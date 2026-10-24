import { esc, fmt } from './util.js'
import { winPct, T } from './analyze.js'

let tip
function showTip(html, ev) {
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip) }
  tip.innerHTML = html; tip.style.display = 'block'
  const r = tip.getBoundingClientRect()
  tip.style.left = Math.min(innerWidth - r.width - 8, ev.clientX + 14) + 'px'
  tip.style.top = Math.max(8, ev.clientY - r.height - 12) + 'px'
}
const hideTip = () => { if (tip) tip.style.display = 'none' }
const svg = (w, h, inner, cls = '') => `<svg viewBox="0 0 ${w} ${h}" class="chart ${cls}" role="img" preserveAspectRatio="xMidYMid meet">${inner}</svg>`
let mon = t => new Date(t * 1000).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })

export function lineChart(el, series) {
  const W = 760, H = 280, m = { l: 46, r: 14, t: 12, b: 28 }
  const xs = series.flatMap(s => s.pts.map(p => p[0])), ys = series.flatMap(s => s.pts.map(p => p[1]))
  if (!xs.length) { el.innerHTML = '<p class="empty">No rating data in this selection.</p>'; return }
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  mon = x1 - x0 < 200 * 86400 ? t => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : t => new Date(t * 1000).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  const lo = Math.min(...ys), hi = Math.max(...ys)
  const step = [1, 2, 5, 10, 25, 50, 100].find(v => (hi - lo || 1) / v <= 5) || 100
  let y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step
  if (y1 === y0) y1 += step
  const X = t => m.l + ((t - x0) / (x1 - x0 || 1)) * (W - m.l - m.r), Y = v => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b)
  let g = ''
  for (let v = y0; v <= y1; v += step) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${m.l - 8}" y="${Y(v) + 4}" class="ax" text-anchor="end">${v}</text>`
  for (let i = 0; i < 5; i++) { const t = x0 + ((x1 - x0) * i) / 4; g += `<text x="${X(t)}" y="${H - 8}" class="ax" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${mon(t)}</text>` }
  const paths = series.map(s => `<path class="line" pathLength="1" d="${s.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('')}" fill="none" stroke="${s.color || `var(--c-${s.key})`}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')
  el.innerHTML = `<div class="legend">${series.map(s => `<span><i style="background:${s.color || `var(--c-${s.key})`}"></i>${s.name}</span>`).join('')}</div>` + svg(W, H, g + paths + '<g class="hov"></g><rect class="hit" x="0" y="0" width="' + W + '" height="' + H + '" fill="transparent"/>')
  const s = el.querySelector('svg'), hov = s.querySelector('.hov')
  s.addEventListener('mousemove', ev => {
    const r = s.getBoundingClientRect(), t = x0 + ((((ev.clientX - r.left) / r.width) * W - m.l) / (W - m.l - m.r)) * (x1 - x0)
    const near = series.map(se => ({ se, p: se.pts.reduce((b, p) => (Math.abs(p[0] - t) < Math.abs(b[0] - t) ? p : b)) }))
    const tx = X(near.reduce((b, n) => (Math.abs(n.p[0] - t) < Math.abs(b.p[0] - t) ? n : b)).p[0])
    hov.innerHTML = `<line x1="${tx}" x2="${tx}" y1="${m.t}" y2="${H - m.b}" class="cross"/>` + near.map(n => `<circle cx="${X(n.p[0])}" cy="${Y(n.p[1])}" r="4" fill="${n.se.color || `var(--c-${n.se.key})`}" stroke="var(--surface)" stroke-width="2"/>`).join('')
    showTip(`<b>${new Date(near[0].p[0] * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</b>` + near.map(n => `<div><i style="background:${n.se.color || `var(--c-${n.se.key})`}"></i>${n.se.name} ${n.p[1]}</div>`).join(''), ev)
  })
  s.addEventListener('mouseleave', () => { hov.innerHTML = ''; hideTip() })
}

// vertical bars of score % per bucket, with the 50% line
export function barChart(el, items, { h = 190 } = {}) {
  const W = 420, H = h, m = { l: 34, r: 6, t: 14, b: 34 }
  const bw = (W - m.l - m.r) / items.length, Y = v => H - m.b - (v / 100) * (H - m.t - m.b)
  let g = [0, 25, 50, 75, 100].map(v => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 50 ? 'grid mid' : 'grid'}"/><text x="${m.l - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${v}</text>`).join('')
  items.forEach((it, i) => {
    const x = m.l + i * bw + bw * 0.22, w = bw * 0.56, y = Y(it.score), bh = H - m.b - y
    const low = it.n < 5
    if (it.n) g += `<path d="M${x} ${H - m.b}V${y + 4}Q${x} ${y} ${x + 4} ${y}H${x + w - 4}Q${x + w} ${y} ${x + w} ${y + 4}V${H - m.b}Z" fill="${it.score >= 50 ? 'var(--win)' : 'var(--loss)'}" opacity="${low ? 0.35 : 1}" class="bar" data-i="${i}" style="--i:${i}"/>`
    g += `<text x="${x + w / 2}" y="${H - 16}" class="ax" text-anchor="middle">${esc(it.label)}</text><text x="${x + w / 2}" y="${H - 3}" class="ax faint" text-anchor="middle">${it.n}</text>`
  })
  el.innerHTML = svg(W, H, g)
  el.querySelectorAll('.bar').forEach(b => {
    const it = items[b.dataset.i]
    b.addEventListener('mousemove', ev => showTip(`<b>${esc(it.label)}</b><div>${it.n} games, score ${it.score.toFixed(0)}%</div>`, ev))
    b.addEventListener('mouseleave', hideTip)
  })
}

// white-advantage area chart for one game; click or drag to jump to a move
export function evalGraph(el, a, J, cur, onSel) {
  const W = 640, H = 120, n = a.ev.length, X = i => (i / (n - 1 || 1)) * W, Y = i => H - (winPct(a.ev[i]) / 100) * H
  const line = a.ev.map((_, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(i).toFixed(1)).join('')
  const dots = J.filter(m => m.loss >= T.ms).map(m => `<circle cx="${X(m.i + 1)}" cy="${Y(m.i + 1)}" r="3.5" fill="${m.loss >= T.bl ? 'var(--loss)' : 'var(--warn)'}" stroke="var(--surface)" stroke-width="1.5"/>`).join('')
  el.innerHTML = svg(W, H, `<rect width="${W}" height="${H}" fill="var(--graph-dark)"/><path d="${line}L${W} ${H}L0 ${H}Z" fill="var(--graph-light)"/><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--graph-mid)" stroke-dasharray="3 4"/>${dots}<line class="curline" x1="${X(cur)}" x2="${X(cur)}" y1="0" y2="${H}" stroke="var(--accent)" stroke-width="2"/>`, 'evalg')
  const s = el.querySelector('svg'), pick = ev => { const r = s.getBoundingClientRect(); onSel(Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - r.left) / r.width) * (n - 1))))) }
  let down = false
  s.addEventListener('mousedown', ev => { down = true; pick(ev) })
  s.addEventListener('mousemove', ev => { if (down) pick(ev) })
  addEventListener('mouseup', () => (down = false))
  return i => { const l = s.querySelector('.curline'); l.setAttribute('x1', X(i)); l.setAttribute('x2', X(i)) }
}

