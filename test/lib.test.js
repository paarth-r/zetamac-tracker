const test = require('node:test');
const assert = require('node:assert/strict');
const ZT = require('../src/lib.js');

test('parseProblem reads all four Zetamac operators', () => {
  assert.deepEqual(ZT.parseProblem('47 + 38'), { a: 47, b: 38, op: 'add', answer: 85 });
  assert.deepEqual(ZT.parseProblem('93 – 47'), { a: 93, b: 47, op: 'sub', answer: 46 });
  assert.deepEqual(ZT.parseProblem('7 \xD7 86'), { a: 7, b: 86, op: 'mul', answer: 602 });
  assert.deepEqual(ZT.parseProblem('602 \xF7 7'), { a: 602, b: 7, op: 'div', answer: 86 });
  assert.equal(ZT.parseProblem(''), null);
  assert.equal(ZT.parseProblem('hello'), null);
});

test('classify splits each operation into the sub-skill it exercises', () => {
  const c = (t) => ZT.classify(ZT.parseProblem(t));
  assert.equal(c('47 + 38'), 'add-carry');
  assert.equal(c('41 + 38'), 'add-no-carry');
  assert.equal(c('93 – 47'), 'sub-borrow');
  assert.equal(c('98 – 47'), 'sub-no-borrow');
  assert.equal(c('7 \xD7 8'), 'mul-table');
  assert.equal(c('7 \xD7 86'), 'mul-2digit');
  assert.equal(c('56 \xF7 7'), 'div-table');
  assert.equal(c('602 \xF7 7'), 'div-2digit');
});

test('factors gives the times-table cell for mul and div only', () => {
  assert.deepEqual(ZT.factors(ZT.parseProblem('7 \xD7 86')), { small: 7, big: 86 });
  assert.deepEqual(ZT.factors(ZT.parseProblem('602 \xF7 7')), { small: 7, big: 86 });
  assert.equal(ZT.factors(ZT.parseProblem('47 + 38')), null);
});

test('analyzeEntries counts think time, wrong digits and backspaces', () => {
  // answer 85: typed 8, then 3 (wrong), backspace, then 5
  const r = ZT.analyzeEntries(85, [
    { t: 900, v: '8' },
    { t: 1100, v: '83' },
    { t: 1400, v: '8' },
    { t: 1600, v: '85' },
  ]);
  assert.equal(r.firstInputMs, 900);
  assert.equal(r.errors, 1);
  assert.equal(r.backspaces, 1);
  assert.equal(r.keystrokes, 4);
});

test('analyzeEntries counts one error per wrong excursion, not per keystroke', () => {
  const r = ZT.analyzeEntries(46, [
    { t: 500, v: '5' }, { t: 600, v: '56' }, { t: 800, v: '5' }, { t: 900, v: '' },
    { t: 1200, v: '4' }, { t: 1300, v: '46' },
  ]);
  assert.equal(r.errors, 1);
  assert.equal(r.backspaces, 2);
});

test('analyzeEntries with no input has null think time', () => {
  const r = ZT.analyzeEntries(12, []);
  assert.equal(r.firstInputMs, null);
  assert.equal(r.errors, 0);
});

test('buildProblem produces a full record', () => {
  const p = ZT.buildProblem('7 \xD7 86', 4200, [{ t: 2000, v: '6' }, { t: 2300, v: '60' }, { t: 2500, v: '602' }], true);
  assert.equal(p.op, 'mul');
  assert.equal(p.category, 'mul-2digit');
  assert.equal(p.small, 7);
  assert.equal(p.big, 86);
  assert.equal(p.ms, 4200);
  assert.equal(p.solved, true);
  assert.equal(p.firstInputMs, 2000);
  assert.equal(p.errors, 0);
});

test('isDefaultSettings recognises the standard 120 s game', () => {
  const def = { add: true, sub: true, mul: true, div: true, add_left_min: 2, add_left_max: 100, add_right_min: 2, add_right_max: 100, mul_left_min: 2, mul_left_max: 12, mul_right_min: 2, mul_right_max: 100 };
  assert.equal(ZT.isDefaultSettings(def), true);
  assert.equal(ZT.isDefaultSettings({ ...def, duration: 120 }), true);
  assert.equal(ZT.isDefaultSettings({ ...def, duration: 30 }), false);
  assert.equal(ZT.isDefaultSettings({ ...def, div: false }), false);
  assert.equal(ZT.isDefaultSettings(null), false);
});

test('stats helpers', () => {
  assert.equal(ZT.median([3, 1, 2]), 2);
  assert.equal(ZT.median([1, 2, 3, 4]), 2.5);
  assert.equal(ZT.median([]), null);
  assert.equal(ZT.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9.1);
});

function prob(text, ms, solved = true, errors = 0) {
  const entries = errors ? [{ t: 100, v: '0' }, { t: 200, v: '' }] : [];
  return ZT.buildProblem(text, ms, entries, solved);
}

test('groupStats ignores the unsolved final problem for timing but counts it', () => {
  const ps = [prob('47 + 38', 2000), prob('41 + 38', 4000, true, 1), prob('7 \xD7 8', 1000), prob('9 + 9', 9999, false)];
  const g = ZT.groupStats(ps, (p) => p.op);
  assert.equal(g.add.n, 2);
  assert.equal(g.add.unsolved, 1);
  assert.equal(g.add.median, 3000);
  assert.equal(g.add.errorRate, 0.5);
  assert.equal(g.add.totalMs, 6000);
  assert.equal(g.mul.n, 1);
});

test('timeSinks ranks groups by share of time over share of problems', () => {
  const ps = [prob('602 \xF7 7', 8000), prob('47 + 38', 1000), prob('41 + 38', 1000), prob('7 \xD7 8', 1000)];
  const sinks = ZT.timeSinks(ps, (p) => p.op);
  assert.equal(sinks[0].key, 'div');
  assert.ok(Math.abs(sinks[0].timeShare - 8000 / 11000) < 1e-9);
  assert.equal(sinks[0].countShare, 0.25);
});

test('gridStats buckets mul/div by small factor and tens of the big factor', () => {
  const ps = [prob('7 \xD7 86', 3000), prob('602 \xF7 7', 5000), prob('7 \xD7 8', 1000), prob('47 + 38', 1000)];
  const grid = ZT.gridStats(ps);
  assert.equal(grid['7|8'].n, 2);
  assert.equal(grid['7|8'].median, 4000);
  assert.equal(grid['7|0'].n, 1);
  assert.equal(Object.keys(grid).length, 2);
});

test('bigBucket', () => {
  assert.equal(ZT.bigBucket(2), 0);
  assert.equal(ZT.bigBucket(9), 0);
  assert.equal(ZT.bigBucket(10), 1);
  assert.equal(ZT.bigBucket(99), 9);
  assert.equal(ZT.bigBucket(100), 9);
});
