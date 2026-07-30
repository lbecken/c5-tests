import type { WhitespaceMode } from './types.js';

export interface SplitText {
  /** Line contents, without their terminators. */
  lines: string[];
  /** True when the source did not end with a newline. */
  noFinalNewline: boolean;
  /** Dominant line terminator observed in the source. */
  eol: '\n' | '\r\n';
}

/**
 * Split text into lines, keeping enough information to reproduce the original
 * byte-for-byte. An empty string is zero lines, not one empty line — that
 * distinction matters when diffing an empty file against a one-line file.
 */
export function splitLines(text: string): SplitText {
  if (text.length === 0) {
    return { lines: [], noFinalNewline: false, eol: '\n' };
  }
  const lines: string[] = [];
  let crlf = 0;
  let lf = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      let end = i;
      if (end > start && text.charCodeAt(end - 1) === 13 /* \r */) {
        end--;
        crlf++;
      } else {
        lf++;
      }
      lines.push(text.slice(start, end));
      start = i + 1;
    }
  }
  const noFinalNewline = start < text.length;
  if (noFinalNewline) lines.push(text.slice(start));
  return { lines, noFinalNewline, eol: crlf > lf ? '\r\n' : '\n' };
}

/** Normalise a line for comparison purposes without altering what we display. */
export function normalizeLine(line: string, ws: WhitespaceMode, ignoreCase: boolean): string {
  let out = line;
  switch (ws) {
    case 'all':
      out = out.replace(/\s+/gu, '');
      break;
    case 'change':
      out = out.replace(/[ \t]+/g, ' ').replace(/[ \t]+$/, '');
      break;
    case 'leading':
      out = out.replace(/^[ \t]+/, '');
      break;
    case 'trailing':
      out = out.replace(/[ \t]+$/, '');
      break;
    case 'none':
      break;
  }
  return ignoreCase ? out.toLowerCase() : out;
}

/**
 * Map each line to an integer so the diff algorithms compare machine words
 * instead of strings. Equal ids mean the lines compare equal under the current
 * whitespace/case options.
 */
export function internLines(
  lines: readonly string[],
  ws: WhitespaceMode = 'none',
  ignoreCase = false,
  table: Map<string, number> = new Map(),
): Int32Array {
  const ids = new Int32Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const key = ws === 'none' && !ignoreCase ? lines[i]! : normalizeLine(lines[i]!, ws, ignoreCase);
    let id = table.get(key);
    if (id === undefined) {
      id = table.size;
      table.set(key, id);
    }
    ids[i] = id;
  }
  return ids;
}

export type TokenClass = 'word' | 'space' | 'punct' | 'newline';

export interface WordToken {
  text: string;
  cls: TokenClass;
  /** Index of the line this token belongs to, relative to the diffed region. */
  line: number;
  /** Character offset of the token within its line. */
  start: number;
  end: number;
}

const WORD_RE = /[\p{L}\p{N}_$]/u;

/**
 * Tokenize a block of lines into words, whitespace runs and single punctuation
 * characters, with a synthetic newline token between lines. Diffing at this
 * granularity — rather than per line — lets a change that moves text across a
 * line boundary highlight as a move instead of two unrelated rewrites.
 */
export function tokenizeWords(lines: readonly string[]): WordToken[] {
  const tokens: WordToken[] = [];
  for (let l = 0; l < lines.length; l++) {
    const line = lines[l]!;
    let i = 0;
    while (i < line.length) {
      const ch = line[i]!;
      let j = i + 1;
      let cls: TokenClass;
      if (ch === ' ' || ch === '\t') {
        cls = 'space';
        while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
      } else if (WORD_RE.test(ch)) {
        cls = 'word';
        while (j < line.length && WORD_RE.test(line[j]!)) j++;
      } else {
        cls = 'punct';
      }
      tokens.push({ text: line.slice(i, j), cls, line: l, start: i, end: j });
      i = j;
    }
    if (l < lines.length - 1) {
      tokens.push({ text: '\n', cls: 'newline', line: l, start: line.length, end: line.length });
    }
  }
  return tokens;
}

/** Intern arbitrary strings (word tokens, characters) into comparable ids. */
export function internStrings(
  values: readonly string[],
  table: Map<string, number> = new Map(),
): Int32Array {
  const ids = new Int32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const key = values[i]!;
    let id = table.get(key);
    if (id === undefined) {
      id = table.size;
      table.set(key, id);
    }
    ids[i] = id;
  }
  return ids;
}
