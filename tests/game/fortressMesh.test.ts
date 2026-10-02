// The fortress's static geometry (`world/fortressMesh.ts`, `world/decor.ts`):
// one lit mesh per 16 m chunk so the renderer can cull whole chunks, shared
// materials so every chunk batches, and geometry that matches the height grid.

import { describe, expect, it } from 'vitest'
import type { Mesh } from 'three'
import { buildFortressMesh, CHUNK } from '@/game/world/fortressMesh'
import { buildDecor } from '@/game/world/decor'
import { FortressBuilder } from '@/game/world/fortress'
import { CELL } from '@/game/world/grid'
import { buildProvingGround } from '@/game/data/fortresses/proving'
import { toonVC, glowVC } from '@/game/models/toon'

const tris = (m: Mesh): number => m.geometry.index!.count / 3

describe('the fortress mesh', () => {
  it('is one lit mesh per chunk that has ground, each with a tight bounding sphere', async () => {
    const f = buildProvingGround()
    const mesh = await buildFortressMesh(f)
    const cols = Math.ceil(f.grid.w / CHUNK)
    const rows = Math.ceil(f.grid.d / CHUNK)
    expect(mesh.chunks.length).toBeGreaterThan(0)
    expect(mesh.chunks.length).toBeLessThanOrEqual(cols * rows)
    for (const c of mesh.chunks) {
      const s = c.geometry.boundingSphere!
      expect(Number.isFinite(s.radius)).toBe(true)
      // A chunk is 16 m square; even with a tower and the cliff under it, its
      // sphere stays local, which is what makes frustum culling worth having.
      expect(s.radius).toBeLessThan(CHUNK * CELL * 1.6)
      expect(c.frustumCulled).toBe(true)
    }
  })

  it('shares two materials across every chunk', async () => {
    const mesh = await buildFortressMesh(buildProvingGround())
    const mats = new Set(mesh.group.children.map(c => (c as Mesh).material))
    expect(mats).toEqual(new Set([toonVC(), glowVC()]))
  })

  it('carries position, normal and colour for every vertex, with no NaN', async () => {
    const mesh = await buildFortressMesh(buildProvingGround())
    for (const c of mesh.chunks) {
      const g = c.geometry
      const n = g.attributes.position!.count
      expect(g.attributes.normal!.count).toBe(n)
      expect(g.attributes.color!.count).toBe(n)
      for (const v of g.attributes.position!.array as Float32Array) expect(Number.isNaN(v)).toBe(false)
    }
  })

  it('a single ground cell is a top and four cliff sides', async () => {
    const b = new FortressBuilder('one', 3, 3)
    b.ground(1, 1, 1, 1).insert(1, 1).extract(1, 1)
    const mesh = await buildFortressMesh(b.build())
    expect(mesh.chunks).toHaveLength(1)
    // 1 top + 4 edges × (a lip and a tapering skirt) = 9 quads.
    expect(tris(mesh.chunks[0]!)).toBe(9 * 2)
  })

  it('draws a side only where a neighbour is lower', async () => {
    const flat = new FortressBuilder('flat', 8, 8)
    flat.ground(0, 0, 7, 7).insert(1, 1).extract(6, 6)
    const base = tris((await buildFortressMesh(flat.build())).chunks[0]!)
    // 64 tops + 32 rim edges × 2 quads.
    expect(base).toBe((64 + 32 * 2) * 2)

    const walled = new FortressBuilder('wall', 8, 8)
    walled.ground(0, 0, 7, 7).wall(3, 2, 3, 5).insert(1, 1).extract(6, 6)
    const withWall = await buildFortressMesh(walled.build())
    // The wall adds its exposed faces: two long sides of four cells and two
    // ends; faces between wall cells are not drawn.
    expect(tris(withWall.chunks[0]!)).toBe(base + (4 + 4 + 1 + 1) * 2)
  })

  it('lights a neon trim on structures and draws the ways up', async () => {
    const f = buildProvingGround()
    const mesh = await buildFortressMesh(f)
    const glow = mesh.group.children.filter(c => (c as Mesh).material === glowVC()) as Mesh[]
    expect(glow.length).toBeGreaterThan(1)
    const links = mesh.group.getObjectByName('links') as Mesh
    expect(links).toBeTruthy()
    expect(tris(links)).toBeGreaterThan(f.grid.ladders.length * 8 + f.grid.cables.length * 8)
  })

  it('reports progress up to 1 and yields once per chunk', async () => {
    const f = buildProvingGround()
    const seen: number[] = []
    let yields = 0
    await buildFortressMesh(f, undefined, () => { yields++ }, p => seen.push(p))
    expect(seen[seen.length - 1]).toBe(1)
    expect(yields).toBe(Math.ceil(f.grid.w / CHUNK) * Math.ceil(f.grid.d / CHUNK))
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })

  it('a whole base is small enough for a phone', async () => {
    const mesh = await buildFortressMesh(buildProvingGround())
    const total = mesh.group.children.reduce((n, c) => n + tris(c as Mesh), 0)
    expect(total).toBeLessThan(20_000)
    // Everything in view at once: chunks + their trims + the links.
    expect(mesh.group.children.length).toBeLessThanOrEqual(60)
  })
})

describe('dressing', () => {
  it('bakes every prop of a base into two meshes', () => {
    const f = buildProvingGround()
    expect(f.decor.length).toBeGreaterThan(8)
    const d = buildDecor(f.decor)
    expect(d.group.children).toHaveLength(2)
    expect(new Set(d.group.children.map(c => (c as Mesh).material))).toEqual(new Set([toonVC(), glowVC()]))
  })

  it('an undressed base adds nothing to the scene', () => {
    expect(buildDecor([]).group.children).toHaveLength(0)
  })
})
