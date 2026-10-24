import { S } from './state.js'

// Your own reasons for losing a game, saved in this browser (the engine cannot know these).
export const WHY = [['opening', 'Bad opening'], ['tactic', 'Missed a tactic'], ['hung', 'Blundered a piece'], ['time', 'Time trouble'], ['tilt', 'Tilted or rushed'], ['pressed', 'Pushed too hard'], ['endgame', 'Lost the endgame'], ['outplayed', 'Outplayed']]
const key = () => `why:${S.user}`
export const allWhy = () => { try { return JSON.parse(localStorage[key()] || '{}') } catch { return {} } }
export function toggleWhy(id, tag) {
  const all = allWhy(), cur = new Set(all[id] || [])
  cur.has(tag) ? cur.delete(tag) : cur.add(tag)
  cur.size ? (all[id] = [...cur]) : delete all[id]
  localStorage[key()] = JSON.stringify(all)
  return [...cur]
}
