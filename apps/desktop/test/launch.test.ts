import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

import { TempRepo } from '../../../packages/core/test/helpers/tempRepo.js';

/**
 * The desktop shell, launched for real: the server must come up inside the main
 * process, the window must load the bundled UI from it, and the repository
 * named on the command line must already be open when the window appears.
 */

const OUTPUT = resolve(import.meta.dirname, '../test-output');

let temp: TempRepo;
let app: ElectronApplication;
let window: Page;

beforeAll(async () => {
  await mkdir(OUTPUT, { recursive: true });
  temp = await TempRepo.create();
  await temp.commit('Initial import', { 'src/main.ts': 'export const started = true;\n' });
  await temp.commit('Rename the flag', { 'src/main.ts': 'export const running = true;\n' });

  app = await electron.launch({
    args: [resolve(import.meta.dirname, '..'), temp.dir],
    // Chromium's sandbox needs privileges this container does not grant.
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
    executablePath: undefined,
  });
  window = await app.firstWindow();
  await window.waitForSelector('.app', { timeout: 30_000 });
}, 90_000);

afterAll(async () => {
  await app?.close();
  await temp?.destroy();
});

describe('desktop shell', () => {
  it('opens the repository given on the command line', async () => {
    expect(await window.title()).toContain('Gitscope');
    await expect
      .poll(() => window.locator('.sidebar-repo-branch').textContent(), { timeout: 20_000 })
      .toContain('main');
    await window.screenshot({ path: `${OUTPUT}/40-desktop.png` });
  });

  it('runs the server inside the main process', async () => {
    const url = window.url();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);
    const health = await window.evaluate(async () =>
      (await fetch('/api/health')).json(),
    );
    expect(health).toMatchObject({ ok: true });
  });

  it('exposes only the narrow desktop bridge to the page', async () => {
    const bridge = await window.evaluate(() => {
      const desktop = (window as unknown as { gitscopeDesktop?: Record<string, unknown> })
        .gitscopeDesktop;
      return {
        keys: desktop ? Object.keys(desktop).sort() : [],
        hasNodeRequire: typeof (window as unknown as { require?: unknown }).require !== 'undefined',
        hasProcess: typeof (window as unknown as { process?: unknown }).process !== 'undefined',
      };
    });
    expect(bridge.keys).toEqual(['isDesktop', 'openRepositoryDialog', 'platform']);
    // Context isolation must hold: no node primitives reachable from the page.
    expect(bridge.hasNodeRequire).toBe(false);
    expect(bridge.hasProcess).toBe(false);
  });

  it('navigates from the application menu', async () => {
    await app.evaluate(async ({ Menu }) => {
      const item = Menu.getApplicationMenu()
        ?.items.find((entry) => entry.label === 'View')
        ?.submenu?.items.find((entry) => entry.label === 'History');
      item?.click();
    });
    await window.waitForSelector('.graph-row', { timeout: 20_000 });
    expect(await window.locator('.graph-row').count()).toBe(2);
    await window.screenshot({ path: `${OUTPUT}/41-desktop-history.png` });
  });

  it('shows a character-level diff for the selected commit', async () => {
    await window.click('.graph-row:has-text("Rename the flag")');
    await window.waitForSelector('.graph-bottom .diff-row[data-kind="replace"]', {
      timeout: 20_000,
    });
    const highlighted = await window
      .locator('.graph-bottom .diff-cell[data-side="b"] .hl-strong')
      .allTextContents();
    expect(highlighted.join('')).toContain('running');
  });
});
