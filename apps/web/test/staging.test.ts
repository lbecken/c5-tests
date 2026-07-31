import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';

import { TempRepo } from '../../../packages/core/test/helpers/tempRepo.js';
import { startServer, type RunningServer } from '../../server/src/index.js';
import { launchBrowser } from './helpers/browser.js';

/** The staging area and commit flow, driven end to end against a real repo. */

const DIST = resolve(import.meta.dirname, '../dist');
const OUTPUT = resolve(import.meta.dirname, '../test-output');

let temp: TempRepo;
let server: RunningServer;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  await mkdir(OUTPUT, { recursive: true });
  temp = await TempRepo.create();
  await temp.commit('Initial import', {
    'src/index.ts': 'export const value = 1;\n',
    'docs/readme.md': '# Docs\n',
  });

  server = await startServer({ port: 0, staticDir: DIST, openPaths: [temp.dir] });
  browser = await launchBrowser();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
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
});

describe('staging and committing', () => {
  it('separates staged from unstaged work', async () => {
    await temp.write('src/index.ts', 'export const value = 2;\n');
    await temp.write('src/added.ts', 'export const added = true;\n');
    await temp.git(['add', 'src/added.ts']);

    await page.click('.sidebar-item:has-text("Working copy")');
    await expect
      .poll(
        async () =>
          (await page.locator('.staging-section:has-text("Staged") .file-entry').count()) +
          (await page.locator('.staging-section:has-text("Changed") .file-entry').count()),
        { timeout: 15_000 },
      )
      .toBe(2);

    expect(
      await page.locator('.staging-section:has-text("Staged") .file-entry:has-text("added.ts")').count(),
    ).toBe(1);
    expect(
      await page.locator('.staging-section:has-text("Changed") .file-entry:has-text("index.ts")').count(),
    ).toBe(1);
    await page.screenshot({ path: `${OUTPUT}/20-staging.png` });
  });

  it('stages a file from the UI', async () => {
    await page
      .locator('.staging-section:has-text("Changed") .file-entry:has-text("index.ts") .icon-button')
      .last()
      .click();
    await expect
      .poll(
        () =>
          page
            .locator('.staging-section:has-text("Staged") .file-entry:has-text("index.ts")')
            .count(),
        { timeout: 15_000 },
      )
      .toBe(1);

    const staged = await temp.git(['diff', '--cached', '--name-only']);
    expect(staged.stdout.toString('utf8').split('\n').filter(Boolean).sort()).toEqual([
      'src/added.ts',
      'src/index.ts',
    ]);
  });

  it('unstages a file from the UI', async () => {
    await page
      .locator('.staging-section:has-text("Staged") .file-entry:has-text("added.ts") .icon-button')
      .last()
      .click();
    await expect
      .poll(
        () =>
          page
            .locator('.staging-section:has-text("Changed") .file-entry:has-text("added.ts")')
            .count(),
        { timeout: 15_000 },
      )
      .toBe(1);
  });

  it('refuses to commit without a message and commits with one', async () => {
    const commitButton = page.locator('.commit-panel button:has-text("Commit")');
    expect(await commitButton.isDisabled()).toBe(true);

    await page.fill('.commit-message', 'Bump the value to 2');
    expect(await commitButton.isDisabled()).toBe(false);
    await commitButton.click();

    await expect
      .poll(
        async () => {
          const log = await temp.git(['log', '-1', '--format=%s']);
          return log.stdout.toString('utf8').trim();
        },
        { timeout: 15_000 },
      )
      .toBe('Bump the value to 2');

    // The message box empties and the staged section drains.
    await expect.poll(() => page.locator('.commit-message').inputValue(), { timeout: 5000 }).toBe('');
    await page.screenshot({ path: `${OUTPUT}/21-after-commit.png` });
  });

  it('creates and checks out a branch from the sidebar', async () => {
    page.once('dialog', (dialog) => void dialog.accept('feature/from-ui'));
    await page.click('.sidebar-filter .icon-button');
    await expect
      .poll(() => page.locator('.sidebar-repo-branch').textContent(), { timeout: 15_000 })
      .toContain('feature/from-ui');
    const branch = await temp.git(['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(branch.stdout.toString('utf8').trim()).toBe('feature/from-ui');
  });

  it('discards a file after confirmation', async () => {
    await temp.write('docs/readme.md', '# Docs\n\nUnwanted edit.\n');
    await expect
      .poll(
        () =>
          page
            .locator('.staging-section:has-text("Changed") .file-entry:has-text("readme.md")')
            .count(),
        { timeout: 15_000 },
      )
      .toBe(1);

    page.once('dialog', (dialog) => void dialog.accept());
    await page
      .locator(
        '.staging-section:has-text("Changed") .file-entry:has-text("readme.md") .icon-button.danger',
      )
      .click();

    await expect
      .poll(
        () =>
          page
            .locator('.staging-section:has-text("Changed") .file-entry:has-text("readme.md")')
            .count(),
        { timeout: 15_000 },
      )
      .toBe(0);
  });

  it('logged no console errors or uncaught exceptions', () => {
    expect((page as Page & { failures: string[] }).failures).toEqual([]);
  });
});
