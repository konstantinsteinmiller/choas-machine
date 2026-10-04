// R41: the roof layer (#96, #93). A roof is a slab over cells: bodies walk
// under it, the mech can stand on it and drop through a hole, and it stops
// rounds, eyes and the camera like a wall. And the guard every geometry
// change needs: no two opaque faces of the fortress mesh share a plane.

import { describe, expect, it } from 'vitest'
import type { BufferGeometry } from 'three'
import { FortressBuilder, type Fortress } from '@/game/world/fortress'
import {
  ROOF_HEADROOM, ROOF_T, VOID, addRoof, cellMid, ceilingAt, floorAt, hasLineOfSight, heightAt, moveCircle, raycast, roofAt
} from '@/game/world/grid'
import { validateFortress } from '@/game/world/validate'
import { buildFortressMesh } from '@/game/world/fortressMesh'
import { makePlayer, stepPlayer, type Wish } from '@/game/sim/player'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { buildTrainingGround } from '@/game/data/fortresses/training'
import { buildProvingGround } from '@/game/data/fortresses/proving'
import { FORTRESSES, FORTRESS_IDS, fortressMeta, loadFortress } from '@/game/data/fortresses/registry'
import { THEMES, themeOf } from '@/game/data/themes'

/** A yard with a hall: walls round it, a roof with a skylight, a crate inside, a stair to the wall top. */
const hall = (): Fortress => {
  const b = new FortressBuilder('hall', 30, 30)
  b.ground(0, 0, 29, 29).insert(1, 1).extract(28, 28)
  b.wall(8, 8, 18, 8).wall(8, 18, 18, 18).wall(8, 8, 8, 18).wall(18, 8, 18, 18)
  b.gate(13, 18)
  b.cover(10, 10, 1)
  b.stairs(20, 12, 'n', 4)
  b.roof(9, 9, 17, 17, { holes: [[13, 13], [14, 13]] })
  return b.build()
}

const wish = (over: Partial<Wish> = {}): Wish => ({ mx: 0, mz: 0, aiming: false, aimYaw: 0, crouch: false, jump: false, ...over })

describe('the roof layer (#96)', () => {
  it('lays slabs with headroom, leaves holes open, and the fortress validates', () => {
    const f = hall()
    const g = f.grid
    expect(roofAt(g, 10, 12)).toBeGreaterThanOrEqual(heightAt(g, cellMid(10), cellMid(12)) + ROOF_HEADROOM - 1e-6)
    expect(roofAt(g, 13, 13)).toBe(VOID)
    expect(roofAt(g, 4, 4)).toBe(VOID)
    expect(validateFortress(f)).toEqual([])
  })

  it('stops a ray: a drone overhead cannot see a body under it, but can through the skylight', () => {
    const f = hall()
    const g = f.grid
    // Under the slab.
    expect(hasLineOfSight(g, cellMid(11), 14, cellMid(11), cellMid(11), 1.5, cellMid(11))).toBe(false)
    // Through the hole.
    expect(hasLineOfSight(g, cellMid(13), 14, cellMid(13), cellMid(13), 1.5, cellMid(13))).toBe(true)
    // A level ray under the roof runs on.
    const r = raycast(g, cellMid(11), 2, cellMid(12), 0, 0, 1, 6)
    expect(r.hit).toBe(false)
  })

  it('a body under it walks the floor; a body on it stands on the slab', () => {
    const f = hall()
    const g = f.grid
    const x = cellMid(11)
    const z = cellMid(12)
    const r = roofAt(g, 11, 12)
    expect(floorAt(g, x, z, 0)).toBe(0)
    expect(floorAt(g, x, z, r + ROOF_T)).toBeCloseTo(r + ROOF_T)
    expect(ceilingAt(g, x, z, 0)).toBe(r)
    expect(ceilingAt(g, x, z, r + ROOF_T)).toBe(Infinity)
    // Walking about on the floor under the roof: nothing blocks.
    const m = moveCircle(g, x, z, 0, 0, 2, 0.42)
    expect(m.z).toBeCloseTo(z + 2)
  })

  it('a jump under the roof stops at the slab', () => {
    const f = hall()
    const g = f.grid
    // A low slab out in the yard (lower than a builder allows): a jump meets it.
    addRoof(g, 4, 4, 4, 4, 3)
    const p = makePlayer(cellMid(4), 0, cellMid(4), 0)
    stepPlayer(p, g, wish({ jump: true }), 1 / 60)
    let top = 0
    for (let k = 0; k < 90; k++) { stepPlayer(p, g, wish(), 1 / 60); top = Math.max(top, p.y) }
    expect(top).toBeGreaterThan(0.3)
    expect(top + 2.5).toBeLessThanOrEqual(3 + 1e-6)
    expect(p.mode).toBe('ground')
  })

  it('the mech walks on the roof and drops through the skylight to the floor', () => {
    const f = hall()
    const g = f.grid
    const r = roofAt(g, 12, 13)
    const p = makePlayer(cellMid(12), r + ROOF_T, cellMid(13), Math.PI / 2)
    p.mode = 'ground'
    // Stands.
    for (let k = 0; k < 10; k++) stepPlayer(p, g, wish(), 1 / 60)
    expect(p.mode).toBe('ground')
    expect(p.y).toBeCloseTo(r + ROOF_T, 1)
    // Walks east into the hole (13, 13) and falls to the floor.
    for (let k = 0; k < 120 && p.y > 0.01; k++) stepPlayer(p, g, wish({ mx: 1 }), 1 / 60)
    expect(p.y).toBeLessThan(0.05)
  })
})

