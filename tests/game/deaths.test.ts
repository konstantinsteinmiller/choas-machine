// Round 2, R3: how defenders (and the mech) go down, and what stays behind.

import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  buildGuard, poseGuard, restGuardPose, DEATH_SECONDS, buildEnforcer, poseEnforcer, buildDrone, poseDrone,
  type HumanDeath
} from '@/game/models/garrison'
import { buildMech, poseMech, restPose, MECH_DOWN_S } from '@/game/models/mech'
import { FortressBuilder } from '@/game/world/fortress'
import { makeGrid, cellMid, heightAt, type Grid } from '@/game/world/grid'
import { makeGarrison, killUnit, drainEvents, stepGarrison, BURST_CHANCE, type Garrison, type Target } from '@/game/sim/garrison'
import { Wreckage, seedWreckage, WRECK_CAPACITY } from '@/game/fx/wreckage'
import type { Rig } from '@/game/models/kit'

const snapshot = (rig: Rig): number[] => Object.values(rig.bones).flatMap(b => [...b.position.toArray(), ...b.quaternion.toArray()])
const finite = (rig: Rig): boolean => snapshot(rig).every(Number.isFinite)
const worldY = (rig: Rig, bone: string): number => {
  rig.root.updateMatrixWorld(true)
  return rig.bones[bone]!.getWorldPosition(new Vector3()).y
}

describe('a guard\'s fall', () => {
  const KINDS: HumanDeath[] = ['back', 'front', 'spin', 'thrown']

  it.each(KINDS)('%s: ends lying on the ground, and then never moves again', (death) => {
    const rig = buildGuard()
    const at = (t: number): number[] => { poseGuard(rig, { ...restGuardPose(), deadT: t, death, time: t }); return snapshot(rig) }
    const done = at(DEATH_SECONDS[death])
    expect(finite(rig)).toBe(true)
    // Lying: hips and head both near the floor.
    expect(worldY(rig, 'hips')).toBeLessThan(0.3)
    expect(worldY(rig, 'hips')).toBeGreaterThan(0.05)
    expect(worldY(rig, 'head')).toBeLessThan(0.55)
    const later = at(DEATH_SECONDS[death] + 30)
    later.forEach((v, i) => expect(v).toBeCloseTo(done[i]!, 5))
  })

  it.each(KINDS)('%s: the body is never under the floor on the way down', (death) => {
    const rig = buildGuard()
    for (let t = 0.01; t < DEATH_SECONDS[death] + 0.2; t += 0.03) {
      poseGuard(rig, { ...restGuardPose(), deadT: t, death })
      expect(worldY(rig, 'hips'), `${death} at ${t.toFixed(2)}`).toBeGreaterThan(0.05)
    }
  })

  it('the four falls are four different falls', () => {
    const at = (death: HumanDeath): number[] => {
      const rig = buildGuard()
      poseGuard(rig, { ...restGuardPose(), deadT: 0.45, death })
      return snapshot(rig)
    }
    const all = KINDS.map(at)
    for (let a = 0; a < all.length; a++) {
      for (let b = a + 1; b < all.length; b++) {
        const diff = all[a]!.reduce((s, v, i) => s + Math.abs(v - all[b]![i]!), 0)
        expect(diff, `${KINDS[a]} vs ${KINDS[b]}`).toBeGreaterThan(0.5)
      }
    }
  })

  it('a blast throws it: up off the ground first, and away', () => {
    const rig = buildGuard()
    poseGuard(rig, { ...restGuardPose(), deadT: 0.35, death: 'thrown' })
    expect(worldY(rig, 'hips')).toBeGreaterThan(1.3)
    poseGuard(rig, { ...restGuardPose(), deadT: DEATH_SECONDS.thrown, death: 'thrown' })
    rig.root.updateMatrixWorld(true)
    expect(Math.abs(rig.bones.hips!.getWorldPosition(new Vector3()).z)).toBeGreaterThan(1.5)
  })

  it('starts from whatever the guard was doing: no jump on the first frame', () => {
    const rig = buildGuard()
    const live = { ...restGuardPose(), stride: 1.3, speed: 0.42, aim: 1 }
    poseGuard(rig, live)
    const before = snapshot(rig)
    poseGuard(rig, { ...live, deadT: 0.004, death: 'back' })
    const after = snapshot(rig)
    const jump = Math.max(...before.map((v, i) => Math.abs(v - after[i]!)))
    expect(jump).toBeLessThan(0.05)
  })
})

