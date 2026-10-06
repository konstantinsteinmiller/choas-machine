// Round 5 (#151): the shield guard uses his shield. It is up, over his head,
// unless he has gone five seconds without anything striking him: then he
// looks out over it for a second and a half, and only then does his handgun
// fire and his head show. In a fight he walks ahead of the guard nearest him,
// between it and the mech, so his shield covers that guard too.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  PEEK_S, SHIELD_QUIET_S, drainEvents, escortSpot, makeGarrison, shieldStruck, shieldUp, stepGarrison, type Target
} from '@/game/sim/garrison'
import { stepFire } from '@/game/sim/chaos'
import { castShot, makeShotHit } from '@/game/sim/hitscan'
import { GUARD_HEAD_Y } from '@/game/models/garrison'

const yard = (): ReturnType<FortressBuilder['build']> => {
  const b = new FortressBuilder('t', 30, 30)
  b.ground(0, 0, 29, 29).insert(1, 1).extract(28, 28)
  b.guard([[14, 10]], 0)
  b.posts[0]!.shield = true
  b.guard([[14, 7]], 0)
  return b.build()
}
const DT = 1 / 30
const away: Target = { x: cellMid(1), y: 0, z: cellMid(1), height: 2.6, crouched: true, visible: false }

describe('the shield guard (#151)', () => {
  it('keeps his shield up; after five quiet seconds he looks out for a moment, then it goes up again', () => {
    const f = yard()
    const gar = makeGarrison(f, 1)
    const u = gar.units[0]!
    expect(shieldUp(u)).toBe(true)
    let t = 0
    while (shieldUp(u) && t < 10) { stepGarrison(gar, f.grid, away, DT); t += DT }
    expect(t).toBeGreaterThan(SHIELD_QUIET_S - 0.1)
    expect(t).toBeLessThan(SHIELD_QUIET_S + 0.2)
    let peek = 0
    while (!shieldUp(u) && peek < 5) { stepGarrison(gar, f.grid, away, DT); peek += DT }
    expect(peek).toBeGreaterThan(PEEK_S - 0.1)
    expect(peek).toBeLessThan(PEEK_S + 0.2)
  })

  it('anything striking him puts it straight back up and starts the count again', () => {
    const f = yard()
    const gar = makeGarrison(f, 1)
    const u = gar.units[0]!
    for (let t = 0; t < SHIELD_QUIET_S + 0.2; t += DT) stepGarrison(gar, f.grid, away, DT)
    expect(shieldUp(u)).toBe(false)
    shieldStruck(gar, u.id)
    expect(shieldUp(u)).toBe(true)
    expect(u.quietT).toBe(0)
  })

  it('up, a round at his head from in front stops on the shield; peeking, it finds his head', () => {
    const f = yard()
    const gar = makeGarrison(f, 1)
    const u = gar.units[0]!
    const shot = (): string => {
      const h = castShot(f.grid, gar.units, u.x, u.y + GUARD_HEAD_Y, u.z + 12, 0, 0, -1, 20, makeShotHit())
      return h.kind === 'unit' && h.unit === u.id ? h.zone : h.kind
    }
    u.yaw = 0
    expect(shot()).toBe('armor')
    u.peekT = 1
    expect(shot()).toBe('head')
  })

  it('his gun is quiet while the shield is up, and speaks while he looks out', () => {
    const f = yard()
    const gar = makeGarrison(f, 1)
    const u = gar.units[0]!
    const mech: Target = { x: u.x, y: 0, z: u.z + 8, height: 2.6, crouched: false, visible: true }
    u.state = 'combat'
    u.sees = true
    u.power = 1
    const fired = (): number => {
      let n = 0
      for (let t = 0; t < 1.4; t += DT) {
        u.sees = true
        stepFire(gar, f.grid, mech, DT)
        n += drainEvents(gar).filter(e => e.type === 'fire' && e.id === u.id).length
      }
      return n
    }
    u.quietT = 0
    u.peekT = 0
    expect(fired()).toBe(0)
    u.peekT = PEEK_S + 2
    expect(fired()).toBeGreaterThan(0)
  })

  it('in a fight he walks ahead of the guard nearest him, toward the mech', () => {
    const f = yard()
    const gar = makeGarrison(f, 1)
    const ally = gar.units[1]!
    ally.state = 'combat'
    const mech = { x: ally.x, z: ally.z + 20 }
    const s = escortSpot(gar.units[0]!, gar, mech)
    expect(Math.hypot(s.x - ally.x, s.z - ally.z)).toBeGreaterThan(1.5)
    expect(s.z).toBeGreaterThan(ally.z)
    expect(Math.abs(s.x - ally.x)).toBeLessThan(0.01)
  })
})
