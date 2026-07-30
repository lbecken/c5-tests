import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';

import { TempRepo } from '../../../packages/core/test/helpers/tempRepo.js';
import { startServer, type RunningServer } from '../../server/src/index.js';
import { launchBrowser } from './helpers/browser.js';

/**
 * End-to-end coverage of the real UI in a real browser: the app is served from
 * the production build, pointed at a real repository, and driven the way a
 * person would drive it. Screenshots are written to `test-output/` so the
 * visual result can be inspected rather than assumed.
 */

const DIST = resolve(import.meta.dirname, '../dist');
const OUTPUT = resolve(import.meta.dirname, '../test-output');

let temp: TempRepo;
let server: RunningServer;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  await mkdir(OUTPUT, { recursive: true });

  temp = await TempRepo.create();
  await temp.commit('Add the parser', {
    'README.md': '# Demo project\n\nA small project used to exercise the diff viewer.\n',
    'src/parser.ts': [
      'export interface Token {',
      '  kind: string;',
      '  value: string;',
      '}',
      '',
      'export function parse(input: string): Token[] {',
      '  const tokens: Token[] = [];',
      '  for (const part of input.split(/\\s+/)) {',
      '    tokens.push({ kind: "word", value: part });',
      '  }',
      '  return tokens;',
      '}',
      '',
    ].join('\n'),
  });
  await temp.commit('Rename the accumulator and add a guard\n\nThe empty-input case used to return a single empty token.', {
    'src/parser.ts': [
      'export interface Token {',
      '  kind: string;',
      '  value: string;',
      '}',
      '',
      'export function parse(input: string): Token[] {',
      '  const result: Token[] = [];',
      '  if (input.length === 0) {',
      '    return result;',
      '  }',
      '  for (const part of input.split(/\\s+/)) {',
      '    result.push({ kind: "word", value: part });',
      '  }',
      '  return result;',
      '}',
      '',
    ].join('\n'),
  });

  server = await startServer({ port: 0, staticDir: DIST, openPaths: [temp.dir] });
  browser = await launchBrowser();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  (page as Page & { failures: string[] }).failures = failures;

  await page.goto(server.url);
  await page.waitForSelector('.app', { timeout: 20_000 });
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  await temp?.destroy();
});

describe('Gitscope UI', () => {
  it('opens the repository passed to the server and shows the working copy', async () => {
    await expect.poll(() => page.locator('.sidebar-repo-name').textContent()).toBeTruthy();
    expect(await page.locator('.sidebar-repo-branch').textContent()).toContain('main');
    await page.screenshot({ path: `${OUTPUT}/01-working-copy.png`, fullPage: false });
  });

  it('shows a commit changeset with an aligned, character-level diff', async () => {
    await page.click('.sidebar-item:has-text("History")');
    // The graph view is not built yet; navigate straight to the commit instead.
    await page.evaluate(async () => {
      const response = await fetch('/api/repos');
      const repos = (await response.json()) as Array<{ id: string }>;
      const log = await (await fetch(`/api/repos/${repos[0]!.id}/log?limit=5`)).json();
      const store = (window as unknown as { __gitscope?: { navigate: (view: unknown) => void } })
        .__gitscope;
      store?.navigate({ kind: 'commit', oid: log.commits[0].oid });
    });

    await page.waitForSelector('.diff-row', { timeout: 15_000 });
    const rows = await page.locator('.diff-row').count();
    expect(rows).toBeGreaterThan(3);

    // The commit renamed `tokens` to `result`; the character highlight must be
    // confined to the identifier rather than covering the whole line.
    const highlights = page.locator('.diff-cell[data-side="b"] .hl-strong');
    expect(await highlights.count()).toBeGreaterThan(0);
    const texts = await highlights.allTextContents();
    expect(texts.join(' ')).toContain('result');
    expect(texts.every((text) => text.length < 12)).toBe(true);

    await page.screenshot({ path: `${OUTPUT}/02-commit-changeset.png` });
  });

  it('switches to a unified layout', async () => {
    await page.click('.segmented button:has-text("Unified")');
    await page.waitForSelector('.diff-view[data-mode="unified"] .diff-row');
    expect(await page.locator('.diff-marker').count()).toBeGreaterThan(0);
    await page.screenshot({ path: `${OUTPUT}/03-unified.png` });
    await page.click('.segmented button:has-text("Split")');
  });

  it('opens file history and compares two revisions', async () => {
    await page.click('.file-entry:has-text("parser.ts")');
    await page.click('.button:has-text("File history")');
    await page.waitForSelector('.history-entry', { timeout: 15_000 });
    const entries = await page.locator('.history-entry').count();
    // Working copy plus two commits.
    expect(entries).toBe(3);

    await page.click('.history-entry:has-text("Add the parser")');
    await page.waitForSelector('.commit-card');
    expect(await page.locator('.commit-subject').first().textContent()).toContain('Add the parser');
    await page.screenshot({ path: `${OUTPUT}/04-file-history.png` });
  });

  it('reflects a working-copy edit without a manual refresh', async () => {
    await page.evaluate(() => {
      const store = (window as unknown as { __gitscope?: { navigate: (view: unknown) => void } })
        .__gitscope;
      store?.navigate({ kind: 'working' });
    });
    await page.waitForSelector('.changeset');

    await temp.write('src/parser.ts', 'export const changed = true;\n');
    await expect
      .poll(() => page.locator('.file-entry:has-text("parser.ts")').count(), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await page.screenshot({ path: `${OUTPUT}/05-live-update.png` });
  });

  it('renders the dark theme', async () => {
    await page.click('.title-bar .segmented button:has-text("Dark")');
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-theme') === 'dark',
    );
    await page.screenshot({ path: `${OUTPUT}/06-dark.png` });
  });

  it('logged no console errors or uncaught exceptions', () => {
    const failures = (page as Page & { failures: string[] }).failures;
    expect(failures).toEqual([]);
  });
});
