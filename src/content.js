// Runs on arithmetic.zetamac.com/game. Watches the problem text and the
// answer box, times every problem, and saves the finished game to
// chrome.storage.local under `games`.
(() => {
  const ZT = globalThis.ZT;
  const now = () => performance.now();

  const state = {
    startedAt: Date.now(),
    problems: [],
    current: null, // { text, start, entries, lateStart }
    pendingStart: null, // timestamp of the last correct answer
    done: false,
  };

  function readSettings() {
    for (const s of document.querySelectorAll('script')) {
      const m = /init\((\{[\s\S]*?\})\)/.exec(s.textContent);
      if (m) {
        try {
          return JSON.parse(m[1]);
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  function startProblem(text, t, lateStart) {
    state.current = { text, start: t, entries: [], lateStart };
  }

  function finishProblem(t, solved) {
    const c = state.current;
    if (!c) return;
    const p = ZT.buildProblem(c.text, t - c.start, c.entries, solved);
    if (c.lateStart) p.lateStart = true;
    state.problems.push(p);
    state.current = null;
  }

  function attach(problemEl, answerEl, leftEl) {
    // The first problem may already be on screen when we attach; its timing
    // then starts late, so it is flagged rather than trusted.
    if (problemEl.textContent.trim()) startProblem(problemEl.textContent.trim(), now(), true);

    new MutationObserver(() => {
      const text = problemEl.textContent.trim();
      if (state.done || !text || state.current) return;
      startProblem(text, state.pendingStart != null ? state.pendingStart : now(), false);
      state.pendingStart = null;
    }).observe(problemEl, { childList: true, characterData: true, subtree: true });

    // Capture phase on the document runs before Zetamac's own handler on the
    // input, which swaps the problem and clears the box on a correct answer.
    document.addEventListener('input', (e) => {
      if (e.target !== answerEl || state.done || !state.current) return;
      const t = now();
      const v = e.target.value;
      state.current.entries.push({ t: Math.round(t - state.current.start), v });
      const p = ZT.parseProblem(state.current.text);
      if (p && v.trim() === String(p.answer)) {
        finishProblem(t, true);
        state.pendingStart = t;
      }
    }, true);

    new MutationObserver(() => {
      const m = /(-?\d+)/.exec(leftEl.textContent);
      if (m && Number(m[1]) <= 0) endGame();
    }).observe(leftEl, { childList: true, characterData: true, subtree: true });
  }

  function endGame() {
    if (state.done) return;
    state.done = true;
    finishProblem(now(), false);
    const settings = readSettings();
    const game = {
      version: 1,
      id: String(state.startedAt),
      startedAt: state.startedAt,
      settings,
      duration: settings && settings.duration ? Number(settings.duration) : 120,
      isDefault: ZT.isDefaultSettings(settings),
      score: state.problems.filter((p) => p.solved).length,
      problems: state.problems,
    };
    chrome.storage.local.get({ games: [] }, (data) => {
      const games = data.games.filter((g) => g.id !== game.id);
      games.push(game);
      chrome.storage.local.set({ games }, () => showSummary(game));
    });
  }

  function fmt(ms) {
    return ms == null ? '-' : (ms / 1000).toFixed(2) + 's';
  }

  function showSummary(game) {
    const solved = game.problems.filter((p) => p.solved);
    const byOp = ZT.groupStats(solved, (p) => p.op);
    const sink = ZT.timeSinks(solved, (p) => p.category)[0];
    const slowest = [...solved].sort((x, y) => y.ms - x.ms).slice(0, 3);
    const errors = solved.filter((p) => p.errors > 0).length;

    const box = document.createElement('div');
    box.id = 'zt-summary';
    box.style.cssText = 'max-width:520px;margin:16px auto;padding:14px 16px;border:1px solid #ccc;border-radius:8px;font:14px/1.45 -apple-system,system-ui,sans-serif;color:#222;background:#fff;text-align:left';
    const rows = ['add', 'sub', 'mul', 'div']
      .filter((op) => byOp[op])
      .map((op) => `<tr><td>${ZT.OP_LABELS[op]}</td><td style="text-align:right">${byOp[op].n}</td><td style="text-align:right">${fmt(byOp[op].median)}</td></tr>`)
      .join('');
    box.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px">Tracker: score ${game.score}, ${errors} problem${errors === 1 ? '' : 's'} with a wrong digit</div>
      <table style="border-collapse:collapse;width:100%;margin-bottom:8px">
        <tr style="color:#666"><td>Operation</td><td style="text-align:right">Solved</td><td style="text-align:right">Median</td></tr>
        ${rows}
      </table>
      ${sink && sink.excess > 0 ? `<div>Biggest time sink: <b>${ZT.CATEGORY_LABELS[sink.key] || sink.key}</b> (${Math.round(sink.timeShare * 100)}% of time on ${Math.round(sink.countShare * 100)}% of problems)</div>` : ''}
      <div>Slowest: ${slowest.map((p) => `${p.text} (${fmt(p.ms)})`).join(', ')}</div>
      <button id="zt-open" style="margin-top:10px;padding:6px 12px;cursor:pointer">Open dashboard</button>`;
    const game$ = document.getElementById('game');
    (game$ && game$.parentNode ? game$.parentNode : document.body).insertBefore(box, game$ ? game$.nextSibling : null);
    box.querySelector('#zt-open').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'open-dashboard' });
    });
  }

  function waitForGame() {
    const find = () => ({
      problemEl: document.querySelector('#game .problem'),
      answerEl: document.querySelector('#game input.answer'),
      leftEl: document.querySelector('#game .left'),
    });
    const els = find();
    if (els.problemEl && els.answerEl && els.leftEl) return attach(els.problemEl, els.answerEl, els.leftEl);
    const obs = new MutationObserver(() => {
      const e = find();
      if (e.problemEl && e.answerEl && e.leftEl) {
        obs.disconnect();
        attach(e.problemEl, e.answerEl, e.leftEl);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  waitForGame();
})();
