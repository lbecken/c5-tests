/**
 * Change compaction — the pass that decides *where* an ambiguous change block
 * sits when it could equally be placed a few lines up or down.
 *
 * Given `a\nb\na\nb\n` → `a\nb\na\nb\na\nb\n`, a diff engine may legitimately
 * report the inserted pair anywhere. Compaction slides each block as far as it
 * can go, snaps it to align with a block in the other file when possible, and
 * otherwise picks the position that scores best under git's indent heuristic —
 * so an inserted function comes out as one whole function rather than a closing
 * brace, a blank line, and the top of the next one.
 *
 * This is a port of `xdl_change_compact()` from git's xdiff, including the
 * empirically-derived scoring weights from the diff-slider-tools corpus.
 */

const MAX_INDENT = 200;
const MAX_BLANKS = 20;
const INDENT_WEIGHT = 60;
const INDENT_HEURISTIC_MAX_SLIDING = 100;

const START_OF_FILE_PENALTY = 1;
const END_OF_FILE_PENALTY = 21;
const TOTAL_BLANK_WEIGHT = -30;
const POST_BLANK_WEIGHT = 6;
const RELATIVE_INDENT_PENALTY = -4;
const RELATIVE_INDENT_WITH_BLANK_PENALTY = 10;
const RELATIVE_OUTDENT_PENALTY = 24;
const RELATIVE_OUTDENT_WITH_BLANK_PENALTY = 17;
const RELATIVE_DEDENT_PENALTY = 23;
const RELATIVE_DEDENT_WITH_BLANK_PENALTY = 17;

/** Indentation width of a line in columns, or -1 when the line is blank. */
function getIndent(line: string): number {
  let indent = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === ' ') {
      indent += 1;
    } else if (c === '\t') {
      indent += 8 - (indent % 8);
    } else if (c === '\v' || c === '\f' || c === '\r' || c === '\n') {
      // Other whitespace does not advance the column.
    } else {
      return indent;
    }
    if (indent >= MAX_INDENT) return MAX_INDENT;
  }
  return -1;
}

interface SplitMeasurement {
  endOfFile: boolean;
  indent: number;
  preBlank: number;
  preIndent: number;
  postBlank: number;
  postIndent: number;
}

interface SplitScore {
  effectiveIndent: number;
  penalty: number;
}

function measureSplit(lines: readonly string[], split: number, m: SplitMeasurement): void {
  const n = lines.length;
  if (split >= n) {
    m.endOfFile = true;
    m.indent = -1;
  } else {
    m.endOfFile = false;
    m.indent = getIndent(lines[split]!);
  }

  m.preBlank = 0;
  m.preIndent = -1;
  for (let i = split - 1; i >= 0; i--) {
    m.preIndent = getIndent(lines[i]!);
    if (m.preIndent !== -1) break;
    m.preBlank += 1;
    if (m.preBlank === MAX_BLANKS) {
      m.preIndent = 0;
      break;
    }
  }

  m.postBlank = 0;
  m.postIndent = -1;
  for (let i = split + 1; i < n; i++) {
    m.postIndent = getIndent(lines[i]!);
    if (m.postIndent !== -1) break;
    m.postBlank += 1;
    if (m.postBlank === MAX_BLANKS) {
      m.postIndent = 0;
      break;
    }
  }
}

function scoreAddSplit(m: SplitMeasurement, s: SplitScore): void {
  if (m.preIndent === -1 && m.preBlank === 0) s.penalty += START_OF_FILE_PENALTY;
  if (m.endOfFile) s.penalty += END_OF_FILE_PENALTY;

  const postBlank = m.indent === -1 ? 1 + m.postBlank : 0;
  const totalBlank = m.preBlank + postBlank;
  s.penalty += TOTAL_BLANK_WEIGHT * totalBlank;
  s.penalty += POST_BLANK_WEIGHT * postBlank;

  const indent = m.indent !== -1 ? m.indent : m.postIndent;
  const anyBlanks = totalBlank !== 0;
  s.effectiveIndent += indent;

  if (indent === -1 || m.preIndent === -1) {
    // Nothing to compare the indentation against.
  } else if (indent > m.preIndent) {
    // Indented relative to the line above: likely mid-block.
    s.penalty += anyBlanks ? RELATIVE_INDENT_WITH_BLANK_PENALTY : RELATIVE_INDENT_PENALTY;
  } else if (indent === m.preIndent) {
    // Same level as the line above: no adjustment.
  } else if (m.postIndent !== -1 && m.postIndent > indent) {
    // Outdented, and what follows is indented — this opens a block.
    s.penalty += anyBlanks ? RELATIVE_OUTDENT_WITH_BLANK_PENALTY : RELATIVE_OUTDENT_PENALTY;
  } else {
    // Outdented and nothing follows it inward — this closes a block.
    s.penalty += anyBlanks ? RELATIVE_DEDENT_WITH_BLANK_PENALTY : RELATIVE_DEDENT_PENALTY;
  }
}

function scoreCmp(s1: SplitScore, s2: SplitScore): number {
  const cmpIndents =
    (s1.effectiveIndent > s2.effectiveIndent ? 1 : 0) -
    (s1.effectiveIndent < s2.effectiveIndent ? 1 : 0);
  return INDENT_WEIGHT * cmpIndents + (s1.penalty - s2.penalty);
}

interface Group {
  start: number;
  end: number;
}

function groupInit(changed: Uint8Array, n: number): Group {
  const g: Group = { start: 0, end: 0 };
  while (g.end < n && changed[g.end] === 1) g.end++;
  return g;
}

