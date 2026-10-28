const test = require('node:test');
const assert = require('node:assert/strict');
const ZT = require('../src/lib.js');
const R = require('../src/report.js');

const DAY = 86400e3;
const T0 = new Date(2026, 9, 28, 20, 0).getTime();

// A game whose problems all take `ms`, except problems of `slowCat` which take `slowMs`.
function game(t, score, { ms = 3000, slow = null, slowMs = 8000, isDefault = true, think = 0.5, errEvery = 0 } = {}) {
  const pool = ['47 + 38', '41 + 38', '93 – 47', '98 – 47', '7 \xD7 8', '7 \xD7 86', '56 \xF7 7', '602 \xF7 7'];
  const problems = [];
  for (let i = 0; i < score; i++) {
    const text = pool[i % pool.length];
    const p0 = ZT.parseProblem(text);
    const cat = ZT.classify(p0);
    const dur = cat === slow ? slowMs : ms;
    const entries = [{ t: Math.round(dur * think), v: String(p0.answer)[0] }];
    if (errEvery && i % errEvery === 0) entries.push({ t: dur - 200, v: String(p0.answer)[0] + 'x' }, { t: dur - 100, v: String(p0.answer)[0] });
    entries.push({ t: dur, v: String(p0.answer) });
    problems.push(ZT.buildProblem(text, dur, entries, true));
  }
  problems.push(ZT.buildProblem('9 + 9', 500, [], false));
  return { version: 1, id: String(t), startedAt: t, settings: {}, duration: 120, isDefault, score, problems };
}

test('dailyRows groups default games by local date', () => {
  const games = [game(T0, 20), game(T0 + 60e3, 26), game(T0 + DAY, 30)];
  const rows = R.dailyRows(games);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].games, 2);
  assert.equal(rows[0].best, 26);
  assert.equal(rows[0].avg, 23);
  assert.equal(rows[1].best, 30);
});

test('holdups names the category eating disproportionate time', () => {
  const games = [game(T0, 24, { slow: 'div-2digit' }), game(T0 + 60e3, 24, { slow: 'div-2digit' })];
  const h = R.holdups(games.flatMap((g) => g.problems));
  assert.equal(h.sinks[0].key, 'div-2digit');
  assert.ok(h.sinks[0].timeShare > h.sinks[0].countShare);
});

test('holdups classifies recall-bound vs execution-bound from think share', () => {
  const recall = R.holdups(game(T0, 24, { think: 0.8 }).problems);
  assert.equal(recall.bottleneck, 'recall');
  const exec = R.holdups(game(T0, 24, { think: 0.3 }).problems);
  assert.equal(exec.bottleneck, 'execution');
});

test('holdups reports wrong-digit rate', () => {
  const h = R.holdups(game(T0, 20, { errEvery: 4 }).problems);
  assert.equal(h.wrongDigitRate, 0.25);
});

test('trend detects improvement and plateau', () => {
  const rising = Array.from({ length: 10 }, (_, i) => game(T0 + i * 60e3, 20 + i * 2));
  const t1 = R.trend(rising);
  assert.equal(t1.status, 'improving');
  assert.equal(t1.best, 38);

  const flat = [game(T0, 30), ...Array.from({ length: 10 }, (_, i) => game(T0 + (i + 1) * 60e3, 22 + (i % 3)))];
  const t2 = R.trend(flat);
  assert.equal(t2.status, 'plateau');
});

test('trend with few games is early', () => {
  assert.equal(R.trend([game(T0, 20)]).status, 'early');
});

test('buildReport only uses default-mode games by default', () => {
  const games = [game(T0, 20), game(T0 + 60e3, 90, { isDefault: false })];
  const r = R.buildReport(games, { now: T0 + 120e3 });
  assert.equal(r.totals.games, 1);
  assert.equal(r.trend.best, 20);
  const all = R.buildReport(games, { now: T0 + 120e3, includeCustom: true });
  assert.equal(all.totals.games, 2);
});

test('renderMarkdown includes trend, hold-ups and daily table', () => {
  const games = Array.from({ length: 6 }, (_, i) => game(T0 + i * 60e3, 20 + i, { slow: 'div-2digit' }));
  const md = R.renderMarkdown(R.buildReport(games, { now: T0 + DAY / 2 }));
  assert.match(md, /Best: \*\*25\*\*/);
  assert.match(md, /Divide, 2-digit answer/);
  assert.match(md, /\| Date \| Games \| Best \| Avg \|/);
  assert.doesNotMatch(md, /undefined|NaN/);
});

test('replaceAutoBlock swaps only the generated section', () => {
  const page = '---\ntype: topic\nupdated: 2026-01-01\n---\n\n# Z\n\nmanual\n\n<!-- zt:auto:start -->\nold\n<!-- zt:auto:end -->\n\nafter\n';
  const out = R.replaceAutoBlock(page, 'NEW', '2026-10-28');
  assert.match(out, /manual/);
  assert.match(out, /after/);
  assert.match(out, /<!-- zt:auto:start -->\nNEW\n<!-- zt:auto:end -->/);
  assert.doesNotMatch(out, /old/);
  assert.match(out, /updated: 2026-10-28/);
});

test('replaceAutoBlock inserts the block before Sources when markers are missing', () => {
  const page = '---\nupdated: 2026-01-01\n---\n\n# Z\n\nmanual\n\n## Sources\n\n- x\n';
  const out = R.replaceAutoBlock(page, 'NEW', '2026-10-28');
  assert.ok(out.indexOf('<!-- zt:auto:start -->') < out.indexOf('## Sources'));
  assert.match(out, /manual/);
});

test('mergeGames dedupes by id and keeps order by start time', () => {
  const a = game(T0, 20);
  const b = game(T0 + 60e3, 22);
  const { games, added } = R.mergeGames([b], [a, b]);
  assert.equal(added, 1);
  assert.deepEqual(games.map((g) => g.id), [a.id, b.id]);
});
