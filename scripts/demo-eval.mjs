// One-off: runs Stockfish over Morphy's Opera Game and writes src/demo.json for the homepage board.
import { writeFileSync } from 'node:fs'
import { analyzeGame } from '../src/analyze.js'
import { makePool } from '../worker/uci.mjs'
const pgn = '[Event "Paris"]\n[White "Paul Morphy"]\n[Black "Duke of Brunswick and Count Isouard"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0'
const pool = makePool(3, 'node node_modules/stockfish/bin/stockfish-19-lite-single.js')
const a = await analyzeGame({ pgn, me: 'w' }, pool, 16)
pool.terminate()
const { ev, best, sans, ucis } = a
writeFileSync('src/demo.json', JSON.stringify({ ev, best, sans: sans.split(' '), ucis: ucis.split(' ') }))
console.log(ev.join(' '))
