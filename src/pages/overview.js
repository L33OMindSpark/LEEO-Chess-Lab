import { S, startBatch, startAll, analysedCount } from '../state.js'
import { slice, metrics, horizons, ratingSeries, style } from '../stats.js'
import { tips } from '../tips.js'
import { lineChart, heatmap } from '../charts.js'
import { esc, fmt, dateStr } from '../util.js'
import { filterHTML, bindFilter, sign, dcls, winLabel, cap } from '../ui.js'

export const refresh = true

const ago = ms => { const h = ms / 3600000; return h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago` }

export default function (root) {
  const f = S.filter, cur = slice(S.games, f), prevSet = slice(S.games, f, 1)
  const m = metrics(cur, S.sm)
  const hz = horizons(S.games, f.classes, S.sm)
  const verdict = hz.find(h => h.win === f.win)?.verdict
  const st = style(cur, m), p = S.profile || {}, stats = S.stats || {}
  const analysed = analysedCount(), total = S.games.length, left = S.games.filter(g => g.pgn && !S.sm[g.id]).length
  const now = k => stats['chess_' + k]?.last?.rating, best = k => stats['chess_' + k]?.best?.rating
  const tp = tips(cur, m).slice(0, 3)

  // what changed since the last visit
  let since = ''
  if (S.lastVisit && Date.now() - S.lastVisit > 3600000) {
    const fresh = S.games.filter(g => g.t * 1000 > S.lastVisit && f.classes.has(g.cls))
    if (fresh.length) { const sm = metrics(fresh, S.sm); since = `<div class="since"><span class="muted">Since your last visit ${ago(Date.now() - S.lastVisit)}</span><span><b>${fresh.length}</b> new games</span><span><b class="delta ${dcls(sm.ratingDelta)}">${sign(sm.ratingDelta)}</b> rating</span><span><b>${sm.score.toFixed(0)}%</b> score</span></div>` }
  }

  root.innerHTML = `
  <div class="phead">
    <div class="profile">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : ''}<div><h1>${esc(p.username || S.user)}</h1>
      <p>${fmt(S.games.length)} games read${p.joined ? `, playing since ${new Date(p.joined * 1000).getFullYear()}` : ''}. Showing ${winLabel()}.</p></div></div>
    ${filterHTML()}
  </div>
  ${since}
  ${m.n === 0 ? `<div class="card"><p class="empty">No games in this selection. Pick a longer period or turn on more time controls.</p></div>` : `
  <section class="sec"><div class="lead"><h2>Your level</h2><p>The average rating of the games in this selection, next to the rating chess.com shows now.</p></div>
    <div class="levels">${Object.entries(m.byCls).map(([k, c]) => `<div class="level" style="--c:var(--c-${k})"><div class="name">${cap(k)}</div>
        <div class="big num" data-count="${Math.round(c.avg)}">${fmt(c.avg)}</div><div class="muted">${now(k) ? `now ${now(k)}, ` : ''}${best(k) ? `best ${best(k)}` : `peak ${c.max}`}</div>
        <div class="muted">${c.n} games, <span class="delta ${dcls(c.delta)}">${sign(c.delta)}</span> in range</div></div>`).join('')}
      <div class="level"><div class="name">All games</div><div class="big num" data-count="${Math.round(m.avgMy)}">${fmt(m.avgMy)}</div><div class="muted">average rating</div><div class="muted">opponents averaged ${fmt(m.avgOpp)}</div></div></div></section>

  <section class="sec"><div class="lead"><h2>Rating history</h2><p>Your rating after each game in this selection.</p></div><div class="card"><div id="rc"></div></div></section>

  <section class="sec"><div class="lead"><h2>Are you improving?</h2><p>${f.win ? `${cap(winLabel())} against the same length of time right before it.` : 'Pick a period to compare it with the one before.'}</p></div>
    <div class="grid geven"><div>
      ${verdict ? `<div class="scale"><b style="left:${((verdict.v + 5) / 10) * 100}%"></b></div><div class="scale-l"><span>Slipping</span><span>Steady</span><span>Improving</span></div>
        <div class="verdict">${verdict.label}</div>
        <table>${verdict.parts.map(x => `<tr><td>${x.k}</td><td class="r delta ${dcls(x.d)}">${sign(x.d, x.k === 'Rating' ? 0 : 1)}${x.u}</td></tr>`).join('')}</table>`
        : `<p class="empty">${f.win ? 'Not enough games in both periods yet. It needs at least 5 in each.' : 'Choose 24 hours, 7 days, 30 days, 90 days or 12 months.'}</p>`}
    </div><div>
      <div class="hz h"><span>Period</span><span class="r">Games</span><span class="r">Rating</span><span class="r">Score</span><span class="r">Accuracy</span><span>Trend</span></div>
      ${hz.map(h => { const c = h.cur; return `<div class="hz"><span>${h.label.replace('Last ', '')}</span><span class="r">${c.n}</span>
        <span class="r delta ${dcls(c.ratingDelta)}">${c.n ? sign(c.ratingDelta) : ''}</span><span class="r">${c.n ? c.score.toFixed(0) + '%' : ''}</span>
        <span class="r">${c.acc != null ? c.acc.toFixed(1) + '%' : '<span class="faint">no data</span>'}</span>
        <span>${h.verdict ? `<span class="tag ${h.verdict.v > 1.5 ? 'up' : h.verdict.v < -1.5 ? 'down' : ''}">${h.verdict.label}</span>` : '<span class="faint">too few games</span>'}</span></div>` }).join('')}
    </div></div></section>

  <section class="sec"><div class="lead"><h2>Activity</h2><p>How often you played over the last year. Hover a day for the score.</p></div><div class="card"><div id="heat"></div></div></section>

  <section class="sec"><div class="lead"><h2>Playstyle</h2><p>Built from how your games actually end. <a href="#/style">All meters and coaching tips</a></p></div>
    <div><div class="archetype">${st.name}</div><p class="muted">${st.why.join(', ')}.</p>
      <div class="grid geven" style="column-gap:44px">${st.meters.slice(0, 4).map(x => `<div class="meter"><div class="lab"><span>${x.left}</span><span>${x.right}</span></div><div class="track"><b style="left:${x.value * 100}%"></b></div><div class="note">${x.note}</div></div>`).join('')}</div></div></section>

  <section class="sec"><div class="lead"><h2>Engine review</h2><p>Stockfish judges every move of the games it has analysed. <a href="#/engine">Open the full engine report</a></p></div><div>
    ${m.e ? `<div class="levels"><div class="level"><div class="name">Average accuracy</div><div class="big num" data-count="${m.e.acc.toFixed(1)}" data-dec="1">${m.e.acc.toFixed(1)}</div><div class="muted">over ${m.e.games} analysed games</div></div>
      <div class="level"><div class="name">Errors per 100 moves</div><div class="big num" data-count="${m.e.err100.toFixed(1)}" data-dec="1">${m.e.err100.toFixed(1)}</div><div class="muted">mistakes and blunders</div></div>
      <div class="level"><div class="name">Weakest phase</div><div class="big num" style="font-size:2.4rem;padding-top:14px">${['Opening', 'Middlegame', 'Endgame'][m.e.phRate.indexOf(Math.max(...m.e.phRate))]}</div><div class="muted">${Math.max(...m.e.phRate).toFixed(1)}% of moves go wrong</div></div></div>`
      : `<p class="muted" style="margin-top:0">No engine results in this selection yet.</p>`}
    <div class="cover"><div class="bar"><i style="width:${(analysed / total) * 100}%"></i></div><p class="muted" style="margin:0">${fmt(analysed)} of ${fmt(total)} games analysed (${((analysed / total) * 100).toFixed(analysed === total ? 0 : 1)}%).</p></div>
    ${S.cloud ? `<p class="muted">The server works through your whole history${S.cloud.refreshed_at ? ` and last updated on ${dateStr(Date.parse(S.cloud.refreshed_at) / 1000)}` : ''}. See Account, My accounts for its progress.</p>`
    : `<div class="filters"><select id="nbatch" class="field" style="width:auto"><option>25</option><option>100</option><option>250</option><option selected>500</option></select>
      <button class="btn primary" id="runbatch" ${S.job || !left ? 'disabled' : ''}>${S.job ? 'Analysing' : 'Analyse newest games'}</button>
      <button class="btn" id="runall" ${S.job || analysed >= total ? 'disabled' : ''}>Analyse entire history</button></div>
      <p class="faint" style="font-size:.88rem">Runs in this tab and is saved as it goes, so you can stop and continue later. A whole history takes many hours in a browser. A tracked account does it on a server instead.</p>`}
  </div></section>

  ${tp.length ? `<section class="sec"><div class="lead"><h2>Where to improve first</h2><p>The three biggest leaks in this selection. <a href="#/style">See all tips</a></p></div>
    <div>${tp.map(t => `<div class="tipcard"><span class="area">${t.area}</span><h3>${esc(t.title)}</h3><div>${esc(t.body)}</div><div class="drill">${esc(t.drill)}</div></div>`).join('')}</div></section>` : ''}`}`

  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
  if (m.n) { lineChart(root.querySelector('#rc'), ratingSeries(cur, f.classes)); heatmap(root.querySelector('#heat'), S.games.filter(g => f.classes.has(g.cls))) }
  const rb = root.querySelector('#runbatch')
  if (rb) rb.onclick = () => startBatch(+root.querySelector('#nbatch').value)
  const ra = root.querySelector('#runall')
  if (ra) ra.onclick = () => startAll()
}
