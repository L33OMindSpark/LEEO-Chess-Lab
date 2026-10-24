import { S } from '../state.js'
import { slice, patterns } from '../stats.js'
import { esc, fmt } from '../util.js'
import { filterHTML, bindFilter, winLabel } from '../ui.js'
import { WHY, allWhy } from '../why.js'
import { MOTIF } from '../motifs.js'

export const refresh = true

export default function (root) {
  const cur = slice(S.games, S.filter), P = patterns(cur, S.sm), why = allWhy()
  const tagged = cur.filter(g => why[g.id]?.length), counts = {}
  tagged.forEach(g => why[g.id].forEach(t => (counts[t] = (counts[t] || 0) + 1)))
  const hot = P ? P.cells.filter(c => c.lift >= 1.35).slice(0, 4) : []
  root.innerHTML = `<div class="phead"><div><h1>Mistake patterns</h1><p>The kinds of position where your mistakes and blunders cluster over ${winLabel()}, found by comparing where your errors happen with where your moves happen.</p></div>${filterHTML()}</div>
  ${!P ? `<div class="card"><p class="empty">Needs at least 15 errors in analysed games. Analyse more games from the <a href="#/engine">Engine report</a>, or pick a longer period.</p></div>` : `
  <section class="sec"><div class="lead"><h2>What keeps going wrong</h2><p>${fmt(P.total)} errors in ${fmt(P.games)} games, about ${P.avg.toFixed(1)} per game.</p></div><div>
    ${hot.length ? hot.map(c => `<div class="tipcard" style="grid-template-columns:80px 1fr"><span class="area" style="font-size:1.1rem">${c.lift.toFixed(1)}x</span><h3>More errors on ${esc(c.label)}</h3>
      <div>${c.errs} of your ${fmt(P.total)} errors (${(c.eShare * 100).toFixed(0)}%) came on ${esc(c.label)}, which are only ${(c.mShare * 100).toFixed(0)}% of your moves.</div>
      <div><button class="btn small primary" data-train="${c.dim}:${c.idx}:${esc(c.label)}">Train these positions</button></div></div>`).join('') : '<p class="empty">No kind of position stands out. Your errors are spread evenly.</p>'}
</div></section>
  <section class="sec"><div class="lead"><h2>The tactic behind it</h2><p>What was on the board when you went wrong, found by checking the engine's move and the reply to yours.</p></div><div class="card">${P.motifs.filter(x => x.n).sort((a, b) => b.n - a.n).map(x => `<div class="hbar"><span style="min-width:0">${MOTIF[x.k]}</span><div class="hb"><i style="width:${(x.n / P.total) * 100}%"></i></div><b>${x.n} errors (${((x.n / P.total) * 100).toFixed(0)}%) ${x.n >= 5 ? `<a href="#/train" data-train="fl:${'hfxkpm'.indexOf(x.k)}:${esc(MOTIF[x.k])}">Train</a>` : ''}</b></div>`).join('') || '<p class="empty">No tactic pattern found yet.</p>'}</div></section>
  ${P.opens.length ? `<section class="sec"><div class="lead"><h2>Openings with the most errors</h2><p>Errors per game, with at least 6 analysed games. Your average is ${P.avg.toFixed(1)}.</p></div><div class="card"><table><tbody>${P.opens.map(o => `<tr><td>${esc(o.fam)}</td><td class="r muted">${o.n} games</td><td class="r"><b class="${o.per > P.avg * 1.25 ? 'bl' : ''}">${o.per.toFixed(1)}</b></td></tr>`).join('')}</tbody></table></div></section>` : ''}`}
  <section class="sec"><div class="lead"><h2>Why you lose</h2><p>Your own reasons, tagged on a lost game while you review it. The engine cannot know these.</p></div><div class="card">
    ${tagged.length ? WHY.filter(([k]) => counts[k]).sort((a, b) => counts[b[0]] - counts[a[0]]).map(([k, l]) => `<div class="hbar"><span style="min-width:0">${l}</span><div class="hb"><i style="width:${(counts[k] / tagged.length) * 100}%"></i></div><b>${counts[k]} of ${tagged.length} tagged games</b></div>`).join('') : '<p class="empty">Nothing tagged yet. Open a lost game from <a href="#/games">Game history</a> and choose what went wrong.</p>'}</div></section>`
  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
  root.querySelectorAll('[data-train]').forEach(b => (b.onclick = e => { e.preventDefault(); const [dim, idx, label] = b.dataset.train.split(':'); S.trainFilter = { dim, idx: +idx, label }; location.hash = '#/train' }))
}
