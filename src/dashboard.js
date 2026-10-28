(() => {
  const ZT = globalThis.ZT;
  const $ = (id) => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  // Sequential blue ramp, light -> dark (steps 100..700).
  const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
  const OP_ORDER = ['add', 'sub', 'mul', 'div'];

  const ui = { range: '5', defaultOnly: true };
  try {
    const saved = JSON.parse(localStorage.getItem('zt-ui') || '{}');
    if (saved.range) ui.range = saved.range;
    if (typeof saved.defaultOnly === 'boolean') ui.defaultOnly = saved.defaultOnly;
  } catch (e) { /* storage unavailable: keep defaults */ }

  let allGames = [];

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sec = (ms) => (ms == null ? '-' : (ms / 1000).toFixed(2) + 's');
  const pct = (x) => (x == null ? '-' : Math.round(x * 100) + '%');
  const dateStr = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  function svg(tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }

  // ---- tooltip -----------------------------------------------------------
  const tip = $('tip');
  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let left = x + 14;
    let top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }
  function hideTip() { tip.hidden = true; }
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el) showTip(el.getAttribute('data-tip'), e.clientX, e.clientY);
    else if (!e.target.closest || !e.target.closest('.crosshair-zone')) hideTip();
  });

  // ---- selection ---------------------------------------------------------
  function modeGames() {
    return allGames
      .filter((g) => !ui.defaultOnly || g.isDefault)
      .sort((a, b) => a.startedAt - b.startedAt);
  }

  function selectedGames(games) {
    if (ui.range === 'all') return games;
    if (ui.range === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return games.filter((g) => g.startedAt >= start.getTime());
    }
    return games.slice(-Number(ui.range));
  }

  // ---- sections ----------------------------------------------------------
  function renderInsight(problems) {
    const el = $('insight');
    const solved = problems.filter((p) => p.solved);
    if (!solved.length) { el.textContent = 'No problems in this range.'; return; }
    const overall = ZT.median(solved.map((p) => p.ms));
    const sink = ZT.timeSinks(solved, (p) => p.category).find((s) => s.n >= 2 && s.excess > 0);
    const cells = Object.values(ZT.gridStats(solved)).filter((c) => c.n >= 2).sort((a, b) => b.median - a.median);
    const parts = [];
    if (sink) {
      parts.push(`Drill next: <b>${esc(ZT.CATEGORY_LABELS[sink.key] || sink.key)}</b>. It takes ${pct(sink.timeShare)} of your time on ${pct(sink.countShare)} of problems (median ${sec(sink.median)} vs ${sec(overall)} overall).`);
    }
    if (cells.length) {
      const [small, bucket] = cells[0].key.split('|').map(Number);
      parts.push(`Slowest table cell: <b>${small} x ${bucketLabel(bucket)}</b> (median ${sec(cells[0].median)} over ${cells[0].n} problems).`);
    }
    el.innerHTML = parts.join(' ') || `Median ${sec(overall)} per problem.`;
  }

  function renderTiles(games, sel, problems) {
    const solved = problems.filter((p) => p.solved);
    const scores = sel.map((g) => g.score);
    const best = games.length ? Math.max(...games.map((g) => g.score)) : null;
    const last = games.length ? games[games.length - 1] : null;
    const tiles = [
      { label: 'Best score', value: best ?? '-', note: `${games.length} game${games.length === 1 ? '' : 's'} total` },
      { label: 'Last score', value: last ? last.score : '-', note: last ? dateStr(last.startedAt) : '' },
      { label: 'Average (range)', value: scores.length ? (ZT.mean(scores)).toFixed(1) : '-', note: `${sel.length} game${sel.length === 1 ? '' : 's'}` },
      { label: 'Median per problem', value: sec(ZT.median(solved.map((p) => p.ms))), note: `${solved.length} solved` },
      { label: 'Median think time', value: sec(ZT.median(solved.map((p) => p.firstInputMs).filter((x) => x != null))), note: 'before first keystroke' },
      { label: 'Wrong-digit rate', value: pct(solved.length ? solved.filter((p) => p.errors > 0).length / solved.length : null), note: `${solved.reduce((n, p) => n + p.backspaces, 0)} backspaces` },
    ];
    $('tiles').innerHTML = tiles.map((t) => `<div class="tile"><div class="label">${t.label}</div><div class="value">${t.value}</div><div class="note">${esc(t.note)}</div></div>`).join('');
  }

  function renderTrend(games) {
    const host = $('trend');
    host.innerHTML = '';
    if (!games.length) return;
    const W = 720; const H = 220; const m = { l: 34, r: 12, t: 12, b: 26 };
    const iw = W - m.l - m.r; const ih = H - m.t - m.b;
    const maxY = Math.max(10, Math.ceil(Math.max(...games.map((g) => g.score)) / 10) * 10);
    const x = (i) => m.l + (games.length === 1 ? iw / 2 : (i / (games.length - 1)) * iw);
    const y = (v) => m.t + ih - (v / maxY) * ih;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Score per game' }, host);
    const tickStep = maxY <= 20 ? 5 : maxY <= 60 ? 10 : 20;
    for (let v = 0; v <= maxY; v += tickStep) {
      svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'axis-line' : 'grid-line' }, s);
      svg('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, s).textContent = v;
    }
    svg('text', { x: m.l, y: H - 6 }, s).textContent = dateStr(games[0].startedAt);
    if (games.length > 1) svg('text', { x: W - m.r, y: H - 6, 'text-anchor': 'end' }, s).textContent = dateStr(games[games.length - 1].startedAt);
    if (games.length > 1) {
      svg('polyline', {
        points: games.map((g, i) => `${x(i)},${y(g.score)}`).join(' '),
        fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }, s);
    }
    if (games.length <= 40) {
      games.forEach((g, i) => svg('circle', { cx: x(i), cy: y(g.score), r: 3.5, fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 2 }, s));
    }
    const cross = svg('line', { y1: m.t, y2: m.t + ih, stroke: 'var(--text-muted)', 'stroke-width': 1, visibility: 'hidden' }, s);
    const dot = svg('circle', { r: 5, fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 2, visibility: 'hidden' }, s);
    const zone = svg('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', class: 'crosshair-zone' }, s);
    zone.addEventListener('mousemove', (e) => {
      const r = s.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = games.length === 1 ? 0 : Math.max(0, Math.min(games.length - 1, Math.round(((px - m.l) / iw) * (games.length - 1))));
      const g = games[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(g.score)); dot.setAttribute('visibility', 'visible');
      showTip(`<b>${g.score}</b> <span class="muted">game ${i + 1} - ${esc(dateStr(g.startedAt))}</span>`, e.clientX, e.clientY);
    });
    zone.addEventListener('mouseleave', () => {
      cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip();
    });
  }

  function statsTable(stats, labelFn, opts = {}) {
    if (!stats.length) return '<p class="sub">No data.</p>';
    const maxMedian = Math.max(...stats.map((s) => s.median || 0));
    const rows = stats.map((s) => `
      <tr>
        <td>${esc(labelFn(s.key))}</td>
        <td>${s.n}</td>
        <td><b>${sec(s.median)}</b></td>
        <td class="bar-cell"><div class="bar" style="width:${maxMedian ? (s.median / maxMedian) * 100 : 0}%" data-tip="${esc(`${labelFn(s.key)}: median ${sec(s.median)}, p90 ${sec(s.p90)}`)}"></div></td>
        <td>${sec(s.p90)}</td>
        <td>${sec(s.think)}</td>
        <td>${pct(s.errorRate)}</td>
        ${opts.shares ? `<td>${pct(s.timeShare)}</td><td>${pct(s.countShare)}</td>` : ''}
      </tr>`).join('');
    return `<div class="table-scroll"><table class="stats">
      <thead><tr><th>${opts.first || 'Group'}</th><th>Solved</th><th>Median</th><th></th><th>p90</th><th>Think</th><th>Wrong digit</th>${opts.shares ? '<th>Time share</th><th>Problem share</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function renderOps(problems) {
    const g = ZT.groupStats(problems, (p) => p.op);
    const stats = OP_ORDER.filter((k) => g[k] && g[k].n).map((k) => g[k]);
    $('ops').innerHTML = statsTable(stats, (k) => ZT.OP_LABELS[k] || k, { first: 'Operation' });
  }

  function renderCats(problems) {
    const stats = ZT.timeSinks(problems, (p) => p.category).filter((s) => s.n).sort((a, b) => b.median - a.median);
    $('cats').innerHTML = statsTable(stats, (k) => ZT.CATEGORY_LABELS[k] || k, { first: 'Type', shares: true });
  }

  function bucketLabel(b) {
    return b === 0 ? '2-9' : b === 9 ? '90s-100' : b * 10 + 's';
  }

  function renderGrid(problems) {
    const host = $('grid');
    host.innerHTML = '';
    const grid = ZT.gridStats(problems.filter((p) => p.solved));
    const cells = Object.values(grid);
    if (!cells.length) { host.innerHTML = '<p class="sub">No multiplication or division yet.</p>'; return; }
    const meds = cells.map((c) => c.median).sort((a, b) => a - b);
    const lo = meds[0]; const hi = meds[meds.length - 1];
    const step = (v) => (hi === lo ? 3 : Math.min(RAMP.length - 1, Math.floor(((v - lo) / (hi - lo)) * RAMP.length)));
    const cw = 56; const ch = 30; const left = 40; const top = 22;
    const W = left + cw * 10 + 4; const H = top + ch * 11 + 4;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Median time by times-table cell' }, host);
    for (let b = 0; b < 10; b++) svg('text', { x: left + b * cw + cw / 2, y: 14, 'text-anchor': 'middle' }, s).textContent = bucketLabel(b);
    for (let f = 2; f <= 12; f++) {
      const yy = top + (f - 2) * ch;
      svg('text', { x: left - 8, y: yy + ch / 2 + 4, 'text-anchor': 'end' }, s).textContent = f;
      for (let b = 0; b < 10; b++) {
        const c = grid[f + '|' + b];
        const g = svg('g', {}, s);
        const fill = c ? RAMP[step(c.median)] : 'var(--surface-2)';
        svg('rect', { x: left + b * cw + 1, y: yy + 1, width: cw - 2, height: ch - 2, rx: 4, fill }, g);
        if (c) {
          const dark = step(c.median) >= 3;
          const t = svg('text', { x: left + b * cw + cw / 2, y: yy + ch / 2 + 4, 'text-anchor': 'middle', style: `fill:${dark ? '#ffffff' : '#0b0b0b'}` }, g);
          t.textContent = (c.median / 1000).toFixed(1);
          g.setAttribute('data-tip', `<b>${f} x ${bucketLabel(b)}</b><br>median ${sec(c.median)}, ${c.n} solved, wrong digit ${pct(c.errorRate)}`);
        }
      }
    }
  }

  function renderTimeline(sel) {
    const host = $('timeline');
    host.innerHTML = '';
    const g = sel[sel.length - 1];
    if (!g) { $('timelineSub').textContent = ''; return; }
    $('timelineSub').textContent = `Latest game in range (${dateStr(g.startedAt)}, score ${g.score}). One bar per problem in order; a dot above a bar means you typed a wrong digit.`;
    const ps = g.problems.filter((p) => p.solved);
    if (!ps.length) return;
    const W = 720; const H = 200; const m = { l: 34, r: 8, t: 14, b: 20 };
    const iw = W - m.l - m.r; const ih = H - m.t - m.b;
    const maxMs = Math.max(...ps.map((p) => p.ms));
    const maxY = Math.max(2, Math.ceil(maxMs / 1000));
    const y = (ms) => m.t + ih - (ms / 1000 / maxY) * ih;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Time per problem, latest game' }, host);
    const ticks = maxY <= 6 ? 1 : Math.ceil(maxY / 5);
    for (let v = 0; v <= maxY; v += ticks) {
      svg('line', { x1: m.l, x2: W - m.r, y1: y(v * 1000), y2: y(v * 1000), class: v === 0 ? 'axis-line' : 'grid-line' }, s);
      svg('text', { x: m.l - 6, y: y(v * 1000) + 4, 'text-anchor': 'end' }, s).textContent = v + 's';
    }
    const slot = iw / ps.length;
    const bw = Math.max(2, slot - 2);
    ps.forEach((p, i) => {
      const x0 = m.l + i * slot + (slot - bw) / 2;
      const g2 = svg('g', { 'data-tip': `<b>${esc(p.text)} = ${p.answer}</b><br>${sec(p.ms)} total, think ${sec(p.firstInputMs)}<br>${p.errors ? 'wrong digit typed, ' : ''}${p.backspaces} backspace${p.backspaces === 1 ? '' : 's'}<br><span class="muted">${esc(ZT.CATEGORY_LABELS[p.category] || p.category)}</span>` }, s);
      svg('rect', { x: m.l + i * slot, y: m.t, width: slot, height: ih, fill: 'transparent' }, g2);
      const top = y(p.ms);
      const h = m.t + ih - top;
      svg('path', { d: roundedTop(x0, top, bw, h, Math.min(4, bw / 2)), fill: 'var(--series-1)' }, g2);
      if (p.errors) svg('circle', { cx: x0 + bw / 2, cy: top - 6, r: 2.5, fill: 'var(--text-secondary)' }, g2);
    });
    svg('text', { x: m.l, y: H - 4 }, s).textContent = '1';
    svg('text', { x: W - m.r, y: H - 4, 'text-anchor': 'end' }, s).textContent = ps.length;
  }

  function roundedTop(x, y, w, h, r) {
    if (h <= r) return `M${x},${y + h}V${y}H${x + w}V${y + h}Z`;
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function renderSlowest(problems) {
    const ps = problems.filter((p) => p.solved).sort((a, b) => b.ms - a.ms).slice(0, 15);
    if (!ps.length) { $('slowest').innerHTML = '<p class="sub">No data.</p>'; return; }
    $('slowest').innerHTML = `<div class="table-scroll"><table class="stats">
      <thead><tr><th>Problem</th><th>Answer</th><th>Time</th><th>Think</th><th>Wrong digit</th><th>Type</th></tr></thead>
      <tbody>${ps.map((p) => `<tr><td>${esc(p.text)}</td><td>${p.answer}</td><td><b>${sec(p.ms)}</b></td><td>${sec(p.firstInputMs)}</td><td>${p.errors ? 'yes' : ''}</td><td>${esc(ZT.CATEGORY_LABELS[p.category] || p.category)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  // ---- top level ---------------------------------------------------------
  function render() {
    document.querySelectorAll('#range button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === ui.range)));
    $('defaultOnly').checked = ui.defaultOnly;
    const games = modeGames();
    const sel = selectedGames(games);
    const problems = sel.flatMap((g) => g.problems);
    $('empty').hidden = allGames.length > 0;
    $('content').hidden = allGames.length === 0;
    if (!allGames.length) return;
    if (!games.length) {
      $('insight').textContent = 'No default-mode games yet. Untick "Default mode only" to see your other games.';
    } else {
      renderInsight(problems);
    }
    renderTiles(games, sel, problems);
    renderTrend(games);
    renderOps(problems);
    renderCats(problems);
    renderGrid(problems);
    renderTimeline(sel);
    renderSlowest(problems);
  }

  function saveUi() {
    try { localStorage.setItem('zt-ui', JSON.stringify(ui)); } catch (e) { /* ignore */ }
  }

  function load() {
    chrome.storage.local.get({ games: [] }, (data) => {
      allGames = data.games;
      render();
    });
  }

  $('range').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    ui.range = b.dataset.range;
    saveUi();
    render();
  });
  $('defaultOnly').addEventListener('change', (e) => {
    ui.defaultOnly = e.target.checked;
    saveUi();
    render();
  });

  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ games: allGames }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zetamac-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text()).games || [];
      const byId = new Map(allGames.map((g) => [g.id, g]));
      let added = 0;
      for (const g of incoming) {
        if (g && g.id && Array.isArray(g.problems) && !byId.has(g.id)) { byId.set(g.id, g); added++; }
      }
      chrome.storage.local.set({ games: [...byId.values()] }, () => { $('dataMsg').textContent = `Imported ${added} new game${added === 1 ? '' : 's'}.`; });
    } catch (err) {
      $('dataMsg').textContent = 'That file is not a tracker export.';
    }
    e.target.value = '';
  });

  // Two-step confirm instead of a blocking dialog.
  let clearArmed = null;
  $('clear').addEventListener('click', () => {
    if (!clearArmed) {
      $('clear').textContent = 'Click again to delete everything';
      clearArmed = setTimeout(() => { clearArmed = null; $('clear').textContent = 'Clear all data'; }, 4000);
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = null;
    chrome.storage.local.set({ games: [] }, () => { $('clear').textContent = 'Clear all data'; $('dataMsg').textContent = 'All games deleted.'; });
  });

  // Keep the dashboard live while games finish in another tab.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.games) {
      allGames = changes.games.newValue || [];
      render();
    }
  });

  load();
})();
