import { S, analysedCount, startBatch, startAll } from '../state.js'
import { slice, engineReport } from '../stats.js'
import { lineChart } from '../charts.js'
import { esc, fmt, dateStr } from '../util.js'
import { filterHTML, bindFilter, winLabel, cap, sign } from '../ui.js'

export const refresh = true
const hb = (label, v, max, note) => `<div class="hbar"><span>${label}</span><div class="hb"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></div><b>${note}</b></div>`

export default function (root) {
  const cur = slice(S.games, S.filter), R = engineReport(cur, S.sm)
  root.innerHTML = `<div class="phead"><div><h1>Engine report</h1><p>Everything Stockfish found in the games it has analysed over ${winLabel()}.</p></div>${filterHTML()}</div>
  <section class="card" style="margin-bottom:8px">${(() => { const done = analysedCount(), total = S.games.length, left = S.games.filter(g => g.pgn && !S.sm[g.id]).length
    return `<div class="bar" style="height:8px;margin:0 0 10px"><i style="width:${(done / total) * 100}%"></i></div><p class="muted" style="margin:0 0 ${S.cloud ? 0 : 14}px">${fmt(done)} of ${fmt(total)} games analysed (${((done / total) * 100).toFixed(done === total ? 0 : 1)}%).${S.cloud ? ' The server works through your whole history. See Account, My accounts for its progress.' : ''}</p>
    ${S.cloud ? '' : `<div class="filters"><select id="nbatch" class="field" style="width:auto"><option>25</option><option>100</option><option>250</option><option selected>500</option></select><button class="btn primary" id="runbatch" ${S.job || !left ? 'disabled' : ''}>${S.job ? 'Analysing' : 'Analyse newest games'}</button><button class="btn" id="runall" ${S.job || done >= total ? 'disabled' : ''}>Analyse entire history</button></div><p class="faint" style="font-size:.86rem;margin:10px 0 0">Runs in this tab and is saved as it goes. A whole history takes many hours in a browser, so a tracked account is better for that.</p>`}` })()}</section>
  ${!R ? `<div class="card"><p class="empty">No analysed games in this selection yet. Use the buttons above, or pick a longer period.</p></div>` : (() => {
    const e = R.e, cov = (R.total / cur.length) * 100
    return `
  <section class="sec"><div class="lead"><h2>The headline</h2><p>${fmt(R.total)} of ${fmt(cur.length)} games here are analysed (${cov.toFixed(cov === 100 ? 0 : 1)}%). Stockfish has scored ${fmt(e.moves)} of your moves.</p></div>
    <div class="levels"><div class="level"><div class="name">Average accuracy</div><div class="big num" data-count="${e.acc.toFixed(1)}" data-dec="1">${e.acc.toFixed(1)}</div><div class="muted">White ${e.accW.toFixed(1)}, Black ${e.accB.toFixed(1)}</div></div>
      <div class="level"><div class="name">Blunders per 100 moves</div><div class="big num" data-count="${e.per100.toFixed(1)}" data-dec="1">${e.per100.toFixed(1)}</div><div class="muted">${fmt(e.count('blunder'))} blunders, ${fmt(e.count('mistake'))} mistakes, ${fmt(e.count('inaccuracy'))} inaccuracies</div></div>
      <div class="level"><div class="name">Winning games converted</div><div class="big num" data-count="${e.winGames ? Math.round((e.converted / e.winGames) * 100) : 0}" data-suf="%">${e.winGames ? Math.round((e.converted / e.winGames) * 100) : 0}%</div><div class="muted">${e.converted} of ${e.winGames} games you were clearly winning</div></div>
      <div class="level"><div class="name">Lost games saved</div><div class="big num" data-count="${e.lostGames ? Math.round((e.saved / e.lostGames) * 100) : 0}" data-suf="%">${e.lostGames ? Math.round((e.saved / e.lostGames) * 100) : 0}%</div><div class="muted">${e.saved} of ${e.lostGames} games you were clearly worse</div></div></div></section>

  <section class="sec"><div class="lead"><h2>Accuracy over time</h2><p>The average accuracy of your analysed games, month by month.</p></div><div class="card"><div id="accc"></div></div></section>

  <section class="sec"><div class="lead"><h2>Where the errors happen</h2><p>Mistakes and blunders as a share of your moves in each phase of the game.</p></div><div class="card">
    ${['Opening', 'Middlegame', 'Endgame'].map((n, i) => hb(n, e.phRate[i], Math.max(...e.phRate, 1), `${e.phRate[i].toFixed(1)}% of ${fmt(e.ph[i].n)} moves`)).join('')}
    <h3 style="margin:26px 0 6px">By time control</h3>${R.byClass.map(c => hb(c.label, c.acc - 50, 50, `${c.acc.toFixed(1)}% accuracy, ${fmt(c.n)} games`)).join('')}</div></section>

  <section class="sec"><div class="lead"><h2>Time and tempo</h2><p>How you spend your clock, from the clock times saved with each game.</p></div><div class="card">
    ${e.clocks ? `<table><tbody><tr><td>Average time per move</td><td class="r">${e.avgSpent.toFixed(1)} s</td></tr>
      <tr><td>Mistake rate with time on the clock</td><td class="r">${e.calmRate.toFixed(1)}%</td></tr>
      <tr><td>Mistake rate in time trouble</td><td class="r">${e.pressureMoves > 20 ? e.pressureRate.toFixed(1) + '%' : 'too few moves'}</td></tr>
      <tr><td>Blunders played in under 3 seconds</td><td class="r">${e.blundersTimed ? `${Math.round((e.fastBlunders / e.blundersTimed) * 100)}% (${e.fastBlunders} of ${e.blundersTimed})` : 'no data'}</td></tr>
      <tr><td>Games out of the opening already worse</td><td class="r">${fmt(e.outOfBook)}</td></tr></tbody></table>` : '<p class="empty">No clock data in this selection (daily games have none).</p>'}</div></section>

  <section class="sec"><div class="lead"><h2>Openings, judged by the engine</h2><p>Your chance of winning after 10 moves each, averaged over your games in that opening. Below 45% means you are usually worse before the middlegame starts.</p></div>
    <div class="card">${R.opens.length ? `<table><thead><tr><th>Opening</th><th>Colour</th><th class="r">Games</th><th class="r">Win chance after 10 moves</th><th class="r">Accuracy</th><th class="r">Score</th></tr></thead><tbody>
      ${R.opens.slice(0, 12).map(o => `<tr><td>${esc(o.fam)}</td><td>${o.color === 'w' ? 'White' : 'Black'}</td><td class="r">${o.n}</td><td class="r"><b class="${o.e10 < 45 ? 'bl' : o.e10 > 55 ? 'res w' : ''}">${o.e10.toFixed(0)}%</b></td><td class="r">${o.acc.toFixed(1)}%</td><td class="r">${o.score.toFixed(0)}%</td></tr>`).join('')}
      </tbody></table><p class="sub" style="margin:12px 0 0">Sorted from the weakest. Openings with at least 6 analysed games.</p>` : '<p class="empty">Needs at least 6 analysed games in an opening.</p>'}</div></section>

  <section class="sec"><div class="lead"><h2>Your costliest moments</h2><p>The moves that gave away the most winning chances. Open one to see the position and what the engine wanted.</p></div>
    <div>${R.costly.map(c => `<a class="game" href="#/review/${c.g.id}" style="grid-template-columns:5px 74px 1fr 110px 90px"><i class="stripe ${c.g.score === 1 ? 'w' : c.g.score === 0 ? 'l' : 'd'}"></i>
      <div class="when"><b style="color:var(--ink)">${dateStr(c.g.t).replace(/ \d{4}$/, '')}</b><br>${cap(c.g.cls)}</div><div class="opp"><b>vs ${esc(c.g.oppName)}</b> <span>${c.g.opp}</span><br><span>${esc(c.g.name)}</span></div>
      <div class="mono"><b class="bl">-${c.loss}%</b></div><span class="go">Review</span></a>`).join('') || '<p class="empty">No costly moments recorded.</p>'}</div></section>`
  })()}`
  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
  root.querySelector('#runbatch')?.addEventListener('click', () => startBatch(+root.querySelector('#nbatch').value))
  root.querySelector('#runall')?.addEventListener('click', () => startAll())
  if (R && R.monthly.length > 1) lineChart(root.querySelector('#accc'), [{ name: 'Accuracy', color: 'var(--accent)', pts: R.monthly.map(m => [Date.parse(m.k + '-15') / 1000, +m.acc.toFixed(1)]) }])
  else if (R) root.querySelector('#accc').innerHTML = '<p class="empty">Needs analysed games from at least two different months.</p>'
}
