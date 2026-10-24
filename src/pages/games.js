import { S } from '../state.js'
import { slice } from '../stats.js'
import { esc, dateStr } from '../util.js'
import { filterHTML, bindFilter, cap } from '../ui.js'
import { myGame } from '../analyze.js'

export const refresh = true
let q = '', res = '', shown = 100

export default function (root) {
  let list = slice(S.games, S.filter)
  if (q) { const s = q.toLowerCase(); list = list.filter(g => g.oppName.toLowerCase().includes(s) || g.fam.toLowerCase().includes(s) || g.name.toLowerCase().includes(s)) }
  if (res) list = list.filter(g => String(g.score) === res)
  root.innerHTML = `<div class="pagehead"><div><h1>Games</h1><p>${list.length} games. The newest ${S.games.filter(g => g.pgn).length} can be reviewed with the engine.</p></div>${filterHTML()}</div>
  <section class="panel"><div class="filters" style="margin-bottom:12px"><input id="q" class="btn" style="text-align:left;width:240px" placeholder="Search opponent or opening" value="${esc(q)}">
    <select id="res" class="btn"><option value="">All results</option><option value="1">Wins</option><option value="0.5">Draws</option><option value="0">Losses</option></select></div>
    <table><thead><tr><th>Date</th><th>Type</th><th>Colour</th><th>Opponent</th><th>Result</th><th>Opening</th><th class="r">Moves</th><th class="r">Accuracy</th><th></th></tr></thead><tbody>
    ${list.slice(0, shown).map(g => { const a = S.an[g.id]; const acc = a ? myGame(g, a).acc : g.ca
      return `<tr><td>${dateStr(g.t)}</td><td>${cap(g.cls)}</td><td>${g.me === 'w' ? 'White' : 'Black'}</td><td>${esc(g.oppName)} <span class="muted">${g.opp}</span></td>
      <td><span class="res ${g.score === 1 ? 'w' : g.score === 0 ? 'l' : 'd'}">${g.score === 1 ? 'Win' : g.score === 0 ? 'Loss' : 'Draw'}</span> <span class="muted">${esc(g.how)}</span></td>
      <td>${esc(g.name)}</td><td class="r">${g.moves}</td><td class="r">${acc != null ? acc.toFixed(1) + '%' : ''}</td>
      <td class="r">${g.pgn ? `<a class="btn small" href="#/review/${g.id}" style="text-decoration:none">${a ? 'Review' : 'Analyse'}</a>` : ''}</td></tr>` }).join('')}
    </tbody></table>
    ${list.length > shown ? '<p><button class="btn" id="more">Show 100 more</button></p>' : ''}</section>`
  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
  const qi = root.querySelector('#q'), rs = root.querySelector('#res')
  rs.value = res
  qi.onchange = () => { q = qi.value; shown = 100; root.dispatchEvent(new Event('rerender')) }
  rs.onchange = () => { res = rs.value; shown = 100; root.dispatchEvent(new Event('rerender')) }
  const more = root.querySelector('#more')
  if (more) more.onclick = () => { shown += 100; root.dispatchEvent(new Event('rerender')) }
}
