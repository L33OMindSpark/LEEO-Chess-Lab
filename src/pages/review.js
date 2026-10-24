import { Chessground } from 'chessground'
import { Chess } from 'chess.js'
import { S, analyseOne, getFull } from '../state.js'
import { Engine } from '../engine.js'
import { parseGame, fromAnalysis, judge, winPct } from '../analyze.js'
import { evalGraph } from '../charts.js'
import { esc, dateStr } from '../util.js'
import { HOW } from '../ui.js'

const MARK = m => (m.loss >= 30 ? '<span class="bl">??</span>' : m.loss >= 20 ? '<span class="ms">?</span>' : m.loss >= 10 ? '<span class="ia">?!</span>' : '')
const evText = l => (l.mate != null ? `M${Math.abs(l.mate)}` : (l.cp > 0 ? '+' : '') + (l.cp / 100).toFixed(2))

function sanLine(fen, pv) {
  const c = new Chess(fen), out = []
  for (const u of pv.slice(0, 7)) {
    try { out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san) } catch { break }
  }
  return out.join(' ')
}

export default async function (root, ctx, id) {
  const g = S.games.find(x => x.id === id)
  let a = g && S.sm[id] ? await getFull(id) : null
  if (!g || (!g.pgn && !a)) { root.innerHTML = '<div class="panel"><p class="empty">That game has no saved moves yet. Analyse it from the overview page first. <a href="#/games">Back to games</a></p></div>'; return }
  const p = a ? fromAnalysis(a) : parseGame(g)
  if (!p) { root.innerHTML = '<div class="panel"><p class="err">This game could not be read.</p></div>'; return }
  const n = p.fens.length
  let J = a ? judge(a) : [], ply = n - 1, flip = g.me === 'b', showBest = true
  const names = g.me === 'w' ? [S.user, g.oppName] : [g.oppName, S.user], rate = g.me === 'w' ? [g.my, g.opp] : [g.opp, g.my]
  const outcome = g.score === 1 ? 'You won' : g.score === 0 ? 'You lost' : 'Draw'

  root.innerHTML = `<div class="phead"><div><h1>${esc(names[0])} vs ${esc(names[1])}</h1><p>${outcome} by ${esc(HOW[g.how] || g.how)} on ${dateStr(g.t)}. ${esc(g.name)}. <a href="${esc(g.url)}" target="_blank" rel="noopener">Open on chess.com</a></p></div><a class="btn" href="#/games" style="text-decoration:none">All games</a></div>
  <div class="review"><div>
    <div class="pl" id="ptop"></div>
    <div class="boardrow"><div class="evalbar"><i id="ebar" style="height:50%"></i></div><div class="board" id="board"></div></div>
    <div class="pl" id="pbot"></div>
    <div class="ctrl"><button class="btn" data-n="start" aria-label="First move">&#171;</button><button class="btn" data-n="prev" aria-label="Previous move">&#8249;</button><button class="btn" data-n="next" aria-label="Next move">&#8250;</button><button class="btn" data-n="end" aria-label="Last move">&#187;</button><button class="btn" data-n="flip">Flip board</button>
    <label class="chip" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="sb" checked> Show best move</label></div>
  </div><div class="stack" id="side"></div></div>`

  const cg = Chessground(root.querySelector('#board'), { fen: p.fens[ply], orientation: flip ? 'black' : 'white', viewOnly: true, coordinates: true, animation: { duration: 160 } })
  const side = root.querySelector('#side')
  let setMark = () => {}, live, token = 0, linesEl, timer

  const players = () => {
    const sides = flip ? [0, 1] : [1, 0], acc = c => { if (!J.length) return ''; const x = J.filter(m => m.i % 2 === c); return `<span class="acc">accuracy ${(x.reduce((s, m) => s + m.acc, 0) / (x.length || 1)).toFixed(1)}%</span>` }
    root.querySelector('#ptop').innerHTML = `<span>${esc(names[sides[0]])} <span class="muted">${rate[sides[0]]}</span></span>${acc(sides[0])}`
    root.querySelector('#pbot').innerHTML = `<span>${esc(names[sides[1]])} <span class="muted">${rate[sides[1]]}</span></span>${acc(sides[1])}`
  }

  function drawSide() {
    if (!a) {
      side.innerHTML = `<section class="panel"><h2>Stockfish is reading the game</h2><p class="sub">Depth ${S.depth}. This takes a few seconds.</p><div class="loading" style="margin:10px 0"><div class="bar"><i id="prog" style="width:0"></i></div></div></section>`
      return
    }
    const cnt = (c, k) => J.filter(m => m.i % 2 === c && m.cls === k).length
    const row = (k, l) => `<tr><td>${l}</td><td class="r">${cnt(0, k)}</td><td class="r">${cnt(1, k)}</td></tr>`
    const mv = []
    for (let i = 0; i < p.sans.length; i += 2) {
      mv.push(`<span class="n">${i / 2 + 1}</span>`)
      for (const k of [i, i + 1]) mv.push(p.sans[k] ? `<span class="m" data-p="${k + 1}">${esc(p.sans[k])} ${MARK(J[k])}</span>` : '<span></span>')
    }
    side.innerHTML = `<section class="panel"><h3>Evaluation</h3><div id="eg"></div><p class="sub" style="margin:8px 0 0">Click the graph or use the arrow keys. Orange and red dots are mistakes and blunders.</p></section>
      <section class="panel"><h3>Engine lines</h3><div class="lines" id="lines"><p class="muted">Thinking</p></div></section>
      <section class="panel"><div class="moves">${mv.join('')}</div>
      <table class="sumtbl" style="margin-top:12px"><thead><tr><th></th><th class="r">${esc(names[0])}</th><th class="r">${esc(names[1])}</th></tr></thead><tbody>${row('blunder', 'Blunders')}${row('mistake', 'Mistakes')}${row('inaccuracy', 'Inaccuracies')}</tbody></table></section>`
    setMark = evalGraph(side.querySelector('#eg'), a, J, ply, go)
    linesEl = side.querySelector('#lines')
    side.querySelectorAll('.m').forEach(el => (el.onclick = () => go(+el.dataset.p)))
    players()
  }

  function go(to) {
    ply = Math.max(0, Math.min(n - 1, to))
    const last = ply ? [p.ucis[ply - 1].slice(0, 2), p.ucis[ply - 1].slice(2, 4)] : undefined
    const best = a && showBest && a.best[ply] ? [{ orig: a.best[ply].slice(0, 2), dest: a.best[ply].slice(2, 4), brush: 'green' }] : []
    cg.set({ fen: p.fens[ply], lastMove: last, check: new Chess(p.fens[ply]).inCheck(), drawable: { autoShapes: best } })
    if (a) {
      const pct = winPct(a.ev[ply]), bar = root.querySelector('#ebar')
      bar.style.height = pct + '%'; bar.style.bottom = flip ? 'auto' : '0'; bar.style.top = flip ? '0' : 'auto'
      setMark(ply)
      side.querySelectorAll('.m').forEach(el => el.classList.toggle('cur', +el.dataset.p === ply))
      side.querySelector('.m.cur')?.scrollIntoView({ block: 'nearest' })
      think()
    }
  }

  function think() {
    if (!linesEl) return
    live = live || new Engine()
    live.stop()
    const my = ++token, fen = p.fens[ply]
    if (new Chess(fen).isGameOver()) { linesEl.innerHTML = '<p class="muted">Game over.</p>'; return }
    let latest
    const paint = () => { timer = 0; if (my === token && latest) linesEl.innerHTML = latest.sort((x, y) => x.mpv - y.mpv).map(l => `<div><b>${evText(l)}</b><span>${esc(sanLine(fen, l.pv))} <span class="faint">d${l.depth}</span></span></div>`).join('') }
    live.search(fen, 22, 3, ls => { if (my !== token) return; latest = ls; if (!timer) timer = setTimeout(paint, 180) }, () => my !== token).then(() => my === token && paint())
  }

  const key = e => {
    if (e.target.matches('input,select')) return
    if (e.key === 'ArrowLeft') go(ply - 1); else if (e.key === 'ArrowRight') go(ply + 1); else if (e.key === 'Home') go(0); else if (e.key === 'End') go(n - 1); else if (e.key === 'f') toggleFlip(); else return
    e.preventDefault()
  }
  const toggleFlip = () => { flip = !flip; cg.set({ orientation: flip ? 'black' : 'white' }); players(); go(ply) }
  addEventListener('keydown', key)
  ctx.onCleanup(() => { removeEventListener('keydown', key); token++; live && live.terminate() })
  root.querySelector('[data-n=start]').onclick = () => go(0)
  root.querySelector('[data-n=prev]').onclick = () => go(ply - 1)
  root.querySelector('[data-n=next]').onclick = () => go(ply + 1)
  root.querySelector('[data-n=end]').onclick = () => go(n - 1)
  root.querySelector('[data-n=flip]').onclick = toggleFlip
  root.querySelector('#sb').onchange = e => { showBest = e.target.checked; go(ply) }
  players(); drawSide()

  if (!a) {
    let done = 0
    a = await analyseOne(g, () => { const el = root.querySelector('#prog'); if (el) el.style.width = (++done / n) * 100 + '%' })
    if (!root.isConnected || !a) return
    J = judge(a); drawSide(); go(Math.min(n - 1, 0))
    go(0)
  } else go(0)
}