export const wdlBar = o => {
  const t = o.n || 1
  return `<span class="wdl" title="${o.w} wins, ${o.d} draws, ${o.l} losses"><i class="w" style="width:${(o.w / t) * 100}%"></i><i class="d" style="width:${(o.d / t) * 100}%"></i><i class="l" style="width:${(o.l / t) * 100}%"></i></span>`
}
export const num = fmt

// one square per day for the last 53 weeks, shaded by how many games were played
export function heatmap(el, games) {
  const day = t => Math.floor(t / 86400), today = day(Date.now() / 1000), dow = (new Date().getUTCDay() + 6) % 7
  const start = today - dow - 52 * 7, by = new Map()
  for (const g of games) { const d = day(g.t); if (d >= start) { const o = by.get(d) || { n: 0, s: 0 }; o.n++; o.s += g.score; by.set(d, o) } }
  const max = Math.max(1, ...[...by.values()].map(o => o.n)), W = 53 * 15, H = 7 * 15 + 18
  let out = '', lastM = -1
  for (let w = 0; w < 53; w++) {
    const d0 = new Date((start + w * 7) * 86400000), m = d0.getUTCMonth()
    if (m !== lastM && w < 50) { out += `<text x="${w * 15}" y="10" class="ax">${d0.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</text>`; lastM = m }
    for (let r = 0; r < 7; r++) {
      const d = start + w * 7 + r
      if (d > today) continue
      const o = by.get(d), lv = o ? Math.ceil((o.n / max) * 4) : 0
      out += `<rect x="${w * 15}" y="${18 + r * 15}" width="12" height="12" rx="3" fill="${lv ? 'var(--accent)' : 'var(--line)'}" opacity="${lv ? 0.25 + lv * 0.19 : 0.6}" data-d="${d}" ${o ? `data-n="${o.n}" data-s="${o.s}"` : ''}/>`
    }
  }
  el.innerHTML = svg(W, H, out, 'heat')
  el.querySelectorAll('rect').forEach(r => {
    r.addEventListener('mousemove', ev => showTip(`<b>${new Date(r.dataset.d * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</b><div>${r.dataset.n ? `${r.dataset.n} games, score ${((r.dataset.s / r.dataset.n) * 100).toFixed(0)}%` : 'No games'}</div>`, ev))
    r.addEventListener('mouseleave', hideTip)
  })
}

