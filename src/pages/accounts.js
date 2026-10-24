import * as cloud from '../cloud.js'
import { esc, dateStr } from '../util.js'

export const label = a => ({
  pending: 'Waiting for the server',
  reading: 'Reading games',
  analysing: `Analysing, ${a.analysed} of ${a.analysis_target || '...'} games`,
  ready: 'Ready',
  error: 'Something went wrong',
}[a.status])

export function login(root, ctx, go) {
  root.innerHTML = `<div class="loading" style="margin:12vh auto;text-align:left"><h1>Sign in</h1><p class="muted">Your tracked accounts and their analysis are saved here, so you can come back any time.</p>
    <form id="lf" style="display:grid;gap:12px;margin-top:20px"><input id="le" type="email" placeholder="Email" autocomplete="username" class="btn" style="text-align:left" required>
    <input id="lp" type="password" placeholder="Password" autocomplete="current-password" class="btn" style="text-align:left" required><button class="btn primary">Sign in</button></form><p class="err" id="lerr"></p>
    <p class="faint">Accounts are created by the site owner. <a href="#/">Back to the quick analysis</a></p></div>`
  root.querySelector('#lf').onsubmit = async e => {
    e.preventDefault()
    try { await cloud.login(root.querySelector('#le').value.trim(), root.querySelector('#lp').value); go('#/accounts') }
    catch (x) { root.querySelector('#lerr').textContent = x.message }
  }
}

export async function accounts(root, ctx, open) {
  if (!cloud.signedIn()) { location.hash = '#/login'; return }
  let list = [], msg = ''
  const draw = () => {
    root.innerHTML = `<div class="pagehead"><div><h1>Your accounts</h1><p>Add a chess.com username and the server reads every game and runs Stockfish on the newest 500. It checks for new work every 30 minutes, and refreshes finished accounts twice a day. Close this page whenever you like and come back when it says ready.</p></div>
      <div class="muted">${esc(cloud.email() || '')}</div></div>
    <div class="stack"><section class="panel"><form id="af" class="filters"><input id="au" class="btn" style="text-align:left;width:260px" placeholder="chess.com username" spellcheck="false" required>
      <select id="ad" class="btn"><option value="12">Depth 12, faster</option><option value="14" selected>Depth 14, balanced</option><option value="16">Depth 16, deeper</option></select><button class="btn primary">Track account</button></form>
      <p class="err" id="amsg">${esc(msg)}</p></section>
    ${list.length ? list.map(a => `<section class="panel"><div class="pagehead" style="margin:0"><div><h2>${esc(a.chess_username)}</h2>
      <p class="${a.status === 'error' ? 'err' : 'muted'}" style="margin:4px 0 0">${label(a)}${a.status === 'error' && a.last_error ? ': ' + esc(a.last_error) : ''}${a.refreshed_at ? `. Last updated ${dateStr(Date.parse(a.refreshed_at) / 1000)}.` : ''}</p></div>
      <div class="filters">${a.analysed > 0 || a.status === 'ready' ? `<button class="btn primary" data-open="${a.id}">Open</button>` : ''}${a.status === 'error' ? `<button class="btn" data-retry="${a.id}">Try again</button>` : ''}<button class="btn" data-del="${a.id}">Remove</button></div></div>
      ${a.status === 'analysing' && a.analysis_target ? `<div class="loading" style="margin:10px 0 0;max-width:none"><div class="bar" style="margin:0"><i style="width:${(a.analysed / a.analysis_target) * 100}%"></i></div></div>` : ''}</section>`).join('') : '<section class="panel"><p class="empty">No accounts yet. Add one above.</p></section>'}
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
  const load = async () => {
    try { list = await cloud.accounts(); draw() } catch (x) { msg = x.message; draw() }
  }
  await load()
  // while something is still running, look again every 30 seconds, and only while this tab is visible
  const t = setInterval(() => { if (!document.hidden && list.some(a => a.status !== 'ready' && a.status !== 'error') && !document.activeElement?.matches('input,select')) load() }, 30000)
  ctx.onCleanup(() => clearInterval(t))
}
