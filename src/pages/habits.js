import { S } from '../state.js'
import { slice, metrics, habits } from '../stats.js'
import { barChart } from '../charts.js'
import { filterHTML, bindFilter, winLabel } from '../ui.js'

export const refresh = true
const list = (o, title) => `<h3>${title}</h3><table><tbody>${Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${k}</td><td class="r">${v}</td></tr>`).join('') || '<tr><td class="muted">none</td></tr>'}</tbody></table>`

export default function (root) {
  const cur = slice(S.games, S.filter), m = metrics(cur, S.an), h = habits(cur), e = m.e
  root.innerHTML = `<div class="pagehead"><div><h1>Habits</h1><p>When, against whom and how you win or lose, over ${winLabel()}. Bars show your score; the number below is games played.</p></div>${filterHTML()}</div>
  ${m.n < 10 ? '<div class="panel"><p class="empty">Not enough games here. Pick a longer period.</p></div>' : `
  <div class="grid geven">
    <section class="panel"><h2>Day of the week</h2><p class="sub">Score %, dashed line is 50.</p><div id="c1"></div></section>
    <section class="panel"><h2>Time of day</h2><p class="sub">Your local time, four-hour blocks.</p><div id="c2"></div></section>
    <section class="panel"><h2>Opponent strength</h2><p class="sub">Compared with your rating at the time.</p><div id="c3"></div></section>
    <section class="panel"><h2>Game length</h2><p class="sub">Where your games end.</p><div id="c4"></div></section>
    <section class="panel"><h2>How games end</h2><div class="grid geven">${list(h.how.win, 'Your wins')}${list(h.how.loss, 'Your losses')}</div></section>
    <section class="panel"><h2>After a loss</h2><p class="sub">Next game inside the same sitting.</p>
      <table><tbody><tr><td>After a win</td><td class="r">${h.tilt.nWin ? h.tilt.afterWin.toFixed(0) + '% score' : 'no data'}</td><td class="r muted">${h.tilt.nWin} games</td></tr>
      <tr><td>After a loss</td><td class="r">${h.tilt.nLoss ? h.tilt.afterLoss.toFixed(0) + '% score' : 'no data'}</td><td class="r muted">${h.tilt.nLoss} games</td></tr>
      <tr><td>After two losses</td><td class="r">${h.tilt.nTwo ? h.tilt.afterTwo.toFixed(0) + '% score' : 'no data'}</td><td class="r muted">${h.tilt.nTwo} games</td></tr></tbody></table></section>
    ${e && e.clocks ? `<section class="panel"><h2>Time pressure</h2><p class="sub">From the clock times of your analysed games.</p>
      <table><tbody><tr><td>Average time per move</td><td class="r">${e.avgSpent.toFixed(1)} s</td></tr>
      <tr><td>Mistake rate with time</td><td class="r">${e.calmRate.toFixed(1)}%</td></tr>
      <tr><td>Mistake rate in time trouble</td><td class="r">${e.pressureMoves > 20 ? e.pressureRate.toFixed(1) + '%' : 'too few moves'}</td></tr>
      <tr><td>Losses on time</td><td class="r">${m.timeoutLoss.toFixed(0)}% of losses</td></tr></tbody></table></section>`
      : `<section class="panel"><h2>Time pressure</h2><p class="empty">Analyse some live games on the overview page to see how you play when low on time.</p></section>`}
  </div>`}`
  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
  if (m.n >= 10) { barChart(root.querySelector('#c1'), h.week); barChart(root.querySelector('#c2'), h.hour); barChart(root.querySelector('#c3'), h.bands); barChart(root.querySelector('#c4'), h.len) }
}
