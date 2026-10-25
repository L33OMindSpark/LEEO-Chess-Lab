// Scouting any player from their public games: repertoire, weak lines, nerves, clock habits, traps and a move book.
// Pure functions, so they run the same in the browser and in Node tests.
import { Chess } from 'chess.js'
import { metrics, habits, openings, group, scoreOf } from './stats.js'
import { baseTime } from './analyze.js'

const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const pct = (n, d) => (d ? (n / d) * 100 : 0)
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v))

// move list of a PGN without comments, numbers or results
export const tokens = pgn => (pgn.split(/\n\n/).pop() || '').replace(/\{[^}]*\}/g, ' ').replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(t => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t))
export const clocks = pgn => [...pgn.matchAll(/\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g)].map(m => +m[1] * 3600 + +m[2] * 60 + +m[3])
export const fen4 = f => f.split(' ').slice(0, 4).join(' ')
const label = (ply, san) => `${Math.floor(ply / 2) + 1}${ply % 2 ? '...' : '.'}${san}`
export const line = toks => toks.map((t, i) => (i % 2 ? t : `${i / 2 + 1}.${t}`)).join(' ')

// ---------- the report ----------
export function report(all) {
  const games = all.filter(g => g.pgn)
  const m = metrics(all, {}), h = habits(all)
  const white = all.filter(g => g.me === 'w'), black = all.filter(g => g.me === 'b')
  const rows = k => [...k].map(([key, o]) => ({ key, n: o.n, w: o.w, d: o.d, l: o.l, score: scoreOf(o) * 100 })).sort((a, b) => b.n - a.n)
  const firstW = rows(group(white, g => g.m1))
  const vs = {}
  for (const mv of ['e4', 'd4', 'c4', 'Nf3']) { const set = black.filter(g => g.m1 === mv); if (set.length) { const o = { n: 0, w: 0, d: 0, l: 0 }; set.forEach(g => { o.n++; g.score === 1 ? o.w++ : g.score === 0.5 ? o.d++ : o.l++ }); vs[mv] = { ...o, score: scoreOf(o) * 100, share: pct(set.length, black.length), replies: rows(group(set, g => g.m2)).slice(0, 4) } }
  }
  const opW = openings(white, 'w').filter(r => r.fam !== 'Unknown'), opB = openings(black, 'b').filter(r => r.fam !== 'Unknown')
  const typical = (color, fam) => { const c = new Map(); games.filter(g => g.me === color && g.fam === fam).forEach(g => { const k = tokens(g.pgn).slice(0, 6).join(' '); c.set(k, (c.get(k) || 0) + 1) }); const top = [...c].sort((a, b) => b[1] - a[1])[0]; return top ? line(top[0].split(' ')) : '' }
  const weak = [...opW.map(r => ({ ...r, color: 'w' })), ...opB.map(r => ({ ...r, color: 'b' }))].filter(r => r.n >= 6).sort((a, b) => a.score - b.score)
  const lines = { weak: weak.filter(r => r.score < m.score - 6).slice(0, 5).map(r => ({ ...r, seq: typical(r.color, r.fam) })), strong: [...weak].reverse().filter(r => r.score > m.score + 6).slice(0, 4).map(r => ({ ...r, seq: typical(r.color, r.fam) })) }

  // predictability: how concentrated the repertoire is
  const top = (set, k, n) => { const c = group(set, k); const t = [...c.values()].sort((a, b) => b.n - a.n).slice(0, n).reduce((s, x) => s + x.n, 0); return pct(t, set.length) }
  const predict = white.length >= 10 && black.length >= 10 ? (top(white, g => g.m1, 1) + top(white, g => g.fam, 3) + top(black, g => g.fam, 3)) / 3 : null

  // clocks and nerves
  let timed = 0, low30 = 0, used15 = 0, reached30 = 0
  for (const g of games) {
    if (g.cls === 'daily') continue
    const bt = baseTime(g.tc), clk = clocks(g.pgn), toks = tokens(g.pgn), par = g.me === 'w' ? 0 : 1
    if (!bt || clk.length < toks.length - 1 || toks.length < 20) continue
    timed++
    const at = n => clk[2 * (n - 1) + par]
    if (at(15) != null) used15 += 1 - at(15) / bt.base
    if (toks.length >= 60 && at(30) != null) { reached30++; if (at(30) / bt.base < 0.15) low30++ }
  }
  const losses = all.filter(g => g.score === 0), wins = all.filter(g => g.score === 1)
  const resigned = losses.filter(g => g.how === 'resigned')
  const long = all.filter(g => g.moves >= 45), short = all.filter(g => g.moves < 45)
  const clock = { timed, avgUsed15: timed ? (used15 / timed) * 100 : null, low30: reached30 >= 8 ? pct(low30, reached30) : null, reached30, timeoutLoss: pct(losses.filter(g => g.how === 'timeout').length, losses.length), flagWins: pct(wins.filter(g => g.how === 'timeout').length, wins.length) }
  const psych = { resign: pct(resigned.length, losses.length), resignMoves: med(resigned.map(g => g.moves)), mated: pct(losses.filter(g => g.how === 'checkmated').length, losses.length), drawRate: m.drawRate, tilt: h.tilt, longScore: long.length >= 20 ? scoreOf(long.reduce((o, g) => (g.score === 1 ? o.w++ : g.score === 0.5 ? o.d++ : o.l++, o.n++, o), { n: 0, w: 0, d: 0, l: 0 })) * 100 : null, shortScore: short.length >= 20 ? scoreOf(short.reduce((o, g) => (g.score === 1 ? o.w++ : g.score === 0.5 ? o.d++ : o.l++, o.n++, o), { n: 0, w: 0, d: 0, l: 0 })) * 100 : null, longN: long.length }

  // traps: the same short game happening again
  const rep = (set, max, min) => { const c = new Map(); set.filter(g => g.pgn && g.moves >= 5 && g.moves <= max).forEach(g => { const t = tokens(g.pgn).slice(0, 2 * Math.min(g.moves, 10)); const k = t.slice(0, 8).join(' '); const o = c.get(k) || { n: 0, name: g.name, color: g.me, urls: [] }; o.n++; o.urls.push(g.url); c.set(k, o) }); return [...c].filter(([, o]) => o.n >= min).sort((a, b) => b[1].n - a[1].n).slice(0, 4).map(([k, o]) => ({ ...o, seq: line(k.split(' ')) })) }
  const traps = { falls: rep(losses, 16, 2), sets: rep(wins, 16, 3) }

  // when they play
  const goodHours = h.hour.filter(x => x.n >= 12), goodDays = h.week.filter(x => x.n >= 12)
  const best = a => [...a].sort((x, y) => y.score - x.score)[0], worst = a => [...a].sort((x, y) => x.score - y.score)[0]
  const when = { hours: h.hour, days: h.week, bestHour: goodHours.length > 2 ? best(goodHours) : null, worstHour: goodHours.length > 2 ? worst(goodHours) : null, bestDay: goodDays.length > 2 ? best(goodDays) : null, worstDay: goodDays.length > 2 ? worst(goodDays) : null }

  // Stalker score: how exploitable they are, with the pieces shown
  const worstLine = weak[0]
  const parts = [
    { k: 'Predictable repertoire', v: predict == null ? 0 : clamp(predict), w: 0.35, note: predict == null ? 'Not enough games with each colour.' : `${predict.toFixed(0)}% of their games stay in a few openings.` },
    { k: 'A weak opening', v: worstLine ? clamp(((m.score - worstLine.score) / 35) * 100) : 0, w: 0.3, note: worstLine ? `${worstLine.fam} as ${worstLine.color === 'w' ? 'White' : 'Black'}: ${worstLine.score.toFixed(0)}% against their ${m.score.toFixed(0)}% overall.` : 'No opening stands out.' },
    { k: 'Tilt after a loss', v: h.tilt.nLoss >= 20 ? clamp(((h.tilt.afterWin - h.tilt.afterLoss) / 25) * 100) : 0, w: 0.15, note: h.tilt.nLoss >= 20 ? `${h.tilt.afterLoss.toFixed(0)}% after a loss, ${h.tilt.afterWin.toFixed(0)}% after a win.` : 'Too few games in one sitting to tell.' },
    { k: 'Clock trouble', v: clamp((clock.timeoutLoss / 50) * 100), w: 0.2, note: `${clock.timeoutLoss.toFixed(0)}% of their losses are on time.` },
  ]
  const score = Math.round(parts.reduce((s, p) => s + p.v * p.w, 0))
  const stalker = { score, parts, verdict: score >= 55 ? 'Very exploitable' : score >= 35 ? 'Some handles' : 'Hard to prepare against' }

  return { n: all.length, m, h, white: white.length, black: black.length, firstW, vs, opW, opB, lines, clock, psych, traps, when, stalker, advice: advice({ m, firstW, vs, lines, clock, psych, when, h, white, black, opW, opB }) }
}

