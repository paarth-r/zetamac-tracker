// Node-side reporting for the local bridge and the `zt` CLI: daily rows,
// trend status, hold-ups, and the Markdown block written to a notes page.
const ZT = require('./lib.js');

const AUTO_START = '<!-- zt:auto:start -->';
const AUTO_END = '<!-- zt:auto:end -->';

const sec = (ms) => (ms == null ? '-' : (ms / 1000).toFixed(2) + 's');
const pct = (x) => (x == null ? '-' : Math.round(x * 100) + '%');
const catLabel = (k) => ZT.CATEGORY_LABELS[k] || k;

function localDate(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mergeGames(existing, incoming) {
  const byId = new Map(existing.map((g) => [g.id, g]));
  let added = 0;
  for (const g of incoming) {
    if (g && g.id && Array.isArray(g.problems) && !byId.has(g.id)) {
      byId.set(g.id, g);
      added++;
    }
  }
  const games = [...byId.values()].sort((a, b) => a.startedAt - b.startedAt);
  return { games, added };
}

function solvedOf(games) {
  return games.flatMap((g) => g.problems).filter((p) => p.solved);
}

function dailyRows(games) {
  const days = new Map();
  for (const g of games) {
    const k = localDate(g.startedAt);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(g);
  }
  return [...days.entries()].map(([date, gs]) => {
    const solved = solvedOf(gs);
    const scores = gs.map((g) => g.score);
    const h = holdups(solved);
    return {
      date,
      games: gs.length,
      best: Math.max(...scores),
      avg: Number(ZT.mean(scores).toFixed(1)),
      medianMs: ZT.median(solved.map((p) => p.ms)),
      wrongDigitRate: h.wrongDigitRate,
      topSink: h.sinks[0] ? h.sinks[0].key : null,
    };
  });
}

// What is costing time, from a set of problems.
function holdups(problems) {
  const solved = problems.filter((p) => p.solved);
  const overall = ZT.median(solved.map((p) => p.ms));
  const sinks = ZT.timeSinks(solved, (p) => p.category).filter((s) => s.n >= 2 && s.excess > 0);
  const cells = Object.values(ZT.gridStats(solved))
    .filter((c) => c.n >= 2)
    .sort((a, b) => b.median - a.median)
    .slice(0, 5)
    .map((c) => {
      const [small, bucket] = c.key.split('|').map(Number);
      return { ...c, small, bucket, label: `${small} x ${bucket === 0 ? '2-9' : bucket === 9 ? '90s-100' : bucket * 10 + 's'}` };
    });
  const thinkShares = solved.filter((p) => p.firstInputMs != null && p.ms > 0).map((p) => p.firstInputMs / p.ms);
  const thinkShare = ZT.median(thinkShares);
  const errProblems = solved.filter((p) => p.errors > 0);
  const errByCat = Object.values(ZT.groupStats(solved, (p) => p.category))
    .filter((g) => g.n >= 3 && g.errorRate > 0)
    .sort((a, b) => b.errorRate - a.errorRate);
  return {
    solved: solved.length,
    medianMs: overall,
    thinkMs: ZT.median(solved.map((p) => p.firstInputMs).filter((x) => x != null)),
    thinkShare,
    // Most of each problem spent before the first keystroke = slow recall;
    // otherwise the time goes to typing and fixing digits.
    bottleneck: thinkShare == null ? null : thinkShare >= 0.6 ? 'recall' : 'execution',
    wrongDigitRate: solved.length ? errProblems.length / solved.length : null,
    sinks,
    cells,
    errByCat: errByCat.slice(0, 3),
    slowest: [...solved].sort((a, b) => b.ms - a.ms).slice(0, 5).map((p) => ({ text: p.text, answer: p.answer, ms: p.ms })),
  };
}

function trend(games) {
  const scores = games.map((g) => g.score);
  const best = scores.length ? Math.max(...scores) : null;
  if (games.length < 6) return { status: 'early', best, last: scores.at(-1) ?? null, recentAvg: scores.length ? ZT.mean(scores) : null, priorAvg: null };
  const recent = scores.slice(-5);
  const prior = scores.slice(-10, -5);
  const recentAvg = ZT.mean(recent);
  const priorAvg = prior.length ? ZT.mean(prior) : null;
  const last10 = scores.slice(-10);
  const bestBefore = Math.max(...scores.slice(0, -10).concat([-Infinity]));
  const noNewBest = Math.max(...last10) <= bestBefore;
  const spread = Math.max(...last10) - Math.min(...last10);
  let status = 'steady';
  if (priorAvg != null && recentAvg - priorAvg >= 2) status = 'improving';
  else if (priorAvg != null && priorAvg - recentAvg >= 2) status = 'slipping';
  else if (scores.length >= 10 && (noNewBest || spread <= 3)) status = 'plateau';
  return { status, best, last: scores.at(-1), recentAvg, priorAvg };
}

function buildReport(allGames, { now = Date.now(), includeCustom = false, windowDays = 7 } = {}) {
  const games = allGames.filter((g) => includeCustom || g.isDefault).sort((a, b) => a.startedAt - b.startedAt);
  const recent = games.filter((g) => g.startedAt >= now - windowDays * 86400e3);
  const basis = recent.length ? recent : games.slice(-20);
  return {
    generatedAt: now,
    includeCustom,
    windowDays,
    totals: { games: games.length, problems: solvedOf(games).length, firstGame: games[0] ? games[0].startedAt : null },
    trend: trend(games),
    holdups: holdups(basis.flatMap((g) => g.problems)),
    holdupBasis: recent.length ? `last ${windowDays} days (${recent.length} games)` : `last ${basis.length} games`,
    daily: dailyRows(games),
  };
}

function renderMarkdown(r) {
  const t = r.trend;
  const h = r.holdups;
  const lines = [];
  lines.push(`_Generated by the Zetamac Tracker bridge on ${new Date(r.generatedAt).toLocaleString()}. Edit outside this block; it is rewritten after every game._`);
  lines.push('');
  if (!r.totals.games) {
    lines.push('No default-mode games recorded yet.');
    return lines.join('\n');
  }
  lines.push('### Trend');
  lines.push('');
  lines.push(`- Best: **${t.best}**, last: ${t.last}, status: **${t.status}**`);
  if (t.recentAvg != null) lines.push(`- Last 5 average: ${t.recentAvg.toFixed(1)}${t.priorAvg != null ? ` (previous 5: ${t.priorAvg.toFixed(1)})` : ''}`);
  lines.push(`- ${r.totals.games} default-mode games, ${r.totals.problems} problems solved`);
  lines.push('');
  lines.push(`### Hold-ups (${r.holdupBasis})`);
  lines.push('');
  lines.push(`- Median ${sec(h.medianMs)} per problem, ${sec(h.thinkMs)} before the first keystroke. Bottleneck: **${h.bottleneck === 'recall' ? 'recall (most of each problem is spent before typing)' : 'execution (typing and corrections)'}**.`);
  lines.push(`- Wrong-digit rate: ${pct(h.wrongDigitRate)}`);
  if (h.sinks.length) {
    lines.push('- Time sinks (share of time vs share of problems):');
    for (const s of h.sinks.slice(0, 3)) lines.push(`  - ${catLabel(s.key)}: ${pct(s.timeShare)} of time on ${pct(s.countShare)} of problems, median ${sec(s.median)}`);
  }
  if (h.cells.length) lines.push(`- Slowest times-table cells: ${h.cells.map((c) => `${c.label} (${sec(c.median)}, n=${c.n})`).join(', ')}`);
  if (h.errByCat.length) lines.push(`- Most wrong digits: ${h.errByCat.map((g) => `${catLabel(g.key)} ${pct(g.errorRate)}`).join(', ')}`);
  if (h.slowest.length) lines.push(`- Slowest problems: ${h.slowest.map((p) => `${p.text} = ${p.answer} (${sec(p.ms)})`).join(', ')}`);
  lines.push('');
  lines.push('### By day');
  lines.push('');
  lines.push('| Date | Games | Best | Avg | Median/problem | Wrong digit | Top time sink |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const d of r.daily) lines.push(`| ${d.date} | ${d.games} | ${d.best} | ${d.avg} | ${sec(d.medianMs)} | ${pct(d.wrongDigitRate)} | ${d.topSink ? catLabel(d.topSink) : '-'} |`);
  return lines.join('\n');
}

function replaceAutoBlock(page, block, dateStr) {
  let out = page.replace(/^updated: .*$/m, `updated: ${dateStr}`);
  const wrapped = `${AUTO_START}\n${block}\n${AUTO_END}`;
  const s = out.indexOf(AUTO_START);
  const e = out.indexOf(AUTO_END);
  if (s !== -1 && e > s) return out.slice(0, s) + wrapped + out.slice(e + AUTO_END.length);
  const section = `## Tracker data (auto)\n\n${wrapped}\n\n`;
  const src = out.search(/^## Sources/m);
  if (src !== -1) return out.slice(0, src) + section + out.slice(src);
  return out.replace(/\n*$/, '\n\n') + section;
}

module.exports = { AUTO_START, AUTO_END, localDate, mergeGames, dailyRows, holdups, trend, buildReport, renderMarkdown, replaceAutoBlock };
