import { mean } from './util.js'

export const WINDOWS = [[1, 'Last 24 hours', '24h'], [7, 'Last 7 days', '7d'], [30, 'Last 30 days', '30d'], [90, 'Last 90 days', '90d'], [365, 'Last 12 months', '12m'], [0, 'All time', 'All']]
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

const sum = (rows, f) => rows.reduce((t, r) => t + f(r.s), 0)
const sumA = (rows, k, i) => rows.reduce((t, r) => t + r.s[k][i], 0)

// sm = per-game summaries (see analyze.js summarize)
export function engineStats(set, sm) {
  const rows = set.filter(g => sm[g.id]).map(g => ({ g, s: sm[g.id] }))
  if (!rows.length) return null
  const moves = sum(rows, s => s.mv[0] + s.mv[1] + s.mv[2])
  const ph = [0, 1, 2].map(p => ({ n: sumA(rows, 'mv', p), err: sumA(rows, 'ms', p) + sumA(rows, 'bl', p), blunders: sumA(rows, 'bl', p) }))
  const win = rows.filter(r => r.s.mx >= 80), lost = rows.filter(r => r.s.mn <= 20)
  const pm = sum(rows, s => s.pm), cm = sum(rows, s => s.cm), tn = sum(rows, s => s.tn)
  const bl = sum(rows, s => s.bl[0] + s.bl[1] + s.bl[2]), er = ph[0].err + ph[1].err + ph[2].err
  return {
    games: rows.length, moves, acc: mean(rows.map(r => r.s.acc)),
    accW: mean(rows.filter(r => r.g.me === 'w').map(r => r.s.acc)), accB: mean(rows.filter(r => r.g.me === 'b').map(r => r.s.acc)),
    count: c => (c === 'blunder' ? bl : c === 'mistake' ? sum(rows, s => s.ms[0] + s.ms[1] + s.ms[2]) : sum(rows, s => s.ia[0] + s.ia[1] + s.ia[2])),
    per100: moves ? (bl / moves) * 100 : 0, err100: moves ? (er / moves) * 100 : 0,
    ph, phRate: ph.map(p => (p.n ? (p.err / p.n) * 100 : 0)),
    winGames: win.length, converted: win.filter(r => r.g.score === 1).length,
    lostGames: lost.length, saved: lost.filter(r => r.g.score >= 0.5).length,
    aheadErr: sum(rows, s => s.ae), pressureMoves: pm, pressureRate: pm ? (sum(rows, s => s.pe) / pm) * 100 : 0,
    calmRate: cm ? (sum(rows, s => s.ce) / cm) * 100 : 0,
    avgSpent: tn ? sum(rows, s => s.ts) / tn : null, clocks: tn > 0,
    blundersTimed: sum(rows, s => s.bt), fastBlunders: sum(rows, s => s.fb),
    outOfBook: sum(rows, s => s.oob),
  }
}

