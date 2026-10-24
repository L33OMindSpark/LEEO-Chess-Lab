import { read, write } from './sync.js'

// Your own reasons for losing a game, saved in this browser (the engine cannot know these).
export const WHY = [['opening', 'Bad opening'], ['tactic', 'Missed a tactic'], ['hung', 'Blundered a piece'], ['time', 'Time trouble'], ['tilt', 'Tilted or rushed'], ['pressed', 'Pushed too hard'], ['endgame', 'Lost the endgame'], ['outplayed', 'Outplayed']]
export const allWhy = () => read('why', {})
export function toggleWhy(id, tag) {
  const all = allWhy(), cur = new Set(all[id] || [])
  cur.has(tag) ? cur.delete(tag) : cur.add(tag)
  cur.size ? (all[id] = [...cur]) : delete all[id]
  write('why', all)
  return [...cur]
}
