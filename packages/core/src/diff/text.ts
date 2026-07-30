import { alignBlock } from './align.js';
import { compactChanges } from './compact.js';
import { flagsToEdits } from './edits.js';
import { histogramDiff } from './histogram.js';
import { inlineSpans } from './inline.js';
import { myersDiff } from './myers.js';
import { internLines, splitLines } from './tokenize.js';
import {
  DEFAULT_DIFF_OPTIONS,
  type CollapsedRange,
  type DiffOptions,
  type DiffRow,
  type Edit,
  type TextDiff,
} from './types.js';

/**
 * Above this many total lines we stop materialising unchanged rows and emit
 * context only. Expanding a collapsed range then requires a fresh request
 * rather than being instant, which is the right trade at this size.
 */
const MAX_MATERIALISED_ROWS = 400_000;

/** A line that plausibly starts a declaration, used to label collapsed regions. */
const FUNC_LINE = /^[A-Za-z_$@#]/;

export interface LineDiffInput {
  lines: readonly string[];
  noFinalNewline?: boolean;
}

/** Run the configured algorithm and return per-line change flags for both sides. */
export function diffLineFlags(
  aLines: readonly string[],
  bLines: readonly string[],
  options: DiffOptions = {},
): { changedA: Uint8Array; changedB: Uint8Array } {
  const opts = { ...DEFAULT_DIFF_OPTIONS, ...options };
  const table = new Map<string, number>();
  const aIds = internLines(aLines, opts.whitespace, opts.ignoreCase, table);
  const bIds = internLines(bLines, opts.whitespace, opts.ignoreCase, table);
  const changedA = new Uint8Array(aIds.length);
  const changedB = new Uint8Array(bIds.length);

  if (opts.algorithm === 'myers') {
    myersDiff(aIds, bIds, 0, aIds.length, 0, bIds.length, changedA, changedB);
  } else {
    // Deliberately no prefix/suffix trimming: git skips its `xdl_optimize_ctxs`
    // pass for histogram, and trimming would change the occurrence counts that
    // decide which line becomes an anchor.
    histogramDiff(aIds, bIds, 0, aIds.length, 0, bIds.length, changedA, changedB);
  }

  const rediff =
    opts.algorithm === 'histogram'
      ? (aStart: number, aEnd: number, bStart: number, bEnd: number): void => {
          for (let i = aStart; i < aEnd; i++) changedA[i] = 0;
          for (let i = bStart; i < bEnd; i++) changedB[i] = 0;
          myersDiff(aIds, bIds, aStart, aEnd, bStart, bEnd, changedA, changedB);
        }
      : undefined;

  compactChanges(
    { tokens: aIds, changed: changedA, lines: aLines },
    { tokens: bIds, changed: changedB, lines: bLines },
    opts.indentHeuristic,
    rediff,
  );

  return { changedA, changedB };
}

/** The edit script between two line arrays, after compaction. */
export function diffLines(
  aLines: readonly string[],
  bLines: readonly string[],
  options: DiffOptions = {},
): Edit[] {
  const { changedA, changedB } = diffLineFlags(aLines, bLines, options);
  return flagsToEdits(changedA, changedB, aLines.length, bLines.length);
}

function nearestHeader(lines: readonly string[], before: number): string | undefined {
  for (let i = Math.min(before, lines.length) - 1; i >= 0 && i > before - 400; i--) {
    const line = lines[i]!;
    if (FUNC_LINE.test(line)) return line.length > 120 ? `${line.slice(0, 117)}…` : line;
  }
  return undefined;
}

/**
 * Build the full aligned, renderable diff of two texts: one row per displayed
 * line pair, character-level spans inside changed rows, ranges of unchanged
 * rows worth collapsing, and the row indices a "next change" command jumps to.
 */
export function diffTexts(aText: string, bText: string, options: DiffOptions = {}): TextDiff {
  const a = splitLines(aText);
  const b = splitLines(bText);
  return buildTextDiff(a.lines, b.lines, options, a.noFinalNewline, b.noFinalNewline);
}

export function buildTextDiff(
  aLines: readonly string[],
  bLines: readonly string[],
  options: DiffOptions = {},
  aNoFinalNewline = false,
  bNoFinalNewline = false,
): TextDiff {
  const opts = { ...DEFAULT_DIFF_OPTIONS, ...options };
  const edits = diffLines(aLines, bLines, options);
  const materialise = aLines.length + bLines.length <= MAX_MATERIALISED_ROWS;

  const rows: DiffRow[] = [];
  const collapsed: CollapsedRange[] = [];
  const changeAnchors: number[] = [];
  let additions = 0;
  let deletions = 0;
  let modifications = 0;

  const aRow = (index: number): DiffRow['a'] => ({
    number: index + 1,
    text: aLines[index]!,
    noNewlineAtEof: aNoFinalNewline && index === aLines.length - 1 ? true : undefined,
  });
  const bRow = (index: number): DiffRow['b'] => ({
    number: index + 1,
    text: bLines[index]!,
    noNewlineAtEof: bNoFinalNewline && index === bLines.length - 1 ? true : undefined,
  });

  for (let e = 0; e < edits.length; e++) {
    const edit = edits[e]!;

    if (edit.kind === 'equal') {
      const length = edit.aEnd - edit.aStart;
      const isFirst = e === 0;
      const isLast = e === edits.length - 1;
      // Keep `context` lines next to each neighbouring change; the rest of a
      // long equal run is what gets folded away.
      const keepTop = isFirst ? 0 : opts.context;
      const keepBottom = isLast ? 0 : opts.context;
      const foldable = length - keepTop - keepBottom;

      if (foldable <= 1) {
        for (let i = 0; i < length; i++) {
          rows.push({ kind: 'equal', a: aRow(edit.aStart + i), b: bRow(edit.bStart + i) });
        }
        continue;
      }

      for (let i = 0; i < keepTop; i++) {
        rows.push({ kind: 'equal', a: aRow(edit.aStart + i), b: bRow(edit.bStart + i) });
      }
      const foldStart = rows.length;
      const header = nearestHeader(aLines, edit.aStart + keepTop);
      if (materialise) {
        for (let i = keepTop; i < length - keepBottom; i++) {
          rows.push({ kind: 'equal', a: aRow(edit.aStart + i), b: bRow(edit.bStart + i) });
        }
        collapsed.push({ start: foldStart, end: rows.length, header });
      } else {
        collapsed.push({ start: foldStart, end: foldStart, header, skipped: foldable });
      }
      for (let i = length - keepBottom; i < length; i++) {
        rows.push({ kind: 'equal', a: aRow(edit.aStart + i), b: bRow(edit.bStart + i) });
      }
      continue;
    }

    changeAnchors.push(rows.length);

    const aBlock = aLines.slice(edit.aStart, edit.aEnd);
    const bBlock = bLines.slice(edit.bStart, edit.bEnd);
    const spans = inlineSpans(aBlock, bBlock);
    const pairs = alignBlock(aBlock, bBlock);

    for (const pair of pairs) {
      if (pair.a >= 0 && pair.b >= 0) {
        const left = aRow(edit.aStart + pair.a)!;
        const right = bRow(edit.bStart + pair.b)!;
        const leftSpans = spans.a[pair.a];
        const rightSpans = spans.b[pair.b];
        if (leftSpans && leftSpans.length > 0) left.spans = leftSpans;
        if (rightSpans && rightSpans.length > 0) right.spans = rightSpans;
        rows.push({ kind: 'replace', a: left, b: right });
        // Counted the way git counts it: a modified line is both an addition
        // and a deletion, with `modifications` recording the pairing.
        additions++;
        deletions++;
        modifications++;
      } else if (pair.a >= 0) {
        const left = aRow(edit.aStart + pair.a)!;
        const leftSpans = spans.a[pair.a];
        if (leftSpans && leftSpans.length > 0) left.spans = leftSpans;
        rows.push({ kind: 'delete', a: left });
        deletions++;
      } else if (pair.b >= 0) {
        const right = bRow(edit.bStart + pair.b)!;
        const rightSpans = spans.b[pair.b];
        if (rightSpans && rightSpans.length > 0) right.spans = rightSpans;
        rows.push({ kind: 'insert', b: right });
        additions++;
      }
    }
  }

  return {
    rows,
    collapsed,
    changeAnchors,
    stats: { additions, deletions, modifications },
    aLineCount: aLines.length,
    bLineCount: bLines.length,
    truncated: materialise ? undefined : true,
  };
}