describe('machines', () => {
  it('an Enforcer wrecked in one piece topples forward and its lights go out', () => {
    const rig = buildEnforcer()
    const base = { time: 0, stride: 0, speed: 0, power: 1, aimYaw: 0, aimPitch: 0, recoilL: 0, recoilR: 0 }
    poseEnforcer(rig, { ...base, deadT: 0 })
    const up = worldY(rig, 'head')
    const lit = rig.glowMaterial.color.r
    poseEnforcer(rig, { ...base, deadT: 2 })
    expect(worldY(rig, 'head')).toBeLessThan(up - 1.2)
    expect(rig.glowMaterial.color.r).toBeLessThan(lit * 0.2)
    expect(finite(rig)).toBe(true)
  })

  it('a drone tumbles while it falls and lies still once it has landed', () => {
    const rig = buildDrone()
    const base = { time: 1, spin: 1, pitch: 0, roll: 0, eyeYaw: 0, eyePitch: 0, alarm: 0 }
    poseDrone(rig, { ...base, deadT: 0.2, landed: false })
    const a = rig.bones.body!.quaternion.clone()
    poseDrone(rig, { ...base, deadT: 0.4, landed: false })
    expect(rig.bones.body!.quaternion.angleTo(a)).toBeGreaterThan(0.3)
    poseDrone(rig, { ...base, deadT: 1.5, landed: true })
    const c = rig.bones.body!.quaternion.clone()
    poseDrone(rig, { ...base, deadT: 9, landed: true })
    expect(rig.bones.body!.quaternion.angleTo(c)).toBeLessThan(1e-6)
  })
})

describe('how each one goes down is decided by what hit it', () => {
  const base = (): { gar: Garrison; grid: Grid } => {
    const b = new FortressBuilder('t', 40, 40)
    b.ground(0, 0, 39, 39)
    b.insert(2, 2, 0)
    b.extract(37, 37)
    for (let i = 0; i < 4; i++) b.sentry(6 + i * 3, 10, 0)
    for (let i = 0; i < 12; i++) b.drone([[4 + i * 2, 20], [4 + i * 2, 24]])
    for (let i = 0; i < 12; i++) b.enforcer(4 + i * 2, 30, 0)
    b.goliath(20, 35, 0)
    const f = b.build()
    return { gar: makeGarrison(f), grid: f.grid }
  }

  it('people: a round from the front, from behind, a burst, a blast, the blade', () => {
    const { gar } = base()
    const [a, b2, c, d] = gar.units
    // Sentries face +z (yaw 0): "in front" is a larger z.
    killUnit(gar, a!.id, a!.x, a!.z + 10, 'shot')
    killUnit(gar, b2!.id, b2!.x, b2!.z - 10, 'shot')
    killUnit(gar, c!.id, c!.x, c!.z + 10, 'spray')
    killUnit(gar, d!.id, d!.x + 3, d!.z, 'blast')
    expect([a!.death, b2!.death, c!.death, d!.death]).toEqual(['back', 'front', 'spin', 'thrown'])
    const { gar: g2 } = base()
    killUnit(g2, 0, g2.units[0]!.x, g2.units[0]!.z + 1, 'blade')
    expect(g2.units[0]!.death).toBe('front')
    expect(drainEvents(gar).filter(e => e.type === 'kill').map(e => (e as { death: string }).death)).toEqual(['back', 'front', 'spin', 'thrown'])
  })

  it('machines: the Goliath always bursts, a blast always bursts, the rest burst most of the time', () => {
    const { gar } = base()
    const drones = gar.units.filter(u => u.kind === 'drone')
    const enforcers = gar.units.filter(u => u.kind === 'enforcer')
    const goliath = gar.units.find(u => u.kind === 'goliath')!
    for (const u of [...drones, ...enforcers]) killUnit(gar, u.id, u.x, u.z + 5, 'shot')
    killUnit(gar, goliath.id, goliath.x, goliath.z - 5, 'shot')
    expect(goliath.death).toBe('burst')
    const burst = [...drones, ...enforcers].filter(u => u.death === 'burst').length
    // 24 machines at 60 %: some of each outcome, whatever their seeds are.
    expect(burst).toBeGreaterThan(24 * BURST_CHANCE * 0.5)
    expect(burst).toBeLessThan(24)
    expect(drones.every(u => u.death === 'burst' || u.death === 'crash')).toBe(true)
    expect(enforcers.every(u => u.death === 'burst' || u.death === 'slump')).toBe(true)

    const { gar: g2 } = base()
    for (const u of g2.units.filter(x => x.kind !== 'sentry')) killUnit(g2, u.id, u.x + 1, u.z, 'blast')
    expect(g2.units.filter(x => x.kind !== 'sentry').every(u => u.death === 'burst')).toBe(true)
  })

  it('the same machine dies the same way every time', () => {
    const a = base().gar
    const b = base().gar
    for (const g of [a, b]) for (const u of g.units) killUnit(g, u.id, u.x, u.z + 5, 'shot')
    expect(a.units.map(u => u.death)).toEqual(b.units.map(u => u.death))
  })

  it('a drone shot down is noticed as a light gone out: somebody goes to look, the base is not raised (R22)', () => {
    const b = new FortressBuilder('t', 30, 30)
    b.ground(0, 0, 29, 29)
    b.insert(2, 2, 0)
    b.extract(27, 27)
    b.sentry(10, 5, 0)
    b.drone([[10, 9], [10, 10]])
    const f = b.build()
    const gar = makeGarrison(f)
    const drone = gar.units[1]!
    expect(drone.kind).toBe('drone')
    killUnit(gar, drone.id, drone.x, drone.z + 20, 'shot')
    expect(drone.found).toBe(false)
    const away: Target = { x: cellMid(2), y: 0, z: cellMid(2), feetY: 0, height: 2.5, crouched: false, visible: false } as Target
    const events = []
    for (let i = 0; i < 60 * 12; i++) { stepGarrison(gar, f.grid, away, 1 / 60); events.push(...drainEvents(gar)) }
    expect(events.filter(e => e.type === 'body')).toHaveLength(0)
    expect(events.filter(e => e.type === 'change')).toHaveLength(1)
    expect(gar.changes[0]!.found).toBe(true)
    expect(gar.alert.chaos).toBe(false)
  })
})

