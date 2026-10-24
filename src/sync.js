import { S } from './state.js'
import { getData, putData } from './cloud.js'

// Trainer progress, tags, targets and warm-up streaks. Always saved in this browser first; when you are
// signed in to a tracked account they are also copied to your account and merged back on every device.
const PREFIX = { sr: 'sr:', why: 'why:', targets: 'targets:', warmup: 'warmup:', goal: 'goal:' }
const get = (k, def) => { try { return JSON.parse(localStorage[PREFIX[k] + S.user] || 'null') ?? def } catch { return def } }
const stamp = k => +localStorage['upd:' + PREFIX[k] + S.user] || 0
const timers = {}

export const read = get
export function write(k, val) {
  localStorage[PREFIX[k] + S.user] = JSON.stringify(val)
  localStorage['upd:' + PREFIX[k] + S.user] = Date.now()
  if (S.cloud) { clearTimeout(timers[k]); timers[k] = setTimeout(() => putData(S.cloud.id, k, val).catch(() => {}), 1500) }
}

const merge = {
  sr: (a, b) => { const out = { ...a }; for (const [id, e] of Object.entries(b)) if (!out[id] || (e.t || 0) > (out[id].t || 0)) out[id] = e; return out },
  why: (a, b) => { const out = { ...a }; for (const [id, t] of Object.entries(b)) out[id] = [...new Set([...(out[id] || []), ...t])]; return out },
}

// Called when an account is opened: pull what other devices saved and merge it with this browser.
export async function pull() {
  if (!S.cloud) return
  try {
    const rows = await getData(S.cloud.id)
    for (const r of rows) {
      if (!PREFIX[r.k]) continue
      const mine = get(r.k, null)
      let val = r.v
      if (merge[r.k] && mine) val = merge[r.k](mine, r.v)
      else if (mine && stamp(r.k) > Date.parse(r.updated_at)) val = mine // targets and streaks: newest copy wins
      localStorage[PREFIX[r.k] + S.user] = JSON.stringify(val)
      if (JSON.stringify(val) !== JSON.stringify(r.v)) putData(S.cloud.id, r.k, val).catch(() => {})
    }
    for (const k of Object.keys(PREFIX)) if (get(k, null) && !rows.some(r => r.k === k)) putData(S.cloud.id, k, get(k, null)).catch(() => {})
  } catch {}
}
