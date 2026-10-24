// Runs the real background job against the mock: reads a recent slice of a real account and analyses 3 games.
import { spawn } from 'node:child_process'
import { startMock } from './mock.mjs'
import assert from 'node:assert/strict'

const { server, db } = await startMock(54322)
db.accounts.push({ id: 'acc1', chess_username: process.env.TEST_USER || 'leeoonchess', status: 'pending', games_total: 0, analysed: 0, depth: 10 })
const code = await new Promise(res => {
  const p = spawn('node', ['worker/run.mjs'], { stdio: 'inherit', env: { ...process.env, SUPABASE_URL: 'http://localhost:54322', SUPABASE_ANON_KEY: 'anon', WORKER_SECRET: 'test-secret',
    STOCKFISH_CMD: 'node node_modules/stockfish/bin/stockfish-19-lite-single.js', SINCE: '2026/08', ANALYSE_LIMIT: '3', THREADS: '2', MAX_MINUTES: '5' } })
  p.on('exit', res)
})
const a = db.accounts[0]
console.log(a)
assert.equal(code, 0); assert.equal(a.status, 'ready'); assert.ok(a.games_total > 0)
assert.equal(Object.keys(db.analyses.acc1 || {}).length, 3)
const rec = Object.values(db.analyses.acc1)[0].d
assert.ok(Object.values(db.analyses.acc1)[0].s.mv.length === 3, 'summary saved')
assert.ok(rec.ev.length > 10 && rec.ucis.split(' ').length === rec.ev.length - 1)
console.log('selftest ok:', a.games_total, 'games read,', Object.keys(db.analyses.acc1).length, 'analysed')
server.close()
