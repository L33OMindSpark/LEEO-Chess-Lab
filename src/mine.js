import { S } from './state.js'

// Your own results on the opening tree (games as Black for the defense explorer, as White for the opening explorer). Chess.com names (like "Sicilian Defense Open Najdorf Variation") are matched to the tree by
// word order, so a game lands on the deepest tree entry whose words all appear in it in order.
const words = s => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean)
const inOrder = (needle, hay) => { let i = 0; for (const w of hay) if (w === needle[i]) i++; return i === needle.length }
let built = null

function build(rootLike, color) {
  const games = new Map()
  for (const g of S.games) { if (g.me !== color) continue; const k = g.name; if (!k || k === 'Unknown') continue; const o = games.get(k) || { n: 0, w: 0, c: 0, words: words(k) }; o.n++; o.c++; if (g.score === 1) o.w++; games.set(k, o) }
  const stats = new Map()
  // the first two levels are only groupings ("Against 1.e4"), so the matching words start at the opening family
  const walk = (n, chain) => {
    const own = n.depth < 2 ? [] : [...chain, ...words(n.name)]
    n._words = own
    n.kids.forEach(k => walk(k, own))
  }
  walk(rootLike, [])
  const all = []; (function flat(n) { all.push(n); n.kids.forEach(flat) })(rootLike)
  all.sort((a, b) => b._words.length - a._words.length)
  for (const [, o] of games) {
    const hit = all.find(n => n.depth >= 2 && n._words.length && inOrder(n._words, o.words))
    for (let x = hit; x; x = x.parent) { const s = stats.get(x.id) || { n: 0, w: 0 }; s.n += o.n; s.w += o.w; stats.set(x.id, s) }
  }
  return stats
}

export function mineFor(node, color) {
  let top = node; while (top.parent) top = top.parent
  if (!built || built.root !== top || built.games !== S.games || built.color !== color) built = { root: top, games: S.games, color, stats: build(top, color) }
  const s = built.stats.get(node.id)
  return s && s.n >= 1 ? { n: s.n, win: Math.round((s.w / s.n) * 100) } : null
}
