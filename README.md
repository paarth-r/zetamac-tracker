# Zetamac Tracker

A Chrome extension that records every problem you see on [Zetamac](https://arithmetic.zetamac.com/) and shows where your two minutes actually go.

For each problem it records:

- total time, from the moment the problem appears until the correct answer is in
- think time: how long before your first keystroke
- wrong digits: whether you typed a digit that is not part of the answer (Zetamac never rejects a wrong answer, so this is what a "miss" means)
- backspaces and keystrokes
- the problem type: carry vs no carry, borrow vs no borrow, table multiplication vs 1-digit x 2-digit, table division vs 2-digit answers
- the times-table cell it drills (for example, 7 x 86 and 602 / 7 both count as row 7, column 80s)

The dashboard shows your score trend, stats by operation and by problem type (median, p90, think time, wrong-digit rate, share of time vs share of problems), a times-table heatmap, a per-problem timeline of your latest game, and your slowest problems. A "Drill next" line names the problem type eating the most clock relative to how often it shows up.

## Install

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick this folder.
3. Pin the extension so its icon stays in the toolbar.

## Use

- Play on Zetamac as usual. Every game on `arithmetic.zetamac.com/game` is recorded automatically, and a short summary appears under the game when time runs out.
- Click the toolbar icon (or **Open dashboard** in the summary) to open the dashboard. Keep it open in a second tab and it updates live as each game finishes.
- **Default mode only** (on by default) limits the stats to the standard 120 s, all-operations game, so your scores are comparable. Untick it to include custom games.
- **Export JSON / Import JSON** back up your history or move it to another browser. **Clear all data** asks for a second click before deleting anything.

All data stays in `chrome.storage.local` in your browser. Nothing is sent anywhere.

## Notes

- Timing uses `performance.now()`. In the end-to-end test it matches Zetamac's own per-problem log to within a couple of milliseconds.
- The problem on screen when the clock hits zero is stored as unsolved and left out of timing stats.
- If the extension attaches after the first problem is already on screen (rare), that problem is flagged `lateStart`.

## Development

```
npm install
npm test           # unit tests for the parsing, classification and stats helpers
npm run test:e2e   # plays a real 30 s game on the live site with the extension loaded
                   # and checks stored data against Zetamac's own problem log
HEADED=1 npm run test:e2e   # same, with a visible browser
```

The end-to-end test needs Playwright's Chromium (`npx playwright install chromium`).

Layout: `src/lib.js` holds the pure analysis code (shared by the page script, the dashboard and the tests), `src/content.js` is the recorder that runs on Zetamac, `src/background.js` opens the dashboard, and `dashboard.html` with `src/dashboard.js` and `src/dashboard.css` is the dashboard.
