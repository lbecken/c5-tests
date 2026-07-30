import { describe, expect, it } from 'vitest';

import { diffLines, diffTexts } from '../src/diff/text.js';
import { splitLines } from '../src/diff/tokenize.js';
import { inlineSpans } from '../src/diff/inline.js';
import type { Edit } from '../src/diff/types.js';

/** Re-apply an edit script to A and check it reproduces B exactly. */
function applyEdits(edits: Edit[], a: string[], b: string[]): string[] {
  const out: string[] = [];
  for (const edit of edits) {
    if (edit.kind === 'equal') {
      for (let i = edit.aStart; i < edit.aEnd; i++) out.push(a[i]!);
    } else {
      for (let i = edit.bStart; i < edit.bEnd; i++) out.push(b[i]!);
    }
  }
  return out;
}

function lines(text: string): string[] {
  return splitLines(text).lines;
}

describe('splitLines', () => {
  it('treats an empty file as zero lines', () => {
    expect(splitLines('')).toEqual({ lines: [], noFinalNewline: false, eol: '\n' });
  });

  it('reports a missing trailing newline', () => {
    expect(splitLines('a\nb')).toMatchObject({ lines: ['a', 'b'], noFinalNewline: true });
    expect(splitLines('a\nb\n')).toMatchObject({ lines: ['a', 'b'], noFinalNewline: false });
  });

  it('strips CRLF and reports the dominant terminator', () => {
    const result = splitLines('a\r\nb\r\n');
    expect(result.lines).toEqual(['a', 'b']);
    expect(result.eol).toBe('\r\n');
  });
});

describe('diffLines', () => {
  it('reports no changes for identical input', () => {
    const a = lines('one\ntwo\nthree\n');
    const edits = diffLines(a, a);
    expect(edits).toHaveLength(1);
    expect(edits[0]!.kind).toBe('equal');
  });

  it('handles insertion into an empty file', () => {
    const edits = diffLines([], lines('hello\n'));
    expect(edits).toEqual([{ kind: 'insert', aStart: 0, aEnd: 0, bStart: 0, bEnd: 1 }]);
  });

  it('handles deletion to an empty file', () => {
    const edits = diffLines(lines('hello\n'), []);
    expect(edits).toEqual([{ kind: 'delete', aStart: 0, aEnd: 1, bStart: 0, bEnd: 0 }]);
  });

  it('produces an edit script that reconstructs the target', () => {
    const a = lines('a\nb\nc\nd\ne\nf\n');
    const b = lines('a\nX\nc\nd\nY\nZ\nf\n');
    const edits = diffLines(a, b);
    expect(applyEdits(edits, a, b)).toEqual(b);
  });

  it('reconstructs the target for randomised inputs', () => {
    let seed = 0x2f6e2b1;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let trial = 0; trial < 200; trial++) {
      const a: string[] = [];
      const b: string[] = [];
      const length = Math.floor(random() * 40);
      for (let i = 0; i < length; i++) a.push(String(Math.floor(random() * 8)));
      const bLength = Math.floor(random() * 40);
      for (let i = 0; i < bLength; i++) b.push(String(Math.floor(random() * 8)));
      const edits = diffLines(a, b);
      expect(applyEdits(edits, a, b)).toEqual(b);

      // Ranges must be contiguous and cover both inputs exactly once.
      let aPos = 0;
      let bPos = 0;
      for (const edit of edits) {
        expect(edit.aStart).toBe(aPos);
        expect(edit.bStart).toBe(bPos);
        aPos = edit.aEnd;
        bPos = edit.bEnd;
      }
      expect(aPos).toBe(a.length);
      expect(bPos).toBe(b.length);
    }
  });

  it('finds the minimal change in a large mostly-identical file', () => {
    const a = Array.from({ length: 5000 }, (_, i) => `line ${i}`);
    const b = [...a];
    b[2500] = 'line 2500 changed';
    const edits = diffLines(a, b);
    const changed = edits.filter((edit) => edit.kind !== 'equal');
    expect(changed).toEqual([
      { kind: 'replace', aStart: 2500, aEnd: 2501, bStart: 2500, bEnd: 2501 },
    ]);
  });

  it('respects the whitespace option', () => {
    const a = lines('int x = 1;\n');
    const b = lines('int  x  =  1;\n');
    expect(diffLines(a, b).some((e) => e.kind !== 'equal')).toBe(true);
    expect(diffLines(a, b, { whitespace: 'change' }).every((e) => e.kind === 'equal')).toBe(true);
  });

  it('places an inserted function as one block, not spliced across braces', () => {
    const a = lines(['function one() {', '  return 1;', '}', ''].join('\n'));
    const b = lines(
      ['function one() {', '  return 1;', '}', '', 'function two() {', '  return 2;', '}', ''].join(
        '\n',
      ),
    );
    const edits = diffLines(a, b);
    const inserted = edits.filter((edit) => edit.kind === 'insert');
    expect(inserted).toHaveLength(1);
    const block = b.slice(inserted[0]!.bStart, inserted[0]!.bEnd);
    // The blank separator line belongs above the new function, not below it.
    expect(block).toEqual(['', 'function two() {', '  return 2;', '}']);
  });
});