export function metrics(set, sm) {
  const n = set.length
  const o = wdl(); set.forEach(g => addTo(o, g))
  const byCls = {}
  for (const c of CLASSES) {
    const x = set.filter(g => g.cls === c).sort((a, b) => a.t - b.t)
    if (x.length) byCls[c] = { n: x.length, first: x[0].my, last: x[x.length - 1].my, max: Math.max(...x.map(g => g.my)), avg: mean(x.map(g => g.my)), delta: x[x.length - 1].my - x[0].my }
  }
  const main = Object.keys(byCls).sort((a, b) => byCls[b].n - byCls[a].n)[0] || null
  const losses = set.filter(g => g.score === 0), wins = set.filter(g => g.score === 1)
  const e = engineStats(set, sm)
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

export function horizons(all, classes, sm) {
  return WINDOWS.filter(w => w[0]).map(([win, label]) => {
    const f = { win, classes }, c = metrics(slice(all, f), sm), p = metrics(slice(all, f, 1), sm)
    return { win, label, cur: c, prev: p, verdict: verdict(c, p) }
  })
}

// Everything the engine knows about the selected games, for the Engine report page.
export function engineReport(set, sm) {
  const rows = set.filter(g => sm[g.id]).map(g => ({ g, s: sm[g.id] }))
  if (!rows.length) return null
  const byMonth = new Map()
  for (const r of rows) { const k = new Date(r.g.t * 1000).toISOString().slice(0, 7); (byMonth.get(k) || byMonth.set(k, []).get(k)).push(r.s.acc) }
  const monthly = [...byMonth].sort().map(([k, a]) => ({ k, n: a.length, acc: mean(a) }))
  const byClass = CLASSES.map(c => { const x = rows.filter(r => r.g.cls === c); return { label: c[0].toUpperCase() + c.slice(1), n: x.length, acc: mean(x.map(r => r.s.acc)) } }).filter(x => x.n)
  const opens = []
  for (const color of ['w', 'b']) {
    const m = new Map()
    for (const r of rows) if (r.g.me === color && r.s.e10 != null && r.g.fam !== 'Unknown') (m.get(r.g.fam) || m.set(r.g.fam, []).get(r.g.fam)).push(r)
    for (const [fam, x] of m) if (x.length >= 6) opens.push({ fam, color, n: x.length, e10: mean(x.map(r => r.s.e10)), acc: mean(x.map(r => r.s.acc)), score: (x.reduce((t, r) => t + r.g.score, 0) / x.length) * 100 })
  }
  opens.sort((a, b) => a.e10 - b.e10)
  const costly = rows.flatMap(r => r.s.errs.map(e => ({ g: r.g, i: e[0], loss: e[1], played: e[2], best: e[3] }))).sort((a, b) => b.loss - a.loss).slice(0, 12)
  const swing = rows.filter(r => r.s.mx >= 80 && r.g.score < 1).length
  return { monthly, byClass, opens, costly, swing, total: rows.length, e: engineStats(set, sm) }
}

// ---------- peers: you against the opponents in your own games ----------
const clamp = (v, a = 4, b = 96) => Math.max(a, Math.min(b, v))
export function peer(set, sm) {
  const rows = set.filter(g => sm[g.id]?.v >= 2).map(g => ({ g, s: sm[g.id] }))
  if (rows.length < 8) return null
  const phase = ph => {
    const mineE = rows.reduce((t, r) => t + r.s.ms[ph] + r.s.bl[ph], 0), mineN = rows.reduce((t, r) => t + r.s.mv[ph], 0)
    const oppE = rows.reduce((t, r) => t + r.s.oer[ph], 0), oppN = rows.reduce((t, r) => t + r.s.omv[ph], 0)
    return { me: mineN ? (mineE / mineN) * 100 : 0, peer: oppN ? (oppE / oppN) * 100 : 0, n: mineN }
  }
  const win = rows.filter(r => r.s.mx >= 80), lost = rows.filter(r => r.s.mn <= 20)
  const conv = win.length >= 5 && lost.length >= 5 ? { me: (win.filter(r => r.g.score === 1).length / win.length) * 100, peer: (lost.filter(r => r.g.score === 0).length / lost.length) * 100 } : null
  const fight = conv ? { me: (lost.filter(r => r.g.score >= 0.5).length / lost.length) * 100, peer: ((win.length - win.filter(r => r.g.score === 1).length) / win.length) * 100 } : null
  const acc = { me: mean(rows.map(r => r.s.acc)), peer: mean(rows.map(r => r.s.oa)) }
  const errScore = x => clamp(50 + 40 * Math.log2((x.peer || 0.2) / (x.me || 0.2)))
  const axes = [
    { key: 'open', label: 'Opening', ...phase(0), unit: '% errors', low: true },
    { key: 'mid', label: 'Middlegame', ...phase(1), unit: '% errors', low: true },
    { key: 'end', label: 'Endgame', ...phase(2), unit: '% errors', low: true },
  ].map(a => ({ ...a, score: errScore(a) }))
  if (conv) axes.push({ key: 'conv', label: 'Using an advantage', ...conv, unit: '%', low: false, score: clamp(50 + (conv.me - conv.peer)) }, { key: 'fight', label: 'Fighting back', ...fight, unit: '%', low: false, score: clamp(50 + (fight.me - fight.peer)) })
  axes.push({ key: 'acc', label: 'Accuracy', ...acc, unit: '%', low: false, score: clamp(50 + (acc.me - acc.peer) * 5) })
  return { axes, n: rows.length, oppRating: mean(rows.map(r => r.g.opp)), myRating: mean(rows.map(r => r.g.my)) }
}

// ---------- repeated mistakes: which kinds of position your errors cluster in ----------
const PIECES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
export function patterns(set, sm) {
  const rows = set.filter(g => sm[g.id]?.v >= 2).map(g => ({ g, s: sm[g.id] }))
  const errs = rows.flatMap(r => r.s.errs.map(e => ({ g: r.g, i: e[0], loss: e[1], tag: e[4] || '' })))
  if (errs.length < 15) return null
  const base = k => { const out = []; rows.forEach(r => r.s.bs[k].forEach((v, i) => (out[i] = (out[i] || 0) + v))); return out }
  const tot = a => a.reduce((x, y) => x + y, 0)
  const dims = [
    { k: 'pc', get: t => 'PNBRQK'.indexOf(t[0]), names: i => `${PIECES[i]} moves`, base: base('pc') },
    { k: 'ph', get: t => +t[1], names: i => ['opening moves', 'middlegame moves', 'endgame moves'][i], base: base('ph') },
    { k: 'st', get: t => 'AEB'.indexOf(t[3]), names: i => ['moves when you are already winning', 'moves in level positions', 'moves when you are behind'][i], base: base('st') },
    { k: 'sp', get: t => 'fpsn'.indexOf(t[2]), names: i => ['moves played in under 3 seconds', 'moves in time trouble', 'moves after a long think (15 s or more)', 'normally timed moves'][i], base: base('sp') },
  ]
  const cells = []
  for (const d of dims) {
    const counts = new Array(d.base.length).fill(0)
    errs.forEach(e => { const i = d.get(e.tag); if (i >= 0) counts[i]++ })
    counts.forEach((c, i) => {
      const mShare = d.base[i] / (tot(d.base) || 1), eShare = c / errs.length
      if (c >= 8 && mShare > 0.02) cells.push({ label: d.names(i), errs: c, eShare, mShare, lift: eShare / mShare, dim: d.k, idx: i })
    })
  }
  cells.sort((a, b) => b.lift - a.lift)
  const flag = f => errs.filter(e => e.tag.includes(f)).length
  const byOpen = new Map()
  rows.forEach(r => { const o = byOpen.get(r.g.fam) || { n: 0, e: 0 }; o.n++; o.e += r.s.errs.length; byOpen.set(r.g.fam, o) })
  const avg = errs.length / rows.length
  const opens = [...byOpen].filter(([f, o]) => o.n >= 6 && f !== 'Unknown').map(([fam, o]) => ({ fam, n: o.n, per: o.e / o.n })).sort((a, b) => b.per - a.per).slice(0, 5)
  return { total: errs.length, games: rows.length, cells, hung: flag('h'), missed: flag('m'), opens, avg }
}

// ---------- opening doctor: where your openings keep going wrong ----------
export const moveLabel = (ply, san) => `${Math.floor(ply / 2) + 1}${ply % 2 ? '...' : '.'}${san}`
export function doctor(set, sm) {
  const rows = set.filter(g => sm[g.id]?.v >= 2 && sm[g.id].fd).map(g => ({ g, fd: sm[g.id].fd }))
  const groups = new Map()
  for (const r of rows) {
    const k = `${r.g.me}|${r.g.fam}|${r.fd[0]}|${r.fd[2]}`
    const o = groups.get(k) || { color: r.g.me, fam: r.g.fam, ply: r.fd[0], played: r.fd[2], n: 0, loss: 0, best: {} }
    o.n++; o.loss += r.fd[1]; o.best[r.fd[3]] = (o.best[r.fd[3]] || 0) + 1
    groups.set(k, o)
  }
  const leaks = [...groups.values()].filter(o => o.n >= 3 && o.fam !== 'Unknown').map(o => ({ ...o, avg: o.loss / o.n, better: Object.entries(o.best).sort((a, b) => b[1] - a[1])[0][0] })).sort((a, b) => b.n * b.avg - a.n * a.avg).slice(0, 8)
  // swap suggestions: a weak opening and a strong one with the same colour
  const rep = engineReport(set, sm), advice = []
  if (rep) for (const color of ['w', 'b']) {
    const of = rep.opens.filter(o => o.color === color), weak = of.filter(o => o.e10 < 46)[0], strong = [...of].reverse().find(o => o.e10 > 54)
    if (weak && strong) advice.push({ color, weak, strong })
  }
  return { leaks, advice, games: rows.length }
}
