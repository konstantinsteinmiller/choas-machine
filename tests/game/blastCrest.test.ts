// The exploding barrel's blast crests (owner's playtest): the red drum did
// not read as explosive, so it carries a hazard shield with an exploding
// burst on each of its four sides. Pinned here: four crests a quarter turn
// apart facing out, stood off the drum by centimetres (never in one plane
// with it), one shared texture and material, and every place that builds the
// barrel drawing them.

import { describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Vector3, type BufferGeometry } from 'three'
import { CREST_R, CREST_R_IN, CREST_SIDES, CREST_Y, CREST_H, crestFaces, crestMaterial, crestRims, crestTexture } from '@/game/models/blastCrest'
import { buildFuelBarrel, fuelBarrelParts, fuelBarrelShape } from '@/game/models/supplies'
import { SupplyView } from '@/game/fx/supplyView'
import type { Barrel } from '@/game/sim/barrels'
import { coplanarClashes } from '../helpers/coplanar'

/** The drum's ribs reach out this far (torus 0.405 + 0.03). */
const RIB_OUT = 0.435

/** Each vertex's quarter (0..3) round the drum, by the side its crest faces. */
const quarterOf = (x: number, z: number): number => ((Math.round(Math.atan2(x, z) / (Math.PI / 2)) % 4) + 4) % 4

const vertsOf = (g: BufferGeometry): Array<{ p: Vector3; n: Vector3 }> => {
  const pos = g.attributes.position!
  const nrm = g.attributes.normal!
  return Array.from({ length: pos.count }, (_, i) => ({ p: new Vector3().fromBufferAttribute(pos, i), n: new Vector3().fromBufferAttribute(nrm, i) }))
}

