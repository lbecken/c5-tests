import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';

import { TempRepo } from '../../../packages/core/test/helpers/tempRepo.js';
import { startServer, type RunningServer } from '../../server/src/index.js';
import { launchBrowser } from './helpers/browser.js';

/**
 * The views that need a repository with real shape: branches and a merge for
 * the graph, an actual conflict for the merge view, and two folders on disk for
 * the folder comparison.
 */

const DIST = resolve(import.meta.dirname, '../dist');
const OUTPUT = resolve(import.meta.dirname, '../test-output');

let temp: TempRepo;
let server: RunningServer;
let browser: Browser;
let page: Page;
let folders: { left: string; right: string };

async function navigate(view: unknown): Promise<void> {
  await page.evaluate((target) => {
    (window as unknown as { __gitscope: { navigate: (v: unknown) => void } }).__gitscope.navigate(
      target,
    );
  }, view);
}

beforeAll(async () => {
  await mkdir(OUTPUT, { recursive: true });
  temp = await TempRepo.create();

  await temp.commit('Initial import', {
    'src/config.ts': ['export const config = {', '  retries: 3,', '  timeout: 1000,', '};', ''].join(
      '\n',
    ),
    'README.md': '# Demo\n',
  });

  // A side branch that edits the same lines, so merging conflicts for real.
  await temp.git(['checkout', '-q', '-b', 'feature/timeouts']);
  await temp.commit('Raise the timeout for slow networks', {
    'src/config.ts': ['export const config = {', '  retries: 3,', '  timeout: 5000,', '};', ''].join(
      '\n',
    ),
  });
  await temp.commit('Document the timeout', { 'README.md': '# Demo\n\nTimeouts are configurable.\n' });

  await temp.git(['checkout', '-q', 'main']);
  await temp.commit('Lower the timeout to fail fast', {
    'src/config.ts': ['export const config = {', '  retries: 3,', '  timeout: 250,', '};', ''].join(
      '\n',
    ),
  });

  // A merged branch as well, so the graph has a real merge commit to draw.
  await temp.git(['checkout', '-q', '-b', 'chore/docs']);
  await temp.commit('Add a licence', { 'LICENSE': 'MIT\n' });
  await temp.git(['checkout', '-q', 'main']);
  await temp.git(['merge', '--no-ff', '--no-edit', 'chore/docs']);

  // Two folders for the folder comparison.
  const base = await mkdtemp(join(tmpdir(), 'gitscope-folders-'));
  folders = { left: join(base, 'left'), right: join(base, 'right') };
  await mkdir(join(folders.left, 'shared'), { recursive: true });
  await mkdir(join(folders.right, 'shared'), { recursive: true });
  await writeFile(join(folders.left, 'same.txt'), 'identical\n');
  await writeFile(join(folders.right, 'same.txt'), 'identical\n');
  await writeFile(join(folders.left, 'shared', 'changed.txt'), 'one\ntwo\nthree\n');
  await writeFile(join(folders.right, 'shared', 'changed.txt'), 'one\nTWO\nthree\n');
  await writeFile(join(folders.left, 'only-left.txt'), 'left\n');
  await writeFile(join(folders.right, 'only-right.txt'), 'right\n');

  server = await startServer({ port: 0, staticDir: DIST, openPaths: [temp.dir] });
  browser = await launchBrowser();
  page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  // Record the URL too: "404" on its own is not something you can act on.
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  (page as Page & { failures: string[] }).failures = failures;

  await page.goto(server.url);
  await page.waitForSelector('.app', { timeout: 20_000 });
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  await temp?.destroy();
  if (folders) await rm(resolve(folders.left, '..'), { recursive: true, force: true });
});

describe('commit graph', () => {
  it('draws lanes, refs and a merge commit', async () => {
    await page.click('.sidebar-item:has-text("History")');
    await page.waitForSelector('.graph-row', { timeout: 15_000 });

    const rows = await page.locator('.graph-row').count();
    expect(rows).toBeGreaterThanOrEqual(6);
    // Two branches diverged, so the layout must use at least two lanes.
    const lanes = await page.locator('.graph-lanes').first().getAttribute('width');
    expect(Number(lanes)).toBeGreaterThanOrEqual(28);
    expect(await page.locator('.ref-badge:has-text("main")').count()).toBeGreaterThan(0);
    expect(
      await page.locator('.ref-badge:has-text("feature/timeouts")').count(),
    ).toBeGreaterThan(0);
    // Merge commits are drawn as hollow nodes.
    expect(await page.locator('.graph-lanes circle[fill="var(--bg)"]').count()).toBeGreaterThan(0);

    await page.screenshot({ path: `${OUTPUT}/10-graph.png` });
  });

  it('shows the selected commit changeset below the graph', async () => {
    await page.click('.graph-row:has-text("Lower the timeout")');
    await page.waitForSelector('.graph-bottom .diff-row', { timeout: 15_000 });
    expect(await page.locator('.graph-bottom .file-entry:has-text("config.ts")').count()).toBe(1);
    await page.screenshot({ path: `${OUTPUT}/11-graph-changeset.png` });
  });

  it('filters the graph by commit message', async () => {
    await page.fill('.graph-search .input', 'licence');
    await page.click('.graph-search button:has-text("Search")');
    await expect
      .poll(() => page.locator('.graph-row').count(), { timeout: 10_000 })
      .toBe(1);
    await page.click('.graph-search button:has-text("Clear")');
    await expect.poll(() => page.locator('.graph-row').count(), { timeout: 10_000 }).toBeGreaterThan(1);
  });
});

