const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ZT = require('../src/lib.js');

const ROOT = path.resolve(__dirname, '..');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zt-bridge-'));
}

function sampleGame(id, score) {
  const problems = [];
  for (let i = 0; i < score; i++) problems.push(ZT.buildProblem('602 \xF7 7', 4000, [{ t: 2500, v: '8' }, { t: 4000, v: '86' }], true));
  problems.push(ZT.buildProblem('9 + 9', 300, [], false));
  return { version: 1, id: String(id), startedAt: id, settings: {}, duration: 120, isDefault: true, score, problems };
}

function frame(obj) {
  const body = Buffer.from(JSON.stringify(obj));
  const h = Buffer.alloc(4);
  h.writeUInt32LE(body.length, 0);
  return Buffer.concat([h, body]);
}

function callHost(home, msg) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bridge/host.js')], { input: frame(msg), env: { ...process.env, ZT_HOME: home } });
  assert.equal(r.status, 0, r.stderr.toString());
  const len = r.stdout.readUInt32LE(0);
  assert.equal(r.stdout.length, 4 + len, 'stdout carries exactly one framed reply');
  return JSON.parse(r.stdout.subarray(4, 4 + len).toString());
}

function zt(home, ...args) {
  return spawnSync(process.execPath, [path.join(ROOT, 'bin/zt.js'), ...args], { env: { ...process.env, ZT_HOME: home }, encoding: 'utf8' });
}

test('host speaks the native messaging protocol and dedupes games', () => {
  const home = tmpHome();
  assert.deepEqual(callHost(home, { type: 'ping' }), { ok: true, home });
  const g1 = sampleGame(Date.UTC(2026, 9, 28, 3), 20);
  const g2 = sampleGame(Date.UTC(2026, 9, 28, 4), 22);
  let r = callHost(home, { type: 'games', games: [g1, g2] });
  assert.equal(r.ok, true);
  assert.equal(r.added, 2);
  r = callHost(home, { type: 'games', games: [g1, g2] });
  assert.equal(r.added, 0);
  assert.equal(r.total, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'games.json'), 'utf8')).length, 2);
  assert.equal(callHost(home, { type: 'nope' }).ok, false);
});

test('host rewrites only the auto block of the notes page', () => {
  const home = tmpHome();
  const notes = path.join(home, 'zetamac.md');
  fs.writeFileSync(notes, '---\ntype: topic\nupdated: 2026-01-01\n---\n\n# Zetamac\n\nmy own notes\n\n## Sources\n\n- me\n');
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ notesPage: notes }));
  const r = callHost(home, { type: 'games', games: [sampleGame(Date.UTC(2026, 9, 28, 3), 20)] });
  assert.equal(r.notes, true);
  const page = fs.readFileSync(notes, 'utf8');
  assert.match(page, /my own notes/);
  assert.match(page, /<!-- zt:auto:start -->/);
  assert.match(page, /Best: \*\*20\*\*/);
  assert.ok(page.indexOf('zt:auto:start') < page.indexOf('## Sources'));
  assert.doesNotMatch(page, /updated: 2026-01-01/);
});

test('zt CLI: summary, games, ingest, paths', () => {
  const home = tmpHome();
  let r = zt(home, 'summary');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No default-mode games/);

  const exportFile = path.join(home, 'export.json');
  fs.writeFileSync(exportFile, JSON.stringify({ games: [sampleGame(Date.UTC(2026, 9, 28, 3), 20), sampleGame(Date.UTC(2026, 9, 28, 4), 24)] }));
  r = zt(home, 'ingest', exportFile);
  assert.match(r.stdout, /Added 2 game/);

  r = zt(home, 'summary', '--json');
  const report = JSON.parse(r.stdout);
  assert.equal(report.totals.games, 2);
  assert.equal(report.trend.best, 24);

  r = zt(home, 'games', '--last', '1');
  assert.equal(JSON.parse(r.stdout).length, 1);

  r = zt(home, 'paths');
  assert.equal(JSON.parse(r.stdout).home, home);

  assert.equal(zt(home, 'bogus').status, 1);
});
