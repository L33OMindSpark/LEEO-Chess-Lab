import { kvGet, kvSet, kvScan } from './util.js'
import { Pool } from './engine.js'
import { analyzeGame } from './analyze.js'
import { CLASSES } from './stats.js'

export const S = {
  user: null, profile: null, stats: null, games: [], an: {},
  filter: { win: 30, classes: new Set(CLASSES) },
  depth: +(localStorage.depth || 12), job: null, listeners: new Set(),
}
export const emit = () => S.listeners.forEach(f => f())

export async function loadAnalyses() {
  S.an = await kvScan(`an:${S.user}:`)
}

let pool
const getPool = () => pool || (pool = new Pool(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2))))

// Analyse one game now (used by the review page); resolves with the stored record.
export async function analyseOne(g, tick) {
  if (S.an[g.id]) return S.an[g.id]
  const a = await analyzeGame(g, getPool(), S.depth, tick)
  if (a) { S.an[g.id] = a; kvSet(`an:${S.user}:${g.id}`, a) }
  return a
}

// Analyse the newest N games that have a move list and no result yet; keeps going until done or stopped.
export async function startBatch(n) {
  if (S.job) return
  const todo = S.games.filter(g => g.pgn && !S.an[g.id]).slice(0, n)
  if (!todo.length) return
  const job = (S.job = { total: todo.length, done: 0, stop: false })
  emit()
  for (const g of todo) {
    if (job.stop) break
    try { await analyseOne(g) } catch (e) { console.warn(e) }
    job.done++
    emit()
  }
  getPool().clear()
  S.job = null
  emit()
}
export function stopBatch() { if (S.job) { S.job.stop = true; getPool().clear() } }
