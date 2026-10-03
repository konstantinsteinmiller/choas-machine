// #38 (R13): bodies are found, and the mech has a box to hide under.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  BOX_BUMP, CHECKIN_JITTER_S, CHECKIN_S, drainEvents, killUnit, makeGarrison, stepGarrison, SUSPECT_AT,
  type Garrison, type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { BOX_SPEED, makePlayer, stepPlayer, type Wish } from '@/game/sim/player'

const DT = 1 / 30
const yard = (): FortressBuilder => {
  const b = new FortressBuilder('test', 32, 32)
  b.ground(0, 0, 31, 31)
  b.insert(1, 1).extract(30, 30)
  return b
}
/** Somewhere far off and out of sight: the mech is not part of this. */
const away = (): Target => ({ x: cellMid(1), y: 0, z: cellMid(1), height: 2.6, crouched: true, visible: false })
const run = (gar: Garrison, f: { grid: Parameters<typeof stepGarrison>[1] }, t: Target, seconds: number): GarrisonEvent[] => {
  const out: GarrisonEvent[] = []
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepGarrison(gar, f.grid, t, DT)
    out.push(...drainEvents(gar))
  }
  return out
}

describe('the missed check-in', () => {
  // Two guards: one that will be shot on a quiet corner, one walking a
  // beat on the far side that never passes it.
  const fortress = () => yard()
    .guard([[4, 26], [6, 26]], 0)
    .guard([[24, 6], [28, 6]], 0)
    .build()

  it('a body on a quiet corner is not found by chance: the beat never goes near it', () => {
    const f = fortress()
    const gar = makeGarrison(f)
    killUnit(gar, 0, cellMid(4), cellMid(20), 'shot')
    const events = run(gar, f, away(), CHECKIN_S - 2)
    expect(events.some(e => e.type === 'body')).toBe(false)
    expect(gar.units[1]!.state).toBe('patrol')
  })

  it('when the radio has been quiet long enough, the other guard goes to see, and finds it', () => {
    const f = fortress()
    const gar = makeGarrison(f)
    killUnit(gar, 0, cellMid(4), cellMid(20), 'shot')
    const events = run(gar, f, away(), CHECKIN_S + CHECKIN_JITTER_S + 1)
    expect(events.some(e => e.type === 'checkin' && e.id === 1 && e.corpse === 0)).toBe(true)
    // It walks over (some 30 m) and sees what is there: the alarm goes up.
    let found = -1
    for (let i = 0; i < Math.round(40 / DT) && found < 0; i++) {
      stepGarrison(gar, f.grid, away(), DT)
      if (drainEvents(gar).some(e => e.type === 'body' && e.corpse === 0)) found = gar.alert.level
    }
    expect(found).toBeGreaterThan(0)
  })

  it('a body found before its check-in is not checked again; nobody left walking, nobody checks', () => {
    const f = yard().guard([[4, 26], [6, 26]], 0).build()
    const gar = makeGarrison(f)
    killUnit(gar, 0, cellMid(4), cellMid(20), 'shot')
    const events = run(gar, f, away(), CHECKIN_S + CHECKIN_JITTER_S + 1)
    expect(events.some(e => e.type === 'checkin')).toBe(false)
    expect(gar.units[0]!.checked).toBe(true)
  })
})

describe('the hide box, as the guards see it', () => {
  // A guard posted at the middle, looking straight down +z at the mech 10 m off.
  const fortress = () => yard().guard([[16, 10]], 0).build()
  const mech = (box: Target['box'], dz = 10): Target => ({
    x: cellMid(16), y: 0, z: cellMid(10) + dz, height: 1.7, crouched: true, visible: true, box
  })

  it('a crouched mech in the open is seen', () => {
    const f = fortress()
    const gar = makeGarrison(f)
    run(gar, f, mech(undefined), 6)
    expect(gar.units[0]!.detect).toBeGreaterThan(SUSPECT_AT)
  })

  it('a box standing still is a box', () => {
    const f = fortress()
    const gar = makeGarrison(f)
    run(gar, f, mech('still'), 8)
    expect(gar.units[0]!.detect).toBe(0)
    expect(gar.units[0]!.state).toBe('patrol')
  })

  it('a box that creeps is odd: worth a look, never sure from afar', () => {
    const f = fortress()
    const gar = makeGarrison(f)
    // Kept out of the guard's walk so it cannot come up close.
    const t = mech('creep', 12)
    for (let i = 0; i < Math.round(12 / DT); i++) {
      stepGarrison(gar, f.grid, t, DT)
      drainEvents(gar)
      gar.units[0]!.x = cellMid(16)
      gar.units[0]!.z = cellMid(10)
    }
    expect(gar.units[0]!.detect).toBeGreaterThan(0)
    expect(gar.units[0]!.state).not.toBe('combat')
  })

  it('walked into, a box is a mech', () => {
    const f = fortress()
    const gar = makeGarrison(f)
    run(gar, f, mech('still', BOX_BUMP - 0.6), 3)
    expect(gar.units[0]!.state).toBe('combat')
  })
})

describe('the hide box, as the mech wears it', () => {
  const f = yard().build()
  const wish = (over: Partial<Wish> = {}): Wish => ({ mx: 0, mz: 0, crouch: false, box: false, aiming: false, aimYaw: 0, ...over })

  it('comes down over a crouched mech, slows it to a creep, and comes off again', () => {
    const p = makePlayer(cellMid(10), 0, cellMid(10), 0)
    stepPlayer(p, f.grid, wish({ box: true }), DT)
    expect(p.boxed).toBe(true)
    expect(p.crouched).toBe(true)
    for (let i = 0; i < 60; i++) stepPlayer(p, f.grid, wish({ mz: 1 }), DT)
    expect(p.box).toBeGreaterThan(0.95)
    expect(Math.hypot(p.vx, p.vz)).toBeLessThanOrEqual(BOX_SPEED + 1e-6)
    stepPlayer(p, f.grid, wish({ box: true }), DT)
    expect(p.boxed).toBe(false)
  })

  it('raising the weapon or breaking into a run throws it off', () => {
    const p = makePlayer(cellMid(10), 0, cellMid(10), 0)
    stepPlayer(p, f.grid, wish({ box: true }), DT)
    stepPlayer(p, f.grid, wish({ aiming: true }), DT)
    expect(p.boxed).toBe(false)
    stepPlayer(p, f.grid, wish({ box: true }), DT)
    stepPlayer(p, f.grid, wish({ mz: 1, sprint: true }), DT)
    expect(p.boxed).toBe(false)
  })
})
