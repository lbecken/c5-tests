#!/usr/bin/env node
/**
 * Drives a real playthrough in Chromium and fails on any console error, failed
 * request, or stall. Audio is muted and every clip is seeked to its end so a
 * fifty-minute game runs in about a minute.
 *
 *   node tools/uitest.mjs [--shots]
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = 'http://localhost:8099/index.html';
const SHOTS = process.argv.includes('--shots');
const ACCUSE = (process.argv.find((a) => a.startsWith('--accuse=')) || '').split('=')[1] || 'voss';
const SUPPRESS = process.argv.includes('--suppress');
const SHOT_DIR = path.join(ROOT, 'docs', 'shots');
const problems = [];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 880 } });

page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => {
  // Swapping a media element's src cancels the previous fetch; that abort is
  // expected. Anything else is not. Asset integrity is checked by assetcheck.mjs.
  const aborted = (r.failure()?.errorText || '').includes('ERR_ABORTED');
  if (!r.url().includes('favicon') && !aborted) {
    problems.push(`request failed: ${r.url().replace(/.*8099/, '')} ${r.failure()?.errorText}`);
  }
});
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().includes('favicon')) problems.push(`HTTP ${r.status()} ${r.url().replace(/.*8099/, '')}`);
});

// Stub playback so a fifty-minute game runs in seconds. src assignment is left
// alone, so the browser still fetches every clip and a bad path still shows up
// as a failed request; only the waiting is removed.
await page.addInitScript(() => {
  const proto = HTMLMediaElement.prototype;
  const realPlay = proto.play;
  proto.play = function () {
    if (this.id === 'a-voice') {
      clearTimeout(this.__t);
      this.__t = setTimeout(() => this.dispatchEvent(new Event('ended')), 40);
    }
    return Promise.resolve();
  };
  proto.pause = function () { if (this.id === 'a-voice') clearTimeout(this.__t); };
});

await page.goto(URL_, { waitUntil: 'networkidle' });
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${n}.png`) }); };

const answerKey = async () => page.evaluate(async () => {
  const s = await (await fetch('script.json')).json();
  const title = document.querySelector('#hud-scene').textContent;
  const scene = Object.values(s.scenes).find((x) => x.title === title);
  const p = s.puzzles[scene.puzzle];
  return { kind: p.kind, items: (p.items || []).map((i) => i.answer),
           correct: (p.options || []).map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0) };
});

await shot('01-title');
await page.click('#btn-start');
await page.waitForTimeout(700);
await shot('02-opening');

const log = [];
let ending = null;
let sawChoices = 0;

for (let guard = 0; guard < 900; guard++) {
  const endCard = await page.$('.ending-card h2');
  if (endCard) { ending = (await endCard.textContent()).trim(); break; }

  if (await page.isVisible('#deduction-slot')) {
    await shot('05-deduction');
    for (const f of await page.$$('.ded-field')) {
      const opts = await f.$$('.pz-opt');
      const labels = await Promise.all(opts.map((o) => o.textContent()));
      const isCulprit = labels.some((t) => /Mara Voss/.test(t));
      const NAMES = { voss: /Mara Voss/, trent: /Elias Trent/, rook: /Gabriel Rook/,
                      okafor: /Leila Okafor/, cross: /Julian Cross/, none: /does not support/ };
      const want = isCulprit ? NAMES[ACCUSE] : /11:42|in his chair|11:48:02/;
      const i = labels.findIndex((t) => want.test(t));
      await opts[i >= 0 ? i : 0].click();
    }
    await page.click('#deduction-slot button.solid');
    await page.waitForTimeout(500);
    log.push('deduction');
    continue;
  }

  if (await page.isVisible('#puzzle-slot')) {
    const title = (await page.textContent('#puzzle-slot h3').catch(() => '')) || '';
    log.push(`puzzle: ${title.slice(0, 40)}`);
    await shot(`04-puzzle-${log.length}`);
    const key = await answerKey();
    if (key.kind === 'match') {
      const sels = await page.$$('#puzzle-slot select');
      for (let i = 0; i < sels.length; i++) await sels[i].selectOption(key.items[i]);
    } else {
      const opts = await page.$$('#puzzle-slot .pz-opt');
      for (const i of key.correct) await opts[i].click();
    }
    await page.click('#puzzle-slot button.solid');
    // A correct answer closes this puzzle. The next scene may render its own
    // puzzle straight afterwards, so wait for *this* one to go, not for the
    // slot to be empty.
    let cleared = false;
    for (let w = 0; w < 60; w++) {
      await page.waitForTimeout(100);
      if (!(await page.isVisible('#puzzle-slot'))) { cleared = true; break; }
      const now = (await page.textContent('#puzzle-slot h3').catch(() => '')) || '';
      if (now !== title) { cleared = true; break; }
    }
    if (!cleared) {
      problems.push(`puzzle "${title}" did not accept the documented correct answer`);
      const btns = await page.$$('#puzzle-slot button.line-btn');
      if (btns.length) await btns[btns.length - 1].click();
    }
    continue;
  }

  if (await page.isVisible('#choices')) {
    const btns = await page.$$('#choices .choice');
    if (btns.length) {
      sawChoices++;
      const texts = await Promise.all(btns.map((b) => b.textContent()));
      let idx = texts.findIndex((t) => /I have enough voices/.test(t));
      if (idx < 0 && SUPPRESS) idx = texts.findIndex((t) => /Protect the eclipse data/.test(t));
      if (idx < 0) idx = 0;
      log.push(`choice: ${texts[idx].trim().slice(0, 52)}`);
      if (sawChoices === 1) await shot('03-choices');
      await btns[idx].click();
      await page.waitForTimeout(320);
      continue;
    }
  }
  await page.waitForTimeout(150);
}

await page.click('[data-panel="evidence"]');
await page.waitForTimeout(350);
const evCards = (await page.$$('#panel-body .ev')).length;
const revealed = (await page.$$('#panel-body .ev .truth')).length;
await shot('06-evidence');
await page.click('.panel-tabs [data-tab="archive"]');
await page.waitForTimeout(350);
const clipRows = (await page.$$('#panel-body .clip')).length;
await shot('07-archive');
await page.click('#panel-close');
await page.waitForTimeout(200);
await shot('08-ending');

console.log('\n  UI playthrough\n');
console.log(`  steps           ${log.length}`);
console.log(`  choice points   ${sawChoices}`);
console.log(`  puzzles solved  ${log.filter((l) => l.startsWith('puzzle')).length}`);
console.log(`  ending          ${ending || 'NONE'}`);
console.log(`  evidence cards  ${evCards} (${revealed} with true significance revealed)`);
console.log(`  archive rows    ${clipRows}`);
console.log('\n  steps:');
log.forEach((l) => console.log(`    ${l}`));

await browser.close();

if (!ending) problems.push('never reached an ending');
if (evCards < 12) problems.push(`only ${evCards} evidence cards rendered`);
if (clipRows < 10) problems.push(`only ${clipRows} archive rows rendered`);
if (log.filter((l) => l.startsWith('puzzle')).length < 4) problems.push('did not reach all four puzzles');

if (problems.length) {
  console.log('\n  PROBLEMS:');
  [...new Set(problems)].slice(0, 25).forEach((p) => console.log(`    x ${p}`));
  console.log('');
  process.exit(1);
}
console.log('\n  clean — no console errors, no failed requests\n');
