# AGENTS.md

Instructions for coding agents (Claude Code, Codex, Cursor and others) working in this repo. Read this before changing anything.

## What this is

A Manifest V3 Chrome extension that records per-problem timing on Zetamac (`https://arithmetic.zetamac.com/game*`) and shows the results on an extension-page dashboard. It has no build step, no framework and no runtime dependencies. Playwright is a dev dependency used only by the end-to-end test. An optional local bridge (Chrome native messaging + Node) copies games to `~/.zetamac-tracker/` for the `zt` CLI and a Markdown notes page.

## If you're here to use the data (not change the code)

Run `node bin/zt.js summary --json` (or `games --last N` for per-problem detail) and follow [`claude/skills/zetamac-coach/SKILL.md`](claude/skills/zetamac-coach/SKILL.md). An empty store means the bridge isn't installed (`./bridge/install.sh`) or the extension hasn't been reloaded since it was. Never edit `~/.zetamac-tracker/games.json` by hand, and never edit inside the `zt:auto` markers of a notes page; the bridge rewrites both.

## Commands

```
npm install
npm test                    # unit tests; must pass before every commit
npm run test:e2e            # live-site end-to-end test; run when src/content.js or manifest.json changes
HEADED=1 npm run test:e2e   # visible browser, for debugging
npx playwright install chromium   # one-time, if the e2e test can't find a browser
```

Use `npm test`. The script uses a glob because `node --test test/` doesn't pick up the directory on Node 24.

## Architecture

| File | Role | Constraints |
|---|---|---|
| `src/lib.js` | Parsing, classification, stats | **Pure.** No DOM, no `chrome.*`. Loaded three ways: as a content script, as a dashboard `<script>`, and via `require()` in Node tests. Keep the UMD-style wrapper at the bottom. |
| `src/content.js` | Recorder on the Zetamac page | Runs at `document_start`, waits for `#game .problem`, `#game input.answer`, `#game .left`. |
| `src/background.js` | Service worker | Opens `dashboard.html`; forwards new games (diffed from `storage.onChanged`) to the bridge, and does a full sync on install/startup. Bridge errors must stay silent. |
| `src/report.js` | Node-only reporting | Trend status, hold-ups, daily rows, `renderMarkdown`, `replaceAutoBlock`. Pure apart from `Date`; tested. |
| `src/store.js` | Node-only store | `~/.zetamac-tracker/{config.json,games.json,bridge.log}` (`ZT_HOME` overrides). Atomic writes. `ingest()` dedupes by `id`. |
| `bridge/host.js` | Native messaging host | Framed JSON on stdin/stdout. **Stdout carries only the protocol**: never `console.log` there, log through `store.log`. |
| `bridge/install.sh` | Installer | Derives the unpacked extension ID from the repo path (sha256 -> a-p), writes the gitignored `bridge/zt-host` wrapper with an absolute node path (browsers start hosts with a minimal PATH), and registers the manifest per browser. |
| `bin/zt.js` | CLI | `summary`, `games`, `notes`, `ingest`, `paths`. |
| `dashboard.html`, `src/dashboard.js`, `src/dashboard.css` | Dashboard | Plain DOM + hand-written SVG. |

## How the recorder works (don't break these)

1. **The capture-phase listener is load-bearing.** `document.addEventListener('input', ..., true)` runs before Zetamac's own jQuery handler on the input. On a correct answer, Zetamac's handler swaps in the next problem and clears the box, so a bubble-phase or element-level listener would see the *next* problem and an empty value.
2. **Problem start = the previous correct answer's timestamp** (`pendingStart`), picked up by a MutationObserver on `.problem`. A problem's time therefore covers everything from when it appeared to when it was solved, with no gaps between problems.
3. **Game end** is detected from the `.left` text reaching 0. The problem still on screen is stored with `solved: false`, and all timing stats exclude it.
4. **Settings** are parsed from the inline `init({...})` script on the page. `isDefault` means the standard 120 s, all-operations game. The dashboard filters on it by default, so a wrong value silently hides or pollutes games.
5. **Zetamac never rejects an answer.** A "miss" is `errors`: the number of times the typed value went from a valid prefix of the answer to something that isn't. One wrong excursion counts once, however many keys it took.

