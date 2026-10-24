import { S } from '../state.js'
import { METRICS, fmtV, valueNow, weekly, progress, suggestions } from '../targets.js'
import { lineChart } from '../charts.js'
import { esc, dateStr } from '../util.js'

export const refresh = false
const key = () => `targets:${S.user}`
const load = () => { try { return JSON.parse(localStorage[key()] || '[]') } catch { return [] } }
const save = t => (localStorage[key()] = JSON.stringify(t))
const verdict = (t, now, p) => (now == null ? ['Not enough recent games', ''] : p >= 1 ? ['Goal reached', 'up'] : p >= 0.5 ? ['More than halfway', 'up'] : p > 0 ? ['Moving the right way', ''] : ['Not moving yet', 'down'])

export default function (root) {
  const targets = load(), have = new Set(targets.map(t => t.key)), sug = suggestions(S.games, S.sm, have)
  const rows = targets.map(t => { const m = METRICS[t.key], series = weekly(t.key, S.games, S.sm), live = valueNow(t.key, S.games, S.sm), last = series[series.length - 1], now = live ?? last?.[1] ?? null, old = live == null && last && last[0] < t.created / 1000, p = old ? null : progress(t, now); return { t, m, now, p, series, v: old ? ['Waiting for games after you started', ''] : verdict(t, now, p), stale: live == null && last ? last[0] : null } })
  root.innerHTML = `<div class="phead"><div><h1>Targets</h1><p>Pick a number to improve and watch it week by week. Each value is measured over the last 4 weeks, so one bad evening does not move it. Needs analysed games.</p></div></div>
  <div class="stack">
  ${rows.map((r, i) => `<section class="card" data-rv><div class="phead" style="margin:0 0 12px;align-items:center"><div><h2>${esc(r.m.label)}</h2><p style="margin:6px 0 0"><span class="tag ${r.v[1]}">${r.v[0]}</span> <span class="muted">Started ${dateStr(r.t.created / 1000)}</span></p></div><button class="btn small" data-del="${i}">Remove</button></div>
    <div class="levels" style="margin-bottom:20px"><div class="level"><div class="name">When you started</div><div class="big num" style="font-size:2.4rem">${fmtV(r.t.key, r.t.base)}</div></div>
      <div class="level" style="--c:var(--accent)"><div class="name">${r.stale ? `Latest measured, ${dateStr(r.stale)}` : 'Now'}</div><div class="big num" style="font-size:2.4rem">${fmtV(r.t.key, r.now)}</div></div>
      <div class="level"><div class="name">Goal</div><div class="big num" style="font-size:2.4rem">${fmtV(r.t.key, r.t.goal)}</div></div></div>
    <div class="bar"><i style="width:${(r.p || 0) * 100}%"></i></div><div id="tc${i}" style="margin-top:14px"></div></section>`).join('')}
  ${sug.length ? `<section class="card" data-rv><h2>Suggested for you</h2><p class="sub">Based on your last six months of analysed games.</p>
    ${sug.map(s => `<div class="hz" style="grid-template-columns:1fr auto auto;gap:18px"><span>${esc(METRICS[s.key].label)}</span><span class="muted">${fmtV(s.key, s.base)} to ${fmtV(s.key, s.goal)}</span><button class="btn small primary" data-add="${s.key}:${s.base}:${s.goal}">Track this</button></div>`).join('')}</section>` : ''}
  <section class="card" data-rv><h2>Choose your own</h2><form id="tf" class="filters"><select id="tk" class="field" style="width:auto">${Object.entries(METRICS).filter(([k]) => !have.has(k)).map(([k, m]) => `<option value="${k}">${esc(m.label)}</option>`).join('')}</select>
    <input id="tg" class="field" style="width:130px" type="number" step="any" placeholder="Goal" required><button class="btn primary">Track it</button></form><p class="err" id="te" style="margin:10px 0 0"></p></section></div>`
  rows.forEach((r, i) => { if (r.series.length > 1) lineChart(root.querySelector('#tc' + i), [{ name: r.m.label, color: 'var(--accent)', pts: r.series }]); else root.querySelector('#tc' + i).innerHTML = '<p class="muted">The weekly chart appears once there are enough analysed games across a few weeks.</p>' })
  const add = (k, goal) => {
    const base = valueNow(k, S.games, S.sm, 180)
    if (base == null) return false
    save([...targets, { key: k, goal: +goal, base: +base.toFixed(2), created: Date.now() }]); root.dispatchEvent(new Event('rerender')); return true
  }
  root.querySelectorAll('[data-add]').forEach(b => (b.onclick = () => { const [k, base, goal] = b.dataset.add.split(':'); save([...targets, { key: k, goal: +goal, base: +base, created: Date.now() }]); root.dispatchEvent(new Event('rerender')) }))
  root.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => { save(targets.filter((_, i) => i !== +b.dataset.del)); root.dispatchEvent(new Event('rerender')) }))
  root.querySelector('#tf').onsubmit = e => { e.preventDefault(); if (!add(root.querySelector('#tk').value, root.querySelector('#tg').value)) root.querySelector('#te').textContent = 'Not enough analysed games yet to measure a starting point for that.' }
}
