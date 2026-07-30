import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { merge3, renderMerge } from '../src/merge/diff3.js';
import { splitLines } from '../src/diff/tokenize.js';
import { runGit } from '../src/git/runner.js';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gitscope-merge-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function lines(text: string): string[] {
  return splitLines(text).lines;
}

function mergeText(base: string, ours: string, theirs: string): { text: string; clean: boolean } {
  const b = lines(base);
  const o = lines(ours);
  const t = lines(theirs);
  const result = merge3(b, o, t);
  return { text: `${renderMerge(result, b, o, t).join('\n')}\n`, clean: result.clean };
}

/** Run `git merge-file` and report whether it merged cleanly, plus its output. */
async function gitMerge(
  base: string,
  ours: string,
  theirs: string,
): Promise<{ text: string; clean: boolean }> {
  await writeFile(join(dir, 'base'), base, 'utf8');
  await writeFile(join(dir, 'ours'), ours, 'utf8');
  await writeFile(join(dir, 'theirs'), theirs, 'utf8');
  // `git merge-file` exits with the number of conflicts, so 0 means clean.
  const result = await runGit(['merge-file', '-p', 'ours', 'base', 'theirs'], {
    cwd: dir,
    throwOnError: false,
  });
  return { text: result.stdout.toString('utf8'), clean: result.exitCode === 0 };
}

describe('merge3', () => {
  it('passes through text nobody touched', () => {
    const result = merge3(lines('a\nb\nc\n'), lines('a\nb\nc\n'), lines('a\nb\nc\n'));
    expect(result.clean).toBe(true);
    expect(result.regions).toEqual([
      {
        kind: 'stable',
        baseStart: 0,
        baseEnd: 3,
        oursStart: 0,
        oursEnd: 3,
        theirsStart: 0,
        theirsEnd: 3,
      },
    ]);
  });

  it('takes a change made by only one side', () => {
    const merged = mergeText('a\nb\nc\n', 'a\nB\nc\n', 'a\nb\nc\n');
    expect(merged.clean).toBe(true);
    expect(merged.text).toBe('a\nB\nc\n');
  });

  it('combines changes to different parts of the file', () => {
    const merged = mergeText(
      'one\ntwo\nthree\nfour\nfive\n',
      'ONE\ntwo\nthree\nfour\nfive\n',
      'one\ntwo\nthree\nfour\nFIVE\n',
    );
    expect(merged.clean).toBe(true);
    expect(merged.text).toBe('ONE\ntwo\nthree\nfour\nFIVE\n');
  });

  it('takes an identical change made by both sides once', () => {
    const merged = mergeText('a\nb\nc\n', 'a\nX\nc\n', 'a\nX\nc\n');
    expect(merged.clean).toBe(true);
    expect(merged.text).toBe('a\nX\nc\n');
  });

  it('reports a conflict when both sides change the same lines differently', () => {
    const base = lines('a\nb\nc\n');
    const ours = lines('a\nOURS\nc\n');
    const theirs = lines('a\nTHEIRS\nc\n');
    const result = merge3(base, ours, theirs);
    expect(result.clean).toBe(false);
    expect(result.conflictCount).toBe(1);
    const conflict = result.regions.find((region) => region.kind === 'conflict')!;
    expect(base.slice(conflict.baseStart, conflict.baseEnd)).toEqual(['b']);
    expect(ours.slice(conflict.oursStart, conflict.oursEnd)).toEqual(['OURS']);
    expect(theirs.slice(conflict.theirsStart, conflict.theirsEnd)).toEqual(['THEIRS']);
  });

  it('renders diff3 style with the base section', () => {
    const base = lines('a\nb\nc\n');
    const ours = lines('a\nOURS\nc\n');
    const theirs = lines('a\nTHEIRS\nc\n');
    const result = merge3(base, ours, theirs);
    const text = renderMerge(result, base, ours, theirs, {
      style: 'diff3',
      labels: { ours: 'HEAD', base: 'base', theirs: 'branch' },
    }).join('\n');
    expect(text).toBe(
      ['a', '<<<<<<< HEAD', 'OURS', '||||||| base', 'b', '=======', 'THEIRS', '>>>>>>> branch', 'c'].join(
        '\n',
      ),
    );
  });

  it('handles a side deleting what the other side edited', () => {
    const result = merge3(lines('a\nb\nc\n'), lines('a\nc\n'), lines('a\nB\nc\n'));
    expect(result.clean).toBe(false);
  });

  it('merges appends at opposite ends of the file', () => {
    const merged = mergeText('b\n', 'a\nb\n', 'b\nc\n');
    expect(merged.clean).toBe(true);
    expect(merged.text).toBe('a\nb\nc\n');
  });

  it('regions tile the base exactly and stay ordered', () => {
    const base = lines('1\n2\n3\n4\n5\n6\n7\n8\n');
    const ours = lines('1\nX\n3\n4\n5\n6\nY\n8\n');
    const theirs = lines('1\n2\n3\nZ\n5\n6\n7\n8\n');
    const result = merge3(base, ours, theirs);
    let basePos = 0;
    let oursPos = 0;
    let theirsPos = 0;
    for (const region of result.regions) {
      expect(region.baseStart).toBe(basePos);
      expect(region.oursStart).toBe(oursPos);
      expect(region.theirsStart).toBe(theirsPos);
      basePos = region.baseEnd;
      oursPos = region.oursEnd;
      theirsPos = region.theirsEnd;
    }
    expect(basePos).toBe(base.length);
    expect(oursPos).toBe(ours.length);
    expect(theirsPos).toBe(theirs.length);
  });
});

describe('merge3 versus git merge-file', () => {
  const scenarios: Array<[string, string, string, string]> = [
    ['disjoint edits', 'a\nb\nc\nd\ne\n', 'A\nb\nc\nd\ne\n', 'a\nb\nc\nd\nE\n'],
    ['same edit twice', 'a\nb\nc\n', 'a\nX\nc\n', 'a\nX\nc\n'],
    ['one side only', 'a\nb\nc\n', 'a\nb\nc\n', 'a\nb\nZ\n'],
    ['insertions at both ends', 'm\n', 'top\nm\n', 'm\nbottom\n'],
    ['overlapping edits', 'a\nb\nc\n', 'a\nOURS\nc\n', 'a\nTHEIRS\nc\n'],
    ['delete versus edit', 'a\nb\nc\n', 'a\nc\n', 'a\nB\nc\n'],
    [
      'function added on each side',
      'header\n\nfunction one() {\n  return 1;\n}\n',
      'header\n\nfunction one() {\n  return 1;\n}\n\nfunction two() {\n  return 2;\n}\n',
      'header\n\nfunction zero() {\n  return 0;\n}\n\nfunction one() {\n  return 1;\n}\n',
    ],
  ];

  for (const [name, base, ours, theirs] of scenarios) {
    it(`agrees with git on whether "${name}" is clean`, async () => {
      const expected = await gitMerge(base, ours, theirs);
      const actual = mergeText(base, ours, theirs);
      expect(actual.clean).toBe(expected.clean);
      if (expected.clean) {
        // For clean merges the output is fully determined, so it must match.
        expect(actual.text).toBe(expected.text);
      }
    });
  }
});
