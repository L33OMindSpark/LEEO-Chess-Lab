import { S, startBatch } from '../state.js'
import { slice, metrics, horizons, ratingSeries, style } from '../stats.js'
import { tips } from '../tips.js'
import { lineChart } from '../charts.js'
import { esc, fmt, dateStr } from '../util.js'
import { filterHTML, bindFilter, sign, dcls, winLabel, cap } from '../ui.js'

export const refresh = true

export default function (root) {
  const f = S.filter, cur = slice(S.games, f), prevSet = slice(S.games, f, 1)
  const m = metrics(cur, S.an), pm = metrics(prevSet, S.an)
  const hz = horizons(S.games, f.classes, S.an)
  const verdict = hz.find(h => h.win === f.win)?.verdict || (f.win ? null : null)
  const p = S.profile || {}, st = S.stats || {}
  const analysed = S.games.filter(g => S.an[g.id]).length, canAnalyse = S.games.filter(g => g.pgn).length
  const now = k => st['chess_' + k]?.last?.rating, best = k => st['chess_' + k]?.best?.rating

  root.innerHTML = `
  <div class="pagehead">
    <div class="profile">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : ''}<div><h1>${esc(p.username || S.user)}</h1>
      <p>${fmt(S.games.length)} games read${p.joined ? `, member since ${new Date(p.joined * 1000).getFullYear()}` : ''}. Showing ${winLabel()}.</p></div></div>
    ${filterHTML()}
  </div>
  ${m.n === 0 ? `<div class="panel"><p class="empty">No games in this selection. Pick a longer period or turn on more time controls.</p></div>` : `
  <div class="stack">
  <section class="panel"><h2>Your level</h2>
    <p class="sub">Average rating of the games in this selection, with the rating chess.com shows now.</p>
    <div class="levels">
      ${Object.entries(m.byCls).map(([k, c]) => `<div class="level"><div class="name"><i style="background:var(--c-${k})"></i>${cap(k)}</div>
        <div class="big">${fmt(c.avg)}</div><div class="muted">${now(k) ? `now ${now(k)}, ` : ''}${best(k) ? `best ${best(k)}` : `peak ${c.max} here`}</div>
        <div class="muted">${c.n} games, <span class="delta ${dcls(c.delta)}">${sign(c.delta)}</span> in range</div></div>`).join('')}
      <div class="level"><div class="name">All games</div><div class="big">${fmt(m.avgMy)}</div><div class="muted">average of every game</div><div class="muted">opponents averaged ${fmt(m.avgOpp)}</div></div>
    </div></section>

  <div class="grid g2">
    <section class="panel"><h2>Rating over time</h2><p class="sub">Rating after each game in this selection.</p><div id="rc"></div></section>
    <section class="panel"><h2>Improvement</h2>
      <p class="sub">${f.win ? `${cap(winLabel())} against the same length before it.` : 'Pick a period to compare it with the one before.'}</p>
      ${verdict ? `<div class="scale"><b style="left:${((verdict.v + 5) / 10) * 100}%"></b></div><div class="scale-l"><span>Slipping</span><span>Steady</span><span>Improving</span></div>
        <p style="margin-top:14px"><span class="tag ${verdict.v > 1.5 ? 'up' : verdict.v < -1.5 ? 'down' : ''}">${verdict.label}</span></p>
        <table style="margin-top:6px">${verdict.parts.map(x => `<tr><td>${x.k}</td><td class="r delta ${dcls(x.d)}">${sign(x.d, x.k === 'Rating' ? 0 : 1)}${x.u}</td></tr>`).join('')}</table>`
        : `<p class="empty">${f.win ? 'Not enough games in both periods yet. It needs at least 5 in each.' : 'Choose 24 hours, 7 days, 30 days, 90 days or a year.'}</p>`}
    </section>
  </div>

  <section class="panel"><h2>Progress by period</h2><p class="sub">Each row is compared with the same-length period right before it.</p>
    <table><thead><tr><th>Period</th><th class="r">Games</th><th class="r">Rating change</th><th class="r">Score</th><th class="r">Accuracy</th><th>Trend</th></tr></thead><tbody>
    ${hz.map(h => { const c = h.cur; return `<tr><td>${h.label.replace('Last ', '')}</td><td class="r">${c.n}</td>
      <td class="r delta ${dcls(c.ratingDelta)}">${c.n ? sign(c.ratingDelta) : ''}</td>
      <td class="r">${c.n ? c.score.toFixed(0) + '%' : ''}${h.prev.n >= 5 && c.n ? ` <span class="delta ${dcls(c.score - h.prev.score)}">(${sign(c.score - h.prev.score, 1)})</span>` : ''}</td>
      <td class="r">${c.acc != null ? c.acc.toFixed(1) + '%' : '<span class="faint">no data</span>'}</td>
      <td>${h.verdict ? `<span class="tag ${h.verdict.v > 1.5 ? 'up' : h.verdict.v < -1.5 ? 'down' : ''}">${h.verdict.label}</span>` : '<span class="faint">too few games</span>'}</td></tr>` }).join('')}
    </tbody></table></section>

  <div class="grid geven">
    <section class="panel"><h2>Playstyle: ${style(cur, m).name}</h2><p class="sub">${style(cur, m).why.join(', ')}.</p>
      ${style(cur, m).meters.slice(0, 4).map(x => `<div class="meter"><div class="lab"><span>${x.left}</span><span>${x.right}</span></div><div class="track"><b style="left:${x.value * 100}%"></b></div><div class="note">${x.note}</div></div>`).join('')}
      <a href="#/style">All meters and coaching tips</a></section>
    <section class="panel"><h2>Stockfish analysis</h2>
      ${m.e ? `<div class="levels" style="grid-template-columns:1fr 1fr"><div><div class="big">${m.e.acc.toFixed(1)}%</div><div class="muted">average accuracy over ${m.e.games} games</div></div>
        <div><div class="big">${m.e.err100.toFixed(1)}</div><div class="muted">mistakes or blunders per 100 moves</div></div></div>
        <p class="sub" style="margin-top:14px">Mistakes by phase: opening ${m.e.phRate[0].toFixed(1)}%, middlegame ${m.e.phRate[1].toFixed(1)}%, endgame ${m.e.phRate[2].toFixed(1)}% of moves.</p>`
        : `<p class="sub">No engine results in this selection yet.</p>`}
      ${S.cloud ? `<p class="muted">The server has analysed ${analysed} of your ${canAnalyse} newest games${S.cloud.refreshed_at ? ` and last updated on ${dateStr(Date.parse(S.cloud.refreshed_at) / 1000)}` : ''}. Open Account, My accounts to see its progress.</p>`
      : `<p class="muted">${analysed} of your ${canAnalyse} newest games are analysed. Older games count towards every other number here.</p>
      <div class="filters" style="margin-top:10px"><select id="nbatch" class="btn"><option>25</option><option>100</option><option>250</option><option selected>500</option></select>
      <button class="btn primary" id="runbatch" ${S.job || analysed >= canAnalyse ? 'disabled' : ''}>${S.job ? 'Analysing' : 'Analyse newest games'}</button></div>
      <p class="faint" style="font-size:.85rem">Runs in this browser tab and is saved as it goes, so you can close it and continue later.</p>`}
    </section>
  </div>

  ${tips(cur, m).slice(0, 3).length ? `<section class="panel"><h2>Where to improve first</h2>${tips(cur, m).slice(0, 3).map(t => `<div class="tipcard"><span class="area">${t.area}</span><h3>${esc(t.title)}</h3><div>${esc(t.body)}</div><div class="drill">${esc(t.drill)}</div></div>`).join('')}<a href="#/style">See all tips</a></section>` : ''}
  </div>`}`
  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
  if (m.n) lineChart(root.querySelector('#rc'), ratingSeries(cur, f.classes))
  const rb = root.querySelector('#runbatch')
  if (rb) rb.onclick = () => startBatch(+root.querySelector('#nbatch').value)
}
