import { mean } from './util.js'
import { myGame } from './analyze.js'

export const WINDOWS = [[1, 'Last 24 hours'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 12 months'], [0, 'All time']]
export const CLASSES = ['rapid', 'blitz', 'bullet', 'daily']
const DAY = 86400

// offset 0 = the window itself, 1 = the equal window just before it
export function slice(all, f, offset = 0) {
  const now = Date.now() / 1000
  const lo = f.win ? now - f.win * DAY * (offset + 1) : 0, hi = f.win ? now - f.win * DAY * offset : Infinity
  if (!f.win && offset) return []
  return all.filter(g => f.classes.has(g.cls) && g.t >= lo && g.t < hi)
}

export const wdl = () => ({ n: 0, w: 0, d: 0, l: 0, opp: 0, my: 0 })
export const addTo = (o, g) => { o.n++; g.score === 1 ? o.w++ : g.score === 0.5 ? o.d++ : o.l++; o.opp += g.opp; o.my += g.my }
export const scoreOf = o => (o.n ? (o.w + o.d / 2) / o.n : 0)
export function group(set, key) {
  const m = new Map()
  for (const g of set) { const k = key(g); if (k == null) continue; if (!m.has(k)) m.set(k, wdl()); addTo(m.get(k), g) }
  return m
}

const memo = new WeakMap()
const mg = (g, a) => memo.get(a) || (memo.set(a, myGame(g, a)), memo.get(a))

export function engineStats(set, an) {
  const rows = set.filter(g => an[g.id]).map(g => ({ g, m: mg(g, an[g.id]) }))
  if (!rows.length) return null
  const mv = rows.flatMap(r => r.m.mine)
  const per = ph => { const x = mv.filter(m => m.ph === ph); return { n: x.length, err: x.filter(m => m.loss >= 20).length, blunders: x.filter(m => m.loss >= 30).length } }
  const ph = [per(0), per(1), per(2)]
  const win = rows.filter(r => r.m.maxWin >= 80), lost = rows.filter(r => r.m.minWin <= 20)
  const press = mv.filter(m => m.pressure), calm = mv.filter(m => !m.pressure && m.spent != null)
  const rate = x => (x.length ? x.filter(m => m.loss >= 20).length / x.length : 0)
  const aheadErr = mv.filter(m => m.before >= 70 && m.loss >= 20).length
  const timed = mv.filter(m => m.spent != null)
  return {
    games: rows.length, moves: mv.length, acc: mean(rows.map(r => r.m.acc)),
    accW: mean(rows.filter(r => r.g.me === 'w').map(r => r.m.acc)), accB: mean(rows.filter(r => r.g.me === 'b').map(r => r.m.acc)),
    count: c => mv.filter(m => m.cls === c).length,
    per100: (mv.filter(m => m.loss >= 30).length / mv.length) * 100,
    err100: (mv.filter(m => m.loss >= 20).length / mv.length) * 100,
    ph, phRate: ph.map(p => (p.n ? (p.err / p.n) * 100 : 0)),
    winGames: win.length, converted: win.filter(r => r.g.score === 1).length,
    lostGames: lost.length, saved: lost.filter(r => r.g.score >= 0.5).length,
    aheadErr, pressureMoves: press.length, pressureRate: rate(press) * 100, calmRate: rate(calm) * 100,
    avgSpent: timed.length ? mean(timed.map(m => m.spent)) : null,
    clocks: rows.filter(r => r.g.cls !== 'daily').length > 0 && timed.length > 0,
    outOfBook: rows.filter(r => r.m.mine.length > 8 && r.m.mine[8].before < 40).length,
  }
}

export function metrics(set, an) {
  const n = set.length
  const o = wdl(); set.forEach(g => addTo(o, g))
  const byCls = {}
  for (const c of CLASSES) {
    const x = set.filter(g => g.cls === c).sort((a, b) => a.t - b.t)
    if (x.length) byCls[c] = { n: x.length, first: x[0].my, last: x[x.length - 1].my, max: Math.max(...x.map(g => g.my)), avg: mean(x.map(g => g.my)), delta: x[x.length - 1].my - x[0].my }
  }
  const main = Object.keys(byCls).sort((a, b) => byCls[b].n - byCls[a].n)[0] || null
  const losses = set.filter(g => g.score === 0), wins = set.filter(g => g.score === 1)
  const e = engineStats(set, an)
  const caList = set.filter(g => g.ca != null).map(g => g.ca)
  const useE = e && e.games >= 5
  const acc = useE ? e.acc : caList.length >= 5 ? mean(caList) : null
  return {
    n, o, score: scoreOf(o) * 100, byCls, main, ratingDelta: main ? byCls[main].delta : 0,
    avgMy: mean(set.map(g => g.my)), avgOpp: mean(set.map(g => g.opp)), avgMoves: mean(set.map(g => g.moves)),
    timeoutLoss: losses.length ? (losses.filter(g => g.how === 'timeout').length / losses.length) * 100 : 0,
    mateShare: wins.length ? (wins.filter(g => g.how === 'checkmated').length / wins.length) * 100 : 0,
    shortLoss: losses.length ? (losses.filter(g => g.moves <= 20).length / losses.length) * 100 : 0,
    drawRate: n ? (o.d / n) * 100 : 0, acc, accSrc: useE ? 'engine' : 'chess.com', e,
  }
}

// -1..+1 style trend between two windows, with the pieces that went into it
export function verdict(cur, prev) {
  if (!prev || cur.n < 5 || prev.n < 5) return null
  const parts = [{ k: 'Score', d: cur.score - prev.score, u: ' pts', w: 1 / 3 }]
  if (cur.main && cur.main === prev.main) parts.push({ k: 'Rating', d: cur.byCls[cur.main].avg - prev.byCls[prev.main].avg, u: '', w: 1 / 25 })
  if (cur.acc != null && prev.acc != null && cur.accSrc === prev.accSrc) parts.push({ k: 'Accuracy', d: cur.acc - prev.acc, u: ' pts', w: 1 / 2 })
  const v = Math.max(-5, Math.min(5, parts.reduce((s, p) => s + p.d * p.w, 0)))
  return { v, parts, label: v > 1.5 ? 'Improving' : v < -1.5 ? 'Slipping' : 'Holding steady' }
}

export function openings(set, color) {
  const rows = []
  const fams = group(set.filter(g => g.me === color), g => g.fam)
  for (const [fam, o] of fams) {
    const sub = group(set.filter(g => g.me === color && g.fam === fam), g => g.name)
    rows.push({ fam, ...o, score: scoreOf(o) * 100, avgOpp: o.opp / o.n, sub: [...sub].map(([name, x]) => ({ name, ...x, score: scoreOf(x) * 100 })).sort((a, b) => b.n - a.n) })
  }
  return rows.sort((a, b) => b.n - a.n)
}

export function firstMoves(set) {
  const white = group(set.filter(g => g.me === 'w'), g => g.m1)
  const vs = m => group(set.filter(g => g.me === 'b' && g.m1 === m), g => g.m2)
  return { white, e4: vs('e4'), d4: vs('d4') }
}

export function habits(set) {
  const d = [...group(set, g => new Date(g.t * 1000).getDay())]
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const week = [1, 2, 3, 4, 5, 6, 0].map(i => { const o = d.find(x => x[0] === i)?.[1] || wdl(); return { label: names[i], n: o.n, score: scoreOf(o) * 100 } })
  const hrs = [...group(set, g => Math.floor(new Date(g.t * 1000).getHours() / 4))]
  const hour = [0, 1, 2, 3, 4, 5].map(i => { const o = hrs.find(x => x[0] === i)?.[1] || wdl(); return { label: `${String(i * 4).padStart(2, '0')}-${String(i * 4 + 4).padStart(2, '0')}h`, n: o.n, score: scoreOf(o) * 100 } })
  const band = g => { const x = g.opp - g.my; return x <= -100 ? 'Lower rated' : x >= 100 ? 'Higher rated' : 'Similar rating' }
  const bands = ['Lower rated', 'Similar rating', 'Higher rated'].map(k => { const o = group(set, band).get(k) || wdl(); return { label: k, n: o.n, score: scoreOf(o) * 100 } })
  const how = { win: {}, loss: {} }
  set.forEach(g => { const t = g.score === 1 ? how.win : g.score === 0 ? how.loss : null; if (t) t[g.how] = (t[g.how] || 0) + 1 })
  const len = ['<= 20', '21-35', '36-50', '51+'].map((label, i) => {
    const o = group(set, g => (g.moves <= 20 ? 0 : g.moves <= 35 ? 1 : g.moves <= 50 ? 2 : 3)).get(i) || wdl()
    return { label: label + ' moves', n: o.n, score: scoreOf(o) * 100 }
  })
  // tilt: score right after a loss vs after a win, inside one sitting (gap under 40 min)
  const s = [...set].sort((a, b) => a.t - b.t), after = { l: wdl(), w: wdl(), l2: wdl() }
  for (let i = 1; i < s.length; i++) {
    if (s[i].t - s[i - 1].t > 2400) continue
    addTo(s[i - 1].score === 0 ? after.l : s[i - 1].score === 1 ? after.w : wdl(), s[i])
    if (i > 1 && s[i - 1].score === 0 && s[i - 2].score === 0 && s[i].t - s[i - 2].t < 4800) addTo(after.l2, s[i])
  }
  return { week, hour, bands, how, len, tilt: { afterLoss: scoreOf(after.l) * 100, nLoss: after.l.n, afterWin: scoreOf(after.w) * 100, nWin: after.w.n, afterTwo: scoreOf(after.l2) * 100, nTwo: after.l2.n } }
}

// Style meters 0..1, honest about what they are built from
export function style(set, m) {
  const white = set.filter(g => g.me === 'w'), black = set.filter(g => g.me === 'b')
  const share = (arr, k) => { const f = group(arr, g => g.fam); const t = [...f.values()].sort((a, b) => b.n - a.n).slice(0, 3).reduce((s, x) => s + x.n, 0); return arr.length ? t / arr.length : 0 }
  const focus = (share(white) + share(black)) / 2
  const meters = [
    { label: 'Game length', left: 'Quick finisher', right: 'Long grinder', value: Math.min(1, Math.max(0, (m.avgMoves - 20) / 30)), note: `${m.avgMoves.toFixed(0)} moves on average` },
    { label: 'How you win', left: 'Positional', right: 'Attacker', value: Math.min(1, m.mateShare / 50), note: `${m.mateShare.toFixed(0)}% of wins end in checkmate` },
    { label: 'Repertoire', left: 'Wide', right: 'Narrow', value: focus, note: `Top 3 openings are ${(focus * 100).toFixed(0)}% of your games` },
    { label: 'Appetite for a fight', left: 'Takes the draw', right: 'Plays on', value: 1 - Math.min(1, m.drawRate / 12), note: `${m.drawRate.toFixed(1)}% of games are drawn` },
  ]
  if (m.e) meters.push({ label: 'Accuracy under fire', left: 'Volatile', right: 'Steady', value: Math.max(0, Math.min(1, 1 - m.e.err100 / 12)), note: `${m.e.err100.toFixed(1)} mistakes or blunders per 100 moves` })
  const e4 = white.filter(g => g.m1 === 'e4').length / (white.length || 1)
  const name = m.mateShare >= 28 && m.avgMoves < 34 ? 'Attacker' : m.avgMoves > 40 && m.mateShare < 20 ? 'Grinder' : m.drawRate > 8 ? 'Solid defender' : 'All-rounder'
  const why = [`${m.mateShare.toFixed(0)}% of your wins are checkmates`, `games last ${m.avgMoves.toFixed(0)} moves on average`]
  if (white.length > 20) why.push(e4 > 0.55 ? `you open 1.e4 in ${(e4 * 100).toFixed(0)}% of White games` : `you open 1.e4 in ${(e4 * 100).toFixed(0)}% of White games, so you mix systems`)
  return { name, why, meters }
}

export function ratingSeries(all, classes, maxPts = 260) {
  return CLASSES.filter(c => classes.has(c)).map(c => {
    const x = all.filter(g => g.cls === c).sort((a, b) => a.t - b.t)
    const step = Math.max(1, Math.ceil(x.length / maxPts))
    const pts = x.filter((_, i) => i % step === 0 || i === x.length - 1).map(g => [g.t, g.my])
    return { name: c[0].toUpperCase() + c.slice(1), key: c, pts }
  }).filter(s => s.pts.length > 1)
}

export function horizons(all, classes, an) {
  return WINDOWS.filter(w => w[0]).map(([win, label]) => {
    const f = { win, classes }, c = metrics(slice(all, f), an), p = metrics(slice(all, f, 1), an)
    return { win, label, cur: c, prev: p, verdict: verdict(c, p) }
  })
}
