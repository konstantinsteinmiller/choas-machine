// #108: a body falling is heard. A guard taken down silently (no round, no
// shout) still hits the ground: whoever is within earshot turns to it and
// comes to look; further off, nobody. On the training drill heads turn only.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import { BODY_THUD_M, killUnit, makeGarrison, stepGarrison, type Target } from '@/game/sim/garrison'

const setup = (drill = false) => {
  const b = new FortressBuilder('t', 50, 50)
  b.ground(0, 0, 49, 49).insert(1, 1).extract(48, 48)
  // The victim, a neighbour a couple of cells off facing away, one far off.
  b.guard([[20, 20]], 0).guard([[22, 20]], Math.PI).guard([[20, 30]], 0)
  const f = b.build()
  const gar = makeGarrison(f, 1)
  gar.drill = drill
  const t: Target = { x: cellMid(2), y: 0, z: cellMid(2), height: 2.6, crouched: true, visible: false }
  return { f, gar, t }
}

describe('a body falling is heard (#108)', () => {
  it('the neighbour turns to the body and comes to look; the far one does not hear it', () => {
    const { f, gar, t } = setup()
    const [v, near, far] = gar.units
    expect(Math.hypot(near!.x - v!.x, near!.z - v!.z)).toBeLessThan(BODY_THUD_M)
    expect(Math.hypot(far!.x - v!.x, far!.z - v!.z)).toBeGreaterThan(BODY_THUD_M)
    killUnit(gar, v!.id, v!.x, v!.z, 'blade')
    // Just after the thud: the near one has heard it, the far one has not.
    for (let k = 0; k < 25; k++) stepGarrison(gar, f.grid, t, 1 / 30)
    expect(near!.state).not.toBe('patrol')
    expect(near!.detect).toBeGreaterThan(0.3)
    expect(far!.state).toBe('patrol')
    // And once the near one has found the body, it calls the other over.
    for (let k = 0; k < 40; k++) stepGarrison(gar, f.grid, t, 1 / 30)
    expect(far!.state).not.toBe('patrol')
  })

  it('on the training drill the neighbour only turns its head', () => {
    const { f, gar, t } = setup(true)
    const [v, near] = gar.units
    killUnit(gar, v!.id, v!.x, v!.z, 'blade')
    for (let k = 0; k < 30; k++) stepGarrison(gar, f.grid, t, 1 / 30)
    expect(near!.state).toBe('patrol')
  })
})

describe('a round by a guard is always noticed, and the ones beside it come too (#110)', () => {
  it('on the training drill as in a raid: the near one hears it, the one beside it joins the search toward the shot', async () => {
    const { estimateShot, shotPassed, IMPACT_M, SHOT_NOTIFY_M } = await import('@/game/sim/garrison')
    for (const drill of [false, true]) {
      const b = new FortressBuilder('t', 50, 50)
      b.ground(0, 0, 49, 49).insert(1, 1).extract(48, 48)
      // The round lands by the first; the second stands a few metres on, past the impact's reach.
      b.guard([[20, 20]], 0).guard([[23, 20]], 0).guard([[40, 40]], 0)
      const f = b.build()
      const gar = makeGarrison(f, 1)
      gar.drill = drill
      const [a, c, far] = gar.units
      const dist = Math.hypot(c!.x - a!.x, c!.z - a!.z)
      expect(dist).toBeGreaterThan(IMPACT_M - 1)
      expect(dist).toBeLessThan(SHOT_NOTIFY_M + 0.1)
      const from = estimateShot(gar, cellMid(2), 2, cellMid(2), a!.x, a!.z)
      shotPassed(gar, { x: cellMid(2), y: 0, z: cellMid(2), height: 2.6, crouched: true, visible: false }, from, cellMid(2), 2, cellMid(2), a!.x - 1.5, 1.5, a!.z, 1.5, 4)
      expect(a!.state, `drill ${drill}`).toBe('suspicious')
      expect(c!.state, `drill ${drill}`).toBe('suspicious')
      expect(far!.state).toBe('patrol')
      // They look toward where the round came from.
      expect(Math.hypot(a!.seenX - from.x, a!.seenZ - from.z)).toBeLessThan(1e-6)
    }
  })
})

