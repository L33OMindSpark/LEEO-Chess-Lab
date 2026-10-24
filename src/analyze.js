import { Chess } from 'chess.js'
import { mean } from './util.js'

export const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
export const moveAcc = loss => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))
export const uciOf = m => m.from + m.to + (m.promotion || '')

function phaseOf(fen, ply) {
  const board = fen.split(' ')[0]
  const pieces = (board.match(/[nbrqNBRQ]/g) || []).length
  return ply < 16 ? 0 : pieces <= 6 ? 2 : 1
}

export function parseGame(g) {
  try {
    const c = new Chess()
    c.loadPgn(g.pgn)
    const hist = c.history({ verbose: true })
    const fens = [hist.length ? hist[0].before : new Chess().fen(), ...hist.map(m => m.after)]
    const clk = [...g.pgn.matchAll(/\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g)].map(m => +m[1] * 3600 + +m[2] * 60 + +m[3])
    return { fens, sans: hist.map(m => m.san), ucis: hist.map(uciOf), clk: clk.length === hist.length ? clk : [], ph: fens.slice(0, -1).map((f, i) => phaseOf(f, i)).join('') }
  } catch { return null }
}

function terminalEval(fen) {
  const c = new Chess(fen)
  if (c.isCheckmate()) return c.turn() === 'w' ? -10000 : 10000
  if (c.isStalemate() || c.isInsufficientMaterial()) return 0
  return null
}

// Evaluates every position of one game. Returns the raw record that gets stored.
export async function analyzeGame(g, pool, depth, tick) {
  const p = parseGame(g)
  if (!p) return null
  const ev = new Array(p.fens.length), best = new Array(p.fens.length).fill('')
  await Promise.all(p.fens.map(async (fen, i) => {
    const t = terminalEval(fen)
    if (t !== null) { ev[i] = t; return }
    const r = await pool.eval(fen, depth)
    if (!r) throw new Error('stopped')
    const l = r.lines.find(x => x.mpv === 1) || r.lines[0]
    ev[i] = l ? l.cp : 0
    best[i] = l ? l.pv[0] : ''
    tick && tick()
  }))
  return { v: 1, d: depth, ev, best, sans: p.sans.join(' '), ucis: p.ucis.join(' '), ph: p.ph, clk: p.clk }
}

export const CLASS = [['blunder', 30], ['mistake', 20], ['inaccuracy', 10]]

// Per-move judgement of one analysed game. Index i = ply i (0 = White's first move).
export function judge(a) {
  const ucis = a.ucis.split(' '), out = []
  for (let i = 0; i < ucis.length; i++) {
    const s = i % 2 === 0 ? 1 : -1
    const before = winPct(s * a.ev[i]), after = winPct(s * a.ev[i + 1])
    const loss = Math.max(0, before - after)
    const cls = (CLASS.find(([, t]) => loss >= t) || [ucis[i] === a.best[i] ? 'best' : 'good'])[0]
    out.push({ i, loss, before, after, cls, acc: moveAcc(loss), ph: +a.ph[i] })
  }
  return out
}

// Time left before move i is played by its mover, plus the base clock.
export function baseTime(tc) {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc || '')
  return m ? { base: +m[1], inc: +(m[2] || 0) } : null
}

// Facts about my play in one analysed game.
export function myGame(g, a) {
  const J = judge(a), mine = J.filter(m => m.i % 2 === (g.me === 'w' ? 0 : 1))
  const bt = baseTime(g.tc), pressure = []
  mine.forEach(m => {
    const prev = a.clk[m.i - 2] ?? (bt ? bt.base : null)
    m.pressure = !!(bt && prev != null && a.clk.length && (prev < Math.max(20, bt.base * 0.1)))
    m.spent = a.clk.length && prev != null ? Math.max(0, prev + (bt?.inc || 0) - a.clk[m.i]) : null
    pressure.push(m.pressure)
  })
  const sign = g.me === 'w' ? 1 : -1
  const post = a.ev.slice(16).map(v => winPct(sign * v))
  return {
    J, mine, acc: mean(mine.map(m => m.acc)),
    maxWin: post.length ? Math.max(...post) : 50, minWin: post.length ? Math.min(...post) : 50,
    errors: mine.filter(m => m.loss >= 20),
  }
}
