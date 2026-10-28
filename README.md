# Zetamac Tracker

**See exactly where your two minutes go on [Zetamac](https://arithmetic.zetamac.com/).**

Zetamac gives you a single number at the end of a game. That number tells you whether you're getting faster. It doesn't tell you *why* you're stuck. Zetamac Tracker is a small Chrome extension that times every problem you see and breaks your games down by operation, problem type and times-table cell, so you can drill the thing that's actually costing you points.

![Zetamac Tracker dashboard (sample data)](docs/dashboard.png)

<sub>Dashboard with sample data. It follows your system light/dark setting.</sub>

## What it measures

For every problem:

| Metric | Meaning |
|---|---|
| **Time** | From the moment the problem appears until the correct answer is in the box |
| **Think time** | How long before your first keystroke. Long think time means slow recall; short think time with a long total means slow typing or corrections |
| **Wrong digit** | You typed a digit that is not part of the answer. Zetamac never rejects an answer (it just waits), so this is what a "miss" is |
| **Backspaces** | How many times you deleted |
| **Type** | Add with or without carry, subtract with or without borrow, table multiplication (both factors <= 12) vs 1-digit x 2-digit, table division vs 2-digit answer |
| **Times-table cell** | The 2-12 factor and the tens of the other factor. 7 x 86 and 602 / 7 both land in row 7, column 80s |

The dashboard turns those into:

- **Drill next**: the problem type taking the biggest share of your clock compared with how often it shows up, plus your slowest times-table cell
- **Summary tiles**: best and last score, range average, median time per problem, median think time, wrong-digit rate
- **Score per game**: your trend over time, with hover details
- **By operation** and **by problem type**: count, median, p90, think time, wrong-digit rate, share of time vs share of problems
- **Times-table heatmap**: multiplication and division combined, darker = slower
- **Game timeline**: one bar per problem in your latest game, with wrong digits marked
- **Slowest problems**: the 15 slowest across the selected range

Filter by **Last game / Last 5 / Last 20 / Today / All**. **Default mode only** (on by default) keeps the stats to the standard 120-second, all-operations game, so scores stay comparable.

A short summary also appears right under the game when time runs out.

## Install

The extension isn't on the Chrome Web Store. Load it from source; it takes about a minute.

1. Clone the repo:
   ```
   git clone https://github.com/paarth-r/zetamac-tracker.git
   ```
2. Open `chrome://extensions` in Chrome (Edge, Brave and Arc work the same way).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `zetamac-tracker` folder.
5. Pin the extension so its icon stays in the toolbar.

To update later, run `git pull` and click the reload icon on the extension's card in `chrome://extensions`.

## Use

1. Play Zetamac as normal. Every game at `arithmetic.zetamac.com/game` is recorded automatically. There's nothing to start or stop.
2. When time runs out, a summary appears under the game. Click **Open dashboard**, or click the toolbar icon whenever you like.
3. Keep the dashboard open in a second tab while you practice. It updates by itself as each game finishes.

Tips for using the data:

- **Look at problem type before operation.** "Division is slow" is too vague to practice. "2-digit-answer division is 27% of my time" is something you can drill.
- **Compare think time to total time.** If think time is most of the total, you need faster recall (times tables, splitting tricks). If it's a small part, look at typing speed and wrong digits.
- **Judge trends, not single games.** One score bounces around a lot. Look at the "Last 20" average.

### Your data

Everything stays on your computer. Games live in the browser (`chrome.storage.local`), plus a local file if you install the optional bridge below. Nothing is sent over the network, and the extension has no network access of its own. Under **Data** on the dashboard:

- **Export JSON**: back up your history or move it to another browser
- **Import JSON**: merge an export back in (games already present are skipped)
- **Clear all data**: requires a second click to confirm

Removing the extension deletes its data, so export first if you want to keep it.

## Local bridge, CLI and AI agents (optional)

The dashboard only lives inside the browser. The **local bridge** also copies each finished game to a file on your computer, so scripts, notes apps and coding agents (Claude Code, Codex and others) can read your history.

```
./bridge/install.sh                          # games -> ~/.zetamac-tracker/games.json
./bridge/install.sh --notes ~/notes/zetamac.md   # ...and keep a Markdown notes page updated
```

Then reload the extension at `chrome://extensions`. On reload, and on every browser start, it backfills all existing games, and the bridge skips duplicates. Under the hood this is Chrome [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging): the browser starts `bridge/host.js` locally for each message, with no server and no network involved. Requires Node 18+. macOS and Linux; the installer registers the bridge with every Chromium-based browser it finds (Chrome, Chromium, Brave, Edge, Arc).

**Notes page.** With `--notes`, the bridge rewrites a generated section of that Markdown file after every game: trend (best, last-5 vs previous-5 average, improving/steady/plateau/slipping), hold-ups over the last 7 days (time sinks, recall vs execution bottleneck, slowest times-table cells, wrong-digit hot spots, slowest problems), and a day-by-day table. Only the text between `<!-- zt:auto:start -->` and `<!-- zt:auto:end -->` is touched, so the rest of the page is yours. It works with Obsidian or any Markdown notes folder.

**CLI.**

```
node bin/zt.js summary            # trend, hold-ups and daily table as Markdown
node bin/zt.js summary --json     # same, as JSON (what agents should read)
node bin/zt.js summary --days 30 --custom
node bin/zt.js games --last 3     # raw games with per-problem detail
node bin/zt.js ingest export.json # merge a dashboard export (e.g. history from before the bridge)
node bin/zt.js notes              # rewrite the notes page now
node bin/zt.js paths
```

**For AI agents.** [`claude/skills/zetamac-coach/SKILL.md`](claude/skills/zetamac-coach/SKILL.md) is a ready-made Claude Code skill that reads the data and coaches from it. Copy it to `~/.claude/skills/zetamac-coach/` and replace `<repo>` with your clone path. Other agents can follow the same file: run `zt summary --json`, lead with `holdups.sinks[0]` and the `bottleneck`, and judge trends over 5+ games.

**Uninstall the bridge:** delete `NativeMessagingHosts/com.zetamac_tracker.bridge.json` from your browser's profile folder (for Chrome on macOS, `~/Library/Application Support/Google/Chrome/`). Your data stays in `~/.zetamac-tracker/` until you delete that too.

## How it works

- `src/content.js` runs on Zetamac game pages. It watches the problem text and the answer box. A capture-phase `input` listener sees each keystroke before Zetamac's own handler clears the box, and times are taken with `performance.now()`.
- When the clock hits zero, the problem still on screen is stored as unsolved (it's left out of timing stats) and the game is saved.
- `src/lib.js` holds all the parsing, classification and statistics as pure functions, shared by the recorder, the dashboard and the tests.
- `src/background.js` forwards new games to the bridge (if installed) using `chrome.runtime.sendNativeMessage`. Without the bridge, that call fails quietly.
- `dashboard.html` with `src/dashboard.js` is a plain-JS dashboard. It has no dependencies, draws its charts with hand-written SVG, and loads nothing remote.

**Accuracy:** the end-to-end test plays a real game and compares the stored timings with the per-problem log Zetamac itself sends to its server. They agree to within about 1 ms.

## Development

Requires Node 18+.

```
npm install
npm test                    # unit tests: parsing, stats, reports, bridge protocol, CLI
npm run test:e2e            # live end-to-end test (see below)
HEADED=1 npm run test:e2e   # same, with a visible browser
```

The end-to-end test launches Chromium with the extension loaded, has a bot play a real 30-second game on the live site (with a wrong digit and a backspace planted on every 4th problem), then checks the stored game: score, problem count, planted errors, timings against Zetamac's own log, and that the bridge wrote the game to disk. It registers a throwaway bridge inside the test browser profile and never touches your real data. It needs Playwright's Chromium once: `npx playwright install chromium`. It plays on the real site, so run it when you change the recorder, not in a loop.

### Project layout

```
manifest.json        MV3 manifest: content script on zetamac game pages, toolbar action
src/lib.js           pure analysis helpers (no DOM, no chrome.*)
src/content.js       recorder + end-of-game summary
src/background.js    opens the dashboard, forwards games to the bridge
src/report.js        Node: trend, hold-ups, daily rows, Markdown notes block
src/store.js         Node: ~/.zetamac-tracker store and notes-page writer
bridge/host.js       native messaging host
bridge/install.sh    registers the host with your browsers
bin/zt.js            CLI for you and for agents
claude/skills/       Claude Code skill for coaching from the data
dashboard.html       dashboard markup
src/dashboard.js     dashboard rendering, filters, import/export
src/dashboard.css    dashboard styles (light/dark tokens)
test/*.test.js       unit tests (node:test)
test/e2e.mjs         live-site Playwright test
AGENTS.md            instructions for coding agents working in this repo
```

### Stored data format

`chrome.storage.local` holds one key, `games`, an array of:

```js
{
  version: 1,
  id: "1761674400000",          // start time as a string
  startedAt: 1761674400000,     // epoch ms
  settings: { add: true, ... }, // Zetamac's init() options, parsed from the page
  duration: 120,
  isDefault: true,              // standard 120 s, all-operations game
  score: 26,
  problems: [{
    text: "7 × 86", op: "mul", a: 7, b: 86, answer: 602,
    category: "mul-2digit", small: 7, big: 86,
    ms: 4210, solved: true,
    firstInputMs: 2380, errors: 0, backspaces: 0, keystrokes: 3
  }]
}
```

## Contributing

Issues and pull requests are welcome. Please run `npm test` (and `npm run test:e2e` if you touched `src/content.js`, `src/background.js` or the bridge) before opening a PR. If you're using a coding agent, point it at [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE). Not affiliated with Zetamac.