describe('the exploding barrel carries a blast crest on each side', () => {
  it('four crests, a quarter turn apart, each facing straight out', () => {
    expect(CREST_SIDES).toBe(4)
    const verts = vertsOf(crestFaces())
    const byQuarter = [0, 0, 0, 0]
    for (const { p, n } of verts) {
      byQuarter[quarterOf(p.x, p.z)]!++
      // The normal is the drum's outward radial at that point.
      const out = new Vector3(p.x, 0, p.z).normalize()
      expect(n.dot(out)).toBeGreaterThan(0.999)
    }
    // As many vertices on every side: the same crest, turned.
    expect(new Set(byQuarter).size).toBe(1)
    expect(byQuarter[0]).toBe(verts.length / 4)
    // Each crest's middle sits square on its quarter's axis.
    for (let q = 0; q < 4; q++) {
      const mid = verts.filter(v => quarterOf(v.p.x, v.p.z) === q).reduce((s, v) => s.add(v.p), new Vector3()).divideScalar(byQuarter[q]!)
      const a = Math.atan2(mid.x, mid.z)
      const want = q * (Math.PI / 2)
      expect(Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want)))).toBeLessThan(1e-6)
    }
  })

  it('the faces stand centimetres clear of the drum, its ribs and its hazard band', () => {
    for (const { p } of vertsOf(crestFaces())) {
      const r = Math.hypot(p.x, p.z)
      expect(r).toBeCloseTo(CREST_R, 5)
      expect(r - RIB_OUT).toBeGreaterThanOrEqual(0.02)
      expect(p.y).toBeGreaterThanOrEqual(CREST_Y - 1e-6)
      expect(p.y).toBeLessThanOrEqual(CREST_Y + CREST_H + 1e-6)
    }
  })

  it('the rims run from inside the drum out to the face, every wall facing away from its crest', () => {
    const g = crestRims()
    const pos = g.attributes.position!
    const idx = g.index!
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      expect(Math.min(Math.abs(r - CREST_R_IN), Math.abs(r - CREST_R))).toBeLessThan(1e-5)
    }
    expect(CREST_R_IN).toBeLessThan(0.4)
    const a = new Vector3(); const b = new Vector3(); const c = new Vector3()
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(pos, idx.getX(t)); b.fromBufferAttribute(pos, idx.getX(t + 1)); c.fromBufferAttribute(pos, idx.getX(t + 2))
      const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
      const mid = a.clone().add(b).add(c).divideScalar(3)
      // Away from the crest's own centre line (its quarter's axis, half-way up).
      const q = quarterOf(mid.x, mid.z)
      const axis = new Vector3(Math.sin((q * Math.PI) / 2), 0, Math.cos((q * Math.PI) / 2))
      const centre = axis.clone().multiplyScalar(mid.clone().setY(0).dot(axis)).setY(CREST_Y + CREST_H * 0.55)
      expect(face.dot(mid.clone().sub(centre))).toBeGreaterThan(0)
    }
  })

  it('no two of the barrel\'s parts share a face, crests included (the z-fighting rule)', () => {
    const p = fuelBarrelParts()
    const geos = [...p.lit, ...p.glow, p.crest]
    expect(coplanarClashes(geos, 0.004, geos.map((_, i) => `barrel#${i}`))).toEqual([])
  })

  it('the built barrel hands its crests over; the hologram drum has them too', () => {
    const b = buildFuelBarrel()
    expect(b.crest.attributes.uv).toBeDefined()
    expect(b.crest.index!.count).toBe(crestFaces().index!.count)
    const shape = fuelBarrelShape()
    expect(Object.keys(shape.attributes).sort()).toEqual(['normal', 'position'])
    const pos = shape.attributes.position!
    let onFace = 0
    for (let i = 0; i < pos.count; i++) if (Math.abs(Math.hypot(pos.getX(i), pos.getZ(i)) - CREST_R) < 1e-5) onFace++
    expect(onFace).toBeGreaterThanOrEqual(crestFaces().attributes.position!.count)
  })

  it('one texture and one material for every crest of every barrel, kept when a view goes', () => {
    expect(crestMaterial()).toBe(crestMaterial())
    expect(crestMaterial().map).toBe(crestTexture())
    const barrels: Barrel[] = [0, 1, 2].map(i => ({ cx: i, cz: 0, x: i * 2, y: 0, z: 0, live: i !== 1, fuse: -1 }) as Barrel)
    const a = new SupplyView([], barrels)
    const b = new SupplyView([], barrels)
    const crests = (v: SupplyView) => v.group.children.filter(m => (m as { material?: unknown }).material === crestMaterial())
    expect(crests(a)).toHaveLength(1)
    expect(crests(b)).toHaveLength(1)
    a.update([], barrels, 0)
    const mesh = crests(a)[0] as unknown as { count: number }
    expect(mesh.count).toBe(3)
    const tex = vi.spyOn(crestTexture(), 'dispose')
    const mat = vi.spyOn(crestMaterial(), 'dispose')
    a.dispose()
    expect(tex).not.toHaveBeenCalled()
    expect(mat).not.toHaveBeenCalled()
    b.dispose()
  })
})

describe('every place that builds the barrel draws its crests (redesign to every instance)', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|vue)$/.test(f) ? [p] : []
  })
  const src = files(join(__dirname, '../../src')).map(p => ({ p: p.replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }))

  it('each caller of buildFuelBarrel draws the crest faces with the shared material', () => {
    const callers = src.filter(f => /buildFuelBarrel\(\)/.test(f.text) && !f.p.endsWith('models/supplies.ts'))
    expect(callers.map(f => f.p.split('/src/')[1]).sort()).toEqual(['game/fx/supplyView.ts', 'game/story/cinema.ts'])
    for (const f of callers) expect(f.text, f.p).toMatch(/crestMaterial\(\)/)
  })

  it('the training room\'s hologram drum is the barrel\'s own shape, not a plain cylinder', () => {
    const td = src.find(f => f.p.endsWith('sim/trainingDirector.ts'))!
    expect(td.text).toMatch(/this\.drum = new Mesh\(fuelBarrelShape\(\)/)
  })
})
