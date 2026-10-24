// The demo board used on the homepage and the login page: Morphy's Opera Game, scored by Stockfish (see scripts/demo-eval.mjs).
import { Chessground } from 'chessground'
import { Chess } from 'chess.js'
import demo from './demo.json'
import { judge, winPct, T } from './analyze.js'
import { esc } from './util.js'

const fens = (() => { const c = new Chess(), out = [c.fen()]; demo.sans.forEach(s => { c.move(s); out.push(c.fen()) }); return out })()
export const J = judge({ ...demo, ucis: demo.ucis.join(' '), ph: '0'.repeat(demo.ucis.length) })
export const worst = J.reduce((b, m, i) => (m.loss > J[b].loss && demo.ev[i + 1] < 5000 ? i : b), 0)
export const bestSan = i => { try { const u = demo.best[i], c = new Chess(fens[i]); return c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san } catch { return '' } }
export const demoFen = i => fens[i]
export const demoSan = i => demo.sans[i]
const ann = m => (m.loss >= T.bl ? ['bl', '??'] : m.loss >= T.ms ? ['ms', '?'] : m.loss >= T.ia ? ['ms', '?!'] : null)
const evTxt = cp => (Math.abs(cp) > 5000 ? 'Mate' : (cp > 0 ? '+' : '') + (cp / 100).toFixed(1))
const sqPos = sq => `left:${(sq.charCodeAt(0) - 97) * 12.5}%;top:${(8 - +sq[1]) * 12.5}%`
const move = (i) => `${i % 2 ? '' : i / 2 + 1 + '.'}${demo.sans[i]}`

export function createStage(el, { ribbon = true, caption = true } = {}) {
  el.innerHTML = `<div class="stagerow"><div class="evalbar"><i style="height:50%"></i></div><div class="board"><div class="bd"></div></div></div>
    ${ribbon ? `<div class="ribbon mono">${demo.sans.map((s, i) => `<span data-i="${i + 1}">${i % 2 ? '' : `<em>${i / 2 + 1}.</em>`}${esc(s)}</span>`).join('')}</div>` : ''}
    ${caption ? `<div class="cap"><div class="capmove mono"></div><div class="capsay"></div></div>` : ''}`
  const board = el.querySelector('.board'), bar = el.querySelector('.evalbar i'), rib = el.querySelector('.ribbon')
  const cg = Chessground(el.querySelector('.bd'), { fen: fens[0], viewOnly: true, coordinates: true, animation: { duration: 260 }, highlight: { lastMove: true } })
  let ply = 0, timer, playing = false, badge

  function goto(p, o = {}) {
    ply = p
    const last = p ? [demo.ucis[p - 1].slice(0, 2), demo.ucis[p - 1].slice(2, 4)] : undefined
    const shapes = o.arrow ? [{ orig: demo.best[p].slice(0, 2), dest: demo.best[p].slice(2, 4), brush: 'green' }] : o.hint ? [{ orig: demo.best[p].slice(0, 2), brush: 'yellow' }] : []
    cg.set({ fen: fens[p], lastMove: last, orientation: o.orientation || 'white', drawable: { autoShapes: shapes } })
    bar.style.height = winPct(demo.ev[p]) + '%'
    badge && badge.remove(); badge = null
    const m = p ? J[p - 1] : null, a = m && ann(m)
    if (a && o.badge !== false) { badge = document.createElement('div'); badge.className = 'badge ' + a[0]; badge.style.cssText = sqPos(demo.ucis[p - 1].slice(2, 4)); badge.innerHTML = `<b>${a[1]}</b>`; board.appendChild(badge) }
    if (rib) { rib.querySelectorAll('.cur').forEach(x => x.classList.remove('cur')); const c = rib.querySelector(`[data-i="${p}"]`); if (c) { c.classList.add('cur'); rib.scrollTo({ left: c.offsetLeft - rib.clientWidth / 2, behavior: 'smooth' }) } }
    const cap = el.querySelector('.cap')
    if (cap) {
      cap.querySelector('.capmove').innerHTML = (o.arrow || o.hint) ? `${p % 2 ? 'Black' : 'White'} to move <span class="faint">${evTxt(demo.ev[p])}</span>` : p ? `${move(p - 1)} ${a ? `<b class="${a[0]}">${a[1]}</b>` : ''}<span class="faint">${evTxt(demo.ev[p])}</span>` : '<span class="faint">Start position</span>'
      cap.querySelector('.capsay').textContent = o.say ?? (!p ? 'Morphy against the Duke of Brunswick and Count Isouard, Paris 1858.' : a ? `Costs ${m.loss.toFixed(0)}% of the win chance. Stockfish preferred ${bestSan(p - 1)}.` : m.cls === 'best' ? 'The engine’s first choice.' : 'A sound move.')
    }
  }
  const step = () => { goto(ply >= demo.sans.length ? 0 : ply + 1); timer = setTimeout(step, ply >= demo.sans.length ? 3200 : J[ply - 1] && J[ply - 1].loss >= T.ms ? 2100 : 1050) }
  const api = {
    goto,
    play() { if (!playing) { playing = true; timer = setTimeout(step, 700) } },
    pause() { playing = false; clearTimeout(timer) },
    get playing() { return playing },
    toggle() { playing ? api.pause() : api.play(); return playing },
  }
  goto(0)
  return api
}
