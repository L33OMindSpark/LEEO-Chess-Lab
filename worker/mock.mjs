// A tiny in-memory stand-in for Supabase, used to test the background job and the site locally.
// Run alone: node worker/mock.mjs   (login test@example.com / test-password, port 54321)
import http from 'node:http'
import { randomUUID } from 'node:crypto'

export function startMock(port = 54321) {
  const db = { accounts: [], months: {}, analyses: {} }
  const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); res.end(body === undefined ? '' : JSON.stringify(body)) }
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204)
    let raw = ''; for await (const c of req) raw += c
    const body = raw ? JSON.parse(raw) : {}
    const u = new URL(req.url, 'http://x'), p = u.pathname, q = u.searchParams
    const eq = k => (q.get(k) || '').replace(/^eq\./, '')
    if (p === '/auth/v1/token') {
      if (body.email === 'test@example.com' && body.password === 'test-password') return send(res, 200, { access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { email: body.email } })
      return send(res, 400, { error_description: 'Invalid login credentials' })
    }
    if (p === '/auth/v1/logout') return send(res, 204)
    if (p === '/rest/v1/tracked_accounts') {
      if (req.method === 'GET') return send(res, 200, db.accounts)
      if (req.method === 'POST') { const a = { id: randomUUID(), chess_username: body.chess_username, status: 'pending', games_total: 0, analysed: 0, analysis_target: 0, depth: body.depth || 14, last_error: null, refreshed_at: null, created_at: new Date().toISOString() }; db.accounts.push(a); return send(res, 201, [a]) }
      if (req.method === 'PATCH') { db.accounts.filter(a => a.id === eq('id')).forEach(a => Object.assign(a, body)); return send(res, 204) }
      if (req.method === 'DELETE') { db.accounts = db.accounts.filter(a => a.id !== eq('id')); return send(res, 204) }
    }
    if (p === '/rest/v1/games_months') return send(res, 200, Object.entries(db.months[eq('account_id')] || {}).map(([ym, data]) => ({ ym, data })))
    if (p === '/rest/v1/analyses') {
      const all = Object.entries(db.analyses[eq('account_id')] || {}).map(([game_id, v]) => ({ game_id, data: v.d, summary: v.s }))
      if (q.get('game_id')) return send(res, 200, all.filter(r => r.game_id === eq('game_id')).map(r => ({ data: r.data })))
      const o = +q.get('offset') || 0, l = +q.get('limit') || 1000
      return send(res, 200, all.slice(o, o + l).map(r => ({ game_id: r.game_id, summary: r.summary })))
    }
    if (p.startsWith('/rest/v1/rpc/')) {
      if (body.secret !== 'test-secret') return send(res, 400, { message: 'denied' })
      const fn = p.split('/').pop(), a = db.accounts.find(x => x.id === body.acc)
      if (fn === 'worker_claim') { const j = db.accounts.find(x => ['pending', 'reading', 'analysing'].includes(x.status)); return send(res, 200, j ? { id: j.id, user: j.chess_username, depth: j.depth, first: j.games_total === 0 } : null) }
      if (fn === 'worker_status') { Object.assign(a, { status: body.st, last_error: body.err }); for (const [k, f] of [['games_total', 'total'], ['analysed', 'done'], ['analysis_target', 'target']]) if (body[f] != null) a[k] = body[f]; if (body.finished) a.refreshed_at = new Date().toISOString(); return send(res, 204) }
      if (fn === 'worker_put_months') { Object.assign((db.months[body.acc] ||= {}), body.months); return send(res, 204) }
      if (fn === 'worker_put_analysis') { (db.analyses[body.acc] ||= {})[body.gid] = { d: body.d, s: body.s }; return send(res, 204) }
      if (fn === 'worker_done_ids') return send(res, 200, Object.keys(db.analyses[body.acc] || {}))
    }
    send(res, 404, { message: 'not found ' + p })
  })
  return new Promise(r => server.listen(port, () => r({ server, db })))
}
if (process.argv[1].endsWith('mock.mjs')) { await startMock(); console.log('mock Supabase on http://localhost:54321') }
