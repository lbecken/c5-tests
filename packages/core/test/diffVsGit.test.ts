import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { diffLines } from '../src/diff/text.js';
import { splitLines } from '../src/diff/tokenize.js';
import { runGit } from '../src/git/runner.js';
import type { Edit } from '../src/diff/types.js';

/**
 * Differential test against the real thing.
 *
 * Our engine is meant to reproduce `git diff --histogram --indent-heuristic`
 * hunk-for-hunk. Comparing against git itself over randomised inputs is the
 * only way to be confident the histogram anchoring and the change-compaction
 * port really behave like git, rather than merely looking plausible.
 */

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gitscope-diffcmp-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** `@@ -1,3 +1,4 @@` → `-1,3 +1,4`, the part that describes the change. */
async function gitHunks(a: string, b: string, algorithm: string): Promise<string[]> {
  const aPath = join(dir, 'a.txt');
  const bPath = join(dir, 'b.txt');
  await writeFile(aPath, a, 'utf8');
  await writeFile(bPath, b, 'utf8');
  const result = await runGit(
    [
      '-c',
      'core.autocrlf=false',
      'diff',
      '--no-index',
      '-U0',
      `--${algorithm}`,
      '--indent-heuristic',
      '--no-color',
      '--',
      aPath,
      bPath,
    ],
    { cwd: dir, throwOnError: false },
  );
  const out = result.stdout.toString('utf8');
  const hunks: string[] = [];
  for (const line of out.split('\n')) {
    const match = /^@@ (-\d+(?:,\d+)? \+\d+(?:,\d+)?) @@/.exec(line);
    if (match) hunks.push(normaliseHeader(match[1]!));
  }
  return hunks;
}

/** git omits `,1` for single-line ranges; normalise so both sides compare. */
function normaliseHeader(header: string): string {
  return header
    .split(' ')
    .map((part) => (part.includes(',') ? part : `${part},1`))
    .join(' ');
}

function ourHunks(edits: Edit[]): string[] {
  const hunks: string[] = [];
  for (const edit of edits) {
    if (edit.kind === 'equal') continue;
    const aLength = edit.aEnd - edit.aStart;
    const bLength = edit.bEnd - edit.bStart;
    // git points a zero-length range at the line *before* the change.
    const aStart = aLength === 0 ? edit.aStart : edit.aStart + 1;
    const bStart = bLength === 0 ? edit.bStart : edit.bStart + 1;
    hunks.push(`-${aStart},${aLength} +${bStart},${bLength}`);
  }
  return hunks;
}

interface Rng {
  (): number;
}

function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Source-like text, so the indent heuristic has something to work with. */
function randomSource(rng: Rng, length: number): string[] {
  const vocabulary = [
    'function handler(request) {',
    '  const value = compute(request);',
    '  if (!value) {',
    '    return null;',
    '  }',
    '',
    '  return value;',
    '}',
    'class Widget {',
    '  render() {',
    '    return this.template;',
    '  }',
    'const config = {',
    '  retries: 3,',
    '};',
    '// TODO: revisit',
    '#include <stdio.h>',
    '\treturn 0;',
  ];
  const out: string[] = [];
  for (let i = 0; i < length; i++) {
    out.push(vocabulary[Math.floor(rng() * vocabulary.length)]!);
  }
  return out;
}

function mutate(rng: Rng, lines: string[]): string[] {
  const out = [...lines];
  const edits = 1 + Math.floor(rng() * 4);
  for (let i = 0; i < edits; i++) {
    if (out.length === 0) break;
    const at = Math.floor(rng() * out.length);
    const roll = rng();
    if (roll < 0.35) {
      out.splice(at, 1 + Math.floor(rng() * 3));
    } else if (roll < 0.7) {
      out.splice(at, 0, ...randomSource(rng, 1 + Math.floor(rng() * 3)));
    } else {
      out[at] = `${out[at]} // edited`;
    }
  }
  return out;
}

describe('diff engine versus git', () => {
  it('matches git --histogram hunk for hunk on randomised source files', async () => {
    const rng = makeRng(20240117);
    let compared = 0;
    for (let trial = 0; trial < 60; trial++) {
      const aLines = randomSource(rng, 5 + Math.floor(rng() * 60));
      const bLines = mutate(rng, aLines);
      const a = `${aLines.join('\n')}\n`;
      const b = `${bLines.join('\n')}\n`;
      if (a === b) continue;
      compared++;

      const expected = await gitHunks(a, b, 'histogram');
      const actual = ourHunks(diffLines(splitLines(a).lines, splitLines(b).lines));
      expect(actual, `trial ${trial}\n--- a\n${a}--- b\n${b}`).toEqual(expected);
    }
    expect(compared).toBeGreaterThan(40);
  });

  it('matches git --histogram on files with repeated and blank lines', async () => {
    const rng = makeRng(987654321);
    for (let trial = 0; trial < 40; trial++) {
      const alphabet = ['a', 'b', '', '  c', '\td', '}'];
      const length = 3 + Math.floor(rng() * 30);
      const aLines = Array.from(
        { length },
        () => alphabet[Math.floor(rng() * alphabet.length)]!,
      );
      const bLines = mutate(rng, aLines);
      const a = `${aLines.join('\n')}\n`;
      const b = `${bLines.join('\n')}\n`;
      if (a === b) continue;

      const expected = await gitHunks(a, b, 'histogram');
      const actual = ourHunks(diffLines(splitLines(a).lines, splitLines(b).lines));
      expect(actual, `trial ${trial}\n--- a\n${a}--- b\n${b}`).toEqual(expected);
    }
  });

  it('matches git --myers when asked for the minimal algorithm', async () => {
    const rng = makeRng(555);
    for (let trial = 0; trial < 30; trial++) {
      const aLines = randomSource(rng, 4 + Math.floor(rng() * 30));
      const bLines = mutate(rng, aLines);
      const a = `${aLines.join('\n')}\n`;
      const b = `${bLines.join('\n')}\n`;
      if (a === b) continue;

      const expected = await gitHunks(a, b, 'minimal');
      const actual = ourHunks(
        diffLines(splitLines(a).lines, splitLines(b).lines, { algorithm: 'myers' }),
      );
      // Myers has freedom in how it distributes equal-cost edits; require the
      // same total edit size rather than identical hunk placement.
      const size = (hunks: string[]): number =>
        hunks.reduce((sum, hunk) => {
          const [, aLength, , bLength] = /-(\d+),(\d+) \+(\d+),(\d+)/.exec(hunk)!.slice(1);
          return sum + Number(aLength) + Number(bLength);
        }, 0);
      expect(size(actual), `trial ${trial}\n--- a\n${a}--- b\n${b}`).toBe(size(expected));
    }
  });
});