describe('the fortress registry (#93 #79)', () => {
  it('lists every fortress once, each unlocked by one before it, and loads it with its look', async () => {
    expect(new Set(FORTRESS_IDS).size).toBe(FORTRESS_IDS.length)
    FORTRESSES.forEach((f, i) => {
      if (i === 0) expect(f.unlock).toBeNull()
      else expect(FORTRESS_IDS.indexOf(f.unlock!.after)).toBeLessThan(i)
      expect(THEMES[f.theme]).toBeDefined()
    })
    for (const id of FORTRESS_IDS) {
      const f = await loadFortress(id, 1, 0)
      expect(f.id).toBe(id)
      expect(validateFortress(f)).toEqual([])
      expect(themeOf(f.theme)).toBe(THEMES[fortressMeta(id).theme])
    }
  })
})

/** Axis-aligned opaque quads from the mesh, as rectangles in their plane, grouped by plane and facing. */
const planes = (geoms: BufferGeometry[]): Map<string, Array<[number, number, number, number]>> => {
  const out = new Map<string, Array<[number, number, number, number]>>()
  for (const g of geoms) {
    const p = g.attributes.position!.array as Float32Array
    const n = g.attributes.normal!.array as Float32Array
    const idx = g.index!.array
    for (let i = 0; i < idx.length;) {
      const quad = i + 5 < idx.length && idx[i] === idx[i + 3] && idx[i + 2] === idx[i + 4]
      const vs = quad ? [idx[i]!, idx[i + 1]!, idx[i + 2]!, idx[i + 5]!] : [idx[i]!, idx[i + 1]!, idx[i + 2]!]
      i += quad ? 6 : 3
      if (!quad) continue
      const v0 = vs[0]! * 3
      const nx = n[v0]!
      const ny = n[v0 + 1]!
      const nz = n[v0 + 2]!
      const axis = Math.abs(nx) > 0.999 ? 0 : Math.abs(ny) > 0.999 ? 1 : Math.abs(nz) > 0.999 ? 2 : -1
      if (axis < 0) continue
      const off = p[v0 + axis]!
      if (vs.some(v => Math.abs(p[v * 3 + axis]! - off) > 1e-4)) continue
      const [ua, va] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]
      const us = vs.map(v => p[v * 3 + ua]!)
      const ws = vs.map(v => p[v * 3 + va]!)
      const key = `${axis}:${Math.sign([nx, ny, nz][axis]!)}:${Math.round(off * 1000)}`
      let list = out.get(key)
      if (!list) out.set(key, (list = []))
      list.push([Math.min(...us), Math.min(...ws), Math.max(...us), Math.max(...ws)])
    }
  }
  return out
}

/** Pairs of rectangles in one plane that overlap by more than a sliver. */
const overlaps = (rects: Array<[number, number, number, number]>): number => {
  const s = [...rects].sort((a, b) => a[0] - b[0])
  let n = 0
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length && s[j]![0] < s[i]![2] - 1e-3; j++) {
      const w = Math.min(s[i]![2], s[j]![2]) - Math.max(s[i]![0], s[j]![0])
      const h = Math.min(s[i]![3], s[j]![3]) - Math.max(s[i]![1], s[j]![1])
      if (w > 0.01 && h > 0.01) n++
    }
  }
  return n
}

describe('no z-fighting in the fortress mesh', () => {
  const cases: Array<[string, () => Fortress]> = [
    ['the roofed hall', hall],
    ['the training ground', buildTrainingGround],
    ['the proving ground', buildProvingGround],
    ...[1, 2, 3, 4, 5].map(l => [`the Bastion at threat ${l}`, () => buildBastion(l)] as [string, () => Fortress])
  ]
  for (const [name, build] of cases) {
    it(`${name}: no two opaque faces overlap in one plane`, async () => {
      const mesh = await buildFortressMesh(build())
      const geoms = mesh.chunks.map(c => c.geometry as BufferGeometry)
      let bad = 0
      const where: string[] = []
      for (const [key, rects] of planes(geoms)) {
        const k = overlaps(rects)
        if (k > 0) { bad += k; where.push(key) }
      }
      mesh.dispose()
      expect(where.slice(0, 5)).toEqual([])
      expect(bad).toBe(0)
    })
  }
})
