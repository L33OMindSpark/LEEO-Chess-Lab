import './style.css'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.cburnett.css'
import { Chessground } from 'chessground'
import { S, emit, loadAnalyses, stopBatch } from './state.js'
import { getProfile, getStats, loadGames } from './api.js'
import * as cloud from './cloud.js'
import { login as loginPage, accounts as accountsPage } from './pages/accounts.js'
import { $, esc, kvClear } from './util.js'
import overview, * as ovMod from './pages/overview.js'
import style, * as stMod from './pages/style.js'
import openings from './pages/openings.js'
import habits, * as hbMod from './pages/habits.js'
import games, * as gmMod from './pages/games.js'

const app = $('#app'), DEFAULT_USER = 'leeoonchess'
let cleanups = [], current = null
app.addEventListener('rerender', () => { const y = scrollY; render().then(() => scrollTo(0, y)) })
const pages = { overview: [overview, ovMod], style: [style, stMod], openings: [openings, {}], habits: [habits, hbMod], games: [games, gmMod] }

const sinceVal = () => {
  const v = $('#since').value
  if (!v) return ''
  const d = new Date(); d.setFullYear(d.getFullYear() - (v === '2y' ? 2 : 1))
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function landing(msg = '') {
  app.innerHTML = `<div class="hero"><div><h1>See how you really play chess.</h1>
    <p class="lead">Enter a chess.com username. Every public game is read, the newest ones go through Stockfish, and you get your real level, your openings, your habits and a plain read on whether you are improving.</p>
    <form id="hform"><input id="huser" value="${esc(S.user || localStorage.last || DEFAULT_USER)}" aria-label="chess.com username" spellcheck="false"><button class="btn primary">Analyse</button></form>
    ${msg ? `<p class="err" style="margin-top:12px">${esc(msg)}</p>` : ''}
    <small>Runs in your browser. Nothing is uploaded and no account is needed.</small>
    ${cloud.enabled ? `<p class="muted" style="margin-top:26px">Have an account? <a href="#/accounts">${cloud.signedIn() ? 'Open your tracked accounts' : 'Sign in'}</a> to let the server analyse everything in the background.</p>` : ''}</div>
    <div><div class="board" id="hb"></div></div></div>`
  $('#hform').onsubmit = e => { e.preventDefault(); begin($('#huser').value) }
  Chessground($('#hb'), { fen: 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2P1PN2/PP1NBPPP/R2Q1RK1 b - - 0 8', viewOnly: true, coordinates: true, drawable: { autoShapes: [{ orig: 'c5', dest: 'd4', brush: 'green' }, { orig: 'f6', dest: 'e4', brush: 'blue' }] } })
}

function pickWindow() {
  const now = Date.now() / 1000
  S.filter.win = [30, 90, 365, 0].find(w => !w || S.games.filter(g => g.t > now - w * 86400).length >= 30)
}

async function openCloud(acc) {
  app.innerHTML = `<div class="loading"><h2>Opening ${esc(acc.chess_username)}</h2><p class="muted">Loading saved games and analysis</p><div class="bar"><i style="width:60%"></i></div></div>`
  try {
    const [data, p, st] = await Promise.all([cloud.loadAccountData(acc), getProfile(acc.chess_username).catch(() => null), getStats(acc.chess_username).catch(() => null)])
    Object.assign(S, { user: acc.chess_username, cloud: acc, profile: p, stats: st, games: data.games, an: data.an })
    pickWindow()
    location.hash = '#/overview'
    render()
  } catch (e) { app.innerHTML = `<div class="loading"><h2>Could not open it</h2><p class="err">${esc(e.message)}</p><a href="#/accounts">Back to your accounts</a></div>` }
}

async function begin(raw) {
  const user = raw.trim().toLowerCase().replace(/^.*\/member\//, '')
  if (!/^[a-z0-9_-]{2,40}$/.test(user)) return landing('Enter a valid chess.com username.')
  S.user = user; S.cloud = null
  app.innerHTML = `<div class="loading"><h2>Reading ${esc(user)}</h2><p class="muted" id="ls">Looking up the account</p><div class="bar"><i id="lb" style="width:3%"></i></div><p class="faint">The first read takes a while for big accounts. Every month is saved, so the next visit is instant.</p></div>`
  try {
    ;[S.profile, S.stats] = await Promise.all([getProfile(user), getStats(user).catch(() => null)])
    S.games = await loadGames(user, sinceVal(), (d, t) => { $('#ls').textContent = `Reading the archive, month ${d} of ${t}`; $('#lb').style.width = 3 + (d / t) * 97 + '%' })
    if (!S.games.length) throw new Error('This account has no standard games to analyse.')
    await loadAnalyses()
    pickWindow()
    localStorage.last = user
    location.hash = '#/overview'
    render()
  } catch (e) { S.user = null; landing(e.message) }
}

async function render() {
  cleanups.forEach(f => f()); cleanups = []
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/')
  syncCloudNav()
  if (name === 'login' || name === 'accounts') {
    if (!cloud.enabled) return landing()
    current = null; app.innerHTML = ''
    return name === 'login' ? loginPage(app, { onCleanup: f => cleanups.push(f) }, h => (location.hash = h)) : accountsPage(app, { onCleanup: f => cleanups.push(f) }, openCloud)
  }
  if (!S.games.length) { current = null; return landing() }
  if (!name) return (location.hash = '#/overview')
  app.innerHTML = ''
  const ctx = { onCleanup: f => cleanups.push(f) }
  if (name === 'review') { current = {}; (await import('./pages/review.js')).default(app, ctx, arg) }
  else if (name === 'train') { current = {}; (await import('./pages/train.js')).default(app, ctx) }
  else { const [fn, mod] = pages[name] || pages.overview; current = mod; fn(app, ctx) }
}

// job pill + live refresh while the batch analysis runs
let t
S.listeners.add(() => {
  const j = S.job, el = $('#job')
  el.hidden = !j
  if (j) {
    el.innerHTML = `<b>Analysing games</b><div class="bar"><i style="width:${(j.done / j.total) * 100}%"></i></div><div class="muted">${j.done} of ${j.total} done at depth ${S.depth}. Results are saved as they finish.</div><button class="btn small" id="stop" style="margin-top:8px">Stop</button>`
    $('#stop').onclick = stopBatch
  }
  clearTimeout(t)
  t = setTimeout(() => { if (current?.refresh && !document.activeElement?.matches('input,select')) render() }, 1500)
})

$('#uform').onsubmit = e => { e.preventDefault(); begin($('#uname').value || DEFAULT_USER) }
$('#uname').value = localStorage.last || DEFAULT_USER
$('#depth').value = S.depth
$('#depth').onchange = e => { S.depth = +e.target.value; localStorage.depth = S.depth }
$('#clear').onclick = async () => { if (confirm('Delete all saved games and analysis from this browser?')) { await kvClear(); localStorage.clear(); location.reload() } }
if (import.meta.env.DEV) window.S = S
function syncCloudNav() {
  $('#ddcloud').hidden = !cloud.enabled
  $('#sign').textContent = cloud.signedIn() ? 'Sign out' : 'Sign in'
  $('#sign').href = cloud.signedIn() ? '#/' : '#/login'
}
$('#sign').onclick = () => { if (cloud.signedIn()) { cloud.logout(); S.cloud = null; S.games = []; S.an = {}; S.user = null } }
addEventListener('hashchange', render)
render()
