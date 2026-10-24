import { Chessground } from 'chessground'
import { createStage, worst, bestSan, demoSan, demoFen } from '../board.js'
import demo from '../demo.json'
import { lineChart, barChart, wdlBar } from '../charts.js'
import * as cloud from '../cloud.js'
import { esc } from '../util.js'

// deterministic sample series so the preview never changes between visits
const sample = (() => { let x = 7, r = 1750; const pts = []; for (let i = 0; i < 90; i++) { x = (x * 48271) % 2147483647; r += (x % 17) - 6.2 + Math.sin(i / 9) * 2; pts.push([1.76e9 + i * 3.4e5, Math.round(r)]) } return pts })()

const steps = [
  ['Every move gets a score', 'Stockfish rates the position after each move. The bar beside the board shows who is ahead and by how much.'],
  ['Mistakes are marked where they happen', 'Giving away 10% of your winning chances is an inaccuracy, 20% a mistake and 30% a blunder. The marker lands on the exact move.'],
  ['You see what to play instead', 'The engine’s choice is drawn on the board from the position where you went wrong.'],
  ['Then you train on your own errors', 'Moves you missed in real games come back as puzzles, so you practise the positions that actually cost you points.'],
]
const facts = [
  ['Your whole history', 'Every public game on the account, however old.'],
  ['Stockfish 19', 'A top engine, running on your computer or on a free server.'],
  ['Rules, not guesses', 'Every tip quotes the numbers it came from.'],
  ['Yours to keep', 'Saved in your browser or in your own free account.'],
]

