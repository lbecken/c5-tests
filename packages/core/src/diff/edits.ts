import type { Edit } from './types.js';

/**
 * Convert per-token change flags into a list of edits covering both sequences.
 * Equal runs are emitted too, so the result is a complete alignment.
 */
export function flagsToEdits(
  changedA: Uint8Array,
  changedB: Uint8Array,
  aLength: number,
  bLength: number,
): Edit[] {
  const edits: Edit[] = [];
  let ai = 0;
  let bi = 0;

  while (ai < aLength || bi < bLength) {
    if (ai < aLength && bi < bLength && changedA[ai] === 0 && changedB[bi] === 0) {
      const aStart = ai;
      const bStart = bi;
      while (ai < aLength && bi < bLength && changedA[ai] === 0 && changedB[bi] === 0) {
        ai++;
        bi++;
      }
      edits.push({ kind: 'equal', aStart, aEnd: ai, bStart, bEnd: bi });
      continue;
    }

    const aStart = ai;
    const bStart = bi;
    while (ai < aLength && changedA[ai] === 1) ai++;
    while (bi < bLength && changedB[bi] === 1) bi++;

    if (ai === aStart && bi === bStart) {
      // Neither side is flagged yet the pair is not aligned; this only happens
      // when one sequence has run out. Consume whatever remains.
      if (ai < aLength) ai = aLength;
      if (bi < bLength) bi = bLength;
    }

    const aChanged = ai > aStart;
    const bChanged = bi > bStart;
    const kind = aChanged && bChanged ? 'replace' : aChanged ? 'delete' : 'insert';
    edits.push({ kind, aStart, aEnd: ai, bStart, bEnd: bi });
  }

  return edits;
}
