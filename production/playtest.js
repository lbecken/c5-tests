/* Headless playthrough. Drives the real engine in Chromium and checks that
 * each ending is reachable, that no scene dead-ends, and that nothing throws.
 *
 *   npx http-server -p 8099 -s game
 *   node production/playtest.js solve      # correct finding, redacted release
 *   node production/playtest.js suppress   # correct finding, suppressed
 *   node production/playtest.js wrong      # careless play
 *
 * `?fast=1` puts the engine in playtest mode: scenes advance without waiting
 * for audio, so a 30-minute drama runs in about twenty seconds.
 */
// playwright may be installed globally rather than in this repo
function loadPlaywright() {
  const { execSync } = require('child_process');
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean);
  try {
    tries.push(require('path').join(
      execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'));
  } catch (e) { /* npm not on PATH */ }
  for (const t of tries) {
    try { return require(t); } catch (e) { /* next */ }
  }
  console.error('playwright not found - npm i -D playwright, or set PLAYWRIGHT_PATH');
  process.exit(2);
}
const { chromium } = loadPlaywright();

// Playwright's own download location, or a browser the environment provides
function findChrome() {
  const fs = require('fs'), path = require('path');
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  for (const d of fs.readdirSync(base).filter(n => n.startsWith('chromium'))) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = path.join(base, d, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

// scenario: how to explore, what to answer, what to release
const SCEN = {
  solve:    { pick: 0, theory: 'right', release: /^Release the accusation/i },
  suppress: { pick: 0, theory: 'right', release: /^Release nothing/i },
  wrong:    { pick: 'last', theory: 'wrong', release: /^Release the accusation/i },
};

(async () => {
  const name = process.argv[2] || 'solve';
  const sc = SCEN[name];
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || findChrome(),
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  page.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/favicon/i.test(t)) errors.push(t); });
  page.on('requestfailed', r => errors.push('FAILED ' + new URL(r.url()).pathname));
  page.on('response', r => {
    const u = new URL(r.url()).pathname;
    if (r.status() === 404 && !/favicon/.test(u)) errors.push('404 ' + u);
  });

  await page.goto(`${BASE}/index.html?fast=1`);
  await page.fill('#dial', '4921');
  await page.dispatchEvent('#dial', 'input');
  await page.click('#begin');

  const seen = new Set();
  let submittedTheory = false;

  for (let step = 0; step < 260; step++) {
    await page.waitForTimeout(110);
    if (await page.locator('.ending-card').count()) break;
    const scene = await page.evaluate(() => window.__scene || '');
    if (scene) seen.add(scene);

    // the finding: choose one option per question, then submit
    if (scene === 's35_theory' && await page.locator('.overlay.on').count()) {
      if (!submittedTheory) {
        const qs = page.locator('#panel-body .q');
        for (let i = 0; i < await qs.count(); i++) {
          const opts = qs.nth(i).locator('.opt');
          const n = await opts.count();
          await opts.nth(sc.theory === 'right' ? 0 : n - 1).click();
        }
        submittedTheory = true;
      }
      const submit = page.locator('#panel-body button.primary:not([disabled])');
      if (await submit.count()) { await submit.click(); continue; }
    }

    const overlay = await page.locator('.overlay.on').count();
    const btns = overlay
      ? page.locator('#panel-body button:not([disabled])')
      : page.locator('#choices button:not([disabled])');
    const n = await btns.count();
    if (!n) continue;
    const labels = [];
    for (let i = 0; i < n; i++) labels.push((await btns.nth(i).innerText()).trim());

    // the disclosure decision
    const titles = labels.map(l => l.split('\n')[0].trim());
    const rel = titles.findIndex(l => sc.release.test(l));
    let pick = (scene === 's36_disclosure' && rel >= 0)
      ? rel : (sc.pick === 'last' ? n - 1 : 0);
    if (/listen again/i.test(labels[pick])) pick = (pick + 1) % n;

    if (process.env.VERBOSE) console.log(`[${step}] ${scene} :: ${labels[pick].split('\n').pop()}`);
    await btns.nth(pick).click({ timeout: 3000 }).catch(() => {});
  }

  const ending = await page.locator('.ending-card .et').innerText().catch(() => 'NONE');
  const verdict = await page.locator('.verdict').innerText().catch(() => '');
  const assets = await page.evaluate(() => window.__assets || []);
  const timings = await page.evaluate(() => fetch('audio/timings.json').then(r => r.json()));
  const uniqAssets = [...new Set(assets)];
  const secs = uniqAssets.reduce((a, id) => a + ((timings[id] || {}).dur || 0), 0);
  console.log(`\n== ${name} ==`);
  console.log(`scenes visited : ${seen.size}`);
  console.log(`audio played   : ${(secs / 60).toFixed(1)} min over ${uniqAssets.length} segments`);
  console.log(`ENDING         : ${ending}`);
  verdict.split('\n').filter(Boolean).slice(0, 6).forEach(l => console.log('  ' + l));
  const uniq = [...new Set(errors)];
  console.log(uniq.length ? `ERRORS: ${uniq.slice(0, 6).join(' | ')}` : 'no errors');
  await browser.close();
  process.exit(ending === 'NONE' || uniq.length ? 1 : 0);
})();
