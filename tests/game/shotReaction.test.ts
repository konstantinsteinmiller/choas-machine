// A playtester's minigun hit a guard up on a tower: it never turned to where
// the rounds came from, and never told its teammates. A defender that is
// shot and lives turns to the shooter, takes it in, and shouts (a machine
// calls it in); on the training drill it still turns and goes to look.

import { describe, expect, it } from 'vitest'
import { FortressBuilder, type Fortress } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import { angleDelta } from '@/game/sim/player'
import {
  REACT_S, alarmUnit, drainEvents, headingTo, makeGarrison, stepGarrison, type Garrison, type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { MECH_HEIGHT } from '@/game/models/mech'

const DT = 1 / 30

/** A guard up on a 6 m tower at (10, 10) looking along +z, a mate below it, a beacon; the mech below and behind it. */
const tower = (): { f: Fortress; gar: Garrison; mech: Target } => {
  const b = new FortressBuilder('t', 30, 30)
  b.ground(0, 0, 29, 29).insert(1, 1).extract(28, 28)
  b.fill(9, 9, 11, 11, 6)
  b.guard([[10, 10]], 0)
  b.guard([[14, 10]], 0)
  b.beacon(20, 20)
  const f = b.build()
  const gar = makeGarrison(f, 1)
  const mech: Target = { x: cellMid(10), y: 0, z: cellMid(2), height: MECH_HEIGHT, crouched: false, visible: true }
  return { f, gar, mech }
}

const run = (gar: Garrison, f: Fortress, t: Target, s: number): GarrisonEvent[] => {
  const all: GarrisonEvent[] = []
  for (let k = 0; k < s / DT; k++) {
    stepGarrison(gar, f.grid, t, DT)
    all.push(...drainEvents(gar))
  }
  return all
}

describe('a defender that is shot and lives', () => {
  it('turns from its watch to where the rounds came from, sees the mech, and shouts to its mates', () => {
    const { f, gar, mech } = tower()
    const g = gar.units[0]!
    expect(g.y).toBeGreaterThan(5)
    // Facing away from the mech.
    expect(Math.abs(angleDelta(g.yaw, headingTo(g.x, g.z, mech.x, mech.z)))).toBeGreaterThan(2.5)
    alarmUnit(gar, g.id, mech.x, mech.z)
    const ev = run(gar, f, mech, REACT_S + 2)
    expect(g.state).toBe('combat')
    expect(Math.abs(angleDelta(g.yaw, headingTo(g.x, g.z, mech.x, mech.z)))).toBeLessThan(0.4)
    expect(g.sees).toBe(true)
    expect(ev.some(e => e.type === 'shout' && e.id === g.id)).toBe(true)
    // The mate beside the tower heard it and is in the fight.
    expect(gar.units[1]!.state).toBe('combat')
  })

  it('one already fighting turns to a new shot from behind it', () => {
    const { f, gar, mech } = tower()
    const g = gar.units[0]!
    alarmUnit(gar, g.id, mech.x, mech.z)
    run(gar, f, mech, 2)
    // The mech is round the other side now, and fires again.
    const back: Target = { ...mech, z: cellMid(18) }
    alarmUnit(gar, g.id, back.x, back.z)
    run(gar, f, back, 1.5)
    expect(Math.abs(angleDelta(g.yaw, headingTo(g.x, g.z, back.x, back.z)))).toBeLessThan(0.4)
  })

  it('on the training drill there is no alarm, but it turns to the shooter and goes to look', () => {
    const { f, gar, mech } = tower()
    gar.drill = true
    const g = gar.units[0]!
    alarmUnit(gar, g.id, mech.x, mech.z)
    expect(g.state).toBe('suspicious')
    expect(g.seenX).toBe(mech.x)
    expect(g.seenZ).toBe(mech.z)
    expect(gar.alert.chaos).toBe(false)
    const ev = run(gar, f, { ...mech, visible: false }, 1)
    expect(ev.some(e => e.type === 'shout')).toBe(false)
  })
})
