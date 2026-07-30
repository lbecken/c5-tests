import { myersDiff } from './myers.js';

/**
 * Histogram diff — the algorithm behind `git diff --histogram`, and the reason
 * git's hunks read better than a plain minimal diff.
 *
 * Instead of minimising the edit script, it repeatedly picks the *rarest* line
 * that both sides share, treats the maximal run around it as an anchor, and
 * recurses either side of that anchor. Rare lines are far more likely to be
 * genuine structural landmarks (a function signature) than common ones (`}`),
 * so hunks line up with how a person reads the file.
 *
 * This is a port of git's `xdiff/xhistogram.c`, including its exact anchor
 * selection rule and its fallbacks, so our hunks match `git diff --histogram`
 * rather than merely resembling it. `test/diffVsGit.test.ts` checks that
 * against the real binary.
 */

/** Occurrence counts above this make a line useless as an anchor. */
const MAX_CHAIN_LENGTH = 64;

/** Safety valve: regions larger than this go straight to Myers. */
const MAX_REGION_LINES = 2_000_000;

interface Region {
  aLo: number;
  aHi: number;
  bLo: number;
  bHi: number;
}

interface LcsSearch {
  found: boolean;
  /** Inclusive bounds of the chosen anchor run. */
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
  /**
   * True when both sides share lines but every one of them is too common to
   * anchor on; the caller then hands the whole region to Myers, exactly as git
   * does.
   */
  fallback: boolean;
}

/**
 * Index of region A: for each distinct line, its first position and occurrence
 * count, plus a chain linking each position to the next occurrence of the same
 * line. Built by scanning backwards so chains run in increasing position order.
 */
interface HistIndex {
  first: Map<number, number>;
  counts: Map<number, number>;
  /** `next[position - aLo]`, or -1 at the end of a chain. */
  next: Int32Array;
  aLo: number;
}

function buildIndex(a: Int32Array, aLo: number, aHi: number): HistIndex {
  const next = new Int32Array(aHi - aLo).fill(-1);
  const first = new Map<number, number>();
  const counts = new Map<number, number>();
  for (let ptr = aHi - 1; ptr >= aLo; ptr--) {
    const key = a[ptr]!;
    const head = first.get(key);
    if (head === undefined) {
      first.set(key, ptr);
      counts.set(key, 1);
    } else {
      next[ptr - aLo] = head;
      first.set(key, ptr);
      counts.set(key, counts.get(key)! + 1);
    }
  }
  return { first, counts, next, aLo };
}

function findLcs(
  a: Int32Array,
  b: Int32Array,
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): LcsSearch {
  const index = buildIndex(a, aLo, aHi);
  const { first, counts, next } = index;

  // The rarest occurrence count seen in any accepted anchor so far. Starting
  // one above the chain limit means "nothing acceptable found yet".
  let cnt = MAX_CHAIN_LENGTH + 1;
  let hasCommon = false;
  let found = false;
  let aStart = 0;
  let aEnd = 0;
  let bStart = 0;
  let bEnd = 0;

  let bPtr = bLo;
  while (bPtr < bHi) {
    let bNext = bPtr + 1;
    const key = b[bPtr]!;
    const recCount = counts.get(key);

    if (recCount === undefined) {
      bPtr = bNext;
      continue;
    }
    if (recCount > cnt) {
      // Present on both sides, but too common to be a useful landmark.
      hasCommon = true;
      bPtr = bNext;
      continue;
    }
    hasCommon = true;

    let as = first.get(key)!;
    for (;;) {
      let np = next[as - aLo]!;
      let bs = bPtr;
      let ae = as;
      let be = bs;
      let rc = recCount;

      while (aLo < as && bLo < bs && a[as - 1] === b[bs - 1]) {
        as--;
        bs--;
        if (rc > 1) rc = Math.min(rc, counts.get(a[as]!) ?? rc);
      }
      while (ae < aHi - 1 && be < bHi - 1 && a[ae + 1] === b[be + 1]) {
        ae++;
        be++;
        if (rc > 1) rc = Math.min(rc, counts.get(a[ae]!) ?? rc);
      }

      if (bNext <= be) bNext = be + 1;
      // Prefer a longer run; otherwise prefer one anchored on a rarer line.
      if (aEnd - aStart < ae - as || rc < cnt) {
        aStart = as;
        bStart = bs;
        aEnd = ae;
        bEnd = be;
        cnt = rc;
        found = true;
      }

      if (np === -1) break;
      // Skip occurrences already covered by the run we just measured.
      while (np <= ae) {
        np = next[np - aLo]!;
        if (np === -1) break;
      }
      if (np === -1 || np <= ae) break;
      as = np;
    }

    bPtr = bNext;
  }

  return {
    found,
    aStart,
    aEnd,
    bStart,
    bEnd,
    fallback: hasCommon && MAX_CHAIN_LENGTH < cnt,
  };
}

/**
 * Diff `a` against `b` over the given region, writing per-token change flags.
 *
 * Note that the region must *not* have had its common prefix and suffix
 * trimmed: git skips that optimisation for histogram (`xdl_prepare_env` only
 * calls `xdl_optimize_ctxs` for the Myers path), and trimming changes the
 * occurrence counts that decide which line wins as an anchor.
 */
export function histogramDiff(
  a: Int32Array,
  b: Int32Array,
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
  changedA: Uint8Array,
  changedB: Uint8Array,
): void {
  const stack: Region[] = [{ aLo, aHi, bLo, bHi }];

  while (stack.length > 0) {
    const { aLo: lo1, aHi: hi1, bLo: lo2, bHi: hi2 } = stack.pop()!;

    if (hi1 <= lo1 && hi2 <= lo2) continue;
    if (hi1 <= lo1) {
      for (let i = lo2; i < hi2; i++) changedB[i] = 1;
      continue;
    }
    if (hi2 <= lo2) {
      for (let i = lo1; i < hi1; i++) changedA[i] = 1;
      continue;
    }
    if (hi1 - lo1 > MAX_REGION_LINES || hi2 - lo2 > MAX_REGION_LINES) {
      myersDiff(a, b, lo1, hi1, lo2, hi2, changedA, changedB);
      continue;
    }

    const lcs = findLcs(a, b, lo1, hi1, lo2, hi2);

    if (lcs.fallback) {
      myersDiff(a, b, lo1, hi1, lo2, hi2, changedA, changedB);
      continue;
    }
    if (!lcs.found) {
      for (let i = lo1; i < hi1; i++) changedA[i] = 1;
      for (let i = lo2; i < hi2; i++) changedB[i] = 1;
      continue;
    }

    stack.push({ aLo: lcs.aEnd + 1, aHi: hi1, bLo: lcs.bEnd + 1, bHi: hi2 });
    stack.push({ aLo: lo1, aHi: lcs.aStart, bLo: lo2, bHi: lcs.bStart });
  }
}