// ---------- plain advice ----------
function advice({ m, firstW, vs, lines, clock, psych, when, h, white, black }) {
  const out = []
  const add = (sev, title, body) => out.push({ sev, title, body })
  // which first move to play as White: where their Black results are worst
  const vsRows = Object.entries(vs).filter(([, o]) => o.n >= 10).sort((a, b) => a[1].score - b[1].score)
  if (vsRows.length >= 2) { const [mv, o] = vsRows[0]; add(8, `As White, open 1.${mv}`, `Against 1.${mv} they score ${o.score.toFixed(0)}% as Black (${o.n} games), the lowest of their replies. Against 1.${vsRows[vsRows.length - 1][0]} they score ${vsRows[vsRows.length - 1][1].score.toFixed(0)}%.`) }
  for (const l of lines.weak.slice(0, 3)) add(7, `Steer into the ${l.fam}`, `As ${l.color === 'w' ? 'White' : 'Black'} they score only ${l.score.toFixed(0)}% in this opening over ${l.n} games${l.seq ? `. Their usual start: ${l.seq}.` : '.'} ${l.color === 'w' ? 'Reach it by playing the Black side against their favourite first move.' : 'Reach it by playing the White side with the same start.'}`)
  for (const l of lines.strong.slice(0, 2)) add(5, `Avoid the ${l.fam}`, `They score ${l.score.toFixed(0)}% in it as ${l.color === 'w' ? 'White' : 'Black'} over ${l.n} games. Pick another line.`)
  const top = firstW[0]
  if (top && white.length >= 15) add(5, `Expect 1.${top.key} as White`, `${((top.n / white.length) * 100).toFixed(0)}% of their White games begin 1.${top.key}. Prepare an answer to it and nothing else.`)
  if (clock.timeoutLoss >= 25) add(6, 'Play on the clock', `${clock.timeoutLoss.toFixed(0)}% of their losses are on time. Keep the position complicated and keep your own clock healthy.`)
  if (clock.low30 != null && clock.low30 >= 30) add(5, 'They run low on time', `In ${clock.low30.toFixed(0)}% of their long games they have under 15% of the clock left at move 30.`)
  if (psych.resign >= 55 && psych.resignMoves < 30) add(4, 'They resign early', `${psych.resign.toFixed(0)}% of their losses end in resignation, typically around move ${psych.resignMoves}. A steady edge is often enough.`)
  if (psych.longScore != null && psych.shortScore != null) {
    if (psych.longScore < psych.shortScore - 8) add(6, 'Take them into long games', `They score ${psych.longScore.toFixed(0)}% in games of 45 moves or more, against ${psych.shortScore.toFixed(0)}% in shorter ones. Trade queens and grind.`)
    else if (psych.longScore > psych.shortScore + 8) add(6, 'Avoid long endgames', `They score ${psych.longScore.toFixed(0)}% in games of 45 moves or more, against ${psych.shortScore.toFixed(0)}% in shorter ones. Decide it in the middlegame.`)
  }
  if (h.tilt.nLoss >= 20 && h.tilt.afterLoss < h.tilt.afterWin - 8) add(5, 'Rematch quickly', `After a loss their score drops to ${h.tilt.afterLoss.toFixed(0)}% (${h.tilt.nLoss} games), against ${h.tilt.afterWin.toFixed(0)}% after a win.`)
  if (when.worstHour && when.bestHour && when.bestHour.score - when.worstHour.score > 10) add(3, 'Their weak hours', `They score ${when.worstHour.score.toFixed(0)}% in the ${when.worstHour.label} block and ${when.bestHour.score.toFixed(0)}% in the ${when.bestHour.label} block (their local time may differ from yours).`)
  return out.sort((a, b) => b.sev - a.sev)
}