function groupNext(changed: Uint8Array, n: number, g: Group): boolean {
  if (g.end === n) return false;
  g.start = g.end + 1;
  for (g.end = g.start; g.end < n && changed[g.end] === 1; g.end++);
  return true;
}

function groupPrevious(changed: Uint8Array, g: Group): boolean {
  if (g.start === 0) return false;
  g.end = g.start - 1;
  for (g.start = g.end; g.start > 0 && changed[g.start - 1] === 1; g.start--);
  return true;
}

function groupSlideDown(tokens: Int32Array, changed: Uint8Array, n: number, g: Group): boolean {
  if (g.end < n && tokens[g.start] === tokens[g.end]) {
    changed[g.start++] = 0;
    changed[g.end++] = 1;
    while (g.end < n && changed[g.end] === 1) g.end++;
    return true;
  }
  return false;
}

function groupSlideUp(tokens: Int32Array, changed: Uint8Array, g: Group): boolean {
  if (g.start > 0 && tokens[g.start - 1] === tokens[g.end - 1]) {
    changed[--g.start] = 1;
    changed[--g.end] = 0;
    while (g.start > 0 && changed[g.start - 1] === 1) g.start--;
    return true;
  }
  return false;
}

export interface CompactSide {
  tokens: Int32Array;
  changed: Uint8Array;
  lines: readonly string[];
}

/**
 * Re-run a diff over a merged change group. Histogram anchoring can leave equal
 * lines inside a group once the group has been slid; re-diffing recovers them.
 */
export type RediffFn = (
  selfStart: number,
  selfEnd: number,
  otherStart: number,
  otherEnd: number,
) => void;

function compactSide(
  self: CompactSide,
  other: CompactSide,
  indentHeuristic: boolean,
  rediff?: RediffFn,
): void {
  const n = self.tokens.length;
  const nOther = other.tokens.length;
  const g = groupInit(self.changed, n);
  const go = groupInit(other.changed, nOther);

  for (;;) {
    if (g.end !== g.start) {
      const origStart = g.start;
      const origEnd = g.end;
      let earliestEnd = 0;
      let endMatchingOther = -1;
      let groupSize = 0;

      do {
        groupSize = g.end - g.start;
        endMatchingOther = -1;

        // Slide as far up as possible, keeping the other file's cursor in sync.
        while (groupSlideUp(self.tokens, self.changed, g)) {
          if (!groupPrevious(other.changed, go)) break;
        }
        earliestEnd = g.end;
        if (go.end > go.start) endMatchingOther = g.end;

        // Then as far down as possible, remembering the last position at which
        // this group lined up with a change in the other file.
        for (;;) {
          if (!groupSlideDown(self.tokens, self.changed, n, g)) break;
          if (!groupNext(other.changed, nOther, go)) break;
          if (go.end > go.start) endMatchingOther = g.end;
        }
      } while (groupSize !== g.end - g.start);

      if (g.end === earliestEnd) {
        // The group is pinned; nothing to choose.
      } else if (endMatchingOther !== -1) {
        // Prefer lining up with the other side so a single edit stays a single
        // replace rather than splitting into an unrelated add and delete.
        while (go.end === go.start) {
          if (!groupSlideUp(self.tokens, self.changed, g)) break;
          if (!groupPrevious(other.changed, go)) break;
        }
      } else if (indentHeuristic) {
        let shift = earliestEnd;
        if (g.end - groupSize - 1 > shift) shift = g.end - groupSize - 1;
        if (g.end - INDENT_HEURISTIC_MAX_SLIDING > shift) {
          shift = g.end - INDENT_HEURISTIC_MAX_SLIDING;
        }
        let bestShift = -1;
        const bestScore: SplitScore = { effectiveIndent: 0, penalty: 0 };
        const m: SplitMeasurement = {
          endOfFile: false,
          indent: 0,
          preBlank: 0,
          preIndent: 0,
          postBlank: 0,
          postIndent: 0,
        };
        for (; shift <= g.end; shift++) {
          const score: SplitScore = { effectiveIndent: 0, penalty: 0 };
          measureSplit(self.lines, shift, m);
          scoreAddSplit(m, score);
          measureSplit(self.lines, shift - groupSize, m);
          scoreAddSplit(m, score);
          if (bestShift === -1 || scoreCmp(score, bestScore) <= 0) {
            bestScore.effectiveIndent = score.effectiveIndent;
            bestScore.penalty = score.penalty;
            bestShift = shift;
          }
        }
        while (g.end > bestShift) {
          if (!groupSlideUp(self.tokens, self.changed, g)) break;
          if (!groupPrevious(other.changed, go)) break;
        }
      }

      if (rediff && go.end !== go.start && (g.start !== origStart || g.end !== origEnd)) {
        rediff(g.start, g.end, go.start, go.end);
      }
    }

    if (!groupNext(self.changed, n, g)) break;
    if (!groupNext(other.changed, nOther, go)) break;
  }
}

/**
 * Compact the change groups on both sides of a diff in place.
 */
export function compactChanges(
  a: CompactSide,
  b: CompactSide,
  indentHeuristic: boolean,
  rediffAB?: RediffFn,
): void {
  compactSide(a, b, indentHeuristic, rediffAB);
  compactSide(
    b,
    a,
    indentHeuristic,
    rediffAB ? (bs, be, as, ae) => rediffAB(as, ae, bs, be) : undefined,
  );
}
