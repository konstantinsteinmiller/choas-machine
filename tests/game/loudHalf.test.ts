// R20 and #60: rounds to a guard's body or legs do not kill outright, a
// guard that lives through one sends those near it to look for the shooter,
// and a defender that opens up on the mech mostly misses at first.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  SPECS, SUSPECT_AT, drainEvents, makeGarrison, searchForShooter, stepGarrison, type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { GUNS, SUPPRESS_S, stepFire } from '@/game/sim/chaos'
import { HUMAN_BODY, HUMAN_LIMB, shotDamage } from '@/game/sim/damage'
import { LIMB_TOP, castShot, makeShotHit } from '@/game/sim/hitscan'
import { MECH_HEIGHT } from '@/game/models/mech'

const DT = 1 / 60
const yard = (): FortressBuilder => {
  const b = new FortressBuilder('test', 40, 40)
  b.ground(0, 0, 39, 39)
  b.insert(1, 1).extract(38, 38)
  return b
}
const mech = (cx: number, cz: number): Target => ({
  x: cellMid(cx), y: 0, z: cellMid(cz), height: MECH_HEIGHT, crouched: false, visible: true, moving: 0
})

/** How many sniper rounds to `zone` a fresh guard takes. */
const roundsToKill = (zone: 'head' | 'body' | 'limb'): number => {
  const hp = SPECS.guard.hp
  let left = hp
  let n = 0
  while (left > 0 && n < 10) { left -= shotDamage('sniper', 'guard', zone, 1, hp); n++ }
  return n
}

describe('#60: where the round lands decides how many it takes', () => {
  it('one to the head, two to the body, three to the legs', () => {
    expect(roundsToKill('head')).toBe(1)
    expect(roundsToKill('body')).toBe(2)
    expect(roundsToKill('limb')).toBe(3)
    expect(HUMAN_LIMB).toBeLessThan(HUMAN_BODY)
  })

  it('the counts hold at a higher threat level, where guards are tougher', () => {
    for (const hp of [30, 45, 80]) {
      expect(hp - shotDamage('sniper', 'guard', 'body', 1, hp)).toBeGreaterThan(0)
      expect(hp - 2 * shotDamage('sniper', 'guard', 'body', 1, hp)).toBeLessThanOrEqual(0)
      expect(hp - 2 * shotDamage('sniper', 'guard', 'limb', 1, hp)).toBeGreaterThan(0)
      expect(hp - 3 * shotDamage('sniper', 'guard', 'limb', 1, hp)).toBeLessThanOrEqual(0)
    }
  })

  it('a round below the hips is in the legs, above them in the body', () => {
    const f = yard().guard([[10, 10]], 0).build()
    const gar = makeGarrison(f)
    const u = gar.units[0]!
    const shoot = (y: number) => castShot(f.grid, gar.units, u.x, u.y + y, u.z - 20, 0, 0, 1, 60, makeShotHit())
    expect(shoot(LIMB_TOP - 0.3).zone).toBe('limb')
    expect(shoot(LIMB_TOP + 0.3).zone).toBe('body')
  })
})

describe('#60: a guard that lives through a round', () => {
  it('sends those near it to look where the round came from; those far off carry on', () => {
    const f = yard().guard([[10, 10]], 0).guard([[14, 10]], 0).guard([[36, 36]], 0).build()
    const gar = makeGarrison(f)
    searchForShooter(gar, 0, cellMid(10), cellMid(30))
    expect(gar.units[1]!.detect).toBeGreaterThan(SUSPECT_AT)
    expect(gar.units[1]!.state).not.toBe('patrol')
    expect(gar.units[2]!.state).toBe('patrol')
    expect(gar.units[2]!.detect).toBe(0)
  })
})

describe('R20: suppressing fire', () => {
  it('a defender that has just opened up mostly misses; once settled it hits as before', () => {
    const fight = (): { early: number; late: number; shotsEarly: number; shotsLate: number } => {
      const f = yard().sentry(10, 5, 0).build()
      const gar = makeGarrison(f, 1)
      const t = mech(10, 11)
      let early = 0, late = 0, shotsEarly = 0, shotsLate = 0
      for (let s = 0; s < 40; s += DT) {
        stepGarrison(gar, f.grid, t, DT)
        stepFire(gar, f.grid, t, DT)
        for (const e of drainEvents(gar) as GarrisonEvent[]) {
          if (e.type !== 'fire') continue
          const u = gar.units[e.id]!
          if (u.aimT < SUPPRESS_S) { shotsEarly++; if (e.damage > 0) early++ } else { shotsLate++; if (e.damage > 0) late++ }
        }
        // Break line now and then, so it opens up again and again.
        t.visible = (s % 8) < 6
      }
      return { early, late, shotsEarly, shotsLate }
    }
    const r = fight()
    expect(r.shotsEarly).toBeGreaterThan(3)
    expect(r.shotsLate).toBeGreaterThan(3)
    expect(r.early / r.shotsEarly).toBeLessThan(r.late / r.shotsLate)
  })

  it('guns reach across the base: anyone who has made the mech can fire from far off', () => {
    for (const g of Object.values(GUNS)) expect(g!.range).toBeGreaterThanOrEqual(45)
  })
})
