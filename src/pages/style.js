import { S } from '../state.js'
import { slice, metrics, style, WINDOWS } from '../stats.js'
import { tips } from '../tips.js'
import { esc } from '../util.js'
import { filterHTML, bindFilter, winLabel, tabs, STYLE_TABS } from '../ui.js'

export const refresh = true

export default function (root) {
  const f = S.filter, cur = slice(S.games, f), m = metrics(cur, S.sm), st = style(cur, m)
  const list = m.n >= 15 ? tips(cur, m) : []
  const cols = WINDOWS.filter(w => w[0]).map(([win, l]) => ({ l: l.replace('Last ', ''), m: metrics(slice(S.games, { win, classes: f.classes }), S.sm) }))
  root.innerHTML = `<div class="phead"><div><h1>Playstyle and tips</h1><p>Built from your games over ${winLabel()}. All rules run on this computer.</p></div>${filterHTML()}</div>
  <div style="margin-bottom:22px">${tabs('style', STYLE_TABS)}</div>
  ${m.n < 15 ? `<div class="panel"><p class="empty">At least 15 games are needed for a reliable read. Choose a longer period.</p></div>` : `
  <div class="grid g21">
    <section class="panel"><h2>You are ${/^[aeiou]/i.test(st.name) ? 'an' : 'a'} ${st.name.toLowerCase()}</h2><p class="sub">${st.why.join(', ')}.</p>
      ${st.meters.map(x => `<div class="meter"><div class="lab"><span>${x.left}</span><span>${x.right}</span></div><div class="track"><b style="left:${x.value * 100}%"></b></div><div class="note"><b>${x.label}.</b> ${x.note}</div></div>`).join('')}</section>
    <section class="panel"><h2>Style by period</h2><p class="sub">How the numbers behind your style move.</p>
      <table><thead><tr><th></th>${cols.map(c => `<th class="r">${c.l}</th>`).join('')}</tr></thead><tbody>
      ${[['Games', c => c.n], ['Moves per game', c => (c.n ? c.avgMoves.toFixed(0) : '')], ['Wins by mate', c => (c.n ? c.mateShare.toFixed(0) + '%' : '')], ['Draws', c => (c.n ? c.drawRate.toFixed(0) + '%' : '')], ['Score', c => (c.n ? c.score.toFixed(0) + '%' : '')], ['Accuracy', c => (c.acc != null ? c.acc.toFixed(1) : '')]]
        .map(([k, fn]) => `<tr><td>${k}</td>${cols.map(c => `<td class="r">${fn(c.m)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></section>
  </div>
  <section class="panel" style="margin-top:18px"><h2>Coaching tips</h2><p class="sub">Sorted by how much rating they are likely to cost you. Each one quotes your own numbers.</p>
    ${list.length ? list.map(t => `<div class="tipcard"><span class="area">${t.area}</span><h3>${esc(t.title)}</h3><div>${esc(t.body)}</div><div class="drill">${esc(t.drill)}</div></div>`).join('') : '<p class="empty">Nothing stands out as a weakness in this selection.</p>'}
    ${m.e ? '' : '<p class="muted">Run the Stockfish analysis on the overview page to unlock tips about blunders, time trouble and converting wins.</p>'}
  </section>`}`
  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
}
