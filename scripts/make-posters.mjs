// Draws a big picture for every large opening family. Run: node scripts/make-posters.mjs
// SVGs are always written. PNGs are made too when Google Chrome is installed (macOS).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { prepare, allIds, poster } from '../src/treeview.js'

const OUT = process.argv[2] || new URL('../posters/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const data = JSON.parse(readFileSync(new URL('../src/data/openings.json', import.meta.url)))
const slug = s => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
let made = 0
for (const [i, kind] of [[1, 'defenses'], [0, 'openings']]) {
  const root = prepare(data[i])
  const fams = root.kids.flatMap(g => g.kids.map(f => ({ g, f }))).filter(({ f }) => f.size >= 25)
  for (const { g, f } of fams) {
    const ex = allIds(f)
    const svg = poster(f, ex, { title: f.name, subtitle: `${(f.size - 1).toLocaleString()} variations. ${g.name}. ${kind === 'defenses' ? 'Defense explorer' : 'Opening explorer'}` })
    const base = `${OUT}${kind}-${slug(f.name)}`
    writeFileSync(base + '.svg', svg)
    const w = +/width="(\d+)"/.exec(svg)[1], h = +/height="(\d+)"/.exec(svg)[1]
    try {
      execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--window-size=${w},${Math.min(h, 8000)}`, `--screenshot=${base}.png`, 'file://' + base + '.svg'], { stdio: 'ignore', timeout: 60000 })
    } catch { /* no Chrome: SVG only */ }
    made++
  }
  // one picture per first-move group, opened one level only
  for (const g of root.kids) {
    const ex = new Set([g.id]); g.kids.forEach(k => ex.add(k.id))
    writeFileSync(`${OUT}${kind}-overview-${slug(g.name)}.svg`, poster(g, ex, { title: g.name, subtitle: `${g.kids.length} families. ${kind === 'defenses' ? 'Defense explorer' : 'Opening explorer'}` }))
  }
}
console.log('posters:', made, 'in', OUT)
