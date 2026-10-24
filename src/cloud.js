// Optional hosted mode: sign in with a Supabase account and read what the background job saved.
// Plain fetch against Supabase's REST endpoints, so no client library is needed.
import { kvGet, kvSet } from './util.js'

const URL_ = import.meta.env.VITE_SUPABASE_URL, KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const enabled = !!(URL_ && KEY)
let session = null
try { session = JSON.parse(localStorage.cloud || 'null') } catch {}
export const email = () => session?.email
export const signedIn = () => !!session

const save = s => { session = s; s ? (localStorage.cloud = JSON.stringify(s)) : localStorage.removeItem('cloud') }
const auth = async (grant, body) => {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error_description || j.msg || 'Sign in failed.')
  save({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + j.expires_in * 1000, email: j.user?.email })
}
export const login = (email, password) => auth('password', { email, password })
export async function logout() {
  if (session) fetch(`${URL_}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + session.access } }).catch(() => {})
  save(null)
}

async function api(path, { method = 'GET', body, prefer } = {}) {
  if (!session) throw new Error('Sign in first.')
  if (session.exp - Date.now() < 60000) await auth('refresh_token', { refresh_token: session.refresh }).catch(() => save(null))
  if (!session) throw new Error('Your session ended. Sign in again.')
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { apikey: KEY, Authorization: 'Bearer ' + session.access, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body && JSON.stringify(body) })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(/limit|policy|violates/i.test(j.message || '') ? 'You can track up to 5 accounts, and each username only once.' : j.message || 'The server answered with status ' + r.status)
  }
  return r.status === 204 ? null : r.json()
}

export const accounts = () => api('tracked_accounts?select=*&order=created_at')
export const addAccount = (chess_username, depth = 14) => api('tracked_accounts', { method: 'POST', body: { chess_username, depth }, prefer: 'return=representation' })
export const retry = id => api(`tracked_accounts?id=eq.${id}`, { method: 'PATCH', body: { status: 'pending' } })
export const remove = id => api(`tracked_accounts?id=eq.${id}`, { method: 'DELETE' })

// Games plus one small summary per analysed game. Cached until the job saves something new.
export async function loadAccountData(acc) {
  const key = `cloud:${acc.id}:${acc.refreshed_at}:${acc.analysed}`
  const hit = await kvGet(key)
  if (hit) return hit
  const months = await api(`games_months?account_id=eq.${acc.id}&select=ym,data&limit=1000`)
  const games = months.flatMap(m => m.data).sort((a, b) => b.t - a.t)
  const sm = {}
  for (let o = 0; ; o += 1000) {
    const rows = await api(`analyses?account_id=eq.${acc.id}&select=game_id,summary&order=game_id&limit=1000&offset=${o}`)
    rows.forEach(r => (sm[r.game_id] = r.summary))
    if (rows.length < 1000) break
  }
  const out = { games, sm }
  await kvSet(key, out)
  return out
}
export async function loadFull(accountId, gameId) {
  const r = await api(`analyses?account_id=eq.${accountId}&game_id=eq.${encodeURIComponent(gameId)}&select=data`)
  return r[0]?.data || null
}
