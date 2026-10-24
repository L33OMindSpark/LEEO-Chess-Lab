import { S } from '../state.js'
import { slice, openings, firstMoves, scoreOf } from '../stats.js'
import { wdlBar } from '../charts.js'
import { esc } from '../util.js'
import { filterHTML, bindFilter, winLabel, tabs, OPEN_TABS } from '../ui.js'

let color = 'w'
const row = (name, r, cls = '', attr = '') => `<tr class="${cls}" ${attr}><td>${esc(name)}</td><td class="r">${r.n}</td><td>${wdlBar(r)}</td><td class="r">${r.score.toFixed(0)}%</td><td class="r muted">${(r.opp / r.n).toFixed(0)}</td></tr>`

export default function (root) {
  const cur = slice(S.games, S.filter), rows = openings(cur, color).filter(r => r.n >= 2)
  const fm = firstMoves(cur)
  const mini = (title, map) => `<h3>${title}</h3><table><tbody>${[...map].sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([k, o]) => row(k, { ...o, score: scoreOf(o) * 100 })).join('')}</tbody></table>`
  root.innerHTML = `<div class="phead"><div><h1>Openings</h1><p>What you play, and what it earns you, over ${winLabel()}.</p></div>${filterHTML()}</div>
  <div style="margin-bottom:22px">${tabs('openings', OPEN_TABS)}</div>
  <div class="filters" style="margin-bottom:14px"><button class="chip" data-col="w" aria-pressed="${color === 'w'}">As White</button><button class="chip" data-col="b" aria-pressed="${color === 'b'}">As Black</button></div>
  <div class="grid g21"><section class="panel"><h2>Your openings as ${color === 'w' ? 'White' : 'Black'}</h2><p class="sub">Click an opening to see the variations. Average opponent rating on the right.</p>
    ${rows.length ? `<table><thead><tr><th>Opening</th><th class="r">Games</th><th>Results</th><th class="r">Score</th><th class="r">Opp.</th></tr></thead><tbody>
    ${rows.slice(0, 40).map((r, i) => row(r.fam, r, 'click', `data-i="${i}"`) + r.sub.slice(0, 8).map(s => `<tr class="sub" data-p="${i}" hidden><td style="padding-left:28px" class="muted">${esc(s.name)}</td><td class="r muted">${s.n}</td><td>${wdlBar(s)}</td><td class="r muted">${s.score.toFixed(0)}%</td><td></td></tr>`).join('')).join('')}
    </tbody></table>` : '<p class="empty">No games in this selection.</p>'}</section>
  <section class="panel">${color === 'w' ? mini('Your first move', fm.white) : mini('Reply to 1.e4', fm.e4) + '<div style="height:16px"></div>' + mini('Reply to 1.d4', fm.d4)}</section></div>`
  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
  root.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { color = b.dataset.col; root.dispatchEvent(new Event('rerender')) })
  root.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => root.querySelectorAll(`[data-p="${tr.dataset.i}"]`).forEach(s => (s.hidden = !s.hidden)))
}
