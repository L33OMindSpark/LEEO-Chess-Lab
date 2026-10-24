import { Chessground } from 'chessground'
import { Chess } from 'chess.js'
import { S } from '../state.js'
import { judge } from '../analyze.js'
import { esc, dateStr } from '../util.js'

export default function (root, ctx) {
  const items = []
  for (const g of S.games) {
    const a = S.an[g.id]
    if (!a) continue
    const ucis = a.ucis.split(' ')
    for (const m of judge(a)) if (m.i % 2 === (g.me === 'w' ? 0 : 1) && m.loss >= 20 && m.before >= 25 && a.best[m.i] && a.best[m.i] !== ucis[m.i]) items.push({ g, a, m, ucis })
  }
  if (!items.length) {
    root.innerHTML = `<div class="pagehead"><div><h1>Blunder trainer</h1></div></div><div class="panel"><p class="empty">No positions yet. Analyse some games on the <a href="#/overview">overview page</a> and your own mistakes will show up here as puzzles.</p></div>`
    return
  }
  items.sort(() => Math.random() - 0.5)
  let k = -1, solved = 0, tried = 0, cg, cur, tries = 0

  root.innerHTML = `<div class="pagehead"><div><h1>Blunder trainer</h1><p>${items.length} positions from your own games where you missed the best move. Find it.</p></div><div class="muted" id="score"></div></div>
  <div class="puz"><div class="board" id="tb"></div><div class="fb" id="fb"></div>
  <div class="filters"><button class="btn" id="hint">Hint</button><button class="btn" id="show">Show answer</button><button class="btn primary" id="next">Next position</button></div></div>`
  const fb = root.querySelector('#fb'), say = (t, c = '') => { fb.className = 'fb ' + c; fb.innerHTML = t }

  function load() {
    k = (k + 1) % items.length; tries = 0
    cur = items[k]
    const c = new Chess()
    c.loadPgn(cur.g.pgn)
    const h = c.history({ verbose: true })[cur.m.i], turn = h.color === 'w' ? 'white' : 'black'
    const ch = new Chess(h.before), dests = new Map()
    ch.moves({ verbose: true }).forEach(m => dests.set(m.from, [...(dests.get(m.from) || []), m.to]))
    cur.fen = h.before; cur.chess = ch; cur.turn = turn; cur.dests = dests
    const lastPrev = cur.m.i ? c.history({ verbose: true })[cur.m.i - 1] : null
    const cfg = { fen: h.before, orientation: turn, turnColor: turn, lastMove: lastPrev ? [lastPrev.from, lastPrev.to] : undefined, check: ch.inCheck(), drawable: { autoShapes: [] }, movable: { free: false, color: turn, dests, events: { after: onMove } }, highlight: { lastMove: true } }
    cg ? cg.set(cfg) : (cg = Chessground(root.querySelector('#tb'), cfg))
    say(`You play ${turn === 'white' ? 'White' : 'Black'} against ${esc(cur.g.oppName)} (${dateStr(cur.g.t)}). Find the best move.`)
    score()
  }
  const score = () => (root.querySelector('#score').textContent = `Solved ${solved} of ${tried}`)

  function onMove(from, to) {
    const legal = cur.chess.moves({ verbose: true }).find(m => m.from === from && m.to === to)
    const uci = from + to + (legal?.promotion ? cur.a.best[cur.m.i][4] || 'q' : '')
    const best = cur.a.best[cur.m.i]
    if (uci === best) {
      if (!tries) solved++
      tried += tries ? 0 : 1; score()
      cg.set({ movable: { color: undefined }, drawable: { autoShapes: [] } })
      say(`Correct. In the game you played <b>${esc(cur.a.ucis.split(' ')[cur.m.i])}</b> and lost ${cur.m.loss.toFixed(0)}% of your winning chances.`, 'ok')
    } else {
      if (!tries) { tried++; score() }
      tries++
      say(`Not the best move. Try again, or ask for a hint.`, 'no')
      const c0 = cur
      setTimeout(() => { if (cur === c0) cg.set({ fen: c0.fen, turnColor: c0.turn, lastMove: undefined, movable: { color: c0.turn, dests: c0.dests } }) }, 500)
    }
  }
  const best = () => cur.a.best[cur.m.i]
  root.querySelector('#hint').onclick = () => cg.set({ drawable: { autoShapes: [{ orig: best().slice(0, 2), brush: 'yellow' }] } })
  root.querySelector('#show').onclick = () => { if (!tries) tried++; tries++; score(); cg.set({ drawable: { autoShapes: [{ orig: best().slice(0, 2), dest: best().slice(2, 4), brush: 'green' }] } }); say(`The best move was <b>${best()}</b>.`) }
  root.querySelector('#next').onclick = load
  load()
}
