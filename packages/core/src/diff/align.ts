/**
 * Pairing of lines inside a single change block.
 *
 * When four lines are replaced by six, a naive viewer pairs them 1-to-1 and
 * leaves two orphans at the bottom, which reads as if everything moved. Pairing
 * by similarity instead keeps each rewritten line next to the line it actually
 * came from, and lets genuinely new lines stand alone.
 */

/** Blocks larger than this fall back to positional pairing. */
const MAX_ALIGN_BLOCK = 250;

/** Below this Dice coefficient two lines are considered unrelated. */
const MIN_SIMILARITY = 0.32;

export interface LinePair {
  /** Index into the A block, or -1 when this row is a pure insertion. */
  a: number;
  /** Index into the B block, or -1 when this row is a pure deletion. */
  b: number;
}

function bigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const trimmed = text.trim();
  if (trimmed.length < 2) {
    if (trimmed.length === 1) counts.set(trimmed, 1);
    return counts;
  }
  for (let i = 0; i < trimmed.length - 1; i++) {
    const gram = trimmed.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** Sørensen–Dice coefficient over character bigrams. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let sizeA = 0;
  for (const n of ga.values()) sizeA += n;
  let sizeB = 0;
  for (const n of gb.values()) sizeB += n;
  if (sizeA === 0 || sizeB === 0) return 0;
  let overlap = 0;
  for (const [gram, count] of ga) {
    const other = gb.get(gram);
    if (other !== undefined) overlap += Math.min(count, other);
  }
  return (2 * overlap) / (sizeA + sizeB);
}

function positional(aCount: number, bCount: number): LinePair[] {
  const pairs: LinePair[] = [];
  const shared = Math.min(aCount, bCount);
  for (let i = 0; i < shared; i++) pairs.push({ a: i, b: i });
  for (let i = shared; i < aCount; i++) pairs.push({ a: i, b: -1 });
  for (let i = shared; i < bCount; i++) pairs.push({ a: -1, b: i });
  return pairs;
}

/**
 * Align the lines of one change block, preserving order. Returns the rows to
 * render, top to bottom.
 */
export function alignBlock(aLines: readonly string[], bLines: readonly string[]): LinePair[] {
  const n = aLines.length;
  const m = bLines.length;
  if (n === 0 || m === 0) return positional(n, m);
  if (n === m) return positional(n, m);
  if (n > MAX_ALIGN_BLOCK || m > MAX_ALIGN_BLOCK) return positional(n, m);

  const width = m + 1;
  const score = new Float64Array((n + 1) * width);
  const sims = new Float64Array(n * m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const s = similarity(aLines[i]!, bLines[j]!);
      sims[i * m + j] = s >= MIN_SIMILARITY ? s : 0;
    }
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const skipA = score[(i - 1) * width + j]!;
      const skipB = score[i * width + (j - 1)]!;
      const s = sims[(i - 1) * m + (j - 1)]!;
      const match = s > 0 ? score[(i - 1) * width + (j - 1)]! + s : -1;
      score[i * width + j] = Math.max(skipA, skipB, match);
    }
  }

  const reversed: LinePair[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const current = score[i * width + j]!;
    const s = sims[(i - 1) * m + (j - 1)]!;
    if (s > 0 && current === score[(i - 1) * width + (j - 1)]! + s) {
      reversed.push({ a: i - 1, b: j - 1 });
      i--;
      j--;
    } else if (current === score[(i - 1) * width + j]!) {
      reversed.push({ a: i - 1, b: -1 });
      i--;
    } else {
      reversed.push({ a: -1, b: j - 1 });
      j--;
    }
  }
  while (i > 0) {
    reversed.push({ a: i - 1, b: -1 });
    i--;
  }
  while (j > 0) {
    reversed.push({ a: -1, b: j - 1 });
    j--;
  }

  reversed.reverse();
  return reversed;
}
