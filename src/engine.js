// Stockfish 19 (lite, single thread WASM) driven over UCI in a Web Worker.
const URL_ = './engine/stockfish-19-lite-single.js'

const workerTransport = () => {
  const w = new Worker(URL_)
  return { send: s => w.postMessage(s), listen: cb => { w.onmessage = e => String(e.data).split('\n').forEach(l => cb(l.trim())) }, terminate: () => w.terminate() }
}

export class Engine {
  // transport: { send(line), listen(cb(line)), terminate() }. The browser uses a Web Worker, the background job a child process.
  constructor(transport = workerTransport()) {
    this.t = transport
    this.on = null
    this.busy = false
    this.chain = Promise.resolve()
    this.t.listen(l => this.on && this.on(l))
    this.ready = new Promise(res => {
      this.on = l => { if (l === 'uciok') { this.send('setoption name Hash value 16'); this.send('isready') } else if (l === 'readyok') { this.on = null; res() } }
      this.send('uci')
    })
  }
  send(s) { this.t.send(s) }
  stop() { if (this.busy) this.send('stop') }
  // One move at a chosen playing strength, for the twin bot. Resolves with a UCI move like e2e4.
  play(fen, elo, ms = 600) {
    const run = () => new Promise(res => {
      this.busy = true
      this.on = l => { if (l.startsWith('bestmove')) { this.on = null; this.busy = false; res(l.split(' ')[1]) } }
      this.send('setoption name UCI_LimitStrength value true')
      this.send('setoption name UCI_Elo value ' + Math.max(1320, Math.min(3190, Math.round(elo))))
      this.send('setoption name MultiPV value 1')
      this.send('position fen ' + fen)
      this.send('go movetime ' + ms)
    })
    const prev = this.chain
    const p = this.ready.then(() => prev).then(run)
    this.chain = p.catch(() => {})
    return p
  }
  terminate() { this.t.terminate() }
  // Resolves { lines: [{mpv, depth, cp, mate, pv:[uci]}] } with scores from White's point of view.
  search(fen, depth, multipv = 1, onInfo, skip) {
    const run = () => new Promise(res => {
      if (skip && skip()) return res(null)
      this.busy = true
      const sign = fen.split(' ')[1] === 'b' ? -1 : 1
      const lines = {}
      this.on = l => {
        if (l.startsWith('info') && / pv /.test(l) && / score /.test(l)) {
          const g = re => re.exec(l)
          const sc = g(/score (cp|mate) (-?\d+)/), d = g(/ depth (\d+)/), mp = g(/multipv (\d+)/)
          if (!sc || !d) return
          const v = +sc[2] * sign
          lines[mp ? +mp[1] : 1] = {
            mpv: mp ? +mp[1] : 1, depth: +d[1],
            cp: sc[1] === 'cp' ? v : (v > 0 ? 1 : -1) * (10000 - Math.abs(+sc[2])),
            mate: sc[1] === 'mate' ? v : null, pv: l.split(' pv ')[1].trim().split(' '),
          }
          if (onInfo) onInfo(Object.values(lines))
        } else if (l.startsWith('bestmove')) {
          this.on = null; this.busy = false
          res({ lines: Object.values(lines) })
        }
      }
      this.send('setoption name MultiPV value ' + multipv)
      this.send('position fen ' + fen)
      this.send('go depth ' + depth)
    })
    const prev = this.chain
    const p = this.ready.then(() => prev).then(run)
    this.chain = p.catch(() => {})
    return p
  }
}

// A few engines working through a queue of positions.
export class Pool {
  constructor(n, make = () => new Engine()) {
    this.free = Array.from({ length: n }, make)
    this.all = [...this.free]
    this.q = []
  }
  eval(fen, depth) {
    return new Promise(res => { this.q.push({ fen, depth, res }); this.pump() })
  }
  pump() {
    while (this.free.length && this.q.length) {
      const e = this.free.pop(), j = this.q.shift()
      e.search(j.fen, j.depth).then(r => { this.free.push(e); j.res(r); this.pump() })
    }
  }
  clear() { this.q.forEach(j => j.res(null)); this.q = [] }
  terminate() { this.all.forEach(e => e.terminate()) }
}
