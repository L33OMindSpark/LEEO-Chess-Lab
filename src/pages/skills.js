import { S } from '../state.js'
import { slice, peer } from '../stats.js'
import { radar } from '../charts.js'
import { filterHTML, bindFilter, winLabel, sign } from '../ui.js'
import { fmt } from '../util.js'

export const refresh = true

export default function (root) {
  const cur = slice(S.games, S.filter), P = peer(cur, S.sm)
  root.innerHTML = `<div class="phead"><div><h1>Skills and peers</h1><p>You against the opponents in your own games over ${winLabel()}. They are rated close to you, and Stockfish scores their moves exactly like yours, so this needs no extra data.</p></div>${filterHTML()}</div>
  ${!P ? `<div class="card"><p class="empty">Needs at least 8 analysed games in this selection, with both sides scored. Analyse more games from the <a href="#/engine">Engine report</a>, or pick a longer period.</p></div>` : (() => {
    const best = [...P.axes].sort((a, b) => b.score - a.score), top = best[0], low = best[best.length - 1]
    return `<section class="sec"><div class="lead"><h2>Where you stand</h2><p>${fmt(P.n)} analysed games. You average ${fmt(P.myRating)}, your opponents ${fmt(P.oppRating)}.</p></div>
      <div class="grid geven" style="align-items:center"><div class="card"><div id="rd"></div><p class="sub" style="text-align:center;margin:0">The dashed ring is an equal match with your opponents. Outside it, you are ahead.</p></div>
      <div><p style="font:560 1.6rem/1.25 var(--serif);margin:0 0 20px">${top.score > 55 ? `You beat your opponents at <b>${top.label.toLowerCase()}</b>` : 'You are level with your opponents'}${low.score < 45 ? ` and trail them at <b>${low.label.toLowerCase()}</b>.` : '.'}</p>
      <table><thead><tr><th></th><th class="r">You</th><th class="r">Opponents</th><th class="r">Edge</th></tr></thead><tbody>${P.axes.map(a => { const d = a.low ? a.peer - a.me : a.me - a.peer; return `<tr><td>${a.label}</td><td class="r">${a.me.toFixed(1)}%</td><td class="r">${a.peer.toFixed(1)}%</td><td class="r delta ${d > 0.4 ? 'up' : d < -0.4 ? 'down' : ''}">${sign(d, 1)}</td></tr>` }).join('')}</tbody></table>
      <p class="sub" style="margin-top:12px">Opening, middlegame and endgame show how often a move loses at least 20% of the winning chances, so lower is better and a positive edge means you make fewer errors.</p></div></div></section>`
  })()}`
  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
  if (P) radar(root.querySelector('#rd'), P.axes)
}
