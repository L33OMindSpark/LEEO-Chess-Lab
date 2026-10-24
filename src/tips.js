import { openings, habits, scoreOf, firstMoves } from './stats.js'

const p0 = n => Math.round(n)

// Rule-based coaching. Every tip quotes the numbers it came from and ends with something to practise.
export function tips(set, m) {
  const out = [], e = m.e, h = habits(set)
  const add = (area, sev, title, body, drill) => out.push({ area, sev, title, body, drill })
  if (set.length < 15) return out

  // openings
  for (const [c, name] of [['w', 'White'], ['b', 'Black']]) {
    const rows = openings(set, c).filter(r => r.fam !== 'Unknown')
    const top = rows[0]
    if (top && top.n >= 10) {
      const sc = top.score
      if (sc < 45) add('Openings', 6 + (45 - sc) / 5, `Your main ${name} opening is costing you points`,
        `${top.fam} is your most played opening as ${name} (${top.n} games) and you score ${p0(sc)}% with it.`,
        `Pick one line of ${top.fam} and learn the first 8 moves plus the plans behind them, or switch to a simpler system for 30 games and compare.`)
      else if (sc > 58) add('Openings', 2, `${top.fam} works for you as ${name}`,
        `You score ${p0(sc)}% over ${top.n} games. That is well above your overall ${p0(m.score)}%.`,
        `Go one level deeper: study the 3 most common replies you face and write down your answer to each.`)
    }
    const weak = rows.filter(r => r.n >= 8 && r !== top).sort((a, b) => a.score - b.score)[0]
    if (weak && weak.score < 40) add('Openings', 5, `Trouble against ${weak.fam} as ${name}`,
      `${weak.n} games, ${p0(weak.score)}% score (${weak.w} wins, ${weak.d} draws, ${weak.l} losses).`,
      `Replay your last 3 losses in this opening and find the move where the position first turned. Then learn the standard plan once.`)
  }
  const fm = firstMoves(set).white, tot = [...fm.values()].reduce((s, x) => s + x.n, 0)
  const wide = [...fm].filter(([, o]) => o.n / tot > 0.08).length
  if (tot > 40 && wide >= 4) add('Openings', 3, 'You change first move a lot as White', `${wide} different first moves each make up more than 8% of your White games.`, 'Stay with one first move for a month. Patterns repeat faster when the positions do.')

  // colour
  const w = set.filter(g => g.me === 'w'), b = set.filter(g => g.me === 'b')
  if (w.length > 20 && b.length > 20) {
    const sw = (w.filter(g => g.score === 1).length + w.filter(g => g.score === 0.5).length / 2) / w.length * 100
    const sb = (b.filter(g => g.score === 1).length + b.filter(g => g.score === 0.5).length / 2) / b.length * 100
    if (Math.abs(sw - sb) > 8) add('Style', 4, `A ${p0(Math.abs(sw - sb))} point gap between your colours`, `You score ${p0(sw)}% with White and ${p0(sb)}% with Black.`,
      sw > sb ? 'Your Black repertoire is the cheapest place to gain rating. Choose one reply to 1.e4 and one to 1.d4 and stick to them.' : 'You are stronger defending than starting. Build a repertoire for White that creates the type of position you like with Black.')
  }

  // time
  if (m.timeoutLoss > 10) add('Time', 4 + m.timeoutLoss / 10, 'Too many games are lost on the clock', `${p0(m.timeoutLoss)}% of your losses are timeouts.`, 'Set a budget: be out of your opening by move 10 with 90% of your time left, and play obvious moves in under 5 seconds.')
  if (e && e.clocks && e.pressureMoves > 40 && e.pressureRate > e.calmRate * 1.6) add('Time', 7, 'Your play falls apart in time trouble',
    `Under time pressure you make a mistake or blunder every ${p0(100 / e.pressureRate)} moves, against every ${p0(100 / Math.max(e.calmRate, 0.1))} moves when you have time.`,
    'In your next 10 games, when your clock goes below 20% stop spending time on the opponent plan and only check one thing: can anything of mine be captured?')

  // habits
  const bestT = [...h.hour].filter(x => x.n >= 15).sort((a, b) => b.score - a.score), worstT = [...bestT].reverse()
  if (bestT.length > 2 && bestT[0].score - worstT[0].score > 12) add('Habits', 3, `You play worse at ${worstT[0].label}`, `${p0(worstT[0].score)}% score there against ${p0(bestT[0].score)}% at ${bestT[0].label}.`, `Move your serious games to ${bestT[0].label} and keep the other hours for casual play.`)
  const t = h.tilt
  if (t.nLoss > 30 && t.afterLoss < t.afterWin - 8) add('Habits', 6, 'You tilt after a loss',
    `After a loss you score ${p0(t.afterLoss)}% in the next game (${t.nLoss} games), after a win ${p0(t.afterWin)}%.${t.nTwo > 10 ? ` After two losses in a row it is ${p0(t.afterTwo)}%.` : ''}`,
    'Make a rule: after any loss take a 5 minute break. After two losses stop for the session.')
  const lower = h.bands[0], higher = h.bands[2]
  if (lower.n > 30 && lower.score < 62) add('Habits', 5, 'You drop too many points to lower rated players', `Against opponents 100+ below you the score is ${p0(lower.score)}% over ${lower.n} games. Players at your level and above are scored ${p0(h.bands[1].score)}% and ${p0(higher.score)}%.`, 'Against weaker players keep pieces on and wait. Do not force matters, they usually lose on their own.')
  if (m.shortLoss > 22) add('Tactics', 6, 'Many losses come early', `${p0(m.shortLoss)}% of your losses end within 20 moves.`, 'Before every move ask: what does their last move attack, and what does it threaten next? Do 15 minutes of tactics puzzles before playing.')

  // engine
  if (e && e.moves > 300) {
    const names = ['opening', 'middlegame', 'endgame']
    const worst = e.phRate.map((r, i) => [r, i]).filter(([, i]) => e.ph[i].n > 80).sort((a, b) => b[0] - a[0])[0]
    if (worst && worst[0] > 8) add('Engine', 6 + worst[0] / 5, `Most of your errors happen in the ${names[worst[1]]}`,
      `A mistake or blunder on ${worst[0].toFixed(1)}% of your ${names[worst[1]]} moves (${e.ph[worst[1]].err} in ${e.ph[worst[1]].n}).`,
      ['Learn the plans, not only the moves, of your 2 main openings.', 'Before each move list the opponent threats and your loose pieces. Slow down in complex positions.', 'Work through basic endgames: king and pawn, rook endgames, and Lucena and Philidor.'][worst[1]])
    if (e.winGames >= 8 && e.converted / e.winGames < 0.75) add('Engine', 8, 'You let winning positions slip', `In ${e.winGames} analysed games you were clearly winning at some point. You won only ${e.converted} (${p0(e.converted / e.winGames * 100)}%).`, 'When ahead: trade pieces, remove counterplay, and spend your time on safety before looking for the knockout.')
    if (e.lostGames >= 8 && e.saved / e.lostGames > 0.25) add('Engine', 2, 'You fight back from bad positions', `You saved ${e.saved} of ${e.lostGames} games where you were clearly worse (${p0(e.saved / e.lostGames * 100)}%).`, 'That resilience is a real strength. Use it in the opening too and avoid getting into those positions.')
    if (e.aheadErr > 10) add('Engine', 5, 'Blunders come when you are already ahead', `${e.aheadErr} of your mistakes or blunders were made from a position with a 70% or better chance to win.`, 'Once you are ahead, play the safest move that keeps the advantage. Stop calculating long lines.')
    if (e.blundersTimed >= 15 && e.fastBlunders / e.blundersTimed > 0.4) add('Time', 6, 'Many blunders are played in seconds', `${p0(e.fastBlunders / e.blundersTimed * 100)}% of your blunders (${e.fastBlunders} of ${e.blundersTimed}) were played in under 3 seconds.`, 'Add one checkpoint before every move: what does their last move threaten, and is my move safe? Even two seconds removes most of these.')
    if (e.per100 > 3) add('Tactics', 7, 'Blunders are your biggest leak', `You blunder (lose 20% win chance or more, the same line chess.com uses) once every ${p0(100 / e.per100)} moves.`, 'Use the blunder trainer on this site daily. Fifteen positions from your own games are worth more than random puzzles.')
  }
  return out.sort((a, b) => b.sev - a.sev)
}
