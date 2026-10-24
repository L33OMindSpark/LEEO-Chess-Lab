import { kvGet, kvSet, kvScan, kvKeys } from './util.js'
import { Pool } from './engine.js'
import { analyzeGame, summarize } from './analyze.js'
import { archiveMonths, loadMonth } from './api.js'
import * as cloud from './cloud.js'
import { CLASSES } from './stats.js'

// sm: a small summary for every analysed game (all statistics come from these).
// an: full move-by-move records, loaded only when a game is opened or trained on.
export const S = {
  user: null, profile: null, stats: null, games: [], sm: {}, an: {},
  filter: { win: 30, classes: new Set(CLASSES) },
  depth: +(localStorage.depth || 12), job: null, listeners: new Set(),
}
export const emit = () => S.listeners.forEach(f => f())
export const analysedCount = () => Object.keys(S.sm).length

export async function loadAnalyses() {
  S.an = {}
  S.sm = await kvScan(`sm:${S.user}:`)
  // records saved before summaries existed, or with an older summary format
  const missing = (await kvKeys(`an:${S.user}:`)).filter(id => !S.sm[id] || S.sm[id].v < 2)
  if (missing.length) {
    const byId = new Map(S.games.map(g => [g.id, g]))
    for (const id of missing) {
      const g = byId.get(id), a = await kvGet(`an:${S.user}:${id}`)
      if (g && a) { S.sm[id] = summarize(g, a); kvSet(`sm:${S.user}:${id}`, S.sm[id]) }
    }
  }
}

// The full record of one analysed game, from memory, the server or this browser.
export async function getFull(id) {
  if (S.an[id]) return S.an[id]
  const a = S.cloud ? await cloud.loadFull(S.cloud.id, id) : await kvGet(`an:${S.user}:${id}`)
  if (a) S.an[id] = a
  return a || null
}

let pool
const getPool = () => pool || (pool = new Pool(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2))))

// Analyse one game now; resolves with the full record.
export async function analyseOne(g, tick) {
  const have = S.sm[g.id] && (await getFull(g.id))
  if (have) return have
  const a = await analyzeGame(g, getPool(), S.depth, tick)
  if (a) {
    S.an[g.id] = a; S.sm[g.id] = summarize(g, a)
    kvSet(`an:${S.user}:${g.id}`, a); kvSet(`sm:${S.user}:${g.id}`, S.sm[g.id])
  }
  return a
}

// Newest N games that still have their move list (no download needed).
export async function startBatch(n) {
  if (S.job) return
  const todo = S.games.filter(g => g.pgn && !S.sm[g.id]).slice(0, n)
  if (!todo.length) return
  const job = (S.job = { total: todo.length, done: 0, stop: false })
  emit()
  for (const g of todo) {
    if (job.stop) break
    try { await analyseOne(g) } catch (e) { console.warn(e) }
    job.done++
    emit()
  }
  getPool().clear(); S.job = null; emit()
}

// The whole history, month by month, newest first (downloads the move lists again as needed).
export async function startAll() {
  if (S.job) return
  const job = (S.job = { total: S.games.length - analysedCount(), done: 0, stop: false })
  emit()
  try {
    for (const ym of await archiveMonths(S.user)) {
      if (job.stop) break
      for (const g of await loadMonth(S.user, ym)) {
        if (job.stop) break
        if (S.sm[g.id]) continue
        try { await analyseOne(g) } catch (e) { console.warn(e) }
        job.done++; emit()
      }
    }
  } finally { getPool().clear(); S.job = null; emit() }
}
export function stopBatch() { if (S.job) { S.job.stop = true; getPool().clear() } }
