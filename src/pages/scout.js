import { Chessground } from 'chessground'
import { Chess } from 'chess.js'
import { getProfile, getStats, loadGames } from '../api.js'
import { report, buildBook, bookMoves, twinMove, engineNotes } from '../scout.js'
import { analyzeGame, summarize } from '../analyze.js'
import { engineStats, patterns } from '../stats.js'
import { MOTIF } from '../motifs.js'
import { Engine, Pool } from '../engine.js'
import { barChart, wdlBar } from '../charts.js'
import { esc, fmt } from '../util.js'
import { tabs } from '../ui.js'
import { positionSegs } from '../fx.js'

const CLS = ['rapid', 'blitz', 'bullet', 'daily']
const cap = s => s[0].toUpperCase() + s.slice(1)
let cache = null, picked = new Set(['rapid', 'blitz', 'bullet'])
const books = {}
const engCache = {}

const area = t => (/^Avoid/.test(t) ? 'Avoid' : /clock|time/i.test(t) ? 'Clock' : /resign|Rematch|tilt/i.test(t) ? 'Nerves' : /hours/i.test(t) ? 'When' : /long|endgame/i.test(t) ? 'Plan' : /^Expect/.test(t) ? 'Prepare' : 'Play')
const wl = r => `${r.w}W ${r.l}L ${r.d}D`