describe('text compare', () => {
  it('diffs two pasted snippets entirely in the browser', async () => {
    await navigate({ kind: 'compare' });
    await page.waitForSelector('.compare-inputs');
    await page.fill('.compare-input:nth-child(1) textarea', 'alpha\nbeta\ngamma\n');
    await page.fill('.compare-input:nth-child(2) textarea', 'alpha\nBETA\ngamma\ndelta\n');
    await page.waitForSelector('.diff-row[data-kind="replace"]', { timeout: 10_000 });

    expect(await page.locator('.diff-row[data-kind="insert"]').count()).toBe(1);
    expect(await page.locator('.compare-summary .count-add').textContent()).toBe('+2');
    await page.screenshot({ path: `${OUTPUT}/12-text-compare.png` });
  });
});

describe('folder compare', () => {
  it('classifies entries and diffs a changed file', async () => {
    await navigate({ kind: 'directories' });
    await page.waitForSelector('.dir-inputs');
    await page.fill('.dir-inputs input:nth-child(1)', folders.left);
    await page.fill('.dir-inputs input:nth-child(2)', folders.right);
    await page.click('.dir-inputs button:has-text("Compare")');
    await page.waitForSelector('.dir-entry', { timeout: 15_000 });

    expect(await page.locator('.dir-entry[data-status="added"]').count()).toBe(1);
    expect(await page.locator('.dir-entry[data-status="removed"]').count()).toBe(1);
    // `same.txt` is identical, so the default filter hides it.
    expect(await page.locator('.dir-entry:has-text("same.txt")').count()).toBe(0);

    await page.click('.dir-entry:has-text("shared") .dir-entry-main');
    await page.click('.dir-entry:has-text("changed.txt") .dir-entry-main');
    await page.waitForSelector('.dir-preview .diff-row[data-kind="replace"]', { timeout: 10_000 });
    await page.screenshot({ path: `${OUTPUT}/13-folder-compare.png` });
  });

  it('copies a file across and re-compares', async () => {
    await page.click('.dir-entry:has-text("only-left.txt") .icon-button[title*="right"]');
    await expect
      .poll(() => page.locator('.dir-entry:has-text("only-left.txt")').count(), { timeout: 10_000 })
      .toBe(0);
  });
});

describe('three-way merge', () => {
  it('resolves a real conflict and marks the file resolved', async () => {
    const merge = await temp.git(['merge', '--no-edit', 'feature/timeouts']);
    expect(merge.exitCode).not.toBe(0);

    await expect
      .poll(() => page.locator('.sidebar-item.conflict').count(), { timeout: 15_000 })
      .toBe(1);
    await page.click('.sidebar-item.conflict');
    await page.waitForSelector('.merge-conflict', { timeout: 15_000 });

    // The context that makes the conflict resolvable: what each side did.
    const context = await page.locator('.merge-context').textContent();
    expect(context).toContain('Raise the timeout for slow networks');
    expect(context).toContain('Lower the timeout to fail fast');

    expect(await page.locator('.merge-status').textContent()).toContain('1 of 1 conflicts left');
    await page.screenshot({ path: `${OUTPUT}/14-merge-conflict.png` });

    await page.click('.merge-conflict .segmented button:has-text("main")');
    await expect
      .poll(() => page.locator('.merge-status').textContent(), { timeout: 5000 })
      .toContain('All conflicts resolved');

    await page.click('.merge-toolbar button:has-text("Save and mark resolved")');
    await expect
      .poll(() => page.locator('.sidebar-item.conflict').count(), { timeout: 15_000 })
      .toBe(0);
    await page.screenshot({ path: `${OUTPUT}/15-merge-resolved.png` });

    // The resolution really landed: the file matches "ours" and is staged.
    const staged = await temp.git(['diff', '--name-only', '--diff-filter=U']);
    expect(staged.stdout.toString('utf8').trim()).toBe('');
    const content = await temp.git(['show', ':src/config.ts']);
    expect(content.stdout.toString('utf8')).toContain('timeout: 250');
  });
});

describe('overall', () => {
  it('logged no console errors or uncaught exceptions', () => {
    expect((page as Page & { failures: string[] }).failures).toEqual([]);
  });
});
