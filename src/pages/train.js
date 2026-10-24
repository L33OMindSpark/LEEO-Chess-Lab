import { Chessground } from 'chessground'
import { Chess } from 'chess.js'
import { S, getFull } from '../state.js'
import { fromAnalysis } from '../analyze.js'
import { esc, dateStr } from '../util.js'

// Puzzles come from the summaries (cheap); the full game is fetched only when a puzzle is shown.
export default function (root, ctx) {
  const items = []
  for (const g of S.games) for (const e of S.sm[g.id]?.errs || []) items.push({ g, i: e[0], loss: e[1], played: e[2], best: e[3] })
  if (!items.length) {
    root.innerHTML = `<div class="phead"><div><h1>Blunder trainer</h1></div></div><div class="panel"><p class="empty">No positions yet. Analyse some games on the <a href="#/overview">overview page</a> and your own mistakes will show up here as puzzles.</p></div>`
    return
  }
  items.sort(() => Math.random() - 0.5)
  let k = -1, solved = 0, tried = 0, cg, cur, tries = 0, token = 0

  root.innerHTML = `<div class="phead"><div><h1>Blunder trainer</h1><p>${items.length.toLocaleString()} positions from your own games where you missed the best move. Find it.</p></div></div>
  <div class="puz"><div class="board" id="tb"></div><div class="puzside"><h2 id="score" class="num"></h2><p class="sub">Solved on the first try, out of positions seen.</p><div class="fb" id="fb"></div>
  <div class="filters"><button class="btn" id="hint">Hint</button><button class="btn" id="show">Show answer</button><button class="btn primary" id="next">Next position</button></div></div></div>`
  const fb = root.querySelector('#fb'), say = (t, c = '') => { fb.className = 'fb ' + c; fb.innerHTML = t }

  async function load() {
    const my = ++token
    k = (k + 1) % items.length; tries = 0
    const it = items[k]
    say('Loading the position')
    const a = await getFull(it.g.id)
    if (my !== token) return
    if (!a) return load()
    const p = fromAnalysis(a), turn = it.i % 2 ? 'black' : 'white', fen = p.fens[it.i]
    const ch = new Chess(fen), dests = new Map()
    ch.moves({ verbose: true }).forEach(m => dests.set(m.from, [...(dests.get(m.from) || []), m.to]))
    cur = { ...it, fen, chess: ch, turn, dests }
    const lp = it.i ? p.ucis[it.i - 1] : null
    const cfg = { fen, orientation: turn, turnColor: turn, lastMove: lp ? [lp.slice(0, 2), lp.slice(2, 4)] : undefined, check: ch.inCheck(), drawable: { autoShapes: [] }, movable: { free: false, color: turn, dests, events: { after: onMove } }, highlight: { lastMove: true } }
    cg ? cg.set(cfg) : (cg = Chessground(root.querySelector('#tb'), cfg))
    say(`You play ${turn === 'white' ? 'White' : 'Black'} against ${esc(it.g.oppName)} (${dateStr(it.g.t)}). Find the best move.`)
    score()
  }
  const score = () => (root.querySelector('#score').textContent = `${solved} of ${tried}`)

  function onMove(from, to) {
    const legal = cur.chess.moves({ verbose: true }).find(m => m.from === from && m.to === to)
    const uci = from + to + (legal?.promotion ? cur.best[4] || 'q' : '')
    if (uci === cur.best) {
      if (!tries) solved++
      tried += tries ? 0 : 1; score()
      cg.set({ movable: { color: undefined }, drawable: { autoShapes: [] } })
      say(`Correct. In the game you played <b>${esc(cur.played)}</b> and lost ${cur.loss}% of your winning chances.`, 'ok')
    } else {
      if (!tries) { tried++; score() }
      tries++
      say(`Not the best move. Try again, or ask for a hint.`, 'no')
      const c0 = cur
      setTimeout(() => { if (cur === c0) cg.set({ fen: c0.fen, turnColor: c0.turn, lastMove: undefined, movable: { color: c0.turn, dests: c0.dests } }) }, 500)
    }
  }
  root.querySelector('#hint').onclick = () => cur && cg.set({ drawable: { autoShapes: [{ orig: cur.best.slice(0, 2), brush: 'yellow' }] } })
  root.querySelector('#show').onclick = () => { if (!cur) return; if (!tries) tried++; tries++; score(); cg.set({ drawable: { autoShapes: [{ orig: cur.best.slice(0, 2), dest: cur.best.slice(2, 4), brush: 'green' }] } }); say(`The best move was <b>${cur.best}</b>.`) }
  root.querySelector('#next').onclick = load
  ctx.onCleanup(() => token++)
  load()
}
