// #139: a destroyed machine comes apart into the parts it was built from.

import { describe, expect, it } from 'vitest'
import { Box3, Vector3, type SkinnedMesh } from 'three'
import { MELT_S, REST_CLEAR, Shatter, planPieces } from '@/game/fx/shatter'
import { buildDrone, buildEnforcer, buildGoliath, buildRoomba, buildSearchlight, poseDrone, poseEnforcer } from '@/game/models/garrison'
import { buildRobodog, HOUND_SCALE } from '@/game/models/robodog'
import { makeGrid, heightAt, type Grid } from '@/game/world/grid'
import type { Rig } from '@/game/models/kit'

const yard = (): Grid => {
  const g = makeGrid(20, 20)
  g.h.fill(0)
  return g
}

/** Every vertex of a skinned mesh, as drawn (skinning applied), in world space. */
const drawnBox = (mesh: SkinnedMesh): Box3 => {
  mesh.updateMatrixWorld(true)
  mesh.skeleton.update()
  const b = new Box3()
  const v = new Vector3()
  const n = mesh.geometry.attributes.position!.count
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, v)
    b.expandByPoint(v.applyMatrix4(mesh.matrixWorld))
  }
  return b
}

const MACHINES: Array<[string, () => Rig, number]> = [
  ['drone', () => { const r = buildDrone(); r.root.position.set(20, 6, 20); return r }, 3],
  ['searchlight', () => { const r = buildSearchlight(); r.root.position.set(20, 4, 20); return r }, 2],
  ['roomba', () => { const r = buildRoomba(false); r.root.position.set(20, 0, 20); return r }, 2],
  ['hound', () => { const r = buildRobodog(true); r.root.position.set(20, 0.4, 20); r.root.scale.setScalar(HOUND_SCALE); return r }, 6],
  ['enforcer', () => { const r = buildEnforcer(false); r.root.position.set(20, 0, 20); r.root.rotation.y = 0.7; return r }, 6],
  ['goliath', () => { const r = buildGoliath(); r.root.position.set(20, 0, 20); return r }, 6]
]

describe('which parts fly together', () => {
  const box = (cx: number, size: number): Box3 => new Box3(new Vector3(cx - size / 2, -size / 2, -size / 2), new Vector3(cx + size / 2, size / 2, size / 2))

  it('a bone\'s big parts each fly on their own; its small ones stay on the nearest big one', () => {
    const plan = planPieces([
      { bone: 0, box: box(0, 1) }, { bone: 0, box: box(2, 0.8) },
      // An LED next to the second plate, a bolt next to the first.
      { bone: 0, box: box(2.1, 0.03) }, { bone: 0, box: box(-0.1, 0.02) },
      // Another bone: a lone small part is a piece of its own.
      { bone: 1, box: box(5, 0.05) }
    ])
    expect(plan).toHaveLength(3)
    expect(plan.find(g => g.parts.includes(0))!.parts.sort()).toEqual([0, 3])
    expect(plan.find(g => g.parts.includes(1))!.parts.sort()).toEqual([1, 2])
    expect(plan.find(g => g.bone === 1)!.parts).toEqual([4])
  })

  it('never more pieces than the cap: smaller parts join bigger ones', () => {
    const parts = Array.from({ length: 60 }, (_, i) => ({ bone: 0, box: box(i, 0.3 + (i % 7) * 0.1) }))
    const plan = planPieces(parts, 20)
    expect(plan.length).toBeLessThanOrEqual(20)
    expect(plan.flatMap(g => g.parts).sort((a, b) => a - b)).toEqual(parts.map((_, i) => i))
  })
})

describe('a machine coming apart', () => {
  for (const [name, make, minPieces] of MACHINES) {
    it(`${name}: breaks seamlessly into its own parts, which scatter and come to rest just over the floor`, () => {
      const g = yard()
      const s = new Shatter(g)
      const rig = make()
      if (name === 'drone') poseDrone(rig, { time: 1, spin: 2, pitch: 0.1, roll: 0.05, eyeYaw: 0.1, eyePitch: 0.2, alarm: 0, deadT: 0, landed: false })
      if (name === 'enforcer') poseEnforcer(rig, { time: 1, stride: 0.5, speed: 0.4, power: 1, aimYaw: 0.2, aimPitch: 0, recoilL: 0, recoilR: 0, deadT: 0 })
      rig.root.updateMatrixWorld(true)
      const before = drawnBox(rig.mesh)
      expect(s.break(7, rig, { dirX: 1, dirZ: 0, force: 4, seed: 0.3 })).toBe(true)
      const wreck = s.group.children.find(c => (c as SkinnedMesh).isSkinnedMesh && (c as SkinnedMesh).renderOrder === 0) as SkinnedMesh
      // At the moment of the break the pieces are exactly where the machine's parts were.
      const at = drawnBox(wreck)
      expect(at.min.distanceTo(before.min)).toBeLessThan(1e-3)
      expect(at.max.distanceTo(before.max)).toBeLessThan(1e-3)
      const pieces = s.pieces(7)
      expect(pieces.length).toBeGreaterThanOrEqual(minPieces)
      expect(pieces.length).toBeLessThanOrEqual(28)
      for (let i = 0; i < 60 * 9; i++) s.update(1 / 60)
      for (const p of s.pieces(7)) {
        expect(p.asleep).toBe(true)
        const floor = heightAt(g, p.x, p.z)
        // Resting on the floor, never in it and never coplanar with it (no z-fighting).
        expect(p.low).toBeGreaterThanOrEqual(floor + REST_CLEAR - 1e-3)
        expect(p.low).toBeLessThan(floor + 0.08)
        // Not flung across the base.
        expect(Math.hypot(p.x - 20, p.z - 20)).toBeLessThan(9)
      }
      // And then it stays put.
      const settled = s.pieces(7)
      for (let i = 0; i < 120; i++) s.update(1 / 60)
      expect(s.pieces(7)).toEqual(settled)
      s.dispose()
    })
  }

  it('the flamethrower melts the whole wreck, wherever its pieces lie', () => {
    const s = new Shatter(yard())
    const rig = buildEnforcer(false)
    rig.root.position.set(20, 0, 20)
    s.break(3, rig, { force: 4 })
    for (let i = 0; i < 60 * 3; i++) s.update(1 / 60)
    s.melt(3)
    expect(s.has(3)).toBe(true)
    for (let i = 0; i < Math.ceil(MELT_S * 60) + 2; i++) s.update(1 / 60)
    expect(s.has(3)).toBe(false)
    // The machine's own material was never touched: the wreck glows on its own copy.
    expect(rig.material.emissive.getHex()).toBe(0)
  })

  it('the same machine comes apart the same way (its own seed)', () => {
    const run = (): Array<{ x: number; z: number }> => {
      const s = new Shatter(yard())
      const rig = buildRoomba(false)
      rig.root.position.set(20, 0, 20)
      s.break(1, rig, { force: 3.4, seed: 0.42 })
      for (let i = 0; i < 200; i++) s.update(1 / 60)
      return s.pieces(1).map(p => ({ x: +p.x.toFixed(4), z: +p.z.toFixed(4) }))
    }
    expect(run()).toEqual(run())
  })
})
