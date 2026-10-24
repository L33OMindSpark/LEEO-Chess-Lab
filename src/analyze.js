import { Chess } from 'chess.js'
import { mean } from './util.js'

export const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
// Calibrated against chess.com's own accuracy on 32 of your reviewed games: the Lichess curve with a steeper slope lands within about 4 points per game.
export const moveAcc = loss => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.115 * loss) - 3.1669))
// chess.com's move classes, as win-chance points lost: inaccuracy 5, mistake 10, blunder 20.
export const T = { ia: 5, ms: 10, bl: 20 }
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

export const CLASS = [['blunder', T.bl], ['mistake', T.ms], ['inaccuracy', T.ia]]

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
    errors: mine.filter(m => m.loss >= T.ms),
  }
}

// Rebuilds the positions of an analysed game from its stored moves (no PGN needed).
export function fromAnalysis(a) {
  const c = new Chess(), fens = [c.fen()], sans = a.sans.split(' ')
  for (const m of sans) { c.move(m); fens.push(c.fen()) }
  return { fens, sans, ucis: a.ucis.split(' '), clk: a.clk || [], ph: a.ph }
}

const PIECE = 'PNBRQK'
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

// Which tactic was on the board: flags f free piece, x fork, k mate, p promotion, m missed capture.
export function bestMotifs(fen, bestUci) {
  let out = ''
  try {
    const c = new Chess(fen), me = c.turn(), opp = me === 'w' ? 'b' : 'w'
    const bm = c.moves({ verbose: true }).find(k => uci(k) === bestUci)
    if (!bm) return out
    if (bm.captured && (VAL[bm.captured] >= 3 && (c.attackers(bm.to, opp).length === 0 || VAL[bm.captured] > VAL[bm.piece]))) out += 'f'
    else if (bm.captured) out += 'm'
    if (bm.promotion) out += 'p'
    c.move(bm)
    if (c.isCheckmate()) out += 'k'
    else {
      let n = 0
      for (const row of c.board()) for (const q of row) {
        if (!q || q.color !== opp || (VAL[q.type] < 3 && q.type !== 'k')) continue
        if (c.attackers(q.square, me).includes(bm.to) && (q.type === 'k' || VAL[q.type] > VAL[bm.piece] || c.attackers(q.square, opp).length === 0)) n++
      }
      if (n >= 2) out += 'x'
    }
  } catch {}
  return out
}
const sanPiece = san => (san[0] === 'O' ? 'K' : /[NBRQK]/.test(san[0]) ? san[0] : 'P')
const uci = m => m.from + m.to + (m.promotion || '')

// A few hundred bytes per game that every statistic can be built from, so the full records are only
// fetched when you open a game or train on it. v2 adds the opponent's side, the kind of position each
// of your errors happened in, and the first move where an opening went wrong.
export function summarize(g, a) {
  const m = myGame(g, a), mine = m.mine, ucis = a.ucis.split(' '), sans = a.sans.split(' ')
  const par = g.me === 'w' ? 0 : 1, opp = m.J.filter(x => x.i % 2 !== par)
  const per = k => [0, 1, 2].map(p => mine.filter(x => x.ph === p && x.cls === k).length)
  const timed = mine.filter(x => x.spent != null), sign = g.me === 'w' ? 1 : -1
  const blunders = mine.filter(x => x.loss >= T.bl)
  let fens = null
  try { const c = new Chess(); fens = [c.fen()]; for (const x of sans) { c.move(x); fens.push(c.fen()) } } catch {}
  const speed = x => (x.spent == null ? 'n' : x.pressure ? 'p' : x.spent < 3 ? 'f' : x.spent >= 15 ? 's' : 'n')
  const state = x => (x.before >= 65 ? 'A' : x.before <= 35 ? 'B' : 'E')
  const elig = mine.filter(x => x.before >= 25)
  const count = (arr, f, n) => { const o = new Array(n).fill(0); arr.forEach(x => o[f(x)]++); return o }
  const tag = x => {
    let flags = ''
    if (fens) {
      try {
        const nxt = new Chess(fens[x.i + 1]).moves({ verbose: true }).find(k => uci(k) === a.best[x.i + 1])
        if (nxt?.captured && VAL[nxt.captured] >= 3) flags += 'h'
      } catch {}
      flags += bestMotifs(fens[x.i], a.best[x.i]).replace('m', sans[x.i].includes('x') ? '' : 'm')
    }
    return sanPiece(sans[x.i]) + x.ph + speed(x) + state(x) + flags
  }
  const first = mine.find(x => x.i < 24 && x.loss >= T.ms && a.best[x.i])
  let fd = null
  if (first && fens) { try { const b = a.best[first.i], bs = new Chess(fens[first.i]).move({ from: b.slice(0, 2), to: b.slice(2, 4), promotion: b[4] }).san; fd = [first.i, Math.round(first.loss), sans[first.i], bs] } catch {} }
  return {
    v: 4, d: a.d, acc: +m.acc.toFixed(1),
    mv: [0, 1, 2].map(p => mine.filter(x => x.ph === p).length), ia: per('inaccuracy'), ms: per('mistake'), bl: per('blunder'),
    mx: Math.round(m.maxWin), mn: Math.round(m.minWin),
    ae: mine.filter(x => x.before >= 70 && x.loss >= T.ms).length,
    pm: mine.filter(x => x.pressure).length, pe: mine.filter(x => x.pressure && x.loss >= T.ms).length,
    cm: mine.filter(x => !x.pressure && x.spent != null).length, ce: mine.filter(x => !x.pressure && x.spent != null && x.loss >= T.ms).length,
    ts: Math.round(timed.reduce((t, x) => t + x.spent, 0)), tn: timed.length,
    bt: blunders.filter(x => x.spent != null).length, fb: blunders.filter(x => x.spent != null && x.spent < 3).length,
    e10: a.ev.length > 20 ? Math.round(winPct(sign * a.ev[20])) : null,
    oob: mine.length > 8 && mine[8].before < 40 ? 1 : 0,
    errs: mine.filter(x => x.loss >= T.ms && x.before >= 25 && a.best[x.i] && a.best[x.i] !== ucis[x.i]).map(x => [x.i, Math.round(x.loss), ucis[x.i], a.best[x.i], tag(x)]),
    // baselines for the pattern finder: how many of my moves fell in each kind of position
    bs: { pc: count(elig, x => PIECE.indexOf(sanPiece(sans[x.i])), 6), ph: count(elig, x => x.ph, 3), st: count(elig, x => 'ABE'.indexOf(state(x)) < 0 ? 2 : { A: 0, E: 1, B: 2 }[state(x)], 3), sp: count(elig, x => 'fpsn'.indexOf(speed(x)), 4) },
    // the opponent in the same games, for the peer comparison
    oa: +mean(opp.map(x => x.acc)).toFixed(1), omv: [0, 1, 2].map(p => opp.filter(x => x.ph === p).length),
    oer: [0, 1, 2].map(p => opp.filter(x => x.ph === p && x.loss >= T.ms).length), obl: opp.filter(x => x.loss >= T.bl).length,
    fd,
  }
}
