import { read, write } from './sync.js'

// Five puzzles a day. The streak counts consecutive days with a finished warm-up.
const day = d => d.toISOString().slice(0, 10)
const days = () => read('warmup', { days: [] }).days
export const doneToday = () => days().includes(day(new Date()))
export function mark() {
  const w = read('warmup', { days: [] })
  if (!w.days.includes(day(new Date()))) { w.days = [...w.days, day(new Date())].slice(-120); write('warmup', w) }
}
export function streak() {
  const have = new Set(days()), t = new Date()
  if (!have.has(day(t))) t.setUTCDate(t.getUTCDate() - 1)
  let n = 0
  while (have.has(day(t))) { n++; t.setUTCDate(t.getUTCDate() - 1) }
  return n
}
