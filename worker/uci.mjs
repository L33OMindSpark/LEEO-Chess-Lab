// Runs a UCI engine as a child process and plugs it into the same Engine class the browser uses.
import { spawn } from 'node:child_process'
import { Engine, Pool } from '../src/engine.js'

function transport(cmd) {
  const [c, ...a] = cmd.split(' ')
  const p = spawn(c, a)
  let buf = ''
  return {
    send: s => p.stdin.write(s + '\n'),
    listen: cb => p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { cb(buf.slice(0, i).trim()); buf = buf.slice(i + 1) } }),
    terminate: () => p.kill(),
  }
}
export const makePool = (n, cmd) => new Pool(n, () => new Engine(transport(cmd)))
