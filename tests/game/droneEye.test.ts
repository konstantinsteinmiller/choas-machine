// #37 (R12): only the drone's eye kills it; a round in the shell makes it wary.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { makeGarrison, drainEvents, startleUnit, type Unit } from '@/game/sim/garrison'
import { castShot, makeShotHit, DRONE_EYE } from '@/game/sim/hitscan'
import { BASE_DAMAGE, DRONE_SHELL, shotDamage } from '@/game/sim/damage'

const yard = (): FortressBuilder => {
  const b = new FortressBuilder('test', 24, 24)
  b.ground(0, 0, 23, 23)
  b.insert(1, 1).extract(22, 22)
  return b
}

describe('the drone\'s eye', () => {
  const f = yard().drone([[12, 10], [12, 11]], 6).build()
  const gar = makeGarrison(f)
  const drone = gar.units[0]!
  const out = makeShotHit()
  /** Shoot from (x, y, z) at a point. */
  const at = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
    const d = Math.hypot(tx - x, ty - y, tz - z)
    return castShot(f.grid, gar.units, x, y, z, (tx - x) / d, (ty - y) / d, (tz - z) / d, 100, out)
  }
  /** Where its eye is in the world. */
  const eye = (u: Unit): { x: number; y: number; z: number } => ({
    x: u.x + Math.sin(u.yaw) * DRONE_EYE.z, y: u.y + DRONE_EYE.y, z: u.z + Math.cos(u.yaw) * DRONE_EYE.z
  })
  /** A point `dist` metres in front of it (or behind, negative), level with it. */
  const ahead = (u: Unit, dist: number, up = 0): [number, number, number] =>
    [u.x + Math.sin(u.yaw) * dist, u.y + up, u.z + Math.cos(u.yaw) * dist]

  it('a round at its eye from in front is a weak-point hit; one at its shell is not', () => {
    const e = eye(drone)
    expect(at(...ahead(drone, 15, 1), e.x, e.y, e.z).zone).toBe('weak')
    // At the top of the shell, from the same place.
    expect(at(...ahead(drone, 15, 1), drone.x, drone.y + 0.4, drone.z).zone).toBe('body')
  })

  it('from behind, the eye cannot be reached through the shell', () => {
    const e = eye(drone)
    const h = at(...ahead(drone, -15, 0.5), e.x, e.y, e.z)
    expect(h.kind).toBe('unit')
    expect(h.zone).toBe('body')
  })

  it('a sniper round in the eye kills it; in the shell it takes a third of one, so it flies on', () => {
    expect(shotDamage('sniper', 'drone', 'weak')).toBeGreaterThan(1000)
    const shell = shotDamage('sniper', 'drone', 'body')
    expect(shell).toBeCloseTo(BASE_DAMAGE.sniper * DRONE_SHELL)
    expect(shell).toBeLessThan(drone.hp)
    // Two in the shell bring it down.
    expect(shell * 2).toBeGreaterThanOrEqual(drone.hp)
    // A lamp is still put out by any round.
    expect(shotDamage('sniper', 'searchlight', 'body')).toBeGreaterThan(1000)
  })

  it('hit in the shell, it goes to look where the round came from, without raising the alarm', () => {
    const g = makeGarrison(f)
    const u = g.units[0]!
    const before = g.alert.level
    startleUnit(g, u.id, 3, 3)
    expect(u.state).toBe('suspicious')
    expect([u.seenX, u.seenZ]).toEqual([3, 3])
    expect(g.alert.level).toBe(before)
    expect(drainEvents(g).some(e => e.type === 'suspicious' && e.id === u.id)).toBe(true)
    // Hit again while it is wary: now it knows.
    startleUnit(g, u.id, 3, 3)
    expect(u.state).toBe('combat')
    expect(g.alert.level).toBeGreaterThan(before)
  })
})
