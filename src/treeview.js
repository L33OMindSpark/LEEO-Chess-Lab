// Layout and drawing for the opening tree. Pure functions (no DOM), so the same code draws the live page and the downloadable posters.
const CW = 5.9, ROW = 18.5
export const PALETTE = ['#2F6F8F', '#B5651D', '#5B8C3A', '#8A4F9E', '#C2483D', '#2A8C82', '#9A7B1C', '#4B5FA8', '#A0527C', '#6B7B3A']

// data: [name, eco, moves, children?]  ->  linked nodes
export function prepare(data) {
  const make = (n, parent, depth) => {
    const node = { id: parent ? parent.id + '>' + n[0] : n[0], name: n[0], eco: n[1], moves: n[2], parent, depth, kids: [], leaves: 0 }
    node.kids = (n[3] || []).map(c => make(c, node, depth + 1))
    node.size = 1 + node.kids.reduce((t, k) => t + k.size, 0)
    return node
  }
  return make(data, null, 0)
}
export const find = (root, id) => { const go = n => (n.id === id ? n : n.kids.map(go).find(Boolean)); return go(root) }
export const allIds = (n, out = new Set()) => { if (n.kids.length) out.add(n.id); n.kids.forEach(k => allIds(k, out)); return out }

export function layout(root, expanded) {
  const nodes = [], links = []
  let row = 0
  const place = n => {
    nodes.push(n)
    const open = n.kids.length && expanded.has(n.id)
    if (!open) { n.row = row++; return }
    n.kids.forEach(k => { links.push([n, k]); place(k) })
    n.row = (n.kids[0].row + n.kids[n.kids.length - 1].row) / 2
  }
  place(root)
  nodes.forEach(n => (n.rd = n.depth - root.depth))
  const maxLen = []
  nodes.forEach(n => (maxLen[n.rd] = Math.max(maxLen[n.rd] || 0, n.name.length)))
  const x = [maxLen[0] * CW + 34]
  for (let d = 1; d < maxLen.length; d++) x[d] = x[d - 1] + Math.max(150, maxLen[d] * CW + 52)
  nodes.forEach(n => { n.x = x[n.rd]; n.y = n.row * ROW })
  const last = x[x.length - 1] || 0
  const lastLabelRight = Math.max(...nodes.filter(n => n.rd === maxLen.length - 1).map(n => n.x + 12), 0)
  return { root, nodes, links, width: Math.max(last + 90, lastLabelRight + 40), height: Math.max(row * ROW, ROW), rows: row }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const branch = (n, root) => { let b = n; while (b.parent && b.parent !== root) b = b.parent; return b.parent === root ? root.kids.indexOf(b) : -1 }
const curve = (p, c) => { const mx = (p.x + c.x) / 2; return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}C${mx.toFixed(1)} ${p.y.toFixed(1)} ${mx.toFixed(1)} ${c.y.toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)}` }

// th: colours. badge(node) can return { text, color } to draw a small pill beside a node.
export function inner(L, expanded, { th, selected = '', hits = null, fresh = null, badge = null } = {}) {
  const links = L.links.map(([p, c]) => { const b = branch(c, L.root); return `<path d="${curve(p, c)}" fill="none" stroke="${b >= 0 ? PALETTE[b % PALETTE.length] : th.line}" stroke-opacity="${th.linkOp ?? 0.8}" stroke-width="${c.rd <= 1 ? 2.2 : 1.5}" vector-effect="non-scaling-stroke"/>` }).join('')
  const nodes = L.nodes.map(n => {
    const has = n.kids.length > 0, open = has && expanded.has(n.id), b = branch(n, L.root)
    const dim = hits && !hits.has(n.id)
    const r = n.rd === 0 ? 5 : has ? 3.8 : 2.8
    const col = b >= 0 ? PALETTE[b % PALETTE.length] : th.ink
    const bd = badge && badge(n)
    return `<g class="nd${fresh && fresh.has(n.id) ? ' new' : ''}${n.id === selected ? ' sel' : ''}${hits && hits.has(n.id) ? ' hit' : ''}${has ? ' can' : ''}" data-id="${esc(n.id)}" opacity="${dim ? 0.28 : 1}">
      <circle cx="${n.x}" cy="${n.y}" r="${r + 7}" fill="transparent"/>
      <circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${has && !open ? th.bg : col}" stroke="${col}" stroke-width="${has && !open ? 1.6 : 0}"/>
      <text x="${n.x - r - 6}" y="${n.y + 3.6}" text-anchor="end" font-size="${n.rd === 0 ? 14 : n.rd === 1 ? 12 : 11}" font-weight="${n.rd <= 1 ? 600 : 400}" fill="${th.ink}">${esc(n.name)}</text>
      ${bd ? `<text x="${n.x + r + 6}" y="${n.y + 3.4}" font-size="9.5" font-weight="600" fill="${bd.color}">${esc(bd.text)}</text>` : ''}
    </g>`
  }).join('')
  return `<g class="links">${links}</g><g class="nodes">${nodes}</g>`
}

// A complete standalone picture of the tree, for download.
export function poster(root, expanded, { title, subtitle }) {
  const th = { ink: '#1B2330', bg: '#FFFFFF', line: '#9AA3AF', linkOp: 0.85 }
  const L = layout(root, expanded), padL = 56, padT = 118, padB = 52, padR = 40
  const W = L.width + padL + padR, H = L.height + padT + padB
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W)}" height="${Math.ceil(H)}" viewBox="0 0 ${Math.ceil(W)} ${Math.ceil(H)}" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif">
<rect width="100%" height="100%" fill="#FFFFFF"/>
<text x="${padL}" y="58" font-family="Georgia, 'Times New Roman', serif" font-size="34" font-weight="600" fill="#1B2330">${esc(title)}</text>
<text x="${padL}" y="84" font-size="13" fill="#5B6675">${esc(subtitle)}</text>
<g transform="translate(${padL} ${padT})">${inner(L, expanded, { th })}</g>
<text x="${padL}" y="${H - 20}" font-size="11" fill="#8A94A3">LEEO Chess Lab. Opening names and move lists from the open Lichess openings list (CC0).</text>
</svg>`
}
