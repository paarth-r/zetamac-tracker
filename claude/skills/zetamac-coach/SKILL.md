---
name: zetamac-coach
description: Use when the user asks about their Zetamac / arithmetic speed-drill practice, mental math scores, what is holding them back, trends, or what to drill next, or when they report a Zetamac score. Reads per-problem data recorded by the Zetamac Tracker extension through the local `zt` CLI.
---

# Zetamac coach

The Zetamac Tracker extension records every problem the user plays (time, think time before the first keystroke, wrong digits, backspaces, problem type). Its local bridge copies each game to `~/.zetamac-tracker/games.json`. You read it with the `zt` CLI from the repo:

```
node <repo>/bin/zt.js summary --json      # trend, hold-ups, daily rows (last 7 days of default games)
node <repo>/bin/zt.js summary             # same, as Markdown
node <repo>/bin/zt.js summary --days 30 --custom
node <repo>/bin/zt.js games --last 3      # raw games, per-problem detail
node <repo>/bin/zt.js paths               # where data and the notes page live
```

If `games.json` is missing or empty, the bridge isn't installed or the extension hasn't been reloaded since. Tell the user to run `./bridge/install.sh` in the repo and reload the extension at `chrome://extensions`. Don't guess at numbers.

## Reading the report

- `trend.status`: `early` (under 6 games), `improving` / `slipping` (last-5 average moved by 2+ vs the previous 5), `plateau` (10+ games with no new best or a spread of 3 or less), otherwise `steady`.
- `holdups.bottleneck`: `recall` means most of each problem passes before the first keystroke, so drill facts and decomposition. `execution` means time goes to typing and fixing digits, so drill accuracy and typing (a numpad is worth it once scores are in the mid 30s).
- `holdups.sinks`: problem types whose share of time exceeds their share of problems. The first one is the main thing to drill.
- `holdups.cells`: slowest times-table cells (small factor x tens of the other factor).
- `holdups.wrongDigitRate`, `errByCat`: careless errors and where they cluster.

## Coaching

- Lead with the single biggest hold-up and a concrete drill for it (for example, "2-digit-answer division: do 20 problems like 602 / 7 untimed, reading them as 7 x ? = 602"). Don't list everything.
- Judge trends over 5+ games, never a single score.
- Cite the actual numbers from the report.
