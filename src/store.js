// On-disk store for the local bridge and the `zt` CLI.
//   ~/.zetamac-tracker/config.json  { "notesPage": "/abs/path/to/page.md" }  (optional)
//   ~/.zetamac-tracker/games.json   every game the extension has sent
// ZT_HOME overrides the directory (used by tests).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('./report.js');

function home() {
  return process.env.ZT_HOME || path.join(os.homedir(), '.zetamac-tracker');
}

function paths() {
  const h = home();
  return { home: h, config: path.join(h, 'config.json'), games: path.join(h, 'games.json'), log: path.join(h, 'bridge.log') };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function loadConfig() {
  return readJson(paths().config, {});
}

function loadGames() {
  return readJson(paths().games, []);
}

function updateNotes(games, config = loadConfig(), now = Date.now()) {
  if (!config.notesPage) return false;
  const page = fs.existsSync(config.notesPage)
    ? fs.readFileSync(config.notesPage, 'utf8')
    : `---\ntype: topic\ndomain: topics\nsources: 1\nupdated: ${R.localDate(now)}\n---\n\n# Zetamac\n\n## Sources\n\n- Zetamac Tracker bridge\n`;
  const block = R.renderMarkdown(R.buildReport(games, { now }));
  writeAtomic(config.notesPage, R.replaceAutoBlock(page, block, R.localDate(now)));
  return true;
}

// Merge games into the store; rewrite the notes page when anything is new.
function ingest(incoming, { now = Date.now() } = {}) {
  const { games, added } = R.mergeGames(loadGames(), incoming);
  if (added) writeAtomic(paths().games, JSON.stringify(games));
  const notes = added ? updateNotes(games, loadConfig(), now) : false;
  return { added, total: games.length, notes };
}

function log(line) {
  try {
    fs.mkdirSync(home(), { recursive: true });
    fs.appendFileSync(paths().log, `${new Date().toISOString()} ${line}\n`);
  } catch (e) { /* logging must never break the bridge */ }
}

module.exports = { home, paths, loadConfig, loadGames, updateNotes, ingest, log, writeAtomic };