describe('wreckage', () => {
  const yard = (): Grid => {
    const g = makeGrid(20, 20)
    g.h.fill(0)
    // A block next to where things burst.
    g.h[10 * 20 + 12] = 4
    return g
  }
  const spec = { x: 20, y: 1, z: 20, hx: 0.8, hy: 1.2, hz: 0.6, count: 26, size: [0.2, 0.6] as [number, number], colors: ['#fff', '#888'], force: 6.5, dirX: 0, dirZ: 0 }

  it('flies apart, comes to rest on the ground, and stays', () => {
    seedWreckage(7)
    const g = yard()
    const w = new Wreckage(g)
    expect(w.burst(spec)).toBe(26)
    expect(w.count).toBe(26)
    expect(w.awake).toBe(26)
    for (let i = 0; i < 60 * 8; i++) w.update(1 / 60)
    expect(w.awake).toBe(0)
    for (let i = 0; i < w.count; i++) {
      const p = w.at(i)!
      const floor = heightAt(g, p.x, p.z)
      // On the surface under it (the floor, or the top of the block), not in it: a torn plate lies flat (#64).
      expect(p.y).toBeGreaterThan(floor + 0.01)
      expect(p.y).toBeLessThan(floor + 0.45)
      expect(Math.hypot(p.x - 20, p.z - 20)).toBeLessThan(14)
    }
    const before = Array.from({ length: w.count }, (_, i) => ({ ...w.at(i)! }))
    for (let i = 0; i < 60 * 60; i++) w.update(1 / 60)
    expect(w.count).toBe(26)
    for (let i = 0; i < w.count; i++) expect(w.at(i)).toEqual(before[i])
    w.dispose()
  })

  it('spreads out: the pieces are not left in one heap', () => {
    seedWreckage(3)
    const w = new Wreckage(yard())
    w.burst(spec)
    for (let i = 0; i < 60 * 8; i++) w.update(1 / 60)
    const far = Array.from({ length: w.count }, (_, i) => Math.hypot(w.at(i)!.x - 20, w.at(i)!.z - 20))
    expect(Math.max(...far)).toBeGreaterThan(1.5)
    w.dispose()
  })

  it('never grows past its buffer: the oldest pieces give up their place', () => {
    seedWreckage(1)
    const w = new Wreckage(yard())
    for (let k = 0; k < 14; k++) w.burst(spec)
    expect(w.count).toBe(Math.min(WRECK_CAPACITY, w.capacity))
    expect(w.count).toBeLessThanOrEqual(WRECK_CAPACITY)
    for (let i = 0; i < 60 * 10; i++) w.update(1 / 60)
    expect(w.awake).toBe(0)
    w.dispose()
  })
})

describe('the mech goes down', () => {
  it('kneels, then falls forward, lights out, and lies still', () => {
    const rig = buildMech()
    const at = (t: number): number[] => { poseMech(rig, { ...restPose(), crouch: Math.min(1, t / 0.45), down: t, time: t }); return snapshot(rig) }
    poseMech(rig, restPose())
    const standing = worldY(rig, 'head')
    expect(rig.glowMaterial.color.r).toBe(1)
    at(0.4)
    const kneeling = worldY(rig, 'head')
    expect(kneeling).toBeLessThan(standing - 0.5)
    const done = at(MECH_DOWN_S)
    expect(worldY(rig, 'head')).toBeLessThan(kneeling - 0.5)
    expect(rig.glowMaterial.color.r).toBeLessThan(0.2)
    const later = at(MECH_DOWN_S + 20)
    // The idle head sway is all that is left of `time`; nothing else moves.
    const moved = later.filter((v, i) => Math.abs(v - done[i]!) > 0.02).length
    expect(moved).toBe(0)
  })
})
