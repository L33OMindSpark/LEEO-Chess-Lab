import './style.css'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.cburnett.css'
import { S, emit, loadAnalyses, stopBatch } from './state.js'
import { getProfile, getStats, loadGames } from './api.js'
import * as cloud from './cloud.js'
import { pull } from './sync.js'
import { $, esc, sleep, kvClear } from './util.js'
import { enhance, initScroll } from './fx.js'
import home from './pages/home.js'
import overview, * as ovMod from './pages/overview.js'
import style, * as stMod from './pages/style.js'
import openings from './pages/openings.js'
import habits, * as hbMod from './pages/habits.js'
import engine, * as enMod from './pages/engine.js'
import targets from './pages/targets.js'
import skills, * as skMod from './pages/skills.js'
import mistakes, * as miMod from './pages/mistakes.js'
import doctor, * as dcMod from './pages/doctor.js'
import explorer from './pages/explorer.js'
import games, * as gmMod from './pages/games.js'
import { login as loginPage, accounts as accountsPage } from './pages/accounts.js'

const app = $('#app'), main = $('main')
let cleanups = [], current = null, token = 0, firstRender = true
const pages = { overview: [overview, ovMod], skills: [skills, skMod], style: [style, stMod], openings: [openings, {}], doctor: [doctor, dcMod], habits: [habits, hbMod], engine: [engine, enMod], mistakes: [mistakes, miMod], targets: [targets, {}], games: [games, gmMod] }
const GROUP = { overview: 'overview', skills: 'insights', style: 'insights', habits: 'insights', openings: 'insights', doctor: 'insights', engine: 'insights', mistakes: 'improve', train: 'improve', targets: 'improve', games: 'games', review: 'games', explorer: 'learn', accounts: 'account', login: 'account' }

// ---------- navigation bar ----------
const item = (href, t, d, extra = '') => `<a href="${href}" ${extra}><b>${t}</b><span>${d}</span></a>`
const dd = (id, title, items, group, right) => `<div class="dd ${group === id ? 'on' : ''}"><button aria-haspopup="true">${title}</button><div class="mw ${right ? 'right' : ''}"><div class="menu">${items}</div></div></div>`