// tiny eval history of one game from my point of view
export const sparkline = (ev, me) => {
  const n = ev.length, pts = ev.map((v, i) => `${((i / (n - 1 || 1)) * 100).toFixed(1)},${(26 - ((me === 'w' ? winPct(v) : 100 - winPct(v)) / 100) * 26).toFixed(1)}`).join(' ')
  return `<svg class="spark" viewBox="0 0 100 26" preserveAspectRatio="none"><line x1="0" x2="100" y1="13" y2="13" stroke="var(--line2)" stroke-dasharray="2 3" stroke-width="1" vector-effect="non-scaling-stroke"/><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`
}
export const ring = acc => {
  const c = 2 * Math.PI * 19, col = acc >= 85 ? 'var(--win)' : acc >= 70 ? 'var(--accent)' : 'var(--warn)'
  return `<div class="ring"><svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="none" stroke="var(--line)" stroke-width="4"/><circle cx="23" cy="23" r="19" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(acc / 100) * c} ${c}"/></svg><b>${Math.round(acc)}</b></div>`
}

// Radar of 0 to 100 scores. The dashed ring at 50 is "equal to the opponents in your games".
export function radar(el, axes, { size = 420 } = {}) {
  const c = size / 2, R = size / 2 - 64, n = axes.length
  const pt = (i, v) => { const a = -Math.PI / 2 + (i / n) * 2 * Math.PI; return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)] }
  const ring = v => axes.map((_, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ')
  let g = [25, 75, 100].map(v => `<polygon points="${ring(v)}" fill="none" stroke="var(--line)"/>`).join('') + `<polygon points="${ring(50)}" fill="none" stroke="var(--faint)" stroke-dasharray="4 4"/>`
  axes.forEach((a, i) => { const [x, y] = pt(i, 100), [lx, ly] = pt(i, 118); g += `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="var(--line)"/><text x="${lx}" y="${ly + 4}" class="ax" text-anchor="${Math.abs(lx - c) < 8 ? 'middle' : lx > c ? 'start' : 'end'}" style="font-size:12px;fill:var(--ink)">${a.label}</text>` })
  const poly = axes.map((a, i) => pt(i, a.score).map(x => x.toFixed(1)).join(',')).join(' ')
  g += `<polygon class="rpoly" points="${poly}" fill="var(--accent)" fill-opacity=".18" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>` + axes.map((a, i) => { const [x, y] = pt(i, a.score); return `<circle cx="${x}" cy="${y}" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" data-i="${i}"/>` }).join('')
  el.innerHTML = svg(size, size, g, 'radar')
  el.querySelectorAll('circle').forEach(ci => {
    const a = axes[ci.dataset.i]
    ci.addEventListener('mousemove', ev => showTip(`<b>${a.label}</b><div>You ${a.me.toFixed(1)}${a.unit.startsWith('%') ? '%' : ''} vs ${a.peer.toFixed(1)}${a.unit.startsWith('%') ? '%' : ''} for opponents</div>`, ev))
    ci.addEventListener('mouseleave', hideTip)
  })
}
