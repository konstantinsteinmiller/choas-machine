// @vitest-environment jsdom
// R37 (#97): the disguises. The toaster is everyone's; the rest unlock for
// good (scrap, or a rewarded video where one can play); each is a model about
// the hide box's size, and none changes the rules.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Box3, Vector3, type Mesh } from 'three'
import { DISGUISE_IDS, DISGUISE_SCRAP, FREE_DISGUISE, buildDisguise, disposeDisguise } from '@/game/models/disguises'
import { defaultProfile, profile } from '@/game/state/profile'
import { ownsDisguise, unlockDisguise, wearDisguise } from '@/game/state/progress'
import { REWARDED_PLACEMENTS } from '@/use/useRewardedOffers'

beforeEach(() => { Object.assign(profile, defaultProfile()) })

describe('owning and wearing (#97)', () => {
  it('a new mech has the toaster on', () => {
    expect(profile.cosmetics).toEqual({ owned: [FREE_DISGUISE], worn: FREE_DISGUISE })
    expect(FREE_DISGUISE).toBe('toaster')
  })

  it('scrap unlocks one for good and puts it on; not twice, not without the scrap', () => {
    expect(unlockDisguise('teddy')).toBe(false)
    profile.scrap = DISGUISE_SCRAP + 10
    expect(unlockDisguise('teddy')).toBe(true)
    expect(profile.scrap).toBe(10)
    expect(ownsDisguise('teddy')).toBe(true)
    expect(profile.cosmetics.worn).toBe('teddy')
    expect(unlockDisguise('teddy')).toBe(false)
  })

  it('a finished video unlocks one without scrap, and the placement is on the list', () => {
    expect(unlockDisguise('horse', true)).toBe(true)
    expect(profile.scrap).toBe(0)
    expect(REWARDED_PLACEMENTS).toContain('disguise')
  })

  it('only an owned disguise can be worn', () => {
    expect(wearDisguise('bush')).toBe(false)
    unlockDisguise('bush', true)
    expect(wearDisguise('toaster')).toBe(true)
    expect(wearDisguise('bush')).toBe(true)
    expect(profile.cosmetics.worn).toBe('bush')
  })
})

describe('the models', () => {
  for (const id of DISGUISE_IDS) {
    it(`${id}: about the hide box's size, and drawn`, () => {
      const g = buildDisguise(id)
      g.visible = true
      g.updateMatrixWorld(true)
      const b = new Box3().setFromObject(g)
      expect(b.max.x - b.min.x).toBeLessThan(2.9)
      expect(b.max.z - b.min.z).toBeLessThan(3.0)
      expect(b.max.y).toBeLessThan(3.3)
      expect(b.max.y).toBeGreaterThan(1.3)
      expect(b.min.y).toBeGreaterThanOrEqual(0)
      disposeDisguise(g)
    })
  }
})

describe('the mech folds into its disguise (#111)', () => {
  it('folded away at 0, half out on the way, whole at 1; in the mech\'s colours, its antenna on top', async () => {
    const { morphDisguise } = await import('@/game/models/disguises')
    const { PAL } = await import('@/game/models/palette')
    const { Color } = await import('three')
    for (const id of DISGUISE_IDS) {
      const g = buildDisguise(id)
      const pieces = g.children as Mesh[]
      expect(pieces.length).toBeGreaterThan(4)
      expect(morphDisguise(g, 0)).toBe(false)
      morphDisguise(g, 0.4)
      const some = pieces.filter(p => p.visible).length
      expect(some).toBeGreaterThan(0)
      expect(some).toBeLessThan(pieces.length)
      morphDisguise(g, 1)
      expect(pieces.every(p => p.visible && Math.abs(p.scale.x - 1) < 1e-6)).toBe(true)
      // Every colour on it is one of the mech's own.
      const mech = new Set([PAL.mechArmor, PAL.mechArmorHi, PAL.mechArmorDeep, PAL.mechSuit, PAL.mechSuitDeep, PAL.mechEye, PAL.mechCore].map(h => new Color(h).getHex()))
      for (const p of pieces) {
        const c = p.geometry.attributes.color!
        expect(mech.has(new Color(c.getX(0), c.getY(0), c.getZ(0)).getHex()), id).toBe(true)
      }
      disposeDisguise(g)
    }
  })

  // The shop showed every disguise but the toaster near-black: the brightness
  // that picks armour or suit was read from the LINEAR vertex colour, where a
  // wooden horse or a steel crate is as dark as the mech's suit.
  it('each one is mostly the mech\'s lilac armour, like the toaster, not its dark suit', async () => {
    const { PAL } = await import('@/game/models/palette')
    const { Color, MeshToonMaterial } = await import('three')
    const armour = new Set([PAL.mechArmor, PAL.mechArmorHi, PAL.mechArmorDeep].map(h => new Color(h).getHex()))
    for (const id of DISGUISE_IDS) {
      const g = buildDisguise(id)
      let lit = 0
      let light = 0
      for (const p of g.children as Mesh[]) {
        if (!(p.material instanceof MeshToonMaterial)) continue
        const b = p.geometry.boundingBox!
        const v = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z)
        const c = p.geometry.attributes.color!
        lit += v
        if (armour.has(new Color(c.getX(0), c.getY(0), c.getZ(0)).getHex())) light += v
      }
      expect(light / lit, id).toBeGreaterThan(0.6)
      disposeDisguise(g)
    }
  })

  it('freeing one leaves the shared materials the rest of the scene draws with', async () => {
    const { toonVC, glowVC } = await import('@/game/models/toon')
    const toon = vi.spyOn(toonVC(), 'dispose')
    const glow = vi.spyOn(glowVC(), 'dispose')
    for (const id of DISGUISE_IDS) disposeDisguise(buildDisguise(id))
    expect(toon).not.toHaveBeenCalled()
    expect(glow).not.toHaveBeenCalled()
  })
})

