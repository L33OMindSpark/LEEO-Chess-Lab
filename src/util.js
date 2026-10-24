export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const $ = (s, r = document) => r.querySelector(s)
export const $$ = (s, r = document) => [...r.querySelectorAll(s)]
export const fmt = (n, d = 0) => Number(n).toLocaleString('en', { maximumFractionDigits: d, minimumFractionDigits: d })
export const sleep = ms => new Promise(r => setTimeout(r, ms))
export const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
export const dateStr = t => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// tiny key-value store on IndexedDB (cached archive months and engine results); a no-op in Node
let dbp
const db = () => dbp || (dbp = new Promise((res, rej) => {
  const r = indexedDB.open('chess-lab', 1)
  r.onupgradeneeded = () => r.result.createObjectStore('kv')
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error)
}))
const has = typeof indexedDB !== 'undefined'
const tx = async (mode, fn) => {
  if (!has) return undefined
  const d = await db()
  return new Promise(res => {
    const t = d.transaction('kv', mode)
    const out = fn(t.objectStore('kv'))
    t.oncomplete = () => res(out.result)
    t.onerror = () => res(undefined)
  })
}
export const kvGet = k => tx('readonly', s => s.get(k))
export const kvSet = (k, v) => tx('readwrite', s => s.put(v, k))
export const kvClear = () => tx('readwrite', s => s.clear())
export async function kvScan(prefix) {
  if (!has) return {}
  const d = await db()
  return new Promise(res => {
    const out = {}
    const q = d.transaction('kv').objectStore('kv').openCursor(IDBKeyRange.bound(prefix, prefix + '￿'))
    q.onsuccess = () => {
      const c = q.result
      if (c) { out[c.key.slice(prefix.length)] = c.value; c.continue() } else res(out)
    }
    q.onerror = () => res(out)
  })
}
export async function kvKeys(prefix) {
  if (!has) return []
  const d = await db()
  return new Promise(res => {
    const out = []
    const q = d.transaction('kv').objectStore('kv').openKeyCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'))
    q.onsuccess = () => { const c = q.result; if (c) { out.push(c.key.slice(prefix.length)); c.continue() } else res(out) }
    q.onerror = () => res(out)
  })
}
