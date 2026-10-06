// Round 5 (#142): the Airship. It circles the fortress high over the walls,
// slows with every engine lost and comes down when all four are; its engines
// and hull are armour, only a blast hurts an engine; its turrets fire bursts
// and its pods rockets only on full alert. Every round and rocket leaves from a
// socket that sits at a barrel's or a tube's own mouth.

import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { AIRSHIP_SOCKETS, buildAirship } from '@/game/models/airship'
import {
  BURST, ENGINE_HP, ROCKET_EVERY, SHIP_ROCKET_SPEED, blastAirship, enginesUp, flying, hitTurret, launchRocket, makeAirship,
  stepAirship, stepGuns, stepShipRockets, type ShipRocket
} from '@/game/sim/airship'
import { FortressBuilder } from '@/game/world/fortress'
import { CELL } from '@/game/world/grid'

const field = (): ReturnType<FortressBuilder['build']> => {
  const b = new FortressBuilder('t', 40, 40)
  b.ground(0, 0, 39, 39).fill(18, 18, 21, 21, 12).insert(1, 1).extract(38, 38).airship()
  return b.build()
}

describe('the Airship flies (#142)', () => {
  it('a fortress can carry it', () => {
    expect(field().airship).toBe(true)
  })

  it('circles high over the highest point, along its loop', () => {
    const f = field()
    const a = makeAirship(f.grid)
    expect(a.y).toBeGreaterThan(12 + 10)
    const x0 = a.x
    const z0 = a.z
    for (let i = 0; i < 300; i++) stepAirship(a, 1 / 30)
    expect(Math.hypot(a.x - x0, a.z - z0)).toBeGreaterThan(30)
    expect(Math.hypot(a.x - a.cx, a.z - a.cz)).toBeCloseTo(a.r, 3)
    expect(a.cx).toBeCloseTo(20 * CELL)
  })

  it('slows with each engine lost, and comes down and is gone with all four', () => {
    const f = field()
    const a = makeAirship(f.grid)
    const t0 = a.t
    stepAirship(a, 1)
    const full = a.t - t0
    a.engines[0] = 0
    a.engines[1] = 0
    const t1 = a.t
    stepAirship(a, 1)
    expect(a.t - t1).toBeLessThan(full)
    a.engines[2] = 0
    a.engines[3] = 1
    blastAirship(a, [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], 0, 0, 0, 5, 400)
    expect(enginesUp(a)).toBe(0)
    expect(flying(a)).toBe(false)
    for (let i = 0; i < 30 * 12; i++) stepAirship(a, 1 / 30)
    expect(a.gone).toBe(true)
  })
})

describe('what hurts it (#142)', () => {
  it('a blast takes an engine near it; one far off is untouched', () => {
    const a = makeAirship(field().grid)
    const at = [{ x: 0, y: 30, z: 0 }, { x: 50, y: 30, z: 0 }, { x: 0, y: 30, z: 50 }, { x: 50, y: 30, z: 50 }]
    blastAirship(a, at, 0, 30, 1.5, 5.5, 400)
    expect(a.engines[0]).toBeLessThan(ENGINE_HP)
    expect(a.engines[1]).toBe(ENGINE_HP)
    blastAirship(a, at, 0, 30, 0.5, 5.5, 400)
    expect(a.engines[0]).toBe(0)
    expect(flying(a)).toBe(true)
  })

  it('a turret is knocked out by rounds', () => {
    const a = makeAirship(field().grid)
    let out = false
    for (let i = 0; i < 10 && !out; i++) out = hitTurret(a, 'F', 34)
    expect(out).toBe(true)
    expect(a.turrets.F).toBe(0)
    expect(hitTurret(a, 'F', 34)).toBe(false)
  })
})

describe('its guns (#142)', () => {
  it('are quiet on a quiet base', () => {
    const a = makeAirship(field().grid)
    for (let t = 0; t < 10; t += 1 / 30) {
      const g = stepGuns(a, false, { F: true, B: true }, true, 1 / 30)
      expect(g.rounds).toEqual([])
      expect(g.rocket).toBe(-1)
    }
  })

  it('on full alert: bursts from each turret, barrel by barrel; a rocket now and then, tube by tube', () => {
    const a = makeAirship(field().grid)
    const rounds: Array<{ id: string; barrel: number }> = []
    const tubes: number[] = []
    for (let t = 0; t < ROCKET_EVERY * 2 + 0.1; t += 1 / 30) {
      const g = stepGuns(a, true, { F: true, B: false }, true, 1 / 30)
      rounds.push(...g.rounds)
      if (g.rocket >= 0) tubes.push(g.rocket)
    }
    expect(rounds.length).toBeGreaterThanOrEqual(BURST * 2)
    expect(rounds.every(r => r.id === 'F')).toBe(true)
    expect(rounds[0]!.barrel).not.toBe(rounds[1]!.barrel)
    expect(tubes).toEqual([0, 1])
  })

  it('its rocket flies to where it was aimed, at its speed, and arrives there', () => {
    const list: ShipRocket[] = []
    const r = launchRocket(list, 0, 30, 0, 24, 0, 0)
    expect(Math.hypot(r.vx, r.vy, r.vz)).toBeCloseTo(SHIP_ROCKET_SPEED)
    let arrived: ShipRocket[] = []
    for (let t = 0; t < 5 && arrived.length === 0; t += 1 / 60) arrived = stepShipRockets(list, 1 / 60)
    expect(arrived).toHaveLength(1)
    expect(Math.hypot(arrived[0]!.x - 24, arrived[0]!.y, arrived[0]!.z)).toBeLessThan(0.5)
  })
})

describe('every round and rocket leaves from a mouth (#142)', () => {
  const rig = buildAirship()
  rig.root.updateMatrixWorld(true)
  const names = rig.mesh.skeleton.bones.map(b => b.name)
  for (const [name, list] of Object.entries(AIRSHIP_SOCKETS)) {
    it(`${name}: each socket sits at the open end of a barrel or a tube on its bone`, () => {
      for (const [bone, x, y, z] of list) {
        const at = rig.bones[bone]!.localToWorld(new Vector3(x, y, z))
        const parts = rig.parts.filter(p => names[p.bone] === bone).map(p => new Box3().setFromBufferAttribute(p.geo.attributes.position as never))
        // A part of that bone round the socket, whose far end (+z, the way it fires) is the socket's.
        const mouth = parts.some(b => b.clone().expandByScalar(0.06).containsPoint(at) && Math.abs(b.max.z - at.z) < 0.12)
        expect(mouth, `${name} ${bone} (${x}, ${y}, ${z})`).toBe(true)
      }
    })
  }
})
