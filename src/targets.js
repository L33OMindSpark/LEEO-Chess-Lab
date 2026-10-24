import { metrics } from './stats.js'

const DAY = 86400
// Each metric: how to read it from a set of games, and which direction is better. need = games required for a trustworthy value.
export const METRICS = {
  fast: { label: 'Blunders played in under 3 seconds', unit: '%', low: true, engine: true, need: 10, get: m => (m.e && m.e.blundersTimed >= 6 ? (m.e.fastBlunders / m.e.blundersTimed) * 100 : null) },
  blunder: { label: 'Blunders per 100 moves', unit: '', low: true, engine: true, need: 10, dec: 1, get: m => m.e?.per100 ?? null },
  errors: { label: 'Mistakes and blunders per 100 moves', unit: '', low: true, engine: true, need: 10, dec: 1, get: m => m.e?.err100 ?? null },
  accuracy: { label: 'Average accuracy', unit: '%', low: false, engine: true, need: 10, dec: 1, get: m => m.e?.acc ?? null },
  pressure: { label: 'Mistake rate in time trouble', unit: '%', low: true, engine: true, need: 10, dec: 1, get: m => (m.e && m.e.pressureMoves >= 30 ? m.e.pressureRate : null) },
  convert: { label: 'Winning positions converted', unit: '%', low: false, engine: true, need: 12, get: m => (m.e && m.e.winGames >= 6 ? (m.e.converted / m.e.winGames) * 100 : null) },
  timeout: { label: 'Losses on time', unit: '%', low: true, engine: false, need: 20, get: m => (m.o.l >= 8 ? m.timeoutLoss : null) },
  score: { label: 'Score', unit: '%', low: false, engine: false, need: 25, get: m => m.score },
}

export const fmtV = (k, v) => (v == null ? 'no data' : v.toFixed(METRICS[k].dec || 0) + METRICS[k].unit)

const inRange = (games, lo, hi) => games.filter(g => g.t >= lo && g.t < hi)
const enough = (k, set, sm) => (METRICS[k].engine ? set.filter(g => sm[g.id]).length : set.length) >= METRICS[k].need

// Value over the last `days` days, or null when there are too few games to say.
export function valueNow(k, games, sm, days = 28, end = Date.now() / 1000) {
  const set = inRange(games, end - days * DAY, end)
  return enough(k, set, sm) ? METRICS[k].get(metrics(set, sm)) : null
}
// One point per week for the last `weeks` weeks, each over the 4 weeks ending then.
export function weekly(k, games, sm, weeks = 16) {
  const now = Date.now() / 1000, out = []
  for (let i = weeks; i >= 0; i--) { const end = now - i * 7 * DAY, v = valueNow(k, games, sm, 28, end); if (v != null) out.push([end, +v.toFixed(2)]) }
  return out
}
// 0 = no progress, 1 = goal reached
export function progress(t, now) {
  if (now == null) return null
  const span = t.goal - t.base
  if (!span) return 1
  return Math.max(0, Math.min(1, (now - t.base) / span))
}

// Starting points picked from the player's own weak spots.
export function suggestions(games, sm, have) {
  const out = [], now = Date.now() / 1000
  for (const k of ['fast', 'blunder', 'pressure', 'convert', 'timeout', 'accuracy']) {
    if (have.has(k)) continue
    const set = inRange(games, now - 180 * DAY, now + 1)
    if (!enough(k, set, sm)) continue
    const base = METRICS[k].get(metrics(set, sm))
    if (base == null) continue
    const m = METRICS[k]
    const bad = k === 'fast' ? base > 30 : k === 'blunder' ? base > 1 : k === 'pressure' ? base > 4 : k === 'convert' ? base < 85 : k === 'timeout' ? base > 12 : base < 90
    if (!bad) continue
    const goal = m.low ? base * 0.7 : k === 'accuracy' ? base + 2 : Math.min(98, base + (100 - base) * 0.35)
    out.push({ key: k, base: +base.toFixed(2), goal: +goal.toFixed(m.dec || 0 ? 1 : 0) })
  }
  return out.slice(0, 3)
}
