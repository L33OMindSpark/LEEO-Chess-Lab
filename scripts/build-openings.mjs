// Builds src/data/openings.json from the open Lichess opening list (CC0): https://github.com/lichess-org/chess-openings
// Run: node scripts/build-openings.mjs
import { writeFileSync } from 'node:fs'
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/'
const rows = []
for (const f of 'abcde') {
  const t = await (await fetch(`${BASE}${f}.tsv`)).text()
  for (const l of t.split('\n').slice(1)) { const [eco, name, pgn] = l.split('\t'); if (name && pgn) rows.push({ eco, name: name.trim(), moves: pgn.replace(/\d+\.(\.\.)?\s*/g, '').trim() }) }
}
// "Sicilian Defense: Smith-Morra Gambit, Chicago Defense" -> Sicilian Defense > Smith-Morra Gambit > Chicago Defense
// "Sicilian Defense: Smith-Morra Gambit, Chicago Defense" -> Sicilian Defense > Smith-Morra Gambit > Chicago Defense
// A family called "X Accepted" or "X Declined" becomes X > Accepted / Declined, and commas inside the family name become levels too.
const pathOf = n => {
  const [head, ...rest] = n.split(': ')
  const parts = []
  const [fam, ...tail] = head.split(', ')
  const m = fam.match(/^(.*\S) (Accepted|Declined)$/)
  if (m) parts.push(m[1], m[2]); else parts.push(fam)
  parts.push(...tail)
  rest.forEach(r => parts.push(...r.split(', ')))
  return parts.filter(Boolean)
}
const mk = name => ({ n: name, e: '', m: '', c: new Map(), own: false })
const root = mk('root')
for (const r of rows) {
  let node = root
  for (const p of pathOf(r.name)) { if (!node.c.has(p)) node.c.set(p, mk(p)); node = node.c.get(p) }
  if (!node.own || r.moves.split(' ').length < node.m.split(' ').length) { node.e = r.eco; node.m = r.moves; node.own = true }
}
// nodes that only exist as a heading get the moves their children share
const lcp = arr => { const a = arr.map(s => s.split(' ')); let i = 0; while (a.every(x => x[i] && x[i] === a[0][i])) i++; return a[0].slice(0, i).join(' ') }
const fill = n => { for (const c of n.c.values()) fill(c); if (!n.own) { const kids = [...n.c.values()].filter(c => c.m); n.m = kids.length ? lcp(kids.map(k => k.m)) : ''; n.e = kids[0]?.e || '' } }
fill(root)
const size = n => 1 + [...n.c.values()].reduce((t, c) => t + size(c), 0)
const out = n => { const k = [...n.c.values()].sort((a, b) => size(b) - size(a) || a.n.localeCompare(b.n)).map(out); return k.length ? [n.n, n.e, n.m, k] : [n.n, n.e, n.m] }
// Black's defenses vs White's openings
const DEF = /Defen[sc]e|Indian(?! Attack)|Benoni|Benko|Dutch|Budapest|Slav|Englund|Albin|Latvian|Elephant|Blumenfeld|Tarrasch|Counter|Scandinavian|Sicilian|French|Caro-Kann|Philidor|Pirc|Alekhine|Modern|Owen/
const NOT_DEF = /Attack$|Opening$|System$|Game$/
const isDefense = n => DEF.test(n) && !NOT_DEF.test(n)
const fams = [...root.c.values()].sort((a, b) => size(b) - size(a))
const first = f => f.m.split(' ')[0]
const OPEN_G = [['e4', '1.e4'], ['d4', '1.d4'], ['c4', '1.c4 English'], ['Nf3', '1.Nf3 Reti'], ['', 'Other first moves']]
const DEF_G = [['e4', 'Against 1.e4'], ['d4', 'Against 1.d4'], ['c4', 'Against 1.c4'], ['Nf3', 'Against 1.Nf3'], ['', 'Against other first moves']]
const group = (labels, list) => {
  const g = labels.map(([mv, label]) => [label, '', mv, []])
  for (const f of list) (g.find(x => x[2] === first(f)) || g[4])[3].push(out(f))
  return g.filter(x => x[3].length)
}
// the Queen's Gambit is White's opening, and Declined / Accepted are Black's two defenses to it
const defFams = fams.filter(f => isDefense(f.n))
const qg = root.c.get("Queen's Gambit")
if (qg) for (const k of qg.c.values()) if (/^(Declined|Accepted)$/.test(k.n)) defFams.push({ ...k, n: `Queen's Gambit ${k.n}` })
defFams.sort((a, b) => size(b) - size(a))
const openFams = fams.filter(f => !isDefense(f.n))
const data = [['Chess openings', '', '', group(OPEN_G, openFams)], ['Chess defenses', '', '', group(DEF_G, defFams)]]
writeFileSync(new URL('../src/data/openings.json', import.meta.url), JSON.stringify(data))
const cnt = n => 1 + (n[3] || []).reduce((t, x) => t + cnt(x), 0)
console.log('openings', cnt(data[0]) - 1, 'defenses', cnt(data[1]) - 1)