describe('footsteps (#116)', () => {
  it('walking close by is heard: each step raises the guard\'s attention, a few and it comes to look; further off, nothing', async () => {
    const { stepHeard, WALK_EARSHOT, SUSPECT_AT } = await import('@/game/sim/garrison')
    const b = new FortressBuilder('t', 40, 40)
    b.ground(0, 0, 39, 39).insert(1, 1).extract(38, 38)
    b.guard([[20, 20]], 0).guard([[30, 30]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const [near, far] = gar.units
    const x = near!.x + WALK_EARSHOT - 1
    stepHeard(gar, x, near!.z)
    expect(near!.detect).toBeGreaterThan(0)
    expect(near!.detect).toBeLessThan(SUSPECT_AT)
    expect(near!.state).toBe('patrol')
    for (let k = 0; k < 6; k++) stepHeard(gar, x, near!.z)
    expect(near!.state).toBe('suspicious')
    expect(far!.detect).toBe(0)
  })
})

describe('the alarm ends with the last defender (jam build)', () => {
  it('everyone down: the full alert is over at once, the meter empty, a stand-down', async () => {
    const { stepGarrison, killUnit } = await import('@/game/sim/garrison')
    const b = new FortressBuilder('t', 40, 40)
    b.ground(0, 0, 39, 39).insert(1, 1).extract(38, 38)
    b.guard([[20, 20]], 0).guard([[30, 30]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    gar.alert.chaos = true
    gar.alert.level = 3
    // Seen a moment ago: the alert is hot, not one going cold.
    gar.lkp = { x: 2, y: 0, z: 2, t: 0 }
    const target = { x: 2, y: 0, z: 2, visible: false } as Parameters<typeof stepGarrison>[2]
    stepGarrison(gar, f.grid, target, 0.1)
    expect(gar.alert.chaos).toBe(true)
    for (const u of gar.units) killUnit(gar, u.id, u.x, u.z, 'blade')
    gar.events.length = 0
    stepGarrison(gar, f.grid, target, 0.1)
    expect(gar.alert.chaos).toBe(false)
    expect(gar.alert.level).toBe(0)
    expect(gar.events.some(e => e.type === 'standDown')).toBe(true)
  })
})

describe('the rope assassination (jam build)', () => {
  it('offers the person or walking machine below the rope, within reach; not one too far out, not a drone', async () => {
    const { findRopeStrike, ROPE_STRIKE_REACH } = await import('@/game/sim/melee')
    const b = new FortressBuilder('t', 40, 40)
    b.ground(0, 0, 39, 39).insert(1, 1).extract(38, 38)
    b.guard([[20, 20]], 0).guard([[30, 30]], 0).drone([[20, 22], [22, 22]], 8)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const [near] = gar.units
    const o = findRopeStrike(gar, f.grid, near!.x + 1, near!.y + 5, near!.z, Math.PI / 2)
    expect(o).toEqual({ id: near!.id, kind: 'air' })
    expect(findRopeStrike(gar, f.grid, near!.x + ROPE_STRIKE_REACH + 1, near!.y + 5, near!.z, 0)).toBeNull()
    // Level with it: no drop to make.
    expect(findRopeStrike(gar, f.grid, near!.x + 1, near!.y + 0.5, near!.z, 0)).toBeNull()
  })
})

describe('nobody walks through anybody (#131)', () => {
  it('two guards on head-on rounds pass each other, never closer than their bodies allow', async () => {
    const { stepGarrison, SPECS } = await import('@/game/sim/garrison')
    const b = new FortressBuilder('t', 40, 20)
    b.ground(0, 0, 39, 19).insert(1, 1).extract(38, 18)
    b.guard([[5, 10], [30, 10]], 0).guard([[30, 10], [5, 10]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const target = { x: 2, y: 0, z: 2, visible: false } as Parameters<typeof stepGarrison>[2]
    const [a, c] = gar.units
    let closest = Infinity
    for (let i = 0; i < 60 * 40; i++) {
      stepGarrison(gar, f.grid, target, 1 / 60)
      closest = Math.min(closest, Math.hypot(a!.x - c!.x, a!.z - c!.z))
    }
    expect(closest).toBeGreaterThan(SPECS.guard.radius * 2 - 0.05)
  })
})