export default function (root, ctx, { begin, signIn }) {
  const last = localStorage.last || ''
  root.innerHTML = `
  <section class="hero"><div class="hero-l">
    <h1 class="hin" style="--d:.05s">See how you really play chess.</h1>
    <p class="lead hin" style="--d:.18s">Enter a chess.com username. Every public game is read and reviewed by Stockfish, newest first, and you get your real level, your openings, your habits and a plain verdict on whether you are improving.</p>
    <form id="hform" class="hin" style="--d:.3s"><input id="huser" class="field" placeholder="chess.com username" value="${esc(last)}" aria-label="chess.com username" spellcheck="false" autocomplete="off"><button class="btn primary big">Analyse games</button></form>
    <p class="note hin" style="--d:.4s">Runs in your browser. Nothing is uploaded and no account is needed.${cloud.enabled ? ` Prefer to let a server do the work in the background? <a href="#/${cloud.signedIn() ? 'accounts' : 'login'}">${cloud.signedIn() ? 'Open your accounts' : 'Sign in'}</a>.` : ''}</p>
  </div>
  <div class="hero-r hin" style="--d:.2s"><div class="stage" id="stage"></div><div class="stagectl"><button class="btn small pill" id="pp">Pause</button><button class="btn small pill" id="rs">Restart</button></div></div></section>

  <section class="facts">${facts.map(([a, b]) => `<div data-rv><b>${a}</b><span>${b}</span></div>`).join('')}</section>

  <section class="story" id="story"><div class="story-in">
    <div class="story-stage"><div class="stage" id="stage2"></div></div>
    <div class="story-steps"><h2 data-rv>How a game gets reviewed</h2>${steps.map(([t, p], i) => `<div class="step" data-s="${i}"><h3>${t}</h3><p>${p}</p></div>`).join('')}</div>
  </div></section>

  <section class="feat" id="features"><div class="wrap">
    <h2 data-rv>Everything in one place</h2><p class="muted" data-rv>Sample data below. Your own numbers fill these in.</p>
    <div class="bento">
      <div class="card b-wide" data-rv><h3>Your level, over time</h3><p class="sub">Average rating per time control, with the rating chess.com shows now.</p><div id="s-rating"></div></div>
      <div class="card" data-rv><h3>Are you improving?</h3><p class="sub">24 hours to 12 months, each against the period before it.</p>
        <div class="scale"><b style="left:72%"></b></div><div class="scale-l"><span>Slipping</span><span>Steady</span><span>Improving</span></div>
        <div class="verdict">Improving</div><p class="muted">Score +6.1 pts, rating +38, accuracy +2.4 pts</p></div>
      <div class="card" data-rv><h3>Your playstyle</h3><p class="sub">Built from how your games actually end.</p>
        ${[['Positional', 'Attacker', 0.7, '34% of wins end in checkmate'], ['Quick finisher', 'Long grinder', 0.35, '27 moves on average'], ['Wide', 'Narrow', 0.55, 'Top 3 openings are 52% of games']].map(([l, r, v, n]) => `<div class="meter"><div class="lab"><span>${l}</span><span>${r}</span></div><div class="track"><b style="left:${v * 100}%"></b></div><div class="note">${n}</div></div>`).join('')}</div>
      <div class="card" data-rv><h3>Openings that pay</h3><p class="sub">Results by opening and colour.</p>
        <table><tbody>${[['Italian Game', 41, 24, 5, 12], ['Sicilian Defense', 33, 11, 4, 18], ['Queens Pawn Opening', 28, 17, 2, 9]].map(([n, g, w, d, l]) => `<tr><td>${n}</td><td class="r muted">${g}</td><td>${wdlBar({ n: g, w, d, l })}</td></tr>`).join('')}</tbody></table></div>
      <div class="card" data-rv><h3>Your habits</h3><p class="sub">Score by time of day.</p><div id="s-habit"></div></div>
      <div class="card b-wide" data-rv><div class="b-split"><div><h3>Blunder trainer</h3><p class="sub">Positions from your own games where you missed the best move.</p><p>Each puzzle starts from the position before your mistake. Find the move, ask for a hint, or see the answer.</p></div>
        <div class="mini-board" id="s-train"></div></div></div>
      <div class="card" data-rv><h3>Runs in the background</h3><p class="sub">Add a username and come back later.</p><div class="bar"><i style="width:62%"></i></div><p class="muted" style="margin:0">Analysing, 312 of 500 games</p></div>
    </div>
  </div></section>

  ${cloud.enabled ? `<section class="modes"><div class="wrap">
    <div class="mode" data-rv><h3>Quick analysis</h3><p>Type a username and watch it work in this tab. Everything stays in your browser and is saved as it goes.</p><button class="btn big" data-focus>Start now</button></div>
    <div class="mode dark" data-rv><h3>Tracked accounts</h3><p>Sign in, add your username, and a server reads every game and runs Stockfish on all of them while you are away. Come back when it says ready.</p><a class="btn primary big" href="#/${cloud.signedIn() ? 'accounts' : 'login'}">${cloud.signedIn() ? 'Open your accounts' : 'Sign in'}</a></div></div></section>`
  : `<section class="cta"><div class="wrap" data-rv><h2>Ready to see your own games?</h2><p>It takes a minute for a big account, and every month is saved so the next visit is instant.</p><button class="btn primary big" data-focus>Analyse a username</button></div></section>`}

  <footer class="foot"><div class="wrap"><div><div class="brand"><span class="mark"></span><b>LEEO</b><span>Chess Lab</span></div>
    <p class="muted">Not affiliated with chess.com. Game data comes from its public API. Engine analysis by Stockfish, licensed under the GPL.</p></div>
    <div class="flinks"><a href="#/" data-focus>Quick analysis</a>${cloud.enabled ? `<a href="#/${cloud.signedIn() ? 'accounts' : 'login'}">${cloud.signedIn() ? 'Your accounts' : 'Sign in'}</a>` : ''}<a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener">Stockfish</a></div></div></footer>`

  const input = root.querySelector('#huser')
  root.querySelector('#hform').onsubmit = e => { e.preventDefault(); if (input.value.trim()) begin(input.value) }
  root.querySelectorAll('[data-focus]').forEach(b => (b.onclick = e => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => input.focus({ preventScroll: true }), 400) }))

  // hero board plays the game while it is on screen
  const hero = createStage(root.querySelector('#stage'))
  const pp = root.querySelector('#pp')
  let userPaused = false
  pp.onclick = () => { userPaused = hero.playing; hero.toggle(); pp.textContent = hero.playing ? 'Pause' : 'Play' }
  root.querySelector('#rs').onclick = () => { hero.pause(); hero.goto(0); hero.play(); pp.textContent = 'Pause'; userPaused = false }
  const vis = new IntersectionObserver(([e]) => { if (e.isIntersecting && !userPaused && !hero.playing) { hero.play(); pp.textContent = 'Pause' } else if (!e.isIntersecting && hero.playing) hero.pause() }, { threshold: 0.3 })
  vis.observe(root.querySelector('#stage'))
  const onVis = () => { if (document.hidden) hero.pause() }
  document.addEventListener('visibilitychange', onVis)

  // scroll story: the pinned board follows the step in the middle of the screen
  const story = createStage(root.querySelector('#stage2'), { ribbon: false })
  const cfg = [
    () => story.goto(8, { badge: false, say: 'The bar moves with every move. Here White is a little ahead.' }),
    () => story.goto(worst + 1),
    () => story.goto(worst, { arrow: true, badge: false, say: `Instead of ${demoSan(worst)}, Stockfish wanted ${bestSan(worst)}.` }),
    () => story.goto(worst, { hint: true, badge: false, orientation: worst % 2 ? 'black' : 'white', say: 'Your turn. What is the best move here?' }),
  ]
  cfg[0]()
  const steps$ = [...root.querySelectorAll('.step')]
  const sio = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return
    steps$.forEach(s => s.classList.toggle('on', s === e.target)); cfg[+e.target.dataset.s]()
  }), { rootMargin: '-42% 0px -42% 0px' })
  steps$.forEach(s => sio.observe(s))

  Chessground(root.querySelector('#s-train'), { fen: demoFen(worst), viewOnly: true, coordinates: false, orientation: worst % 2 ? 'black' : 'white', drawable: { autoShapes: [{ orig: demo.best[worst].slice(0, 2), brush: 'yellow' }] } })
  lineChart(root.querySelector('#s-rating'), [{ name: 'Rapid', key: 'rapid', pts: sample }])
  barChart(root.querySelector('#s-habit'), [['00-04h', 3, 40], ['04-08h', 2, 50], ['08-12h', 14, 54], ['12-16h', 22, 52], ['16-20h', 31, 58], ['20-24h', 19, 47]].map(([label, n, score]) => ({ label, n, score })), { h: 170 })
  ctx.onCleanup(() => { hero.pause(); vis.disconnect(); sio.disconnect(); document.removeEventListener('visibilitychange', onVis) })
}
