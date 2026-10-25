import { kvGet, kvSet, sleep } from './util.js'

const B = 'https://api.chess.com/pub/player/'
export const KEEP_PGN = 500 // only the newest games keep their move list (review + engine); older ones stay as light stats rows
const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])

async function j(u, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(u)
    if (r.ok) return r.json()
    if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue }
    const e = new Error(r.status === 404 ? 'No chess.com player with that username.' : 'chess.com answered with status ' + r.status)
    e.status = r.status
    throw e
  }
  throw new Error('chess.com is busy right now. Try again in a minute.')
}
export const getProfile = u => j(B + u)
export const getStats = u => j(B + u + '/stats')

const head = (pgn, k) => new RegExp('\\[' + k + ' "([^"]*)"').exec(pgn)?.[1]
const FAM_END = new Set(['Defense', 'Opening', 'Gambit', 'Game', 'Attack', 'System'])
function openingOf(pgn) {
  const url = head(pgn, 'ECOUrl'), eco = head(pgn, 'ECO') || '?'
  if (!url) return { eco, fam: 'Unknown', name: 'Unknown' }
  const words = (url.split('/openings/')[1] || '').split(/\.\.\.|-\d/)[0].split('-').filter(Boolean)
  if (!words.length) return { eco, fam: 'Unknown', name: 'Unknown' }
  let k = words.findIndex(w => FAM_END.has(w))
  k = k >= 0 ? k + 1 : Math.min(2, words.length)
  return { eco, fam: words.slice(0, k).join(' '), name: words.slice(0, 6).join(' ') }
}

export function norm(g, user) {
  if (g.rules !== 'chess' || !g.pgn || !g.white || !g.black) return null
  const me = g.white.username.toLowerCase() === user ? 'w' : 'b'
  const mine = me === 'w' ? g.white : g.black, opp = me === 'w' ? g.black : g.white
  const score = mine.result === 'win' ? 1 : DRAWS.has(mine.result) ? 0.5 : 0
  const text = g.pgn.split(/\n\n/).pop().replace(/\{[^}]*\}/g, ' ').replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean)
  const nums = [...g.pgn.matchAll(/(\d+)\.(?!\.)/g)]
  const o = openingOf(g.pgn)
  return {
    id: g.url.split('/').pop(), url: g.url, t: g.end_time, cls: g.time_class, tc: g.time_control,
    me, my: mine.rating, opp: opp.rating, oppName: opp.username, score,
    how: score === 1 ? opp.result : mine.result, moves: nums.length ? +nums[nums.length - 1][1] : 0,
    fam: o.fam, name: o.name, eco: o.eco, m1: text[0] || '', m2: text[1] || '',
    ca: g.accuracies ? g.accuracies[me === 'w' ? 'white' : 'black'] ?? null : null, pgn: g.pgn,
  }
}

// Reads the whole archive (cached per month), newest first. since = 'YYYY/MM' or ''.
// chess.com spells names without apostrophes in its links (Kings Indian Defense); put them back for display
const tidy = s => s.replace(/\.{2,}.*$/, '').replace(/\b(King|Queen|Bishop|Petrov|Alekhine|Philidor|Owen|Nimzowitsch|Grob|Elephant)s\b(?!')/g, "$1's").trim()

export async function loadGames(user, since, onProgress, keep = KEEP_PGN, limit = 0) {
  const { archives } = await j(`${B}${user}/games/archives`)
  let list = archives.map(u => u.split('/').slice(-2).join('/')).filter(ym => !since || ym >= since).reverse()
  const d = new Date(), ym = (y, m) => `${y}/${String(m).padStart(2, '0')}`
  const live = new Set([ym(d.getUTCFullYear(), d.getUTCMonth() + 1), ym(d.getUTCFullYear(), d.getUTCMonth() ? d.getUTCMonth() : 12)])
  const months = {}, fresh = []
  let i = 0, done = 0, got = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < list.length) {
      const m = list[i++]
      let data = live.has(m) ? null : await kvGet(`m:${user}:${m}`)
      if (!data) {
        data = (await j(`${B}${user}/games/${m}`)).games.map(g => norm(g, user)).filter(Boolean)
        if (!live.has(m)) fresh.push(m)
      }
      months[m] = data
      got += data.length
      if (limit && got >= limit) i = list.length // a very busy player: the newest months are enough
      onProgress(++done, list.length)
    }
  }))
  for (const m of fresh) await kvSet(`m:${user}:${m}`, months[m]) // cached with moves, so "analyse everything" never has to download twice
  const all = list.flatMap(m => months[m] || []).sort((a, b) => b.t - a.t)
  all.forEach((g, k) => { g.fam = tidy(g.fam); g.name = tidy(g.name); if (k >= keep) delete g.pgn })
  return all
}

// One month with its move lists (for analysing older games), and the list of months, newest first.
export async function archiveMonths(user) {
  const { archives } = await j(`${B}${user}/games/archives`)
  return archives.map(u => u.split('/').slice(-2).join('/')).reverse()
}
export async function loadMonth(user, ym) {
  return (await j(`${B}${user}/games/${ym}`)).games.map(g => norm(g, user)).filter(Boolean).sort((a, b) => b.t - a.t)
}
