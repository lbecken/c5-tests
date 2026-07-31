import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';

import { startServer, type RunningServer } from '../../server/src/index.js';
import { launchBrowser } from './helpers/browser.js';

/**
 * The `git mergetool` hand-off, end to end: the CLI creates a pending intent
 * and blocks, the window picks it up and resolves the file, and the CLI exits
 * with the status git uses to decide whether the merge succeeded.
 */

const DIST = resolve(import.meta.dirname, '../dist');
const OUTPUT = resolve(import.meta.dirname, '../test-output');
const GSC = resolve(import.meta.dirname, '../../../packages/cli/dist/gsc.mjs');

let server: RunningServer;
let browser: Browser;
let page: Page;
let workspace: string;

interface CliRun {
  exitCode: Promise<number>;
  kill: () => void;
}

function runGsc(args: string[]): CliRun {
  const child = spawn(process.execPath, [GSC, ...args], {
    env: { ...process.env, GITSCOPE_URL: server.url },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exitCode = new Promise<number>((resolvePromise) => {
    child.on('close', (code) => resolvePromise(code ?? -1));
  });
  return { exitCode, kill: () => child.kill() };
}

beforeAll(async () => {
  await mkdir(OUTPUT, { recursive: true });
  workspace = await mkdtemp(join(tmpdir(), 'gitscope-mergetool-'));

  // A repository is needed only so the window has something to render around
  // the hand-off; the merge itself is over three loose files.
  const repo = join(workspace, 'repo');
  await mkdir(repo, { recursive: true });
  const { TempRepo } = await import('../../../packages/core/test/helpers/tempRepo.js');
  const temp = await TempRepo.create();
  await temp.commit('Initial', { 'file.txt': 'hello\n' });

  server = await startServer({ port: 0, staticDir: DIST, openPaths: [temp.dir] });
  browser = await launchBrowser();
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(server.url);
  await page.waitForSelector('.app', { timeout: 20_000 });
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(workspace, { recursive: true, force: true });
});

describe('gsc mergetool', () => {
  it('hands three files to the window, waits, and exits 0 once written', async () => {
    const base = join(workspace, 'BASE');
    const local = join(workspace, 'LOCAL');
    const remote = join(workspace, 'REMOTE');
    const merged = join(workspace, 'MERGED');
    await writeFile(base, 'const timeout = 1000;\nconst retries = 3;\n');
    await writeFile(local, 'const timeout = 250;\nconst retries = 3;\n');
    await writeFile(remote, 'const timeout = 5000;\nconst retries = 5;\n');
    await writeFile(merged, 'placeholder\n');

    const run = runGsc(['merge', base, local, remote, merged]);

    // The window should pick the hand-off up without any user action.
    await page.waitForSelector('.merge-conflict', { timeout: 20_000 });
    expect(await page.locator('.merge-external-label').textContent()).toContain('MERGED');
    await page.screenshot({ path: `${OUTPUT}/30-mergetool.png` });

    // One conflict (the timeout line); the retries line merged cleanly.
    expect(await page.locator('.merge-conflict').count()).toBe(1);
    await page.click('.merge-conflict .segmented button:has-text("Remote")');
    await page.click('.merge-toolbar button:has-text("Save and finish")');

    expect(await run.exitCode).toBe(0);
    const result = await readFile(merged, 'utf8');
    expect(result).toContain('const timeout = 5000;');
    expect(result).toContain('const retries = 5;');
    expect(result).not.toContain('<<<<<<<');
  });

  it('exits non-zero when the merge is cancelled, so git keeps the markers', async () => {
    const base = join(workspace, 'BASE2');
    const local = join(workspace, 'LOCAL2');
    const remote = join(workspace, 'REMOTE2');
    const merged = join(workspace, 'MERGED2');
    await writeFile(base, 'a\nb\nc\n');
    await writeFile(local, 'a\nLOCAL\nc\n');
    await writeFile(remote, 'a\nREMOTE\nc\n');
    await writeFile(merged, 'untouched\n');

    const run = runGsc(['merge', base, local, remote, merged]);
    await page.waitForSelector('.merge-conflict', { timeout: 20_000 });
    await page.click('.merge-toolbar button:has-text("Cancel")');

    expect(await run.exitCode).toBe(1);
    expect(await readFile(merged, 'utf8')).toBe('untouched\n');
  });

  it('hands a two-file comparison to the window', async () => {
    const left = join(workspace, 'left.ts');
    const right = join(workspace, 'right.ts');
    await writeFile(left, 'export const version = 1;\n');
    await writeFile(right, 'export const version = 2;\n');

    const run = runGsc(['diff', left, right]);
    await page.waitForSelector('.diff-row[data-kind="replace"]', { timeout: 20_000 });
    const highlighted = await page.locator('.diff-cell[data-side="b"] .hl-strong').allTextContents();
    expect(highlighted.join('')).toContain('2');
    await page.screenshot({ path: `${OUTPUT}/31-difftool.png` });

    // Nothing completes a comparison, so the command is still waiting.
    run.kill();
    expect(await run.exitCode).not.toBe(0);
  });
});
