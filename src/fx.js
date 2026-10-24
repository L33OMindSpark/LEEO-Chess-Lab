// Motion helpers: scroll reveals, count-up numbers, the sliding thumb of segmented controls, header shadow.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const SEL = '[data-rv],.panel,.card,.sec,.tipcard,.level,.gh,.game'
let io, cio
const lastSeg = []

function countUp(el) {
  const end = +el.dataset.count, dec = +(el.dataset.dec || 0), t0 = performance.now(), dur = 1100
  if (reduced || !isFinite(end)) return
  const tick = t => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4)
    el.textContent = (end * e).toLocaleString('en', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// mode: 'nav' reveals on scroll, 'soft' shows everything at once, 'silent' touches nothing
export function enhance(root, mode = 'nav') {
  positionSegs(root, mode !== 'silent')
  if (mode === 'silent') { root.querySelectorAll('.chart').forEach(c => c.classList.add('go')); return }
  if (mode === 'soft') root.querySelectorAll('[data-count]').forEach(countUp)
  if (reduced || mode === 'soft' || !('IntersectionObserver' in window)) { root.querySelectorAll('.chart').forEach(c => c.classList.add('go')); return }
  io?.disconnect(); cio?.disconnect()
  io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return
    e.target.classList.add('show'); io.unobserve(e.target)
    e.target.querySelectorAll('[data-count]').forEach(countUp)
    if (e.target.matches('[data-count]')) countUp(e.target)
  }), { rootMargin: '0px 0px -7% 0px', threshold: 0.06 })
  const els = [...root.querySelectorAll(SEL)].filter(e => !e.parentElement.closest(SEL))
  els.forEach((e, i) => { e.classList.add('rv'); e.style.setProperty('--d', Math.min((i % 5) * 0.06, 0.24) + 's'); io.observe(e) })
  cio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('go'); cio.unobserve(e.target) } }), { threshold: 0.2 })
  root.querySelectorAll('.chart').forEach(c => cio.observe(c))
}

function positionSegs(root, animate) {
  root.querySelectorAll('.seg').forEach((s, i) => {
    const b = s.querySelector('[aria-pressed=true]'), th = s.querySelector('.thumb')
    if (!b || !th) return
    const to = { x: b.offsetLeft, w: b.offsetWidth }, from = lastSeg[i]
    const set = v => { th.style.width = v.w + 'px'; th.style.transform = `translateX(${v.x}px)` }
    if (animate && from) { th.style.transition = 'none'; set(from); void th.offsetWidth; th.style.transition = '' }
    set(to); lastSeg[i] = to
  })
}

export function initScroll() {
  const top = document.querySelector('.top'), f = () => top.classList.toggle('scrolled', scrollY > 8)
  addEventListener('scroll', f, { passive: true }); f()
}
