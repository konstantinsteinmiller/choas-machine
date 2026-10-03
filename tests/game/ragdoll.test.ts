// #64: a fallen person is a ragdoll.
import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid, heightAt } from '@/game/world/grid'
import { J, JOINTS, blastRagdoll, makeRagdoll, nearRay, ragdollAt, stepRagdoll, strike, type Ragdoll } from '@/game/sim/ragdoll'

const DT = 1 / 60
const yard = () => {
  const b = new FortressBuilder('t', 30, 30)
  b.ground(0, 0, 29, 29).insert(1, 1).extract(28, 28)
  b.wall(20, 0, 20, 29)
  return b.build()
}
const run = (r: Ragdoll, g: ReturnType<typeof yard>['grid'], s: number): void => { for (let k = 0; k < s / DT; k++) stepRagdoll(r, g, DT) }
const lowest = (r: Ragdoll): number => { let m = Infinity; for (let i = 0; i < JOINTS; i++) m = Math.min(m, r.p[i * 3 + 1]!); return m }
const highest = (r: Ragdoll): number => { let m = -Infinity; for (let i = 0; i < JOINTS; i++) m = Math.max(m, r.p[i * 3 + 1]!); return m }

describe('a ragdoll', () => {
  it('shot, it sinks where it stood, lies on the ground, and goes to sleep', () => {
    const f = yard()
    const x = cellMid(10), z = cellMid(10)
    const r = makeRagdoll(x, 0, z, 0)
    strike(r, 'shot', 0, 1, 0.3, DT)
    run(r, f.grid, 4)
    expect(highest(r)).toBeLessThan(0.6)
    expect(lowest(r)).toBeGreaterThanOrEqual(0)
    const at = ragdollAt(r, f.grid)
    expect(Math.hypot(at.x - x, at.z - z)).toBeLessThan(1.6)
    expect(r.asleep).toBe(true)
  })

  it('a rocket throws it far; every body flies its own way', () => {
    const f = yard()
    const far = (seed: number): { d: number; y: number } => {
      const r = makeRagdoll(cellMid(8), 0, cellMid(10), 0)
      strike(r, 'blast', 0, 1, seed, DT)
      let top = 0
      for (let k = 0; k < 4 / DT; k++) { stepRagdoll(r, f.grid, DT); top = Math.max(top, r.p[1]!) }
      const at = ragdollAt(r, f.grid)
      return { d: Math.hypot(at.x - cellMid(8), at.z - cellMid(10)), y: top }
    }
    const a = far(0.1)
    const b = far(0.77)
    expect(a.d).toBeGreaterThan(3)
    expect(a.y).toBeGreaterThan(1.5)
    expect(Math.abs(a.d - b.d)).toBeGreaterThan(0.05)
  })

  it('does not go through a wall', () => {
    const f = yard()
    const r = makeRagdoll(cellMid(18), 0, cellMid(10), Math.PI / 2)
    strike(r, 'blast', 1, 0, 0.5, DT)
    run(r, f.grid, 4)
    for (let i = 0; i < JOINTS; i++) expect(r.p[i * 3]!).toBeLessThan(20 * 2 + 0.2)
  })

  it('a blast flings a body already down; a ray finds the part it passes', () => {
    const f = yard()
    const r = makeRagdoll(cellMid(10), 0, cellMid(10), 0)
    run(r, f.grid, 4)
    expect(r.asleep).toBe(true)
    const before = ragdollAt(r, f.grid)
    expect(blastRagdoll(r, before.x - 1.5, 0, before.z, 5, DT)).toBe(true)
    run(r, f.grid, 3)
    expect(ragdollAt(r, f.grid).x).toBeGreaterThan(before.x + 1)
    const at = ragdollAt(r, f.grid)
    expect(nearRay(r, at.x - 5, 0.3, at.z, at.x + 5, 0.3, at.z, 0.6)).toBeGreaterThanOrEqual(0)
    expect(nearRay(r, at.x - 5, 5, at.z, at.x + 5, 5, at.z, 0.6)).toBe(-1)
  })

  it('dragged by the pelvis, the rest of it follows behind', () => {
    const f = yard()
    const r = makeRagdoll(cellMid(5), 0, cellMid(5), 0)
    run(r, f.grid, 3)
    for (let k = 0; k < 120; k++) {
      r.pin = { x: cellMid(5) + k * 0.05, y: heightAt(f.grid, cellMid(5), cellMid(5)) + 0.4, z: cellMid(5) }
      stepRagdoll(r, f.grid, DT)
    }
    expect(r.p[J.head * 3]!).toBeGreaterThan(cellMid(5) + 2)
    expect(r.p[J.head * 3]!).toBeLessThan(r.p[0]! + 0.2)
  })
})
