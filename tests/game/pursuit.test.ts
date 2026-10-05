// Round 3, R19: losing them, the Odyssey way. Guards go to the last known
// position the base shares, search round it, give up and go back to their
// rounds on their guard; a full alert that has gone cold stands down (#134:
// after CHAOS_COOL_S unseen and unheard, or with every ringing beacon
// silenced), into a cautious search first.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  makeGarrison, stepGarrison, drainEvents, killUnit, noiseAt, sabotageBeacon, CHAOS_COOL_S, SEARCH_HOT_S, WARY_CONE,
  type Garrison, type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { ALERT_MAX } from '@/game/sim/alert'

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

describe('the stand-down (#134)', () => {
  /** Seen, then gone: run until a beacon is lit. */
  const toAlarm = (gar: Garrison, f: ReturnType<typeof fortress>, gone: Target): void => {
    run(gar, f, seenAt(10, 13), 5)
    for (let i = 0; i < 60 && !gar.alert.chaos; i++) run(gar, f, gone, 1)
    expect(gar.alert.chaos).toBe(true)
    expect(gar.beacons.some(b => b.state === 'lit')).toBe(true)
  }
  const gone: Target = { ...seenAt(32, 32), visible: false }

  it('nobody has seen or heard the mech for CHAOS_COOL_S: the alarm goes out, they search the last sighting, cautious, then go back to their rounds', () => {
    const f = fortress()
    const gar = makeGarrison(f, 1)
    toAlarm(gar, f, gone)
    const lkp = { x: gar.lkp.x, z: gar.lkp.z }
    expect(run(gar, f, gone, CHAOS_COOL_S - 2).some(e => e.type === 'standDown')).toBe(false)
    expect(gar.alert.chaos).toBe(true)
    expect(run(gar, f, gone, 4).some(e => e.type === 'standDown')).toBe(true)
    expect(gar.alert.chaos).toBe(false)
    expect(gar.alert.level).toBeLessThan(ALERT_MAX)
    expect(gar.beacons[0]!.state).toBe('ready')
    // Still searching where it was last seen, not where it is.
    run(gar, f, gone, 8)
    for (const u of gar.units) {
      expect(u.state).toBe('search')
      expect(Math.hypot(u.x - lkp.x, u.z - lkp.z)).toBeLessThan(Math.hypot(u.x - gone.x, u.z - gone.z))
    }
    // No runner while the base thinks the intruder gone.
    expect(run(gar, f, gone, SEARCH_HOT_S + 10).some(e => e.type === 'runner')).toBe(false)
    for (const u of gar.units) {
      expect(u.state).toBe('patrol')
      expect(u.wary).toBe(true)
    }
  })

  it('a ringing beacon can be silenced; the last one silenced stands the alert down at once', () => {
    const f = fortress()
    const gar = makeGarrison(f, 1)
    toAlarm(gar, f, gone)
    drainEvents(gar)
    expect(sabotageBeacon(gar, 0)).toBe(true)
    expect(gar.beacons[0]!.state).toBe('sabotaged')
    expect(drainEvents(gar).some(e => e.type === 'standDown')).toBe(true)
    expect(gar.alert.chaos).toBe(false)
    for (const u of gar.units) expect(u.state).toBe('search')
    run(gar, f, gone, SEARCH_HOT_S + 10)
    for (const u of gar.units) expect(u.state).toBe('patrol')
  })

  it('seen again while they search, it all starts over', () => {
    const f = fortress()
    const gar = makeGarrison(f, 1)
    toAlarm(gar, f, gone)
    sabotageBeacon(gar, 0)
    run(gar, f, gone, 3)
    // Right in front of a searcher.
    for (let i = 0; i < 8 * 30 && !gar.units.some(u => u.state === 'combat'); i++) {
      const u = gar.units[0]!
      stepGarrison(gar, f.grid, { x: u.x + Math.sin(u.yaw) * 4, y: 0, z: u.z + Math.cos(u.yaw) * 4, height: 2.6, crouched: false, visible: true }, DT)
    }
    expect(gar.units.some(u => u.state === 'combat')).toBe(true)
  })

  it('a kill or a blast heard during the alert keeps the hunt hot, and sends it there', () => {
    const f = fortress()
    const gar = makeGarrison(f, 1)
    toAlarm(gar, f, gone)
    run(gar, f, gone, CHAOS_COOL_S - 5)
    const victim = gar.units[1]!
    killUnit(gar, 1, gone.x, gone.z)
    expect(gar.lkp.x).toBeCloseTo(victim.x)
    expect(gar.lkp.z).toBeCloseTo(victim.z)
    run(gar, f, gone, 10)
    expect(gar.alert.chaos).toBe(true)
    run(gar, f, gone, CHAOS_COOL_S - 12)
    noiseAt(gar, gone, cellMid(20), cellMid(20), 40, 'loud')
    expect(gar.lkp.x).toBeCloseTo(cellMid(20))
    run(gar, f, gone, CHAOS_COOL_S - 5)
    expect(gar.alert.chaos).toBe(true)
    expect(run(gar, f, gone, 10).some(e => e.type === 'standDown')).toBe(true)
  })
})
