import type { Fortress, Post } from '@/game/world/fortress'

/**
 * ─── Rubber band: a fortress that keeps killing the player thins out ─────────
 *
 * Every death at a fortress (at its threat level) since the player last won
 * there takes one human guard and one surveillance drone out of the next
 * attempt, down to no fewer than `EASE_FLOOR` of the original enemies. A win
 * there puts the count back to zero, and the fortress back to full strength
 * (`progress.ts`: `bankDefeat` counts, `bankMission` clears).
 *
 * Bosses, training dummies and the searchlights are never taken (they are not
 * "enemies" in the count either). Of the guards, a plain patroller goes first,
 * then a sentry, then one with a job (marksman, engineer, grenadier), and a
 * held-back reinforcement last: what is taken should be what the player keeps
 * running into. Chat partners left alone simply stop chatting.
 */

/** The share of the original enemies the rubber band never goes below. */
export const EASE_FLOOR = 0.6

const isEnemy = (p: Post): boolean => p.kind !== 'searchlight' && !p.dummy

const isHuman = (p: Post): boolean => (p.kind === 'guard' || p.kind === 'sentry') && !p.boss && !p.dummy

const isDrone = (p: Post): boolean => p.kind === 'drone' && !p.boss && !p.dummy

/** Which human guard goes first: lower is sooner. */
const guardOrder = (p: Post): number =>
  (p.reserve ? 30 : 0) + (p.role ? 20 : 0) + (p.kind === 'sentry' ? 10 : 0)

/** The fortress with `deaths` guards and `deaths` drones taken out, never below the floor. */
export const easeFortress = (f: Fortress, deaths: number): Fortress => {
  const n = Math.max(0, Math.floor(deaths))
  if (n === 0) return f
  const enemies = f.posts.filter(isEnemy).length
  const floor = Math.ceil(enemies * EASE_FLOOR)
  let budget = Math.max(0, enemies - floor)
  // Candidates in the order they go: the last placed of each rank first.
  const pick = (want: (p: Post) => boolean, order: (p: Post) => number = () => 0): number[] =>
    f.posts.map((p, i) => ({ p, i })).filter(({ p }) => want(p))
      .sort((a, b) => order(a.p) - order(b.p) || b.i - a.i).map(({ i }) => i)
  const guards = pick(isHuman, guardOrder)
  const drones = pick(isDrone)
  const gone = new Set<number>()
  for (let k = 0; k < n && budget > 0; k++) {
    // One guard and one drone a death, alternating, while the floor allows.
    const g = guards[k]
    if (g !== undefined && budget > 0) { gone.add(g); budget-- }
    const d = drones[k]
    if (d !== undefined && budget > 0) { gone.add(d); budget-- }
    if (g === undefined && d === undefined) break
  }
  if (!gone.size) return f
  const index = new Map<number, number>()
  const posts: Post[] = []
  f.posts.forEach((p, i) => { if (!gone.has(i)) { index.set(i, posts.length); posts.push({ ...p }) } })
  for (const p of posts) {
    if (p.partner === undefined) continue
    const to = index.get(p.partner)
    if (to === undefined) delete p.partner
    else p.partner = to
  }
  return { ...f, posts }
}
