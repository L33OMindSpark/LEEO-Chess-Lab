import { S } from '../state.js'
import { slice, doctor, moveLabel } from '../stats.js'
import { esc } from '../util.js'
import { filterHTML, bindFilter, winLabel, tabs, OPEN_TABS } from '../ui.js'

export const refresh = true

export default function (root) {
  const cur = slice(S.games, S.filter), D = doctor(cur, S.sm)
  root.innerHTML = `<div class="phead"><div><h1>Openings</h1><p>Where your openings keep going wrong over ${winLabel()}, found from the first move in each analysed game that gave away at least 10% of the winning chances (a mistake or worse by chess.com's rules).</p></div>${filterHTML()}</div>
  <div style="margin-bottom:22px">${tabs('doctor', OPEN_TABS)}</div>
  ${D.leaks.length ? `<section class="sec"><div class="lead"><h2>Repeated leaks</h2><p>The same move, in the same opening, losing ground at least 3 times. Learn the better move once and the leak closes.</p></div><div class="card">
    ${D.leaks.map(l => `<div class="hz" style="grid-template-columns:1fr auto;gap:18px"><div><b>${esc(l.fam)}</b> <span class="muted">as ${l.color === 'w' ? 'White' : 'Black'}</span><br>You play <span class="mono"><b class="bl">${esc(moveLabel(l.ply, l.played))}</b></span>, the engine prefers <span class="mono"><b>${esc(moveLabel(l.ply, l.better))}</b></span></div><div class="r muted">${l.n} games, ${l.avg.toFixed(0)}% lost each time</div></div>`).join('')}</div></section>`
    : `<div class="card"><p class="empty">${D.games < 20 ? 'Needs more analysed games before repeated leaks show up. Analyse more from the <a href="#/engine">Engine report</a>.' : 'No opening leak repeats three times in this selection. Your first errors are spread out.'}</p></div>`}
  ${D.advice.length ? `<section class="sec"><div class="lead"><h2>Worth switching?</h2><p>Compared by your winning chance after 10 moves, from your own games.</p></div><div>
    ${D.advice.map(a => `<div class="tipcard" style="grid-template-columns:1fr"><h3>As ${a.color === 'w' ? 'White' : 'Black'}, try ${esc(a.strong.fam)} more</h3><div>${esc(a.strong.fam)} gives you ${a.strong.e10.toFixed(0)}% after 10 moves over ${a.strong.n} games. ${esc(a.weak.fam)} gives you only ${a.weak.e10.toFixed(0)}% over ${a.weak.n} games.</div></div>`).join('')}</div></section>` : ''}`
  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
}
