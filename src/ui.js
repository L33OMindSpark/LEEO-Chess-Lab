import { S } from './state.js'
import { WINDOWS, CLASSES } from './stats.js'

export const filterHTML = () => `<div class="filters">
  ${WINDOWS.map(([w, l]) => `<button class="chip" data-win="${w}" aria-pressed="${S.filter.win === w}">${l.replace('Last ', '')}</button>`).join('')}
  <span class="sep"></span>
  ${CLASSES.map(c => `<button class="chip cls" style="--c:var(--c-${c})" data-c="${c}" aria-pressed="${S.filter.classes.has(c)}">${c[0].toUpperCase() + c.slice(1)}</button>`).join('')}
</div>`

export function bindFilter(root, rerender) {
  root.querySelectorAll('[data-win]').forEach(b => b.onclick = () => { S.filter.win = +b.dataset.win; rerender() })
  root.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
    const c = b.dataset.c, s = S.filter.classes
    if (s.has(c)) { if (s.size > 1) s.delete(c) } else s.add(c)
    rerender()
  })
}

export const sign = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d)
export const dcls = v => (v > 0.0001 ? 'up' : v < -0.0001 ? 'down' : '')
export const winLabel = () => (S.filter.win ? 'the ' + WINDOWS.find(w => w[0] === S.filter.win)[1].toLowerCase() : 'all time')
export const cap = s => s[0].toUpperCase() + s.slice(1)
