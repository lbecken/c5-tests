import { histogramDiff } from './histogram.js';
import { myersDiff } from './myers.js';
import { flagsToEdits } from './edits.js';
import { internStrings, tokenizeWords, type WordToken } from './tokenize.js';
import type { InlineSpan } from './types.js';

/**
 * Character-level refinement is what turns "this line changed" into "this
 * identifier changed". We diff the changed region at word granularity first —
 * which keeps highlights readable — and then narrow each replaced word pair to
 * the individual characters that actually differ.
 */

/** Beyond this many characters, refining a single word pair is not worth it. */
const MAX_REFINE_CHARS = 400;

/** Equal runs shorter than this inside a refined pair are absorbed into the change. */
const MIN_EQUAL_RUN = 3;

function pushSpan(target: InlineSpan[], start: number, end: number, weak: boolean): void {
  if (end <= start) return;
  const last = target[target.length - 1];
  const emphasis = weak ? 'weak' : 'strong';
  if (last && last.end === start && last.emphasis === emphasis) {
    last.end = end;
    return;
  }
  target.push({ start, end, emphasis });
}

/** Character-level diff of two short strings, returned as spans on each side. */
function refinePair(aText: string, bText: string): { a: InlineSpan[]; b: InlineSpan[] } | null {
  if (aText.length > MAX_REFINE_CHARS || bText.length > MAX_REFINE_CHARS) return null;
  if (aText.length === 0 || bText.length === 0) return null;

  const aChars = Array.from(aText);
  const bChars = Array.from(bText);
  const table = new Map<string, number>();
  const aIds = internStrings(aChars, table);
  const bIds = internStrings(bChars, table);
  const changedA = new Uint8Array(aIds.length);
  const changedB = new Uint8Array(bIds.length);
  myersDiff(aIds, bIds, 0, aIds.length, 0, bIds.length, changedA, changedB);

  // Absorb tiny islands of equality so the highlight does not turn to confetti.
  absorbShortRuns(changedA, MIN_EQUAL_RUN);
  absorbShortRuns(changedB, MIN_EQUAL_RUN);

  const changedCount =
    countFlags(changedA) / Math.max(1, aChars.length) +
    countFlags(changedB) / Math.max(1, bChars.length);
  // If almost everything differs, a whole-token highlight reads better.
  if (changedCount > 1.4) return null;

  return {
    a: flagsToSpans(changedA, aChars),
    b: flagsToSpans(changedB, bChars),
  };
}

function countFlags(flags: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < flags.length; i++) n += flags[i]!;
  return n;
}

/** Flip equal runs shorter than `min` that sit between two changes. */
function absorbShortRuns(flags: Uint8Array, min: number): void {
  let i = 0;
  while (i < flags.length) {
    if (flags[i] === 1) {
      i++;
      continue;
    }
    let j = i;
    while (j < flags.length && flags[j] === 0) j++;
    const bounded = i > 0 && j < flags.length;
    if (bounded && j - i < min) {
      for (let k = i; k < j; k++) flags[k] = 1;
    }
    i = j;
  }
}

/** Map per-character flags back to character-offset spans. */
function flagsToSpans(flags: Uint8Array, chars: string[]): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let offset = 0;
  let runStart = -1;
  for (let i = 0; i < flags.length; i++) {
    const width = chars[i]!.length;
    if (flags[i] === 1) {
      if (runStart === -1) runStart = offset;
    } else if (runStart !== -1) {
      spans.push({ start: runStart, end: offset, emphasis: 'strong' });
      runStart = -1;
    }
    offset += width;
  }
  if (runStart !== -1) spans.push({ start: runStart, end: offset, emphasis: 'strong' });
  return spans;
}

function tokenText(tokens: WordToken[], start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) out += tokens[i]!.text;
  return out;
}

function allWhitespace(tokens: WordToken[], start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const cls = tokens[i]!.cls;
    if (cls !== 'space' && cls !== 'newline') return false;
  }
  return true;
}

/**
 * Mark the characters that differ between two blocks of changed lines.
 *
 * `aLines` and `bLines` are the changed lines of each side, in order. Returns
 * one span list per line of each side (empty array when the line has no
 * intra-line highlight).
 */
export function inlineSpans(
  aLines: readonly string[],
  bLines: readonly string[],
): { a: InlineSpan[][]; b: InlineSpan[][] } {
  const aSpans: InlineSpan[][] = aLines.map(() => []);
  const bSpans: InlineSpan[][] = bLines.map(() => []);
  if (aLines.length === 0 || bLines.length === 0) return { a: aSpans, b: bSpans };

  const aTokens = tokenizeWords(aLines);
  const bTokens = tokenizeWords(bLines);
  if (aTokens.length === 0 || bTokens.length === 0) return { a: aSpans, b: bSpans };

  const table = new Map<string, number>();
  const aIds = internStrings(
    aTokens.map((t) => t.text),
    table,
  );
  const bIds = internStrings(
    bTokens.map((t) => t.text),
    table,
  );
  const changedA = new Uint8Array(aIds.length);
  const changedB = new Uint8Array(bIds.length);
  histogramDiff(aIds, bIds, 0, aIds.length, 0, bIds.length, changedA, changedB);

  const edits = flagsToEdits(changedA, changedB, aTokens.length, bTokens.length);

  for (const edit of edits) {
    if (edit.kind === 'equal') continue;

    const aWeak = allWhitespace(aTokens, edit.aStart, edit.aEnd);
    const bWeak = allWhitespace(bTokens, edit.bStart, edit.bEnd);

    // A replaced run confined to one line on each side is worth refining down
    // to characters; anything larger stays at word granularity.
    if (edit.kind === 'replace' && !aWeak && !bWeak) {
      const aSingleLine =
        aTokens[edit.aStart]!.line === aTokens[edit.aEnd - 1]!.line &&
        aTokens[edit.aStart]!.cls !== 'newline';
      const bSingleLine =
        bTokens[edit.bStart]!.line === bTokens[edit.bEnd - 1]!.line &&
        bTokens[edit.bStart]!.cls !== 'newline';
      if (aSingleLine && bSingleLine) {
        const refined = refinePair(
          tokenText(aTokens, edit.aStart, edit.aEnd),
          tokenText(bTokens, edit.bStart, edit.bEnd),
        );
        if (refined) {
          applyRefined(aSpans, aTokens, edit.aStart, refined.a);
          applyRefined(bSpans, bTokens, edit.bStart, refined.b);
          continue;
        }
      }
    }

    markTokens(aSpans, aTokens, edit.aStart, edit.aEnd, aWeak);
    markTokens(bSpans, bTokens, edit.bStart, edit.bEnd, bWeak);
  }

  return { a: aSpans, b: bSpans };
}

function markTokens(
  spans: InlineSpan[][],
  tokens: WordToken[],
  start: number,
  end: number,
  weak: boolean,
): void {
  for (let i = start; i < end; i++) {
    const token = tokens[i]!;
    if (token.cls === 'newline') continue;
    pushSpan(spans[token.line]!, token.start, token.end, weak);
  }
}

/** Translate spans computed over a joined token run back to line coordinates. */
function applyRefined(
  spans: InlineSpan[][],
  tokens: WordToken[],
  tokenStart: number,
  refined: InlineSpan[],
): void {
  const base = tokens[tokenStart]!;
  const lineSpans = spans[base.line]!;
  for (const span of refined) {
    pushSpan(lineSpans, base.start + span.start, base.start + span.end, false);
  }
}
