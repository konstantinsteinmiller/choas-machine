// A guard sees what is in its field of view by line of sight; the cone on the
// floor is only how far and how wide it looks. A playtester stood on the cover
// room's crates in the sentry's sight for six seconds, unseen: standing up on
// something, all of it in view, is a silhouette that is spotted fast. Crouched
// behind the same crates, the mech stays hidden.

import { describe, expect, it } from 'vitest'
import { buildTrainingGround, LESSON_IDS, roomCell } from '@/game/data/fortresses/training'
import { makeGarrison, stepGarrison, type Target } from '@/game/sim/garrison'
import { roomAt } from '@/game/sim/training'
import { cellMid, heightAt } from '@/game/world/grid'

const spotted = (lx: number, lz: number, crouched: boolean, s = 6): number => {
  const f = buildTrainingGround()
  const i = LESSON_IDS.indexOf('cover')
  const [cx, cz] = roomCell(i, lx, lz)
  const x = cellMid(cx)
  const z = cellMid(cz)
  const gar = makeGarrison(f, 1)
  gar.drill = true
  const u = gar.units.find(q => roomAt(q.homeX) === i)!
  const t: Target = { x, y: heightAt(f.grid, x, z), z, height: crouched ? 1.3 : 2, crouched, visible: true }
  let k = 0
  while (u.state !== 'combat' && k < 60 * s) { stepGarrison(gar, f.grid, t, 1 / 60); k++ }
  return u.state === 'combat' ? k / 60 : Infinity
}

describe('a mech up on the crates in the sentry\'s sight', () => {
  it('is spotted within about two seconds, wherever along them', () => {
    for (const lx of [1, 3, 5]) expect(spotted(lx, 5, false), `crate ${lx}`).toBeLessThan(2.6)
  })

  it('crouched behind them it is not seen at all', () => {
    expect(spotted(3, 6, true)).toBe(Infinity)
  })
})
