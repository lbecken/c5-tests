import { existsSync } from 'node:fs';

import { chromium, type Browser } from 'playwright';

/**
 * Launch the Chromium that is already installed in this environment.
 *
 * Playwright resolves a browser build matching its own version; when the
 * pre-installed build differs we point at it explicitly rather than downloading
 * a second copy.
 */
const CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
];

export async function launchBrowser(): Promise<Browser> {
  const preinstalled = CANDIDATES.find((path) => existsSync(path));
  return chromium.launch({
    headless: true,
    ...(preinstalled ? { executablePath: preinstalled } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}
