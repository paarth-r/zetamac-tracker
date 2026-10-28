// End-to-end check against the live site: loads the unpacked extension,
// plays a 30 s game with a bot (a wrong digit + backspace on every 4th
// problem), then compares what the extension stored with the per-problem log
// Zetamac itself POSTs to /log.
//
//   npm run test:e2e            headless
//   HEADED=1 npm run test:e2e   watch it play
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ZT = require('../src/lib.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = mkdtempSync(path.join(tmpdir(), 'zt-e2e-'));

const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: !process.env.HEADED,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
});

try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker');

  const page = await ctx.newPage();
  let siteLog = null;
  page.on('request', (req) => {
    if (req.url().endsWith('/log') && req.method() === 'POST') {
      siteLog = JSON.parse(new URLSearchParams(req.postData()).get('problemLog'));
    }
  });

  await page.goto('https://arithmetic.zetamac.com/');
  await page.selectOption('select[name=duration]', '30');
  await page.click('input[type=submit]');
  await page.waitForSelector('#game .problem');

  let i = 0;
  const wrongOn = new Set();
  while (!(await page.locator('#game input.answer').isDisabled())) {
    const text = (await page.textContent('#game .problem')).trim();
    const p = ZT.parseProblem(text);
    await page.waitForTimeout(150);
    if (i % 4 === 3) {
      const bad = String(p.answer)[0] === '9' ? '1' : '9';
      await page.keyboard.type(bad, { delay: 40 });
      await page.keyboard.press('Backspace');
      wrongOn.add(text + '#' + i);
    }
    await page.keyboard.type(String(p.answer), { delay: 40 });
    i++;
    await page.waitForFunction((prev) => {
      const el = document.querySelector('#game .problem');
      const ans = document.querySelector('#game input.answer');
      return ans.disabled || el.textContent.trim() !== prev || ans.value === '';
    }, text).catch(() => {});
  }

  await page.waitForSelector('#zt-summary', { timeout: 10000 });
  const { games } = await sw.evaluate(() => chrome.storage.local.get('games'));
  assert.equal(games.length, 1, 'one game stored');
  const g = games[0];
  const pageScore = Number((await page.textContent('#game > .correct')).replace(/\D/g, ''));
  assert.equal(g.score, pageScore, 'stored score matches the page');
  assert.equal(g.duration, 30);
  assert.equal(g.isDefault, false, '30 s game is not default mode');
  assert.equal(g.problems.length, g.score + 1, 'every solved problem plus the one left on screen');
  assert.equal(g.problems.at(-1).solved, false);
  assert.ok(!g.problems.some((p) => p.lateStart), 'first problem caught from the start');

  const solved = g.problems.filter((p) => p.solved);
  solved.forEach((p, idx) => {
    assert.equal(p.errors, idx % 4 === 3 ? 1 : 0, `errors on problem ${idx} (${p.text})`);
    assert.equal(p.backspaces, idx % 4 === 3 ? 1 : 0, `backspaces on problem ${idx}`);
    assert.ok(p.firstInputMs >= 100, `think time recorded on problem ${idx}`);
  });

  assert.ok(siteLog, 'captured Zetamac\'s own problem log');
  const siteSolved = siteLog.filter((x) => x.timeMs >= 0);
  assert.equal(siteSolved.length, solved.length, 'same number of solved problems as Zetamac');
  let worst = 0;
  solved.forEach((p, idx) => {
    const s = siteSolved[idx];
    assert.equal(ZT.parseProblem(p.text).answer, s.answer, `problem ${idx} matches Zetamac's`);
    worst = Math.max(worst, Math.abs(p.ms - s.timeMs));
  });
  // Zetamac's own times use Date.now() (1 ms resolution, same event), so the two should agree closely.
  assert.ok(worst <= 25, `timings within 25 ms of Zetamac's own log (worst ${worst} ms)`);

  console.log(`PASS: ${g.score} problems, ${solved.filter((p) => p.errors).length} with planted errors, worst timing gap vs Zetamac ${worst} ms`);
} finally {
  await ctx.close();
  rmSync(profile, { recursive: true, force: true });
}