Zetamac's own game script (`https://arithmetic.zetamac.com/dist/app.js`) is short and worth reading before you touch the recorder. Problem text uses `+`, `–` (en dash), `\xD7` and `\xF7`. Multiplication is always (2-12) x (2-100) by default, and division is multiplication reversed.

## Data compatibility

Stored games live in `chrome.storage.local` under `games` (schema in README.md, `version: 1`). Users have real history in there.

- Never rename or remove fields that existing games have. Add fields instead, and make the dashboard tolerate their absence.
- If a breaking change is unavoidable, bump `version` and migrate old games on read. Don't drop them.
- Import must keep merging by `id` and skipping duplicates.

## Bridge rules

- Host name `com.zetamac_tracker.bridge` and the `{ type: 'games', games }` / `{ type: 'ping' }` messages are a contract between the extension and installed hosts. Change both sides together and keep old messages working.
- The notes page is user-owned except between `<!-- zt:auto:start -->` and `<!-- zt:auto:end -->`. `replaceAutoBlock` may also bump the `updated:` frontmatter line, and must not change anything else.
- Moving the repo folder changes the unpacked extension ID. Re-run `bridge/install.sh` after moving it.

## Extension rules

- MV3 CSP: no inline scripts or inline event handlers in `dashboard.html`, no remote scripts, no `eval`. Bundle anything you need locally.
- Keep permissions minimal (`storage`, `unlimitedStorage`, `nativeMessaging`). Don't add host permissions or network access; the README promises that nothing goes over the network.
- Never use `alert`, `confirm` or `prompt`. Destructive actions use the two-click pattern already on "Clear all data".
- Don't interfere with Zetamac's own page. The summary box is inserted after `#game` and must not cover the "Try again" link.

## Dashboard rules

- Colors come from CSS custom properties in `src/dashboard.css`, defined for light and dark (`prefers-color-scheme` plus a `data-theme` override). Add new colors as tokens in both modes. Never hard-code a hex in the JS except the sequential heatmap ramp.
- Charts are single-series (`--series-1`); the heatmap uses the one-hue blue ramp. Text stays in text tokens, never in a series color.
- Every chart mark has a hover tooltip via the `data-tip` attribute. Values set with `setAttribute` must **not** be passed through `esc()` as a whole string (that shows literal tags); escape only the dynamic parts. Values inside HTML template strings must be escaped.
- No horizontal page scroll at 390 px wide. Wide tables scroll inside `.table-scroll`.

## Testing expectations

- New logic goes in `src/lib.js` (browser + Node) or `src/report.js` (Node only), with tests in `test/*.test.js`, written first.
- Bridge or CLI changes: `test/bridge.test.js` spawns the real host and CLI against a temp `ZT_HOME`. Extend it.
- Recorder, background or bridge changes: run `npm run test:e2e`. It also registers a throwaway bridge in the test profile and checks the game reached disk. It must report `PASS` with a worst timing gap of a few ms against Zetamac's own `/log` payload. The test plays on the real public site, so don't run it in a loop.
- Dashboard changes: load the extension, seed `chrome.storage.local` with sample games (from a Playwright service-worker `evaluate`, or play a few games), and look at the page in light mode, dark mode and at 390 px wide before calling it done. Check the console for errors.

## Conventions

- Plain modern JavaScript, 2-space indent, single quotes, semicolons. Match the surrounding code; comments explain *why*, not *what*.
- Small, focused commits with clear messages. Update README.md in the same commit when user-visible behavior changes.
- No emojis in code, UI text or docs.
