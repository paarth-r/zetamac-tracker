#!/usr/bin/env node
// Command-line access to Zetamac Tracker data, for you and for coding agents.
// Reads the games the local bridge saved to ~/.zetamac-tracker/games.json.
const fs = require('node:fs');
const store = require('../src/store.js');
const R = require('../src/report.js');

const USAGE = `zt - Zetamac Tracker data

Usage:
  zt summary [--json] [--days N] [--custom]   trend, hold-ups and daily table (default: last 7 days)
  zt games [--last N]                          raw games as JSON (default: last 5)
  zt notes                                     rewrite the configured notes page now
  zt ingest <export.json>                      merge a dashboard "Export JSON" file into the store
  zt paths                                     show where data and config live

--custom includes non-default games (other durations or settings).`;

function flag(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function main(argv) {
  const [cmd, ...args] = argv;
  const games = store.loadGames();
  switch (cmd) {
    case 'summary': {
      const report = R.buildReport(games, {
        includeCustom: args.includes('--custom'),
        windowDays: Number(flag(args, '--days') || 7),
      });
      if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
      else console.log(R.renderMarkdown(report));
      return 0;
    }
    case 'games': {
      const n = Number(flag(args, '--last') || 5);
      console.log(JSON.stringify(games.slice(-n), null, 2));
      return 0;
    }
    case 'notes': {
      const cfg = store.loadConfig();
      if (!cfg.notesPage) {
        console.error(`No notesPage set in ${store.paths().config}`);
        return 1;
      }
      store.updateNotes(games, cfg);
      console.log(`Updated ${cfg.notesPage}`);
      return 0;
    }
    case 'ingest': {
      const file = args[0];
      if (!file) { console.error(USAGE); return 1; }
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const r = store.ingest(Array.isArray(data) ? data : data.games || []);
      console.log(`Added ${r.added} game(s); ${r.total} total.${r.notes ? ' Notes page updated.' : ''}`);
      return 0;
    }
    case 'paths': {
      const p = store.paths();
      console.log(JSON.stringify({ ...p, notesPage: store.loadConfig().notesPage || null }, null, 2));
      return 0;
    }
    default:
      console.log(USAGE);
      return cmd && cmd !== 'help' && cmd !== '--help' ? 1 : 0;
  }
}

process.exitCode = main(process.argv.slice(2));
