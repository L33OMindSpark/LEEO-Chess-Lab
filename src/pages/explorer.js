import { Chessground } from 'chessground'
import { Chess } from 'chess.js'
import { S } from '../state.js'
import { prepare, find, allIds, layout, inner, poster } from '../treeview.js'
import { esc } from '../util.js'
import { tabs } from '../ui.js'
import { mineFor } from '../mine.js'

const TH = { ink: 'var(--ink)', bg: 'var(--surface)', line: 'var(--faint)', linkOp: 0.5 }
const EX_TABS = [['explorer/defenses', 'Defense explorer'], ['explorer/openings', 'Opening explorer']]
const fileName = s => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
const path = n => { const a = []; for (let x = n; x; x = x.parent) a.unshift(x.name); return a }
const count = n => n.size - 1

export default async function (root, ctx, kind = 'defenses', sel0) {
  const isDef = kind !== 'openings'
  const data = (await import('../data/openings.json')).default[isDef ? 1 : 0]
  const full = prepare(data)
  let focus = 'All', top = full, expanded = new Set(), selected = null, hits = null, prev = new Set(), mine = false
  const view = { x: 20, y: 20, k: 1 }
  const setRoot = label => { focus = label; top = label === 'All' ? full : find(full, full.id + '>' + label); expanded = new Set([top.id, ...(label === 'All' ? top.kids.map(k => k.id) : [])]); selected = null; hits = null }
  setRoot('All')

  root.innerHTML = `<div class="phead"><div><h1>${isDef ? 'Defense explorer' : 'Opening explorer'}</h1>
    <p>${isDef ? 'What to play as Black against each first move, with every variation. Click a name to open its branches.' : 'The main openings for White, with every variation. Click a name to open its branches.'}</p></div>${tabs(`explorer/${kind}`, EX_TABS)}</div>
  <div class="xbar"><input id="xq" class="field" placeholder="Search ${isDef ? 'defenses' : 'openings'}, like Najdorf or Dragon" autocomplete="off">
    <div class="chips" id="xf">${['All', ...full.kids.map(k => k.name)].map(l => `<button class="chip" data-f="${esc(l)}" aria-pressed="${l === 'All'}">${esc(l)}</button>`).join('')}</div>
    <div class="xtools"><button class="btn small" id="xall">Open everything</button><button class="btn small" id="xnone">Collapse</button><button class="btn small" id="xfit">Fit to screen</button>${S.games.length ? '<button class="btn small chip" id="xmine" aria-pressed="false">Show my games</button>' : ''}
      <button class="btn small primary" id="xpng">Download picture</button><button class="btn small" id="xsvg">SVG</button></div></div>
  <div class="xwrap"><div class="xcanvas" id="xc"><svg id="xs" width="100%" height="100%"><g id="vp"></g></svg>
    <div class="xzoom"><button class="btn small" id="zin" aria-label="Zoom in">+</button><button class="btn small" id="zout" aria-label="Zoom out">&minus;</button></div>
    <div class="xhint">Drag to move. Scroll to move up and down. Hold Cmd and scroll to zoom.</div></div>
    <aside class="xside" id="xp"><p class="muted">Pick an opening to see its moves on a board.</p></aside></div>`

  const $ = s => root.querySelector(s), vp = $('#vp'), svg = $('#xs')
  const apply = () => vp.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`)
  const badge = n => { if (!mine) return null; const m = mineFor(n, isDef ? 'b' : 'w'); return m ? { text: `${m.n} games, ${m.win}% won`, color: m.win >= 52 ? 'var(--win)' : m.win <= 44 ? 'var(--loss)' : 'var(--muted)' } : null }

  function draw() {
    const L = layout(top, expanded)
    const vis = new Set(L.nodes.map(n => n.id))
    const fresh = new Set([...vis].filter(i => !prev.has(i)))
    prev = vis
    vp.innerHTML = inner(L, expanded, { th: TH, selected: selected?.id || '', hits, fresh, badge })
    vp._L = L
  }
  function fit() {
    const L = vp._L, r = $('#xc').getBoundingClientRect(), k = Math.min(1, (r.width - 40) / (L.width + 40), (r.height - 40) / (L.height + 30))
    Object.assign(view, { k: Math.max(0.2, k), x: 20, y: Math.max(20, (r.height - L.height * Math.max(0.2, k)) / 2) }); apply()
  }
  function centerOn(n) {
    const r = $('#xc').getBoundingClientRect()
    view.x = r.width / 2 - n.x * view.k - 60; view.y = r.height / 2 - n.y * view.k; apply()
  }
  const expandAll = n => { allIds(n).forEach(i => expanded.add(i)) }
  const ancestors = n => { for (let x = n.parent; x; x = x.parent) expanded.add(x.id) }

  function panel() {
    const n = selected, el = $('#xp')
    if (!n) { el.innerHTML = '<p class="muted">Pick an opening to see its moves on a board.</p>'; return }
    const moves = n.moves ? n.moves.split(' ') : []
    const c = new Chess(), fens = [c.fen()], ok = []
    for (const m of moves) { try { c.move(m); fens.push(c.fen()); ok.push(m) } catch { break } }
    const m = mine ? mineFor(n, isDef ? 'b' : 'w') : null
    el.innerHTML = `<div class="xtitle">${path(n).slice(1).map((p, i, a) => i === a.length - 1 ? `<b>${esc(p)}</b>` : esc(p)).join(' <span class="faint">&rsaquo;</span> ')}</div>
      <p class="muted" style="margin:4px 0 12px">${n.eco ? `ECO ${esc(n.eco)}. ` : ''}${count(n) ? `${count(n)} variations below.` : 'End of the line.'}</p>
      <div class="board" id="xb"></div>
      <div class="xmoves">${ok.map((s, i) => `<button data-i="${i + 1}">${i % 2 ? '' : `<em>${i / 2 + 1}.</em>`}${esc(s)}</button>`).join('')}</div>
      ${m ? `<p class="since" style="margin:12px 0 0;display:block">As ${isDef ? 'Black' : 'White'} you have played this <b>${m.n}</b> times and won <b>${m.win}%</b>.</p>` : ''}
      <div class="filters" style="margin-top:14px">${count(n) ? '<button class="btn small" id="pall">Open all below</button>' : ''}<button class="btn small" id="plink">Copy link</button><button class="btn small primary" id="ppng">Poster of this branch</button></div>`
    const cg = Chessground(el.querySelector('#xb'), { fen: fens[ok.length], viewOnly: true, coordinates: false, orientation: isDef ? 'black' : 'white', lastMove: ok.length ? lastMove(c) : undefined })
    el.querySelectorAll('[data-i]').forEach(b => (b.onclick = () => { const i = +b.dataset.i, cc = new Chess(); ok.slice(0, i).forEach(s => cc.move(s)); const h = cc.history({ verbose: true }), l = h[h.length - 1]; cg.set({ fen: cc.fen(), lastMove: [l.from, l.to] }) }))
    el.querySelector('#pall')?.addEventListener('click', () => { expandAll(n); draw(); centerOn(n) })
    el.querySelector('#plink')?.addEventListener('click', e => copy(link(n), e.target))
    el.querySelector('#ppng')?.addEventListener('click', e => { const ex = new Set(); allIds(n).forEach(i => ex.add(i)); download(n, ex, e.target) })
  }
  const lastMove = c => { const h = c.history({ verbose: true }); const l = h[h.length - 1]; return l ? [l.from, l.to] : undefined }
  const link = n => `${location.origin}${location.pathname}#/explorer/${kind}/${encodeURIComponent(n.id)}`
  async function copy(t, btn) { try { await navigator.clipboard.writeText(t); const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = o), 1200) } catch { prompt('Copy this link', t) } }

  // ---- pictures ----
  const svgOf = (n, ex) => poster(n, ex, { title: n === full ? (isDef ? 'Chess defenses' : 'Chess openings') : n.name, subtitle: `${count(n).toLocaleString()} variations${n.eco ? `. ECO ${n.eco}` : ''}. ${isDef ? 'Defense explorer' : 'Opening explorer'}` })
  function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }
  async function download(n, ex, btn) {
    const s = svgOf(n, ex), w = +/width="(\d+)"/.exec(s)[1], h = +/height="(\d+)"/.exec(s)[1]
    const k = Math.min(3, 15000 / Math.max(w, h), Math.sqrt(1.2e8 / (w * h)))
    const o = btn.textContent; btn.textContent = 'Drawing...'
    const img = new Image(); img.src = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }))
    await img.decode().catch(() => {})
    const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k)
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height)
    cv.toBlob(b => { save(b, `${fileName(n.name)}-openings.png`); btn.textContent = o })
  }

  // ---- events ----
  let drag = null
  svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; svg.setPointerCapture(e.pointerId) })
  svg.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; if (drag.moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; apply() } })
  svg.addEventListener('pointerup', e => {
    const d = drag; drag = null
    if (!d || d.moved) return
    const g = document.elementFromPoint(e.clientX, e.clientY)?.closest('.nd')
    if (!g) return
    const n = find(full, g.dataset.id)
    if (!n) return
    selected = n
    if (n.kids.length) expanded.has(n.id) ? expanded.delete(n.id) : expanded.add(n.id)
    draw(); panel()
    history.replaceState(null, '', `#/explorer/${kind}/${encodeURIComponent(n.id)}`)
  })
  svg.addEventListener('wheel', e => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) { const r = svg.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, k = Math.min(3, Math.max(0.15, view.k * Math.exp(-e.deltaY * 0.01))); view.x = px - ((px - view.x) / view.k) * k; view.y = py - ((py - view.y) / view.k) * k; view.k = k }
    else { view.x -= e.deltaX; view.y -= e.deltaY }
    apply()
  }, { passive: false })
  const zoom = f => { const r = svg.getBoundingClientRect(), px = r.width / 2, py = r.height / 2, k = Math.min(3, Math.max(0.15, view.k * f)); view.x = px - ((px - view.x) / view.k) * k; view.y = py - ((py - view.y) / view.k) * k; view.k = k; apply() }
  $('#zin').onclick = () => zoom(1.25); $('#zout').onclick = () => zoom(0.8)
  $('#xfit').onclick = fit
  $('#xall').onclick = () => { expandAll(top); draw(); fit() }
  $('#xnone').onclick = () => { expanded = new Set([top.id]); hits = null; selected = null; draw(); fit(); panel() }
  $('#xf').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; root.querySelectorAll('#xf .chip').forEach(c => c.setAttribute('aria-pressed', c === b)); setRoot(b.dataset.f); draw(); fit(); panel() })
  $('#xpng').onclick = e => { const ex = new Set(expanded); download(top, ex, e.target) }
  $('#xsvg').onclick = () => save(new Blob([svgOf(top, expanded)], { type: 'image/svg+xml' }), `${fileName(top.name === 'Chess openings' || top.name === 'Chess defenses' ? kind : top.name)}.svg`)
  const mineBtn = $('#xmine'); if (mineBtn) mineBtn.onclick = () => { mine = !mine; mineBtn.setAttribute('aria-pressed', mine); draw(); panel() }
  let t
  $('#xq').addEventListener('input', e => {
    clearTimeout(t)
    t = setTimeout(() => {
      const q = e.target.value.trim().toLowerCase()
      if (q.length < 2) { hits = null; draw(); return }
      const found = []; const walk = n => { if (n.name.toLowerCase().includes(q)) found.push(n); n.kids.forEach(walk) }; walk(top)
      hits = new Set(); found.slice(0, 250).forEach(n => { hits.add(n.id); for (let x = n.parent; x; x = x.parent) { hits.add(x.id); expanded.add(x.id) } })
      draw(); if (found[0]) { centerOn(found[0]); }
    }, 180)
  })

  // open a shared link
  draw()
  const start = sel0 ? find(full, decodeURIComponent(sel0)) : null
  if (start) { ancestors(start); selected = start; if (start.kids.length) expanded.add(start.id); draw(); panel(); centerOn(start) }
  else {
    // first visit: open the biggest family so there is something to look at straight away
    const big = full.kids[0]?.kids[0]
    if (big) { expanded.add(big.id); selected = big; draw(); panel(); centerOn(big) } else fit()
  }
  ctx.onCleanup(() => clearTimeout(t))
}