// The user's hard rule: never two opaque faces in one plane. A disguise is
// a pile of separate pieces, so a panel laid on a shell, or a stripe on a
// face, is exactly where it would happen.
describe('no z-fighting in a disguise', () => {
  interface Tri { a: Vector3; b: Vector3; c: Vector3; n: Vector3; mid: Vector3; d: number; id: number }
  /** Strictly inside triangle `t` (in its plane), off its edges. */
  const inside = (p: Vector3, t: Tri): boolean => {
    const v0 = t.c.clone().sub(t.a)
    const v1 = t.b.clone().sub(t.a)
    const v2 = p.clone().sub(t.a)
    const d00 = v0.dot(v0); const d01 = v0.dot(v1); const d11 = v1.dot(v1)
    const d20 = v2.dot(v0); const d21 = v2.dot(v1)
    const den = d00 * d11 - d01 * d01
    const u = (d11 * d20 - d01 * d21) / den
    const w = (d00 * d21 - d01 * d20) / den
    return u > 0.01 && w > 0.01 && u + w < 0.99
  }
  /** Pairs of pieces with a face of one lying in a face of the other (within 4 mm, facing the same way). */
  const coplanarClashes = (meshes: Mesh[]): string[] => {
    // Faces grouped by direction, then compared only with those a few mm along it.
    const groups = new Map<string, Tri[]>()
    meshes.forEach((mesh, id) => {
      const pos = mesh.geometry.attributes.position!
      const idx = mesh.geometry.index
      const n = idx ? idx.count : pos.count
      const at = (i: number): Vector3 => new Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld)
      for (let i = 0; i < n; i += 3) {
        const a = at(i); const b = at(i + 1); const c = at(i + 2)
        const nrm = b.clone().sub(a).cross(c.clone().sub(a))
        if (nrm.lengthSq() < 1e-14) continue
        nrm.normalize()
        const mid = a.clone().add(b).add(c).divideScalar(3)
        const key = `${Math.round(nrm.x * 40)},${Math.round(nrm.y * 40)},${Math.round(nrm.z * 40)}`
        const list = groups.get(key) ?? []
        list.push({ a, b, c, n: nrm, mid, d: nrm.dot(mid), id })
        groups.set(key, list)
      }
    })
    const clashes = new Set<string>()
    for (const tris of groups.values()) {
      tris.sort((p, q) => p.d - q.d)
      for (let i = 0; i < tris.length; i++) {
        const s = tris[i]!
        for (let j = i + 1; j < tris.length && tris[j]!.d - s.d < 0.006; j++) {
          const o = tris[j]!
          if (o.id === s.id || s.n.dot(o.n) < 0.999) continue
          if (Math.abs(s.mid.clone().sub(o.a).dot(o.n)) > 0.004) continue
          if (inside(s.mid, o) || inside(o.mid, s)) clashes.add(`${meshes[s.id]!.name || s.id} / ${meshes[o.id]!.name || o.id}`)
        }
      }
    }
    return [...clashes]
  }

  for (const id of DISGUISE_IDS) {
    it(`${id}: no two pieces share a face`, async () => {
      const { morphDisguise } = await import('@/game/models/disguises')
      const g = buildDisguise(id)
      morphDisguise(g, 1)
      g.updateMatrixWorld(true)
      expect(coplanarClashes(g.children as Mesh[])).toEqual([])
      disposeDisguise(g)
    })
  }

  it('(the check does catch two boxes with a face in one plane)', async () => {
    const { BoxGeometry, Mesh: M } = await import('three')
    const a = new M(new BoxGeometry(1, 1, 1))
    const b = new M(new BoxGeometry(0.5, 0.5, 0.5))
    b.position.set(0, 0.25, 0)
    a.updateMatrixWorld(); b.updateMatrixWorld()
    expect(coplanarClashes([a, b])).not.toEqual([])
    b.position.set(0, 0.3, 0)
    b.updateMatrixWorld()
    expect(coplanarClashes([a, b])).toEqual([])
  })
})
