// Quick check of the tactic detector. Run: node scripts/test-motifs.mjs
import { bestMotifs } from '../src/analyze.js'
import assert from 'node:assert/strict'
assert.match(bestMotifs('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7'), /x/, 'knight fork on king and rook')
assert.match(bestMotifs('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8'), /k/, 'back rank mate')
assert.match(bestMotifs('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', 'd1d5'), /f/, 'free queen')
assert.match(bestMotifs('8/P7/8/8/8/8/8/k1K5 w - - 0 1', 'a7a8q'), /p/, 'promotion')
assert.equal(bestMotifs('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4'), '', 'quiet opening move')
console.log('motifs ok')
