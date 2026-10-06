// R74: the Warden is a person. Stronger, but a precise blade takes him: from
// behind, from a ledge above or from a rope. Face to face he is not cut down
// in one stroke, and a machine boss is never taken by the blade. And a person
// killed by the mini-gun falls as a body: only machines come apart (#173).

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { FortressBuilder } from '@/game/world/fortress'
import { makeGarrison } from '@/game/sim/garrison'
import { findRopeStrike, findStrike } from '@/game/sim/melee'

const yard = (): FortressBuilder => {
  const b = new FortressBuilder('test', 24, 24)
  b.ground(0, 0, 23, 23)
  b.insert(1, 1).extract(22, 22)
  return b
}

describe('the Warden and the blade (R74)', () => {
  const f = yard().commander([[10, 10]], 0).build()
  const gar = makeGarrison(f)
  const w = gar.units[0]!

  it('is a boss, and still a backstab from behind', () => {
    expect(w.boss).toBe('warden')
    expect(findStrike(gar, f.grid, w.x, 0, w.z - 1.5, 0, true)).toEqual({ id: w.id, kind: 'backstab' })
  })

  it('face to face he is not cut down in one stroke', () => {
    expect(findStrike(gar, f.grid, w.x, 0, w.z + 1.5, Math.PI, true)).toBeNull()
  })

  it('from a rope above him, the assassination', () => {
    expect(findRopeStrike(gar, f.grid, w.x + 1, w.y + 4, w.z, 0)).toEqual({ id: w.id, kind: 'air' })
  })
})

describe('a person cut down by the mini-gun (#173)', () => {
  it('falls as a body: the mission never takes a person apart', () => {
    const src = readFileSync(`${process.cwd()}/src/game/sim/mission.ts`, 'utf8')
    expect(src).not.toContain('MINIGUN_APART')
    // The only `burst` deaths the mission writes are none: the garrison gives them to machines alone.
    expect(src).not.toMatch(/u\.death = 'burst'/)
  })
})