// ---------- the move book (opening tree and twin bot) ----------
// key -> { n, moves: Map(san -> { n, w, d, l }) } for the games of one colour, positions up to maxPly.
export async function buildBook(games, color, maxPly = 24, tick) {
  const book = new Map()
  const mine = games.filter(g => g.pgn && g.me === color)
  for (let i = 0; i < mine.length; i++) {
    const g = mine[i], toks = tokens(g.pgn).slice(0, maxPly), c = new Chess()
    for (const t of toks) {
      const key = fen4(c.fen())
      let node = book.get(key); if (!node) book.set(key, (node = { n: 0, moves: new Map() }))
      let e = node.moves.get(t); if (!e) node.moves.set(t, (e = { n: 0, w: 0, d: 0, l: 0 }))
      node.n++; e.n++; g.score === 1 ? e.w++ : g.score === 0.5 ? e.d++ : e.l++
      try { c.move(t) } catch { break }
    }
    if (tick && i % 60 === 59) await tick(i / mine.length)
  }
  return book
}
export const bookMoves = (book, fen) => { const n = book.get(fen4(fen)); return n ? [...n.moves].map(([san, o]) => ({ san, ...o, score: scoreOf(o) * 100 })).sort((a, b) => b.n - a.n) : [] }
// weighted pick among the player's own moves; null when the position is rare
export function twinMove(book, fen) {
  const mv = bookMoves(book, fen), total = mv.reduce((s, x) => s + x.n, 0)
  if (total < 2) return null
  let r = Math.random() * total
  for (const x of mv) { r -= x.n; if (r <= 0) return x.san }
  return mv[0].san
}