function form(user, months) {
  return `<form id="sf" class="filters" style="margin-top:6px"><input id="su" class="field" style="width:260px" placeholder="chess.com username" value="${esc(user || '')}" spellcheck="false" autocomplete="off" required>
    <select id="sm" class="field" style="width:auto">${[[3, 'Last 3 months'], [6, 'Last 6 months'], [12, 'Last 12 months'], [24, 'Last 2 years']].map(([v, l]) => `<option value="${v}" ${v === months ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn primary">Scout</button></form>`
}

export default async function (root, ctx, user, tab = 'report') {
  const months = +localStorage.scoutMonths || 12
  user = (user || '').trim().toLowerCase()
  if (!user) {
    root.innerHTML = `<div class="phead"><div><h1>Scout a player</h1><p>Type any chess.com username to see how they play and how to beat them: their openings and weak lines, how they handle the clock and a loss, the traps they fall for, and a bot that plays their repertoire. It reads their public games.</p></div></div>
      <section class="card">${form('', months)}<p class="faint" style="margin:14px 0 0;font-size:.9rem">Try your next opponent. You can scout yourself too.</p></section>`
    bind()
    return
  }
  function bind() {
    root.querySelector('#sf').onsubmit = e => { e.preventDefault(); localStorage.scoutMonths = root.querySelector('#sm').value; cache = null; location.hash = '#/scout/' + encodeURIComponent(root.querySelector('#su').value.trim().toLowerCase()) }
  }

  if (!cache || cache.user !== user || cache.months !== months) {
    root.innerHTML = `<div class="loading"><h2>Scouting ${esc(user)}</h2><p class="muted" id="ls">Looking up the account</p><div class="bar"><i id="lb" style="width:3%"></i></div></div>`
    try {
      const d = new Date(); d.setMonth(d.getMonth() - months)
      const since = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
      const [profile, stats] = await Promise.all([getProfile(user), getStats(user).catch(() => null)])
      const games = await loadGames(user, since, (n, t) => { const a = root.querySelector('#ls'), b = root.querySelector('#lb'); if (a) { a.textContent = `Reading month ${n} of ${t}`; b.style.width = 3 + (n / t) * 97 + '%' } }, 4000, 5000)
      cache = { user, months, profile, stats, games }
      Object.keys(books).forEach(k => delete books[k])
    } catch (e) {
      root.innerHTML = `<div class="phead"><div><h1>Scout a player</h1></div></div><section class="card"><p class="err">${esc(e.message)}</p>${form(user, months)}</section>`
      bind(); return
    }
  }
  const { profile, stats, games } = cache
  const set = games.filter(g => picked.has(g.cls))
  const now = k => stats?.['chess_' + k]?.last?.rating
  const T = [[`scout/${encodeURIComponent(user)}`, 'Report'], [`scout/${encodeURIComponent(user)}/tree`, 'Opening tree'], [`scout/${encodeURIComponent(user)}/twin`, 'Play their twin']]
  const active = tab === 'tree' ? T[1][0] : tab === 'twin' ? T[2][0] : T[0][0]

  root.innerHTML = `<div class="phead"><div class="profile">${profile.avatar ? `<img src="${esc(profile.avatar)}" alt="">` : ''}<div><h1>${esc(profile.username || user)}</h1>
      <p>${CLS.filter(k => now(k)).map(k => `${cap(k)} ${now(k)}`).join(', ')}. ${fmt(set.length)} games read from the last ${cache.months} months.</p></div></div>
      <div class="filters"><div class="chips">${CLS.map(c => `<button class="chip cls" style="--c:var(--c-${c})" data-c="${c}" aria-pressed="${picked.has(c)}"><i></i>${cap(c)}</button>`).join('')}</div><button class="btn small" id="slink">Copy link</button></div></div>
    <div class="filters" style="margin-bottom:22px;gap:16px">${tabs(active, T)}<details><summary class="btn small">Scout someone else</summary>${form('', months)}</details></div>
    <div id="sbody"></div>`
  root.querySelector('#slink').onclick = async e => { try { await navigator.clipboard.writeText(location.href); e.target.textContent = 'Copied'; setTimeout(() => (e.target.textContent = 'Copy link'), 1200) } catch {} }
  root.querySelectorAll('[data-c]').forEach(b => (b.onclick = () => { const c = b.dataset.c; picked.has(c) ? picked.size > 1 && picked.delete(c) : picked.add(c); root.dispatchEvent(new Event('rerender')) }))
  bind()
  const body = root.querySelector('#sbody')
  if (set.length < 20) { body.innerHTML = '<section class="card"><p class="empty">Fewer than 20 public games in this selection, so there is not enough to read. Try a longer period or more time controls.</p></section>'; return }
  if (tab === 'tree') return treeTab(body, ctx, set, profile)
  if (tab === 'twin') return twinTab(body, ctx, set, profile, now)
  reportTab(body, ctx, set, user)
}

// ---------- report ----------
function reportTab(body, ctx, set, user) {
  const R = report(set), S = R.stalker, m = R.m
  const first = R.firstW.slice(0, 5), vs = Object.entries(R.vs)
  const opTable = (rows, color) => rows.length ? `<table><thead><tr><th>Opening</th><th class="r">Games</th><th>Results</th><th class="r">Win rate</th></tr></thead><tbody>${rows.slice(0, 8).map(r => `<tr><td>${esc(r.fam)}${r.n >= 6 && r.score < m.score - 6 ? ' <span class="tag down">weak</span>' : r.n >= 6 && r.score > m.score + 6 ? ' <span class="tag up">strong</span>' : ''}</td><td class="r">${r.n}</td><td>${wdlBar(r)}</td><td class="r">${((r.w / r.n) * 100).toFixed(0)}%</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No games.</p>'
  const seqRows = (arr, title) => arr.length ? `<h3 style="margin:0 0 6px">${title}</h3>${arr.map(t => `<div class="hz" style="grid-template-columns:1fr auto;gap:14px"><div><span class="mono">${esc(t.seq)}</span><br><span class="muted" style="font-size:.88rem">${esc(t.name)}, as ${t.color === 'w' ? 'White' : 'Black'}</span></div><div class="r muted">${t.n} games</div></div>`).join('')}` : ''
  body.innerHTML = `<div class="stack">
  <section class="sec"><div class="lead"><h2>How to beat ${esc(user)}</h2><p>Rules applied to their own results. Each line quotes the numbers behind it.</p></div><div>
    ${R.advice.length ? R.advice.map(a => `<div class="tipcard"><span class="area">${area(a.title)}</span><h3>${esc(a.title)}</h3><div>${esc(a.body)}</div></div>`).join('') : '<p class="empty">Nothing stands out. They are balanced across openings and results.</p>'}</div></section>

  <section class="sec"><div class="lead"><h2>Engine check</h2><p>Stockfish reads their newest games in your browser. It adds accuracy, where they go wrong and what kind of mistake they make.</p></div><div id="eng"></div></section>

  <section class="sec"><div class="lead"><h2>Stalker score</h2><p>How exploitable this player looks, from 0 (hard to prepare against) to 100 (a lot to aim at). Four parts, shown so you can see why.</p></div><div>
    <div class="levels" style="margin-bottom:22px"><div class="level" style="--c:var(--accent)"><div class="name">${esc(S.verdict)}</div><div class="big num" data-count="${S.score}">${S.score}</div></div></div>
    ${S.parts.map(p => `<div class="hbar"><span style="min-width:0">${esc(p.k)}</span><div class="hb"><i style="width:${p.v}%"></i></div><b>${esc(p.note)}</b></div>`).join('')}
    <p class="faint" style="font-size:.84rem;margin-top:10px">Score = 35% predictable repertoire, 30% weakest opening, 15% tilt, 20% clock trouble.</p></div></section>

  <section class="sec"><div class="lead"><h2>Openings and weak lines</h2><p>${R.white} games as White, ${R.black} as Black. Win rate is wins divided by games.</p></div><div class="grid geven">
    <div class="card"><h3>As White</h3><p class="sub">First moves: ${first.map(f => `1.${esc(f.key)} (${((f.n / R.white) * 100).toFixed(0)}%, ${f.score.toFixed(0)}% score)`).join(', ') || 'none'}</p>${opTable(R.opW)}</div>
    <div class="card"><h3>As Black</h3><p class="sub">${vs.map(([mv, o]) => `Against 1.${mv}: ${o.n} games, ${o.score.toFixed(0)}% score${o.replies[0] ? `, usually ${esc(o.replies[0].key)}` : ''}`).join('. ') || 'none'}</p>${opTable(R.opB)}</div></div>
    ${R.lines.weak.length || R.lines.strong.length ? `<div class="grid geven" style="margin-top:18px"><div>${seqRows(R.lines.weak, 'Lines to steer into')}</div><div>${seqRows(R.lines.strong, 'Lines to avoid')}</div></div>` : ''}</section>

  <section class="sec"><div class="lead"><h2>Clock and nerves</h2><p>From the clock times and results of their games.</p></div><div class="card"><table><tbody>
    <tr><td>Losses on time</td><td class="r">${R.clock.timeoutLoss.toFixed(0)}% of their losses</td></tr>
    <tr><td>Wins on time</td><td class="r">${R.clock.flagWins.toFixed(0)}% of their wins</td></tr>
    <tr><td>Clock used by move 15</td><td class="r">${R.clock.avgUsed15 != null ? R.clock.avgUsed15.toFixed(0) + '% on average' : 'no clock data'}</td></tr>
    <tr><td>Under 15% of the clock at move 30</td><td class="r">${R.clock.low30 != null ? R.clock.low30.toFixed(0) + '% of long games' : 'too few long games'}</td></tr>
    <tr><td>Losses by resignation</td><td class="r">${R.psych.resign.toFixed(0)}%${R.psych.resign ? `, around move ${R.psych.resignMoves}` : ''}</td></tr>
    <tr><td>Losses by checkmate</td><td class="r">${R.psych.mated.toFixed(0)}%</td></tr>
    <tr><td>Score after a loss, after a win</td><td class="r">${R.psych.tilt.nLoss >= 15 ? `${R.psych.tilt.afterLoss.toFixed(0)}%, ${R.psych.tilt.afterWin.toFixed(0)}%` : 'too few games in one sitting'}</td></tr>
    <tr><td>Score in long games, short games</td><td class="r">${R.psych.longScore != null && R.psych.shortScore != null ? `${R.psych.longScore.toFixed(0)}%, ${R.psych.shortScore.toFixed(0)}%` : 'too few games'}</td></tr></tbody></table></div></section>

  <section class="sec"><div class="lead"><h2>Traps</h2><p>The same short game turning up again and again. Short means 16 moves or fewer.</p></div><div class="card">
    ${seqRows(R.traps.falls, 'Lines they fall for') + (R.traps.falls.length && R.traps.sets.length ? '<div style="height:18px"></div>' : '') + seqRows(R.traps.sets, 'Quick wins they repeat') || ''}
    ${R.traps.falls.length + R.traps.sets.length ? '' : '<p class="empty">No short game repeats often enough to call it a trap.</p>'}</div></section>

  <section class="sec"><div class="lead"><h2>When they play</h2><p>Score by day and by time of day, in your local time. Bars show score, the number below is games.</p></div><div class="grid geven"><div class="card"><div id="bd"></div></div><div class="card"><div id="bh"></div></div></div></section></div>`
  engineCheck(body.querySelector('#eng'), ctx, set, user)
  barChart(body.querySelector('#bd'), R.when.days)
  barChart(body.querySelector('#bh'), R.when.hours)
}

// ---------- opening tree for any player ----------
async function getBook(set, color, el) {
  const key = cache.user + color + set.length
  if (!books[key]) {
    el && (el.textContent = 'Building their opening book')
    books[key] = await buildBook(set, color, 24, async p => { el && (el.textContent = `Building their opening book, ${Math.round(p * 100)}%`); await new Promise(r => setTimeout(r, 0)) })
  }
  return books[key]
}

async function treeTab(body, ctx, set, profile) {
  let color = 'w', path = [], cg, book
  body.innerHTML = `<div class="xwrap"><div><div class="filters" style="margin-bottom:12px"><div class="seg" id="tcol"><button data-c="w" aria-pressed="true">Their White games</button><button data-c="b" aria-pressed="false">Their Black games</button><i class="thumb"></i></div>
    <button class="btn small" id="tback">Back</button><button class="btn small" id="treset">Start again</button></div><div class="board" id="tb"></div><div class="xmoves" id="tpath" style="margin-top:12px"></div></div>
    <aside class="xside" id="tside" style="position:static"><p class="muted" id="tmsg">Reading</p></aside></div>`
  const $ = s => body.querySelector(s)
  const chess = () => { const c = new Chess(); path.forEach(s => c.move(s)); return c }
  async function load() { $('#tmsg') && ($('#tmsg').textContent = 'Building their opening book'); book = await getBook(set, color, $('#tmsg')); draw() }
  function draw() {
    const c = chess(), fen = c.fen(), mv = bookMoves(book, fen), total = mv.reduce((s, x) => s + x.n, 0), theirTurn = c.turn() === color
    const h = c.history({ verbose: true }), last = h[h.length - 1]
    if (!cg) cg = Chessground($('#tb'), { fen, orientation: color === 'w' ? 'white' : 'black', viewOnly: true, coordinates: false })
    cg.set({ fen, orientation: color === 'w' ? 'white' : 'black', lastMove: last ? [last.from, last.to] : undefined })
    $('#tpath').innerHTML = path.map((s, i) => `<button data-i="${i + 1}">${i % 2 ? '' : `<em>${i / 2 + 1}.</em>`}${esc(s)}</button>`).join('') || '<span class="faint">Start position</span>'
    $('#tside').innerHTML = `<p style="margin:0 0 6px"><b>${total}</b> games reached this position. ${theirTurn ? `Here ${esc(profile.username)} plays:` : `Here their opponents played:`}</p>
      ${mv.length ? `<table><thead><tr><th>Move</th><th class="r">Games</th><th>Results</th><th class="r">Win rate</th></tr></thead><tbody>${mv.slice(0, 14).map(x => `<tr class="click" data-m="${esc(x.san)}"><td><b class="mono">${esc(x.san)}</b></td><td class="r">${x.n}</td><td>${wdlBar(x)}</td><td class="r">${((x.w / x.n) * 100).toFixed(0)}%</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No games go this deep.</p>'}
      <p class="faint" style="font-size:.84rem;margin:10px 0 0">Win rate is for ${esc(profile.username)} in games that played that move. The first 12 moves of each game are counted.</p>`
    $('#tside').querySelectorAll('[data-m]').forEach(r => (r.onclick = () => { path.push(r.dataset.m); draw() }))
    $('#tpath').querySelectorAll('[data-i]').forEach(b => (b.onclick = () => { path = path.slice(0, +b.dataset.i); draw() }))
  }
  $('#tcol').querySelectorAll('button').forEach(b => (b.onclick = () => { color = b.dataset.c; $('#tcol').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); positionSegs(body, true); path = []; load() }))
  positionSegs(body, false)
  $('#tback').onclick = () => { path.pop(); draw() }
  $('#treset').onclick = () => { path = []; draw() }
  load()
}

// ---------- twin bot ----------
async function twinTab(body, ctx, set, profile, now) {
  const rating = now('rapid') || now('blitz') || now('bullet') || 1600
  const elo0 = Math.max(1320, Math.min(2800, Math.round(rating / 50) * 50))
  let me = 'w', chess = new Chess(), cg, eng, book, over = false, outOfBook = false, token = 0
  body.innerHTML = `<div class="xwrap"><div><div class="board" id="pb"></div></div><aside class="xside" id="pside" style="position:static">
    <h3 style="margin:0 0 4px">${esc(profile.username)}'s twin</h3><p class="muted" style="margin:0 0 14px">Plays their openings from their real games, then Stockfish takes over at the strength you choose.</p>
    <div class="filters"><div class="seg" id="pcol"><button data-c="w" aria-pressed="true">I play White</button><button data-c="b" aria-pressed="false">I play Black</button><i class="thumb"></i></div></div>
    <label style="display:grid;gap:6px;margin:16px 0;font-size:.9rem">Stockfish strength after the book: <b id="elov">${elo0}</b><input id="elo" type="range" min="1320" max="3000" step="50" value="${elo0}"></label>
    <div class="fb" id="pst">Loading their book</div><div class="filters"><button class="btn primary" id="pnew">New game</button><button class="btn" id="pres">Resign</button></div>
    <div class="xmoves" id="pmv" style="margin-top:14px"></div></aside></div>`
  const $ = s => body.querySelector(s)
  const say = (t, c = '') => { const f = $('#pst'); f.className = 'fb ' + c; f.innerHTML = t }
  const dests = () => { const m = new Map(); chess.moves({ verbose: true }).forEach(x => m.set(x.from, [...(m.get(x.from) || []), x.to])); return m }
  const turn = () => (chess.turn() === 'w' ? 'white' : 'black')
  const sync = () => {
    const h = chess.history({ verbose: true }), l = h[h.length - 1]
    cg.set({ fen: chess.fen(), turnColor: turn(), check: chess.inCheck(), lastMove: l ? [l.from, l.to] : undefined, movable: { free: false, color: over || chess.turn() !== me ? undefined : turn(), dests: dests(), events: { after: onMove } } })
    $('#pmv').innerHTML = chess.history().map((s, i) => `<span>${i % 2 ? '' : `<em>${i / 2 + 1}.</em>`}${esc(s)}</span>`).join(' ')
  }
  const finish = () => {
    if (!chess.isGameOver()) return false
    over = true
    say(chess.isCheckmate() ? (chess.turn() === me ? 'Checkmate. The twin wins.' : 'Checkmate. You win.') : 'Draw.', chess.isCheckmate() && chess.turn() !== me ? 'ok' : '')
    return true
  }
  async function botMove() {
    if (over) return
    const my = ++token, fen = chess.fen()
    let san = outOfBook ? null : twinMove(book, fen)
    if (san) { say(`The twin plays from its real games.`); await new Promise(r => setTimeout(r, 450)) }
    else {
      outOfBook = true
      say(`Out of their book. Stockfish at ${$('#elo').value} is thinking.`)
      eng = eng || new Engine()
      const u = await eng.play(fen, +$('#elo').value, 700)
      if (my !== token || over) return
      const mv = chess.moves({ verbose: true }).find(x => x.from + x.to + (x.promotion || '') === u)
      san = mv ? mv.san : null
    }
    if (my !== token || over) return
    try { chess.move(san) } catch { over = true; say('The bot could not find a legal move.'); return }
    sync()
    if (!finish()) say(outOfBook ? `Out of book. Stockfish at ${$('#elo').value}. Your move.` : 'In their book. Your move.')
  }
  function onMove(from, to) {
    const legal = chess.moves({ verbose: true }).find(m => m.from === from && m.to === to)
    if (!legal) { sync(); return }
    chess.move({ from, to, promotion: legal.promotion ? 'q' : undefined })
    sync()
    if (!finish()) botMove()
  }
  async function start() {
    token++; over = false; outOfBook = false; chess = new Chess()
    const botColor = me === 'w' ? 'b' : 'w'
    say('Loading their book')
    book = await getBook(set, botColor, null)
    if (!cg) cg = Chessground($('#pb'), { fen: chess.fen(), coordinates: true, animation: { duration: 180 } })
    cg.set({ orientation: me === 'w' ? 'white' : 'black' })
    sync()
    say(me === 'w' ? 'Your move.' : 'The twin starts.')
    if (me === 'b') botMove()
  }
  $('#pcol').querySelectorAll('button').forEach(b => (b.onclick = () => { me = b.dataset.c; $('#pcol').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); positionSegs(body, true); start() }))
  positionSegs(body, false)
  $('#elo').oninput = e => ($('#elov').textContent = e.target.value)
  $('#pnew').onclick = start
  $('#pres').onclick = () => { token++; over = true; say('You resigned. The twin wins.'); sync() }
  ctx.onCleanup(() => { token++; eng && eng.terminate() })
  start()
}

// ---------- engine check ----------
function engineCheck(host, ctx, set, user) {
  const key = user + [...picked].sort().join(',')
  let pool, stop = false
  ctx.onCleanup(() => { stop = true; pool && pool.terminate() })
  const show = c => {
    const { e, pat, notes, n } = c
    host.innerHTML = `<div class="levels"><div class="level" style="--c:var(--accent)"><div class="name">Average accuracy</div><div class="big num">${e.acc.toFixed(1)}</div><div class="muted">over ${n} analysed games</div></div>
      <div class="level"><div class="name">Blunders per 100 moves</div><div class="big num">${e.per100.toFixed(1)}</div><div class="muted">${e.count('blunder')} blunders, ${e.count('mistake')} mistakes</div></div>
      <div class="level"><div class="name">Errors by phase</div><div class="big num" style="font-size:1.7rem;padding-top:14px">${e.phRate.map(r => r.toFixed(1) + '%').join(' / ')}</div><div class="muted">opening / middlegame / endgame</div></div></div>
      ${notes.length ? `<div style="margin-top:20px">${notes.map(a => `<div class="tipcard"><span class="area">Engine</span><h3>${esc(a.title)}</h3><div>${esc(a.body)}</div></div>`).join('')}</div>` : '<p class="muted" style="margin-top:18px">Nothing in their play stands out as a clear weakness.</p>'}
      ${pat ? `<div class="card" style="margin-top:18px"><h3 style="margin-bottom:8px">What their errors look like</h3>${pat.motifs.filter(x => x.n).sort((a, b) => b.n - a.n).map(x => `<div class="hbar"><span style="min-width:0">${MOTIF[x.k]}</span><div class="hb"><i style="width:${(x.n / pat.total) * 100}%"></i></div><b>${x.n} of ${pat.total} errors</b></div>`).join('')}</div>` : ''}
      <div class="filters" style="margin-top:16px"><button class="btn small" id="erun">Analyse again</button></div>`
    host.querySelector('#erun').onclick = start
  }
  function ask() {
    host.innerHTML = `<div class="filters"><select id="en" class="field" style="width:auto"><option value="20">Newest 20 games</option><option value="30" selected>Newest 30 games</option><option value="60">Newest 60 games</option></select><button class="btn primary" id="erun">Run the engine check</button></div>
      <p class="faint" style="font-size:.88rem;margin:10px 0 0">Takes about a minute for 30 games. It runs on your computer and uses its processor while it works.</p>`
    host.querySelector('#erun').onclick = start
  }
  async function start() {
    const n = +(host.querySelector('#en')?.value || 30)
    const todo = set.filter(g => g.pgn && g.moves >= 12).slice(0, n)
    if (todo.length < 8) { host.innerHTML = '<p class="empty">Too few games with a full move list in this selection.</p>'; return }
    host.innerHTML = `<div class="bar" style="height:8px"><i id="ep" style="width:0"></i></div><p class="muted" id="et">Starting Stockfish</p><button class="btn small" id="estop">Stop</button>`
    host.querySelector('#estop').onclick = () => { stop = true }
    stop = false
    pool = new Pool(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2)))
    const sm = {}
    let done = 0
    for (const g of todo) {
      if (stop) break
      try { const a = await analyzeGame(g, pool, 12); if (a) sm[g.id] = summarize(g, a) } catch { break }
      done++
      const p = host.querySelector('#ep'); if (p) { p.style.width = (done / todo.length) * 100 + '%'; host.querySelector('#et').textContent = `Analysed ${done} of ${todo.length} games` }
    }
    pool.terminate(); pool = null
    if (!host.isConnected) return
    const used = todo.filter(g => sm[g.id])
    if (used.length < 8) { ask(); return }
    const e = engineStats(used, sm), pat = patterns(used, sm)
    engCache[key] = { e, pat, notes: engineNotes(e, pat), n: used.length }
    show(engCache[key])
  }
  engCache[key] ? show(engCache[key]) : ask()
}