function syncNav(name) {
  const loaded = S.games.length > 0, group = GROUP[name]
  const settings = dd('set', 'Settings', `<div class="set"><label>Engine depth<select id="depth">${[[10, '10, fast'], [12, '12, balanced'], [14, '14, deeper'], [16, '16, slow']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
    <label>History to read<select id="since"><option value="">Everything</option><option value="2y">Last 2 years</option><option value="1y">Last year</option></select></label>
    <button type="button" id="clear" class="linkish">Delete saved data on this computer</button></div>`, group, true)
  const acct = cloud.enabled ? dd('account', 'Account', cloud.signedIn()
    ? item('#/accounts', 'My accounts', 'Tracked usernames and their progress') + `<a href="#/" data-signout><b>Sign out</b><span>${esc(cloud.email() || '')}</span></a>`
    : item('#/login', 'Sign in', 'Let a server analyse in the background'), group, true) : ''
  $('#nav').innerHTML = loaded
    ? `<a class="navlink ${group === 'overview' ? 'on' : ''}" href="#/overview">Overview</a>`
      + dd('insights', 'Insights', item('#/skills', 'Skills and peers', 'How you compare with opponents at your level') + item('#/style', 'Playstyle and habits', 'How you play, when, and what to work on') + item('#/openings', 'Openings', 'Your results, and where lines go wrong') + item('#/engine', 'Engine report', 'Accuracy, blunders and time, judged by Stockfish'), group)
      + dd('learn', 'Learn', item('#/explorer/defenses', 'Defense explorer', 'Every defense against 1.e4, 1.d4 and more, with all variations') + item('#/explorer/openings', 'Opening explorer', 'The main openings for White, with all variations'), group)
      + dd('improve', 'Improve', item('#/mistakes', 'Mistake patterns', 'Where your errors keep clustering') + item('#/train', 'Blunder trainer', 'Your missed moves, repeated until they stick') + item('#/targets', 'Targets', 'Pick a number and track it weekly'), group)
      + `<a class="navlink ${group === 'games' ? 'on' : ''}" href="#/games">Games</a>` + acct + settings
    : `<a class="navlink ${group === 'learn' ? 'on' : ''}" href="#/explorer/defenses">Explorer</a><a class="navlink" href="#/" data-sc="story">How it works</a><a class="navlink" href="#/" data-sc="features">What you get</a>${acct}${settings}`
  $('#tcta').innerHTML = loaded ? `<a class="chip" href="#/overview" style="text-decoration:none">${S.profile?.avatar ? `<img src="${esc(S.profile.avatar)}" alt="" width="20" height="20" style="border-radius:50%">` : ''}<span class="u">${esc(S.user)}</span></a>`
    : `${cloud.enabled && !cloud.signedIn() ? '<a class="btn small pill" href="#/login">Sign in</a>' : ''}<button class="btn primary small pill" data-focus>Analyse</button>`
  $('#uform').style.display = loaded ? '' : 'none'
  const d = $('#depth'), sn = $('#since')
  d.value = S.depth; sn.value = localStorage.since || ''
  d.onchange = e => { S.depth = +e.target.value; localStorage.depth = S.depth }
  sn.onchange = e => (localStorage.since = e.target.value)
  $('#clear').onclick = async () => { if (confirm('Delete all saved games and analysis from this browser?')) { await kvClear(); localStorage.clear(); location.reload() } }
  document.querySelectorAll('[data-sc]').forEach(a => (a.onclick = e => { e.preventDefault(); const go = () => document.getElementById(a.dataset.sc)?.scrollIntoView({ behavior: 'smooth' }); location.hash.replace('#', '') in { '': 1, '/': 1 } ? go() : (location.hash = '#/', setTimeout(go, 700)); document.body.classList.remove('nav-open') }))
  document.querySelectorAll('[data-focus]').forEach(b => (b.onclick = e => { e.preventDefault(); if (location.hash.length > 2) location.hash = '#/'; setTimeout(() => { scrollTo({ top: 0, behavior: 'smooth' }); $('#huser')?.focus({ preventScroll: true }) }, 60) }))
  document.querySelectorAll('[data-signout]').forEach(a => (a.onclick = () => { cloud.logout(); Object.assign(S, { cloud: null, games: [], an: {}, user: null }) }))
}

