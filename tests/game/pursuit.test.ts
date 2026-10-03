// Round 3, R19: losing them, the Odyssey way. Guards go to the last known
// position the base shares, search round it, give up and go back to their
// rounds on their guard; a full alert that has gone cold stands down.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  makeGarrison, stepGarrison, drainEvents, CHAOS_COOL_S, SEARCH_HOT_S, WARY_CONE,
  type Garrison, type GarrisonEvent, type Target
} from '@/game/sim/garrison'

const DT = 1 / 30
const fortress = (beacon = true) => {
  const b = new FortressBuilder('t', 40, 40)
  b.ground(0, 0, 39, 39)
  b.insert(1, 1).extract(38, 38)
  b.guard([[10, 10]], 0).guard([[13, 10]], 0)
  if (beacon) b.beacon(10, 16)
  return b.build()
}
const run = (gar: Garrison, f: ReturnType<typeof fortress>, t: Target, seconds: number): GarrisonEvent[] => {
  const out: GarrisonEvent[] = []
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepGarrison(gar, f.grid, t, DT)
    out.push(...drainEvents(gar))
  }
  return out
}
const seenAt = (cx: number, cz: number): Target => ({ x: cellMid(cx), y: 0, z: cellMid(cz), height: 2.6, crouched: false, visible: true })

describe('the hunt', () => {
  it('they go where the mech was last seen, not where it is now', () => {
    const f = fortress()
    const gar = makeGarrison(f, 1)
    // Seen in front of them, then gone, and slipped far off to one side.
    run(gar, f, seenAt(10, 13), 5)
    const lkp = { x: gar.lkp.x, z: gar.lkp.z }
    const gone: Target = { ...seenAt(32, 32), visible: false }
    run(gar, f, gone, 6)
    for (const u of gar.units) {
      if (u.runner >= 0) continue
      const toLkp = Math.hypot(u.x - lkp.x, u.z - lkp.z)
      const toMech = Math.hypot(u.x - gone.x, u.z - gone.z)
      expect(toLkp).toBeLessThan(toMech)
      expect(toLkp).toBeLessThan(12)
    }
  })

  it('they search round it for a long while, then go back to their rounds on their guard', () => {
    const f = fortress(false)
    const gar = makeGarrison(f, 1)
    run(gar, f, seenAt(10, 13), 5)
    const gone: Target = { ...seenAt(32, 32), visible: false }
    run(gar, f, gone, 8)
    expect(gar.units.some(u => u.state === 'search')).toBe(true)
    run(gar, f, gone, SEARCH_HOT_S + 10)
    for (const u of gar.units) {
      expect(u.state).toBe('patrol')
      expect(u.wary).toBe(true)
    }
    expect(WARY_CONE).toBeGreaterThan(1)
  })
})

describe('the stand-down', () => {
  it('a lit alarm with nobody finding anything goes cold: the beacon burns out, the meter falls back', () => {
    const f = fortress()
    const gar = makeGarrison(f, 1)
    const gone: Target = { ...seenAt(32, 32), visible: false }
    run(gar, f, seenAt(10, 13), 5)
    const lit = run(gar, f, gone, 25)
    expect(lit.some(e => e.type === 'alarm')).toBe(true)
    expect(gar.alert.chaos).toBe(true)
    const later = run(gar, f, gone, CHAOS_COOL_S + SEARCH_HOT_S + 20)
    expect(later.some(e => e.type === 'standDown')).toBe(true)
    expect(gar.alert.chaos).toBe(false)
    expect(gar.beacons[0]!.state).toBe('ready')
  })
})
