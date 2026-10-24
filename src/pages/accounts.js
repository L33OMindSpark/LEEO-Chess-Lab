import * as cloud from '../cloud.js'
import { createStage } from '../board.js'
import { esc, dateStr } from '../util.js'

export const label = a => ({
  pending: 'Waiting for the server',
  reading: 'Reading games',
  analysing: `Analysing, ${a.analysed} of ${a.analysis_target || '...'} games`,
  ready: 'Ready',
  error: 'Something went wrong',
}[a.status])

export function login(root, ctx, go) {
  root.innerHTML = `<div class="auth"><div class="auth-form"><h1 class="hin" style="--d:.05s">Welcome back.</h1>
    <p class="muted hin" style="--d:.15s">Your tracked accounts and their analysis are saved here, so you can pick up where the server left off.</p>
    <form id="lf" class="hin" style="--d:.25s"><label>Email<input id="le" type="email" class="field" autocomplete="username" required></label>
    <label>Password<div class="pw"><input id="lp" type="password" class="field" autocomplete="current-password" required><button type="button" id="lt">Show</button></div></label>
    <p class="err" id="lerr" role="alert" style="margin:0;min-height:1.4em"></p><button class="btn primary big" id="lb">Sign in</button></form>
    <p class="faint hin" style="--d:.35s;margin-top:22px">Accounts are created by the site owner. <a href="#/">Back to the quick analysis</a></p></div>
    <div class="auth-side"><div class="stage" id="as"></div><div><h2>Open it when the analysis is ready.</h2><p style="margin-top:12px">The server reads every game and runs Stockfish while you are away. Sign in to see your level, your habits and whether you are improving.</p></div></div></div>`
  const stage = createStage(root.querySelector('#as'), { ribbon: false })
  stage.goto(0); stage.play()
  ctx.onCleanup(() => stage.pause())
  root.querySelector('#lt').onclick = e => { const i = root.querySelector('#lp'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; e.target.textContent = show ? 'Hide' : 'Show' }
  root.querySelector('#lf').onsubmit = async e => {
    e.preventDefault()
    const b = root.querySelector('#lb'), err = root.querySelector('#lerr'), f = e.target
    b.classList.add('busy'); err.textContent = ''
    try { await cloud.login(root.querySelector('#le').value.trim(), root.querySelector('#lp').value); go('#/accounts') }
    catch (x) { err.textContent = x.message; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake') }
    b.classList.remove('busy')
  }
}

const tagOf = a => (a.status === 'ready' ? 'up' : a.status === 'error' ? 'down' : '')

export async function accounts(root, ctx, open) {
  if (!cloud.signedIn()) { location.hash = '#/login'; return }
  let list = [], msg = ''
  const draw = () => {
    root.innerHTML = `<div class="phead"><div><h1>Your accounts</h1><p>Add a chess.com username and the server reads every game and runs Stockfish on all of them, newest first. It looks for new work every 30 minutes and refreshes finished accounts twice a day. Close this page whenever you like and come back when it says ready.</p></div>
      <span class="muted">${esc(cloud.email() || '')}</span></div>
    <div class="stack"><section class="card"><form id="af" class="filters"><input id="au" class="field" style="width:280px" placeholder="chess.com username" spellcheck="false" required>
      <select id="ad" class="field" style="width:auto"><option value="12">Depth 12, faster</option><option value="14" selected>Depth 14, balanced</option><option value="16">Depth 16, deeper</option></select><button class="btn primary">Track account</button></form>
      <p class="err" id="amsg" style="margin:10px 0 0">${esc(msg)}</p></section>
    ${list.length ? list.map(a => `<section class="card"><div class="phead" style="margin:0;align-items:center"><div><h2>${esc(a.chess_username)}</h2>
      <p style="margin:8px 0 0"><span class="tag ${tagOf(a)}">${label(a)}</span> <span class="muted">${a.status === 'error' && a.last_error ? esc(a.last_error) + '. ' : ''}${a.refreshed_at ? `Last updated ${dateStr(Date.parse(a.refreshed_at) / 1000)}.` : ''}</span></p></div>
      <div class="filters">${a.analysed > 0 || a.status === 'ready' ? `<button class="btn primary" data-open="${a.id}">Open</button>` : ''}${a.status === 'error' ? `<button class="btn" data-retry="${a.id}">Try again</button>` : ''}<button class="btn" data-del="${a.id}">Remove</button></div></div>
      ${a.status === 'analysing' && a.analysis_target ? `<div class="bar" style="margin:18px 0 0"><i style="width:${(a.analysed / a.analysis_target) * 100}%"></i></div>` : ''}</section>`).join('') : '<section class="card"><p class="empty">No accounts yet. Add one above.</p></section>'}
    </div>`
    root.querySelector('#af').onsubmit = async e => {
      e.preventDefault()
      const u = root.querySelector('#au').value.trim().toLowerCase().replace(/^.*\/member\//, '')
      if (!/^[a-z0-9_-]{2,40}$/.test(u)) { msg = 'Enter a valid chess.com username.'; return draw() }
      try { await cloud.addAccount(u, +root.querySelector('#ad').value); msg = ''; await load() } catch (x) { msg = x.message; draw() }
    }
    root.querySelectorAll('[data-open]').forEach(b => (b.onclick = () => open(list.find(a => a.id === b.dataset.open))))
    root.querySelectorAll('[data-retry]').forEach(b => (b.onclick = async () => { await cloud.retry(b.dataset.retry); load() }))
    root.querySelectorAll('[data-del]').forEach(b => (b.onclick = async () => { if (confirm('Remove this account and its saved analysis?')) { await cloud.remove(b.dataset.del); load() } }))
  }
  const load = async () => { try { list = await cloud.accounts() } catch (x) { msg = x.message } draw() }
  await load()
  const t = setInterval(() => { if (!document.hidden && list.some(a => a.status !== 'ready' && a.status !== 'error') && !document.activeElement?.matches('input,select')) load() }, 30000)
  ctx.onCleanup(() => clearInterval(t))
}