// ---------- loading data ----------
const sinceVal = () => {
  const v = localStorage.since
  if (!v) return ''
  const d = new Date(); d.setFullYear(d.getFullYear() - (v === '2y' ? 2 : 1))
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
function pickWindow() {
  const now = Date.now() / 1000
  S.filter.win = [30, 90, 365, 0].find(w => !w || S.games.filter(g => g.t > now - w * 86400).length >= 30)
}
function visit() {
  S.lastVisit = +localStorage['visit:' + S.user] || 0
  localStorage['visit:' + S.user] = Date.now()
}
const loadingView = (t, sub) => { app.innerHTML = `<div class="loading"><h2>${t}</h2><p class="muted" id="ls">${sub}</p><div class="bar"><i id="lb" style="width:3%"></i></div><p class="faint">The first read takes a while for big accounts. Every month is saved, so the next visit is instant.</p></div>`; main.classList.remove('wide') }

async function begin(raw) {
  const user = raw.trim().toLowerCase().replace(/^.*\/member\//, '').replace(/\/.*$/, '')
  if (!/^[a-z0-9_-]{2,40}$/.test(user)) return flash('Enter a valid chess.com username.')
  S.user = user; S.cloud = null
  loadingView(`Reading ${esc(user)}`, 'Looking up the account')
  try {
    ;[S.profile, S.stats] = await Promise.all([getProfile(user), getStats(user).catch(() => null)])
    S.games = await loadGames(user, sinceVal(), (d, t) => { $('#ls').textContent = `Reading the archive, month ${d} of ${t}`; $('#lb').style.width = 3 + (d / t) * 97 + '%' })
    if (!S.games.length) throw new Error('This account has no standard games to analyse.')
    await loadAnalyses()
    pickWindow(); visit()
    localStorage.last = user
    location.hash = '#/overview'
    render()
  } catch (e) { S.user = null; S.games = []; location.hash = '#/'; render().then(() => flash(e.message)) }
}
async function openCloud(acc) {
  loadingView(`Opening ${esc(acc.chess_username)}`, 'Loading saved games and analysis')
  try {
    const [data, p, st] = await Promise.all([cloud.loadAccountData(acc), getProfile(acc.chess_username).catch(() => null), getStats(acc.chess_username).catch(() => null)])
    Object.assign(S, { user: acc.chess_username, cloud: acc, profile: p, stats: st, games: data.games, sm: data.sm, an: {} })
    await pull()
    pickWindow(); visit()
    location.hash = '#/overview'
    render()
  } catch (e) { app.innerHTML = `<div class="loading"><h2>Could not open it</h2><p class="err">${esc(e.message)}</p><a href="#/accounts">Back to your accounts</a></div>` }
}
function flash(msg) {
  const f = $('#hform')
  if (!f) return
  let e = $('#herr'); if (!e) { e = document.createElement('p'); e.id = 'herr'; e.className = 'err'; f.after(e) }
  e.textContent = msg; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake')
}

// ---------- router ----------
async function render(mode = 'nav') {
  const my = ++token
  cleanups.forEach(f => f()); cleanups = []
  const [name = '', arg, arg2] = location.hash.replace(/^#\/?/, '').split('/')
  const ctx = { onCleanup: f => cleanups.push(f) }
  const loaded = S.games.length > 0
  let route = name
  if (route === 'login' || route === 'accounts') { if (!cloud.enabled) route = '' }
  else if (route === 'explorer') {}
  else if (!loaded) route = ''
  else if (!route || (!pages[route] && route !== 'review' && route !== 'train' && route !== 'explorer')) route = route === '' ? '' : 'overview'

  if (mode === 'nav' && !firstRender && app.childElementCount) { app.classList.add('out'); await sleep(150); if (my !== token) return }
  syncNav(route)
  document.body.classList.remove('nav-open')
  main.classList.toggle('wide', route === '' || route === 'login')
  app.classList.remove('out')
  app.innerHTML = ''
  document.body.dataset.route = route || 'home'
  if (route === '') { current = null; home(app, ctx, { begin }) }
  else if (route === 'login') { current = null; loginPage(app, ctx, h => (location.hash = h)) }
  else if (route === 'accounts') { current = null; accountsPage(app, ctx, openCloud) }
  else if (route === 'review') { current = {}; await (await import('./pages/review.js')).default(app, ctx, arg) }
  else if (route === 'explorer') { current = {}; await explorer(app, ctx, arg, arg2) }
  else if (route === 'train') { current = {}; (await import('./pages/train.js')).default(app, ctx, arg) }
  else { const [fn, mod] = pages[route]; current = mod; fn(app, ctx) }
  if (my !== token) return
  if (mode === 'nav') { app.classList.remove('in'); void app.offsetWidth; app.classList.add('in'); if (!firstRender) scrollTo(0, 0) }
  firstRender = false
  enhance(app, mode === 'nav' ? 'nav' : mode)
}

app.addEventListener('rerender', () => { const y = scrollY; render('soft').then(() => scrollTo(0, y)) })
$('#burger').onclick = () => document.body.classList.toggle('nav-open')
$('#uform').onsubmit = e => { e.preventDefault(); if ($('#uname').value.trim()) begin($('#uname').value) }

// job pill + quiet refresh while the batch analysis runs
let t
S.listeners.add(() => {
  const j = S.job, el = $('#job')
  el.hidden = !j
  if (j) {
    el.innerHTML = `<b>Analysing games</b><div class="bar"><i style="width:${(j.done / j.total) * 100}%"></i></div><div class="muted">${j.done} of ${j.total} done at depth ${S.depth}. Results are saved as they finish.</div><button class="btn small" id="stop" style="margin-top:8px">Stop</button>`
    $('#stop').onclick = stopBatch
  }
  clearTimeout(t)
  t = setTimeout(() => { if (current?.refresh && !document.activeElement?.matches('input,select')) { const y = scrollY; render('silent').then(() => scrollTo(0, y)) } }, 1500)
})

if (import.meta.env.DEV) window.S = S
addEventListener('hashchange', () => render())
initScroll()
render()
