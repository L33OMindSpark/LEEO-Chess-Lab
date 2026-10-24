import { Chessground } from 'chessground'
import { Chess } from 'chess.js'
import { S, getFull } from '../state.js'
import { fromAnalysis } from '../analyze.js'
import { esc, dateStr } from '../util.js'
import { queue, record, puzzleId } from '../sr.js'
import { mark, streak, doneToday } from '../warmup.js'

// Puzzles come from the summaries (cheap); the full game is fetched only when a puzzle is shown.
export default function (root, ctx, mode) {
  const TAGS = { fl: (t, i) => t.slice(4).includes('hfxkpm'[i]), pc: (t, i) => 'PNBRQK'.indexOf(t[0]) === i, ph: (t, i) => +t[1] === i, st: (t, i) => 'AEB'.indexOf(t[3]) === i, sp: (t, i) => 'fpsn'.indexOf(t[2]) === i }
  const flt = S.trainFilter; S.trainFilter = null
  const items = []
  for (const g of S.games) for (const e of S.sm[g.id]?.errs || []) if (!flt || TAGS[flt.dim](e[4] || '', flt.idx)) items.push({ g, i: e[0], loss: e[1], played: e[2], best: e[3] })
  if (!items.length) {
    root.innerHTML = `<div class="phead"><div><h1>Blunder trainer</h1></div></div><div class="panel"><p class="empty">No positions yet. Analyse some games from the <a href="#/engine">Engine report</a> and your own mistakes will show up here as puzzles.</p></div>`
    return
  }
  let solved = 0, tried = 0, cg, cur, tries = 0, token = 0, warm = mode === 'warmup', attempts = 0
  const nextItem = () => { const q = queue(items); return q.due[0] || q.fresh[0] || null }

  root.innerHTML = `<div class="phead"><div><h1>${warm ? 'Daily warm-up' : 'Blunder trainer'}</h1><p>${warm ? 'Five of your own missed positions before you play.' : ''} Positions from your own games where you missed the best move. Solve one first try and it comes back later. Miss it and it comes back soon.${flt ? ` Showing only ${esc(flt.label)}.` : ''}</p></div>${warm ? '' : `<div class="filters"><a class="btn primary" href="#/train/warmup">${doneToday() ? 'Warm up again' : 'Start the daily warm-up'}</a>${streak() ? `<span class="muted">${streak()} day streak</span>` : ''}</div>`}</div>
  <div class="puz"><div class="board" id="tb"></div><div class="puzside"><div class="levels" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:22px" id="srstat"></div><div class="fb" id="fb"></div>
  <div class="filters"><button class="btn" id="hint">Hint</button><button class="btn" id="show">Show answer</button><button class="btn primary" id="next">Next position</button></div><p class="sub" style="margin:16px 0 0" id="sess"></p></div></div>`
  const fb = root.querySelector('#fb'), say = (t, c = '') => { fb.className = 'fb ' + c; fb.innerHTML = t }
  const stats = () => {
    const q = queue(items)
    root.querySelector('#srstat').innerHTML = [['Due now', q.due.length], ['New', q.fresh.length], ['Learned', q.learned]].map(([n, v]) => `<div class="level"><div class="name">${n}</div><div class="big num" style="font-size:2.2rem">${v}</div></div>`).join('')
    root.querySelector('#sess').textContent = warm ? `Warm-up: ${Math.min(attempts, 5)} of 5 done.` : `This session: ${solved} solved first try out of ${tried}.`
  }

  async function load() {
    const my = ++token
    tries = 0
    if (warm && attempts >= 5) { mark(); warm = false; stats(); say(`Warm-up done. ${solved} of 5 first try. ${streak()} day streak. Press Next position to keep training.`, 'ok'); return }
    const it = nextItem()
    stats()
    if (!it) { const q = queue(items); say(`All caught up. ${q.next ? `The next position is due ${new Date(q.next).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}`, 'ok'); return }
    say('Loading the position')
    const a = await getFull(it.g.id)
    if (my !== token) return
    if (!a) { record(puzzleId(it), false); return load() }
    const p = fromAnalysis(a), turn = it.i % 2 ? 'black' : 'white', fen = p.fens[it.i]
    const ch = new Chess(fen), dests = new Map()
    ch.moves({ verbose: true }).forEach(m => dests.set(m.from, [...(dests.get(m.from) || []), m.to]))
    cur = { ...it, fen, chess: ch, turn, dests }
    const lp = it.i ? p.ucis[it.i - 1] : null
    const cfg = { fen, orientation: turn, turnColor: turn, lastMove: lp ? [lp.slice(0, 2), lp.slice(2, 4)] : undefined, check: ch.inCheck(), drawable: { autoShapes: [] }, movable: { free: false, color: turn, dests, events: { after: onMove } }, highlight: { lastMove: true } }
    cg ? cg.set(cfg) : (cg = Chessground(root.querySelector('#tb'), cfg))
    say(`You play ${turn === 'white' ? 'White' : 'Black'} against ${esc(it.g.oppName)} (${dateStr(it.g.t)}). Find the best move.`)
  }

  function onMove(from, to) {
    const legal = cur.chess.moves({ verbose: true }).find(m => m.from === from && m.to === to)
    const uci = from + to + (legal?.promotion ? cur.best[4] || 'q' : '')
    if (uci === cur.best) {
      if (!tries) { solved++; tried++; attempts++; record(puzzleId(cur), true) }
      stats()
      cg.set({ movable: { color: undefined }, drawable: { autoShapes: [] } })
      say(`Correct. In the game you played <b>${esc(cur.played)}</b> and lost ${cur.loss}% of your winning chances.`, 'ok')
    } else {
      if (!tries) { tried++; attempts++; record(puzzleId(cur), false); stats() }
      tries++
      say(`Not the best move. Try again, or ask for a hint.`, 'no')
      const c0 = cur
      setTimeout(() => { if (cur === c0) cg.set({ fen: c0.fen, turnColor: c0.turn, lastMove: undefined, movable: { color: c0.turn, dests: c0.dests } }) }, 500)
    }
  }
  root.querySelector('#hint').onclick = () => cur && cg.set({ drawable: { autoShapes: [{ orig: cur.best.slice(0, 2), brush: 'yellow' }] } })
  root.querySelector('#show').onclick = () => { if (!cur) return; if (!tries) { tried++; attempts++; record(puzzleId(cur), false) } tries++; stats(); cg.set({ drawable: { autoShapes: [{ orig: cur.best.slice(0, 2), dest: cur.best.slice(2, 4), brush: 'green' }] } }); say(`The best move was <b>${cur.best}</b>.`) }
  root.querySelector('#next').onclick = load
  ctx.onCleanup(() => token++)
  load()
}
