import { S } from './state.js'

// Spaced repetition for missed positions: solve one first try and it comes back later, miss it and it comes back soon.
const DAY = 86400000, GAPS = [0, 1, 3, 7, 21, 60].map(d => d * DAY)
const key = () => `sr:${S.user}`
const load = () => { try { return JSON.parse(localStorage[key()] || '{}') } catch { return {} } }
export const puzzleId = it => `${it.g.id}:${it.i}`

export function record(id, solvedFirstTry) {
  const all = load(), cur = all[id] || { box: 0 }
  const box = solvedFirstTry ? Math.min(5, cur.box + 1) : 0
  all[id] = { box, due: Date.now() + (solvedFirstTry ? GAPS[box] : 10 * 60000) }
  localStorage[key()] = JSON.stringify(all)
}

export function queue(items) {
  const all = load(), now = Date.now()
  const st = it => all[puzzleId(it)]
  const due = items.filter(it => st(it) && st(it).box < 4 && st(it).due <= now).sort((a, b) => st(a).due - st(b).due)
  const fresh = items.filter(it => !st(it)).sort(() => Math.random() - 0.5)
  const later = items.filter(it => st(it) && st(it).box < 4 && st(it).due > now).sort((a, b) => st(a).due - st(b).due)
  return { due, fresh, later, learned: items.filter(it => st(it)?.box >= 4).length, next: later[0] ? st(later[0]).due : null }
}
