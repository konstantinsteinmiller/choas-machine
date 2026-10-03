// Round 3, R18: Odyssey's fort alarm. A sure guard shouts; somebody runs to a
// beacon and lights it; only then is the whole base on alert.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  makeGarrison, stepGarrison, drainEvents, killUnit, sabotageBeacon, BEACON_LIGHT_S, RUNNER_RETRY_S, SHOUT_M,
  type Garrison, type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { ALERT_MAX } from '@/game/sim/alert'

const DT = 1 / 30
const yard = (beacons: Array<[number, number]>) => {
  const b = new FortressBuilder('t', 32, 32)
  b.ground(0, 0, 31, 31)
  b.insert(1, 1).extract(30, 30)
  // A: posted at (8, 8) facing +z; B: 6 m to its side; C: far off.
  b.guard([[8, 8]], 0).guard([[11, 8]], 0).guard([[26, 26]], Math.PI)
  for (const [cx, cz] of beacons) b.beacon(cx, cz)
  return b.build()
}
/** The mech in plain view right in front of guard A. */
const inView = (): Target => ({ x: cellMid(8), y: 0, z: cellMid(8) + 3, height: 2.6, crouched: false, visible: true })
const run = (gar: Garrison, f: ReturnType<typeof yard>, t: Target, seconds: number, keep?: (g: Garrison) => void): GarrisonEvent[] => {
  const out: GarrisonEvent[] = []
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepGarrison(gar, f.grid, t, DT)
    out.push(...drainEvents(gar))
    keep?.(gar)
  }
  return out
}

describe('the shout', () => {
  it('a sure guard shouts: those near it join; one far off does not', () => {
    const f = yard([[8, 24]])
    const gar = makeGarrison(f, 1)
    const events = run(gar, f, inView(), 2.5)
    expect(events.some(e => e.type === 'shout' && e.id === 0)).toBe(true)
    expect(gar.units[0]!.state).toBe('combat')
    expect(gar.units[1]!.state).toBe('combat')
    expect(Math.hypot(gar.units[2]!.x - gar.units[0]!.x, gar.units[2]!.z - gar.units[0]!.z)).toBeGreaterThan(SHOUT_M)
    expect(gar.units[2]!.state).not.toBe('combat')
  })
})

describe('the beacon', () => {
  it('somebody runs to it, cranks it, and only then is the base on full alert', () => {
    const f = yard([[8, 24]])
    const gar = makeGarrison(f, 1)
    const hidden: Target = { ...inView(), visible: false }
    // Seen, then out of sight: the fight is on, the meter stops short.
    const seen = run(gar, f, inView(), 2.5)
    expect(gar.alert.chaos).toBe(false)
    const events = [...seen, ...run(gar, f, hidden, 20)]
    const runner = events.find(e => e.type === 'runner')
    expect(runner).toBeTruthy()
    expect(events.some(e => e.type === 'alarm')).toBe(true)
    expect(gar.alert.chaos).toBe(true)
    expect(gar.beacons[0]!.state).toBe('lit')
  })

  it('without a lit beacon the meter never fills, however long the fight', () => {
    const f = yard([[8, 24]])
    const gar = makeGarrison(f, 1)
    sabotageBeacon(gar, 0)
    run(gar, f, inView(), 15)
    expect(gar.units[0]!.state).toBe('combat')
    expect(gar.alert.chaos).toBe(false)
    expect(gar.alert.level).toBeLessThan(ALERT_MAX)
  })

  it('stop the runner and the beacon goes dark again; a little later another tries', () => {
    const f = yard([[8, 24]])
    const gar = makeGarrison(f, 1)
    const hidden: Target = { ...inView(), visible: false }
    let first = -1
    for (const e of run(gar, f, inView(), 2.5)) if (e.type === 'runner') first = e.id
    for (let i = 0; i < 20 / DT && first < 0; i++) {
      stepGarrison(gar, f.grid, hidden, DT)
      for (const e of drainEvents(gar)) if (e.type === 'runner') first = e.id
    }
    expect(first).toBeGreaterThanOrEqual(0)
    // On its way, while the other guard still hunts: drop it.
    run(gar, f, hidden, 1.5, (g) => { if (g.beacons[0]!.state === 'lit') throw new Error('lit before it was stopped') })
    killUnit(gar, first, 0, 0)
    expect(gar.beacons[0]!.state).toBe('ready')
    expect(gar.runner).toBe(-1)
    const later = run(gar, f, hidden, RUNNER_RETRY_S + 1)
    expect(later.some(e => e.type === 'runner' && e.id !== first)).toBe(true)
  })

  it('sabotage the beacon it runs for and it gives up', () => {
    const f = yard([[8, 24]])
    const gar = makeGarrison(f, 1)
    const hidden: Target = { ...inView(), visible: false }
    run(gar, f, inView(), 2.5)
    run(gar, f, hidden, 1)
    expect(gar.runner).toBeGreaterThanOrEqual(0)
    expect(sabotageBeacon(gar, 0)).toBe(true)
    run(gar, f, hidden, BEACON_LIGHT_S + 8)
    expect(gar.alert.chaos).toBe(false)
    expect(gar.beacons[0]!.state).toBe('sabotaged')
  })
})

describe('a light has no voice', () => {
  it('a drone that is sure calls the nearest guard, who shouts', () => {
    const b = new FortressBuilder('t', 32, 32)
    b.ground(0, 0, 31, 31)
    b.insert(1, 1).extract(30, 30)
    b.drone([[10, 10], [10, 11]], 6).guard([[14, 12]], 0).beacon(20, 20)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const drone = gar.units[0]!
    // Right under its light, standing.
    const t: Target = { x: drone.x + Math.sin(drone.yaw) * 3, y: 0, z: drone.z + Math.cos(drone.yaw) * 3, height: 2.6, crouched: false, visible: true }
    const events = run(gar, f, t, 4)
    expect(events.some(e => e.type === 'ping' && e.id === 0 && e.guard === 1)).toBe(true)
    expect(gar.units[1]!.state).toBe('combat')
  })
})

describe('a fortress with no beacons', () => {
  it('keeps the old rule: a second witness puts the base on full alert', () => {
    const f = yard([])
    const gar = makeGarrison(f, 1)
    run(gar, f, inView(), 12)
    expect(gar.alert.chaos).toBe(true)
  })
})
