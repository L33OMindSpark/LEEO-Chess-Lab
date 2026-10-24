import { S, analysedCount } from '../state.js'
import { slice, metrics, horizons, ratingSeries, peer, habits, openings } from '../stats.js'
import { wdlBar } from '../charts.js'
import { doneToday, streak } from '../warmup.js'
import { tips } from '../tips.js'
import { lineChart, heatmap, radar } from '../charts.js'
import { esc, fmt } from '../util.js'
import { filterHTML, bindFilter, sign, dcls, winLabel, cap } from '../ui.js'

export const refresh = true

const ago = ms => { const h = ms / 3600000; return h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago` }

export default function (root) {
  const f = S.filter, cur = slice(S.games, f), prevSet = slice(S.games, f, 1)
  const m = metrics(cur, S.sm)
  const hz = horizons(S.games, f.classes, S.sm)
  const verdict = hz.find(h => h.win === f.win)?.verdict
  const P = peer(cur, S.sm), p = S.profile || {}, stats = S.stats || {}
  const officialBits = [stats.tactics?.highest && `Tactics best ${fmt(stats.tactics.highest.rating)}`, stats.puzzle_rush?.best && `Puzzle Rush best ${stats.puzzle_rush.best.score}`, stats.fide && `FIDE ${fmt(stats.fide)}`].filter(Boolean)
  const officialLine = officialBits.length ? `<p class="muted" style="margin:26px 0 0;font-size:.92rem">Straight from chess.com: ${officialBits.join(', ')}.</p>` : ''
  const analysed = analysedCount(), total = S.games.length
  const now = k => stats['chess_' + k]?.last?.rating, best = k => stats['chess_' + k]?.best?.rating
  const tp = tips(cur, m)

  // this week, or what changed since the last visit, plus the one thing to focus on
  const wk = metrics(slice(S.games, { win: 7, classes: f.classes }), S.sm), recent = S.lastVisit && Date.now() - S.lastVisit > 3600000 ? S.games.filter(g => g.t * 1000 > S.lastVisit && f.classes.has(g.cls)) : null
  const dg = recent?.length ? metrics(recent, S.sm) : wk, head = recent?.length ? `Since your last visit ${ago(Date.now() - S.lastVisit)}` : 'This week'
  // session coach: tells you to stop when your own numbers say you tilt
  const coach = (() => {
    const now = Date.now() / 1000, rec = S.games.filter(g => g.t > now - 4 * 3600).sort((a, b) => b.t - a.t)
    if (!rec[0] || now - rec[0].t > 5400) return ''
    let l = 0, prev = rec[0].t
    for (const g of rec) { if (prev - g.t > 2400 || g.score !== 0) break; l++; prev = g.t }
    if (l < 2) return ''
    const t = habits(S.games.filter(g => g.t > now - 365 * 86400)).tilt, mine = metrics(S.games.filter(g => g.t > now - 365 * 86400), S.sm).score
    const x = t.nTwo >= 10 ? t.afterTwo : t.nLoss >= 20 ? t.afterLoss : null
    return `<div class="since warn"><span><b>You have lost your last ${l} games.</b>${x != null && x < mine - 4 ? ` After losses like this your score is ${x.toFixed(0)}%, against ${mine.toFixed(0)}% normally.` : ''} A short break usually costs less than the next game.</span></div>`
  })()
  const hasPuzzles = S.games.some(g => S.sm[g.id]?.errs?.length)
  const warmRow = hasPuzzles ? `<span style="flex-basis:100%;margin-top:4px">Daily warm-up: <a href="#/train/warmup">${doneToday() ? 'done today, go again' : 'five puzzles from your own mistakes'}</a>${streak() ? `, ${streak()} day streak` : ''}</span>` : ''
  const strip = dg.n || warmRow ? `<div class="since">${dg.n ? `<span class="muted">${head}</span><span><b>${dg.n}</b> games</span><span><b class="delta ${dcls(dg.ratingDelta)}">${sign(dg.ratingDelta)}</b> rating</span><span><b>${dg.score.toFixed(0)}%</b> score</span>${dg.acc != null ? `<span><b>${dg.acc.toFixed(0)}%</b> accuracy</span>` : ''}` : ''}${tp[0] ? `<span style="flex-basis:100%;margin-top:4px">Focus: <b style="font-size:1.05rem">${esc(tp[0].title)}</b> <a href="#/style">Why and what to do</a></span>` : ''}${warmRow}</div>` : ''
  const cover = analysedCount() < total * 0.98 ? `<p class="muted" style="margin:-12px 0 26px;font-size:.92rem">Stockfish has analysed ${((analysedCount() / total) * 100).toFixed(analysedCount() ? 1 : 0)}% of your games. <a href="#/engine">${S.cloud ? 'See the progress' : 'Analyse more'}</a></p>` : ''

  root.innerHTML = `
  <div class="phead">
    <div class="profile">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : ''}<div><h1>${esc(p.username || S.user)}</h1>
      <p>${fmt(S.games.length)} games read${p.joined ? `, playing since ${new Date(p.joined * 1000).getFullYear()}` : ''}. Showing ${winLabel()}.</p></div></div>
    ${filterHTML()}
  </div>
  ${coach}${strip}${cover}
  ${m.n === 0 ? `<div class="card"><p class="empty">No games in this selection. Pick a longer period or turn on more time controls.</p></div>` : `
  <section class="sec"><div class="lead"><h2>Your level</h2><p>Your rating on chess.com right now, your record in this selection, and the average rating over it.</p></div>
    <div class="levels">${Object.entries(m.byCls).map(([k, c]) => { const set = cur.filter(g => g.cls === k), off = f.win === 0 ? stats['chess_' + k]?.record : null, w = off ? off.win : set.filter(g => g.score === 1).length, d = off ? off.draw : set.filter(g => g.score === 0.5).length, l = off ? off.loss : set.length - w - d, big = now(k) || Math.round(c.avg)
      return `<div class="level" style="--c:var(--c-${k})"><div class="name">${cap(k)} ${now(k) ? 'rating now' : 'average rating'}</div>
        <div class="big num" data-count="${big}">${fmt(big)}</div><div class="muted">${best(k) ? `best ever ${best(k)}, ` : ''}average here ${fmt(c.avg)}</div>
        <div class="muted"><b style="color:var(--ink)">${w}W ${l}L ${d}D</b> ${off ? 'on chess.com, all time' : `in ${c.n} games`}, <span class="delta ${dcls(c.delta)}">${sign(c.delta)}</span> rating in range</div></div>` }).join('')}
      <div class="level"><div class="name">All games, average rating</div><div class="big num" data-count="${Math.round(m.avgMy)}">${fmt(m.avgMy)}</div><div class="muted">opponents averaged ${fmt(m.avgOpp)}</div><div class="muted">${fmt(m.n)} games, ${m.n ? ((m.o.w / m.n) * 100).toFixed(0) : 0}% won</div></div></div>${officialLine}</section>

  <section class="sec"><div class="lead"><h2>Rating history</h2><p>Your rating after each game in this selection.</p></div><div class="card"><div id="rc"></div></div></section>

  <section class="sec"><div class="lead"><h2>Are you improving?</h2><p>${f.win ? `${cap(winLabel())} against the same length of time right before it.` : 'Pick a period to compare it with the one before.'}</p></div>
    <div class="grid geven"><div>
      ${verdict ? `<div class="scale"><b style="left:${((verdict.v + 5) / 10) * 100}%"></b></div><div class="scale-l"><span>Slipping</span><span>Steady</span><span>Improving</span></div>
        <div class="verdict">${verdict.label}</div>
        <table>${verdict.parts.map(x => `<tr><td>${x.k}</td><td class="r delta ${dcls(x.d)}">${sign(x.d, x.k === 'Rating' ? 0 : 1)}${x.u}</td></tr>`).join('')}</table>`
        : `<p class="empty">${f.win ? 'Not enough games in both periods yet. It needs at least 5 in each.' : 'Choose 24 hours, 7 days, 30 days, 90 days or 12 months.'}</p>`}
    </div><div>
      <div class="hz h"><span>Period</span><span class="r">Games</span><span class="r">Rating</span><span class="r">Win rate</span><span class="r">Accuracy</span><span>Trend</span></div>
      ${hz.map(h => { const c = h.cur; return `<div class="hz"><span>${h.label.replace('Last ', '')}</span><span class="r">${c.n}</span>
        <span class="r delta ${dcls(c.ratingDelta)}">${c.n ? sign(c.ratingDelta) : ''}</span><span class="r">${c.n ? ((c.o.w / c.n) * 100).toFixed(0) + '%' : ''}</span>
        <span class="r">${c.acc != null ? c.acc.toFixed(1) + '%' : '<span class="faint">no data</span>'}</span>
        <span>${h.verdict ? `<span class="tag ${h.verdict.v > 1.5 ? 'up' : h.verdict.v < -1.5 ? 'down' : ''}">${h.verdict.label}</span>` : '<span class="faint">too few games</span>'}</span></div>` }).join('')}
    </div></div></section>

  <section class="sec"><div class="lead"><h2>Your most played openings</h2><p>By games in this selection, with how you score. <a href="#/openings">All openings and the opening doctor</a></p></div>
    <div class="grid geven">${[['w', 'As White'], ['b', 'As Black']].map(([c, t]) => `<div class="card"><h3 style="margin-bottom:10px">${t}</h3>${(rows => rows.length ? `<table><tbody>${rows.map(r => `<tr><td>${esc(r.fam)}</td><td class="r muted">${r.n}</td><td>${wdlBar(r)}</td><td class="r">${((r.w / r.n) * 100).toFixed(0)}% won</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No games.</p>')(openings(cur, c).filter(r => r.fam !== 'Unknown').slice(0, 4))}</div>`).join('')}</div></section>

  <section class="sec"><div class="lead"><h2>Activity</h2><p>How often you played over the last year. Hover a day for the score.</p></div><div class="card"><div id="heat"></div></div></section>

  <section class="sec"><div class="lead"><h2>Where you stand</h2><p>You against the opponents in your own games. <a href="#/skills">See the full comparison</a></p></div>
    ${P ? `<div class="grid geven" style="align-items:center"><div class="card"><div id="rd"></div></div><div><p style="font:560 1.5rem/1.3 var(--serif);margin:0 0 14px">${[...P.axes].sort((a, b) => b.score - a.score)[0].score > 55 ? `Your strongest area is <b>${[...P.axes].sort((a, b) => b.score - a.score)[0].label.toLowerCase()}</b>.` : 'You are level with your opponents.'} ${[...P.axes].sort((a, b) => a.score - b.score)[0].score < 45 ? `<b>${[...P.axes].sort((a, b) => a.score - b.score)[0].label}</b> is where they beat you.` : ''}</p>
      <p class="muted" style="margin:0">Based on ${fmt(P.n)} analysed games. <a href="#/mistakes">See which mistakes repeat</a></p></div></div>` : `<p class="muted" style="margin-top:0">Needs analysed games. <a href="#/engine">Analyse your games</a> and this fills in.</p>`}</section>
`}`

  bindFilter(root, () => root.dispatchEvent(new Event('rerender')))
  if (m.n) { lineChart(root.querySelector('#rc'), ratingSeries(cur, f.classes)); heatmap(root.querySelector('#heat'), S.games.filter(g => f.classes.has(g.cls))) }
  if (P) radar(root.querySelector('#rd'), P.axes, { size: 380 })
}
