// Pure analysis helpers shared by the content script, the dashboard and the
// Node tests. No DOM or chrome.* access in this file.
(function (root) {
  const OPS = { '+': 'add', '-': 'sub', '–': 'sub', '\xD7': 'mul', '*': 'mul', '\xF7': 'div', '/': 'div' };

  const OP_LABELS = { add: 'Addition', sub: 'Subtraction', mul: 'Multiplication', div: 'Division' };

  const CATEGORY_LABELS = {
    'add-carry': 'Add, with carry',
    'add-no-carry': 'Add, no carry',
    'sub-borrow': 'Subtract, with borrow',
    'sub-no-borrow': 'Subtract, no borrow',
    'mul-table': 'Multiply, table (both <= 12)',
    'mul-2digit': 'Multiply, 1-digit x 2-digit',
    'div-table': 'Divide, table (answer <= 12)',
    'div-2digit': 'Divide, 2-digit answer',
  };

  const DEFAULT_SETTINGS = {
    add: true, sub: true, mul: true, div: true,
    add_left_min: 2, add_left_max: 100, add_right_min: 2, add_right_max: 100,
    mul_left_min: 2, mul_left_max: 12, mul_right_min: 2, mul_right_max: 100,
  };

  function parseProblem(text) {
    const m = /^\s*(\d+)\s*([+\-–\xD7*\xF7/])\s*(\d+)\s*$/.exec(text || '');
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[3]);
    const op = OPS[m[2]];
    const answer = op === 'add' ? a + b : op === 'sub' ? a - b : op === 'mul' ? a * b : a / b;
    return { a, b, op, answer };
  }

  function classify(p) {
    if (!p) return 'unknown';
    switch (p.op) {
      case 'add': return (p.a % 10) + (p.b % 10) >= 10 ? 'add-carry' : 'add-no-carry';
      case 'sub': return (p.a % 10) < (p.b % 10) ? 'sub-borrow' : 'sub-no-borrow';
      case 'mul': return Math.max(p.a, p.b) <= 12 ? 'mul-table' : 'mul-2digit';
      case 'div': return p.answer <= 12 ? 'div-table' : 'div-2digit';
      default: return 'unknown';
    }
  }

  // The times-table cell a mul/div problem drills: Zetamac always pairs a
  // 2-12 factor with a 2-100 factor (division is multiplication reversed).
  function factors(p) {
    if (!p) return null;
    if (p.op === 'mul') return { small: Math.min(p.a, p.b), big: Math.max(p.a, p.b) };
    if (p.op === 'div') return { small: Math.min(p.b, p.answer), big: Math.max(p.b, p.answer) };
    return null;
  }

  // entries: [{ t: ms since the problem appeared, v: input value }]
  function analyzeEntries(answer, entries) {
    const target = String(answer);
    let prev = '';
    let onTrack = true;
    let errors = 0;
    let backspaces = 0;
    for (const e of entries) {
      const v = String(e.v).trim();
      if (v.length < prev.length) backspaces++;
      const ok = target.startsWith(v);
      if (!ok && onTrack) errors++;
      onTrack = ok;
      prev = v;
    }
    return {
      firstInputMs: entries.length ? entries[0].t : null,
      errors,
      backspaces,
      keystrokes: entries.length,
    };
  }

  function buildProblem(text, ms, entries, solved) {
    const p = parseProblem(text);
    const f = factors(p);
    return {
      text,
      op: p ? p.op : 'unknown',
      a: p ? p.a : null,
      b: p ? p.b : null,
      answer: p ? p.answer : null,
      category: classify(p),
      small: f ? f.small : null,
      big: f ? f.big : null,
      ms: Math.round(ms),
      solved,
      ...analyzeEntries(p ? p.answer : '', entries),
    };
  }

  function isDefaultSettings(s) {
    if (!s) return false;
    if (s.duration != null && Number(s.duration) !== 120) return false;
    return Object.keys(DEFAULT_SETTINGS).every((k) => s[k] === DEFAULT_SETTINGS[k]);
  }

  function median(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((x, y) => x - y);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // Linear interpolation between closest ranks.
  function percentile(xs, q) {
    if (!xs.length) return null;
    const s = [...xs].sort((x, y) => x - y);
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  function mean(xs) {
    return xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null;
  }

  // Timing stats count solved problems only; the problem left on screen when
  // the clock runs out is tallied as `unsolved`.
  function groupStats(problems, keyFn) {
    const groups = {};
    for (const p of problems) {
      const k = keyFn(p);
      if (k == null) continue;
      (groups[k] = groups[k] || { solved: [], unsolved: 0 });
      if (p.solved) groups[k].solved.push(p);
      else groups[k].unsolved++;
    }
    const out = {};
    for (const [k, g] of Object.entries(groups)) {
      const times = g.solved.map((p) => p.ms);
      const thinks = g.solved.map((p) => p.firstInputMs).filter((x) => x != null);
      out[k] = {
        key: k,
        n: g.solved.length,
        unsolved: g.unsolved,
        median: median(times),
        mean: mean(times),
        p90: percentile(times, 0.9),
        think: median(thinks),
        totalMs: times.reduce((x, y) => x + y, 0),
        errorRate: g.solved.length ? g.solved.filter((p) => p.errors > 0).length / g.solved.length : null,
      };
    }
    return out;
  }

  // Which groups eat more of the clock than their share of problems.
  function timeSinks(problems, keyFn) {
    const solved = problems.filter((p) => p.solved);
    const total = solved.reduce((x, p) => x + p.ms, 0);
    const stats = Object.values(groupStats(solved, keyFn));
    return stats
      .map((g) => ({
        ...g,
        timeShare: total ? g.totalMs / total : 0,
        countShare: solved.length ? g.n / solved.length : 0,
      }))
      .map((g) => ({ ...g, excess: g.timeShare - g.countShare }))
      .sort((x, y) => y.excess - x.excess);
  }

  function bigBucket(big) {
    return Math.min(9, Math.floor(big / 10));
  }

  function gridStats(problems) {
    return groupStats(
      problems.filter((p) => p.small != null),
      (p) => p.small + '|' + bigBucket(p.big),
    );
  }

  const api = {
    OP_LABELS, CATEGORY_LABELS, DEFAULT_SETTINGS,
    parseProblem, classify, factors, analyzeEntries, buildProblem, isDefaultSettings,
    median, percentile, mean, groupStats, timeSinks, bigBucket, gridStats,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
