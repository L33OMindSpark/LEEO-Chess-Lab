import { S } from '../state.js'
import { slice } from '../stats.js'
import { esc } from '../util.js'
import { filterHTML, bindFilter, cap, HOW } from '../ui.js'
import { ring } from '../charts.js'

export const refresh = true
let q = '', res = '', shown = 60

const groupOf = g => {
  const d = (Date.now() / 1000 - g.t) / 86400
  return d < 1 ? 'Today' : d < 2 ? 'Yesterday' : d < 7 ? 'This week' : d < 30 ? 'This month' : new Date(g.t * 1000).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
const errText = a => { const b = a.bl[0] + a.bl[1] + a.bl[2], m = a.ms[0] + a.ms[1] + a.ms[2]; return `<span class="errs">${b ? `<b class="bl">${b}</b> blunder${b > 1 ? 's' : ''}` : ''}${b && m ? ', ' : ''}${m ? `<b class="ms">${m}</b> mistake${m > 1 ? 's' : ''}` : ''}${!b && !m ? '<span class="res w">Clean game</span>' : ''}</span>` }
const when = g => new Date(g.t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function (root) {
  let list = slice(S.games, S.filter)
  if (q) { const s = q.toLowerCase(); list = list.filter(g => g.oppName.toLowerCase().includes(s) || g.fam.toLowerCase().includes(s) || g.name.toLowerCase().includes(s)) }
  if (res) list = list.filter(g => String(g.score) === res)
  let lastG = ''
  const rows = list.slice(0, shown).map(g => {
    const a = S.sm[g.id], acc = g.ca ?? (a ? a.acc : null), k = g.score === 1 ? 'w' : g.score === 0 ? 'l' : 'd'
    const head = groupOf(g) !== lastG ? `<div class="gh"><span>${(lastG = groupOf(g))}</span></div>` : ''
    const can = g.pgn || a, tag = can ? 'a' : 'div'
    return head + `<${tag} class="game" ${can ? `href="#/review/${g.id}"` : ''}><i class="stripe ${k}"></i>
      <div class="when"><b style="color:var(--ink);font-weight:600">${when(g)}</b><br>${cap(g.cls)}</div>
      <div class="opp"><b>${esc(g.oppName)}</b> <span>${g.opp}</span><br><span><span class="res ${k}">${k === 'w' ? 'Win' : k === 'l' ? 'Loss' : 'Draw'}</span> by ${esc(HOW[g.how] || g.how)} as ${g.me === 'w' ? 'White' : 'Black'}</span></div>
      <div class="op">${esc(g.name)}<br><span>${g.moves} moves</span></div>
      ${a ? errText(a) : '<span></span>'}${acc != null ? ring(acc) : '<span class="faint" style="text-align:center">no data</span>'}
      <span class="go">${can ? (a ? 'Review' : 'Analyse') : ''}</span></${tag}>`
  }).join('')
  root.innerHTML = `<div class="phead"><div><h1>Game history</h1><p>${list.length.toLocaleString()} games in this selection. Every analysed game can be reviewed move by move.</p></div>${filterHTML()}</div>
  <div class="toolbar"><input id="q" class="field" placeholder="Search opponent or opening" value="${esc(q)}">
    <div class="seg" id="rseg">${[['', 'All'], ['1', 'Wins'], ['0.5', 'Draws'], ['0', 'Losses']].map(([v, l]) => `<button data-r="${v}" aria-pressed="${res === v}">${l}</button>`).join('')}<i class="thumb"></i></div></div>
  ${rows || '<p class="empty">No games match.</p>'}
  ${list.length > shown ? `<p style="text-align:center;margin-top:20px"><button class="btn" id="more">Show more games</button></p>` : ''}`
  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
  const qi = root.querySelector('#q')
  qi.onchange = () => { q = qi.value; shown = 60; root.dispatchEvent(new Event('rerender')) }
  root.querySelectorAll('[data-r]').forEach(b => (b.onclick = () => { res = b.dataset.r; shown = 60; root.dispatchEvent(new Event('rerender')) }))
  const more = root.querySelector('#more')
  if (more) more.onclick = () => { shown += 60; root.dispatchEvent(new Event('rerender')) }
}
