#!/usr/bin/env node
/* Headless playthrough. Drives the console with the Skip control so it does not
 * depend on real-time playback, takes every branch it is told to, and fails on
 * any page error or unreachable ending.
 *
 *   node tools/playtest.mjs                 # all three routes
 *   node tools/playtest.mjs 3 --shots       # one route, with screenshots
 */
import { chromium } from '/tmp/claude-0/-home-user-c5-tests/7fc65c71-3244-52e7-9a06-a880fb9fcb36/scratchpad/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8099;
const SHOTS = process.argv.includes('--shots');
const ONLY = process.argv.find(a => /^[123]$/.test(a));

/* choiceIndex per decision point, in the order they are met */
/* Routes are steered by intent, not by index: hub spokes and decision points
 * both render as .choice, so a positional list drifts. */
const ROUTES = {
  1: { name: 'Ending 1 — The Predicted Murder',
       prefer: ['Put DI Rao on the line', 'Ask him exactly what', 'Arrest her',
                'Tell him the truth', 'Stand down'],
       theory: 'wrong' },
  2: { name: 'Ending 2 — The Worse Tomorrow',
       prefer: ['Keep him with me', 'Say nothing', 'Send her in',
                'Tell him the truth', 'Pull her out'],
       theory: 'partial' },
  3: { name: 'Ending 3 — The Narrow Door',
       prefer: ['Keep him with me', 'Say nothing', 'Keep her on the channel',
                'Tell him we are standing down', 'Protected shutdown'],
       theory: 'right' }
};

async function run(route, key) {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.click('#btn-begin');
  await page.waitForTimeout(400);

  let pick = 0, steps = 0, visited = [], ended = false;
  while (steps++ < 400) {
    const title = await page.textContent('#scene-title').catch(() => '');
    if (title && visited[visited.length - 1] !== title) visited.push(title);

    if (await page.$('#ending-screen')) { ended = true; break; }

    // accusation board
    if (await page.$('#accusation')) {
      const qs = await page.$$('.acc-q');
      for (let i = 0; i < qs.length; i++) {
        const opts = await qs[i].$$('.acc-opt');
        let idx = 0;
        if (route.theory === 'wrong') idx = opts.length - 1;
        else if (route.theory === 'partial') idx = i < 2 ? 0 : opts.length - 1;
        await opts[idx].click();
      }
      await page.click('#acc-submit');
      await page.waitForTimeout(300);
      continue;
    }

    // analysis puzzle — use the tools properly
    if (await page.$('#analysis')) {
      const tools = await page.$$('.tool');
      await tools[0].click();            // isolate high
      await tools[2].click();            // boost
      await page.waitForTimeout(120);
      await page.click('#a-log');
      await page.waitForTimeout(300);
      continue;
    }

    // hub or choice
    const choices = await page.$$('#interaction .choice:not(:disabled)');
    if (choices.length) {
      const texts = await Promise.all(choices.map(c => c.textContent()));
      let i = texts.findIndex(t => route.prefer.some(p => t.includes(p)));
      if (i < 0) i = 0;
      pick++;
      if (SHOTS) await page.screenshot({ path: path.join(ROOT, `.shots/${key}-${String(pick).padStart(2, '0')}.png`) });
      await choices[i].click();
      await page.waitForTimeout(300);
      continue;
    }

    await page.click('#btn-skip').catch(() => {});
    await page.waitForTimeout(70);
  }

  const endingName = ended ? await page.textContent('#ending-screen h2') : null;
  const evCount = await page.textContent('#ev-count').catch(() => '?');
  if (SHOTS && ended) await page.screenshot({ path: path.join(ROOT, `.shots/${key}-ending.png`), fullPage: true });
  await browser.close();
  return { ended, endingName, evCount, scenes: visited.length, errors };
}

const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
  cwd: path.join(ROOT, 'game'), stdio: 'ignore'
});
await new Promise(r => setTimeout(r, 900));
if (SHOTS) fs.mkdirSync(path.join(ROOT, '.shots'), { recursive: true });

let failed = 0;
try {
  for (const key of (ONLY ? [ONLY] : ['1', '2', '3'])) {
    const r = await run(ROUTES[key], key);
    const ok = r.ended && !r.errors.length;
    console.log(`${ok ? '✓' : '✗'} route ${key}: ${r.endingName || 'NO ENDING REACHED'}`);
    console.log(`    ${r.scenes} scenes · ${r.evCount} evidence logged`);
    if (r.errors.length) {
      failed++;
      [...new Set(r.errors)].slice(0, 8).forEach(e => console.log('    ! ' + e));
    }
    if (!r.ended) failed++;
  }
} finally {
  server.kill();
}
process.exit(failed ? 1 : 0);
