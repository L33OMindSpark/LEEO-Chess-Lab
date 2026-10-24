// Background job: claims tracked chess.com accounts, reads all their games, runs Stockfish on the newest ones and saves the results.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, WORKER_SECRET (required); STOCKFISH_CMD, MAX_MINUTES, THREADS, ANALYSE_LIMIT, SINCE (optional).
import { loadGames, KEEP_PGN } from '../src/api.js'
import { analyzeGame, summarize } from '../src/analyze.js'
import { makePool } from './uci.mjs'

const { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: KEY, WORKER_SECRET: SECRET } = process.env
if (!URL_ || !KEY || !SECRET) { console.error('Missing SUPABASE_URL, SUPABASE_ANON_KEY or WORKER_SECRET'); process.exit(1) }
const CMD = process.env.STOCKFISH_CMD || 'stockfish'
const DEADLINE = Date.now() + (+process.env.MAX_MINUTES || 45) * 60000
const LIMIT = +process.env.ANALYSE_LIMIT || Infinity // the whole history by default
const THREADS = +process.env.THREADS || 2

const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + KEY }) }
async function rpc(fn, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify({ secret: SECRET, ...args }) })
  if (!r.ok) throw new Error(`${fn} failed (${r.status}) ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()
  return t ? JSON.parse(t) : null
}
const status = (acc, st, o = {}) => rpc('worker_status', { acc, st, total: o.total ?? null, done: o.done ?? null, target: o.target ?? null, err: o.err ?? null, finished: !!o.finished })
const ym = g => new Date(g.t * 1000).toISOString().slice(0, 7).replace('-', '/')

async function handle(job, pool) {
  const log = m => console.log(`[${job.user}] ${m}`)
  await status(job.id, 'reading')
  const all = await loadGames(job.user, process.env.SINCE || '', (d, t) => d % 20 === 0 && log(`archive ${d}/${t}`), Infinity)
  log(`${all.length} games read`)
  const months = {}
  // the site only needs move lists for the newest games; the full records are saved separately
  all.forEach((g, i) => (months[ym(g)] ||= []).push(i < KEEP_PGN ? g : { ...g, pgn: undefined }))
  // first read uploads everything; later refreshes only the newest three months
  const keys = Object.keys(months).sort().reverse().slice(0, job.first ? undefined : 3)
  for (let i = 0; i < keys.length; i += 6) await rpc('worker_put_months', { acc: job.id, months: Object.fromEntries(keys.slice(i, i + 6).map(k => [k, months[k]])) })
  const cands = all.filter(g => g.pgn).slice(0, LIMIT)
  const done = new Set(await rpc('worker_done_ids', { acc: job.id }))
  const todo = cands.filter(g => !done.has(g.id))
  let n = cands.length - todo.length
  await status(job.id, 'analysing', { total: all.length, done: n, target: cands.length })
  log(`analysing ${todo.length} games at depth ${job.depth}`)
  for (const g of todo) {
    if (Date.now() > DEADLINE) { log('time budget used, will continue next run'); return }
    try {
      const a = await analyzeGame(g, pool, job.depth)
      if (a) await rpc('worker_put_analysis', { acc: job.id, gid: g.id, d: a, s: summarize(g, a) })
    } catch (e) { log(`skipped ${g.id}: ${e.message}`) }
    n++
    if (n % 10 === 0) await status(job.id, 'analysing', { done: n })
  }
  await status(job.id, 'ready', { total: all.length, done: n, target: cands.length, finished: true })
  log('ready')
  if (process.env.NTFY_TOPIC) await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, { method: 'POST', body: `${job.user}: ${n} games analysed. Open LEEO Chess Lab to see your report.` }).catch(() => {})
}

const pool = makePool(THREADS, CMD)
for (;;) {
  if (Date.now() > DEADLINE) break
  const job = await rpc('worker_claim', {})
  if (!job) { console.log('nothing to do'); break }
  try { await handle(job, pool) } catch (e) {
    console.error(e)
    await status(job.id, 'error', { err: String(e.message).slice(0, 200) }).catch(() => {})
  }
}
pool.terminate()
