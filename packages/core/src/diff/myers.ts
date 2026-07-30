/**
 * Myers' O(ND) difference algorithm in linear space (the divide-and-conquer
 * "middle snake" variant from section 4b of the 1986 paper).
 *
 * Results are written into `changedA` / `changedB` — one flag per token —
 * rather than returned as edit scripts, because the change-compaction pass in
 * `compact.ts` needs exactly that representation, and it is also what git's
 * xdiff uses internally.
 */

interface Region {
  aLo: number;
  aHi: number;
  bLo: number;
  bHi: number;
}

/**
 * Locate the middle snake of the optimal edit path for the given region and
 * return the point at which the problem should be split in two.
 */
function findSplit(
  a: Int32Array,
  b: Int32Array,
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): { x: number; y: number } | null {
  const n = aHi - aLo;
  const m = bHi - bLo;
  const maxD = Math.ceil((n + m) / 2);
  const offset = maxD;
  const length = 2 * maxD + 2;
  const v1 = new Int32Array(length).fill(-1);
  const v2 = new Int32Array(length).fill(-1);
  v1[offset + 1] = 0;
  v2[offset + 1] = 0;
  const delta = n - m;
  // When the total edit distance is odd the forward path is the one that will
  // overlap first; when it is even, the reverse path will.
  const front = delta % 2 !== 0;
  let k1start = 0;
  let k1end = 0;
  let k2start = 0;
  let k2end = 0;

  for (let d = 0; d < maxD; d++) {
    for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      const k1Offset = offset + k1;
      let x1: number;
      if (k1 === -d || (k1 !== d && v1[k1Offset - 1]! < v1[k1Offset + 1]!)) {
        x1 = v1[k1Offset + 1]!;
      } else {
        x1 = v1[k1Offset - 1]! + 1;
      }
      let y1 = x1 - k1;
      while (x1 < n && y1 < m && a[aLo + x1] === b[bLo + y1]) {
        x1++;
        y1++;
      }
      v1[k1Offset] = x1;
      if (x1 > n) {
        k1end += 2;
      } else if (y1 > m) {
        k1start += 2;
      } else if (front) {
        const k2Offset = offset + delta - k1;
        if (k2Offset >= 0 && k2Offset < length && v2[k2Offset] !== -1) {
          const x2 = n - v2[k2Offset]!;
          if (x1 >= x2) return { x: aLo + x1, y: bLo + y1 };
        }
      }
    }

    for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      const k2Offset = offset + k2;
      let x2: number;
      if (k2 === -d || (k2 !== d && v2[k2Offset - 1]! < v2[k2Offset + 1]!)) {
        x2 = v2[k2Offset + 1]!;
      } else {
        x2 = v2[k2Offset - 1]! + 1;
      }
      let y2 = x2 - k2;
      while (x2 < n && y2 < m && a[aLo + n - x2 - 1] === b[bLo + m - y2 - 1]) {
        x2++;
        y2++;
      }
      v2[k2Offset] = x2;
      if (x2 > n) {
        k2end += 2;
      } else if (y2 > m) {
        k2start += 2;
      } else if (!front) {
        const k1Offset = offset + delta - k2;
        if (k1Offset >= 0 && k1Offset < length && v1[k1Offset] !== -1) {
          const x1 = v1[k1Offset]!;
          const y1 = offset + x1 - k1Offset;
          if (x1 >= n - x2) return { x: aLo + x1, y: bLo + y1 };
        }
      }
    }
  }
  return null;
}

function markA(changedA: Uint8Array, lo: number, hi: number): void {
  for (let i = lo; i < hi; i++) changedA[i] = 1;
}

function markB(changedB: Uint8Array, lo: number, hi: number): void {
  for (let i = lo; i < hi; i++) changedB[i] = 1;
}

/**
 * Diff `a[aLo..aHi)` against `b[bLo..bHi)`, setting a flag for every token that
 * is part of a change. Uses an explicit work stack so that pathological inputs
 * cannot overflow the JavaScript call stack.
 */
export function myersDiff(
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
    const region = stack.pop()!;
    let lo1 = region.aLo;
    let hi1 = region.aHi;
    let lo2 = region.bLo;
    let hi2 = region.bHi;

    while (lo1 < hi1 && lo2 < hi2 && a[lo1] === b[lo2]) {
      lo1++;
      lo2++;
    }
    while (lo1 < hi1 && lo2 < hi2 && a[hi1 - 1] === b[hi2 - 1]) {
      hi1--;
      hi2--;
    }

    if (lo1 === hi1) {
      markB(changedB, lo2, hi2);
      continue;
    }
    if (lo2 === hi2) {
      markA(changedA, lo1, hi1);
      continue;
    }
    if (hi1 - lo1 === 1 && hi2 - lo2 === 1) {
      // One token against one different token.
      changedA[lo1] = 1;
      changedB[lo2] = 1;
      continue;
    }

    const split = findSplit(a, b, lo1, hi1, lo2, hi2);
    if (!split) {
      markA(changedA, lo1, hi1);
      markB(changedB, lo2, hi2);
      continue;
    }
    stack.push({ aLo: split.x, aHi: hi1, bLo: split.y, bHi: hi2 });
    stack.push({ aLo: lo1, aHi: split.x, bLo: lo2, bHi: split.y });
  }
}