describe('inlineSpans', () => {
  it('narrows a one-character edit down to that character', () => {
    const { a, b } = inlineSpans(['const value = 1;'], ['const value = 2;']);
    expect(a[0]).toEqual([{ start: 14, end: 15, emphasis: 'strong' }]);
    expect(b[0]).toEqual([{ start: 14, end: 15, emphasis: 'strong' }]);
  });

  it('highlights only the renamed identifier', () => {
    const { a, b } = inlineSpans(
      ['function computeTotal(items) {'],
      ['function computeSubtotal(items) {'],
    );
    const spanA = a[0]!;
    const spanB = b[0]!;
    expect(spanA.length).toBeGreaterThan(0);
    // The change is confined to the identifier, not the whole line.
    expect(spanA[0]!.start).toBeGreaterThanOrEqual(9);
    expect(spanA[spanA.length - 1]!.end).toBeLessThanOrEqual(21);
    expect(spanB[0]!.start).toBeGreaterThanOrEqual(9);
  });

  it('marks whitespace-only differences weakly', () => {
    const { a } = inlineSpans(['a = 1;'], ['a  =  1;']);
    expect(a[0]!.every((span) => span.emphasis === 'weak')).toBe(true);
  });

  it('produces no spans when a line is entirely new', () => {
    const { a, b } = inlineSpans([], ['brand new line']);
    expect(a).toEqual([]);
    expect(b).toEqual([[]]);
  });
});

describe('diffTexts', () => {
  it('aligns rows and reports git-compatible stats', () => {
    const result = diffTexts('a\nb\nc\n', 'a\nB\nc\nd\n');
    expect(result.rows.map((row) => row.kind)).toEqual(['equal', 'replace', 'equal', 'insert']);
    expect(result.stats).toEqual({ additions: 2, deletions: 1, modifications: 1 });
    expect(result.aLineCount).toBe(3);
    expect(result.bLineCount).toBe(4);
  });

  it('collapses long unchanged runs but keeps context around changes', () => {
    const a = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const b = a.replace('line 50', 'line 50 modified');
    const result = diffTexts(`${a}\n`, `${b}\n`, { context: 3 });
    expect(result.collapsed).toHaveLength(2);
    // 47 rows above the change are hidden, leaving 3 lines of context.
    expect(result.collapsed[0]).toMatchObject({ start: 0, end: 47 });
    expect(result.rows[47]!.a!.text).toBe('line 47');
    expect(result.changeAnchors).toEqual([50]);
  });

  it('does not collapse a run that is only context', () => {
    const result = diffTexts('a\nb\nX\nc\nd\n', 'a\nb\nY\nc\nd\n', { context: 3 });
    expect(result.collapsed).toEqual([]);
  });

  it('flags a missing trailing newline on the affected side only', () => {
    const result = diffTexts('a\nb\n', 'a\nb');
    const last = result.rows[result.rows.length - 1]!;
    expect(last.a?.noNewlineAtEof).toBeUndefined();
    expect(last.b?.noNewlineAtEof).toBe(true);
  });

  it('pairs rewritten lines with their originals when block sizes differ', () => {
    const a = 'header\nalpha value\nfooter\n';
    const b = 'header\nbrand new line\nalpha value changed\nfooter\n';
    const result = diffTexts(a, b);
    const paired = result.rows.find((row) => row.kind === 'replace');
    expect(paired?.a?.text).toBe('alpha value');
    expect(paired?.b?.text).toBe('alpha value changed');
    expect(result.rows.some((row) => row.kind === 'insert' && row.b?.text === 'brand new line')).toBe(
      true,
    );
  });
});
