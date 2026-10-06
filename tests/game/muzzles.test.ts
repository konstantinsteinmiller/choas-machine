// #167: every round leaves from the hole in its barrel. The muzzle a shot,
// a flash, a trail, a rocket or a kill-cam starts from is checked here
// against the model it belongs to: on the weapon's foremost face, inside its
// bore, for the mech's three weapons as built and as posed, and for every
// defender's weapon. A model change that moves a barrel breaks this test,
// not the game.

import { describe, expect, it } from 'vitest'
import { Box3, Vector3, type BufferGeometry } from 'three'
import { WEAPON_IDS, type WeaponId } from '@/game/data/ids'
import { MUZZLE, MINIGUN_SPIN_AT, WEAPON_LOOK, weaponModelParts } from '@/game/models/weapons'
import { MUZZLE_TIP, buildMech, muzzleWorld, poseMech, restPose } from '@/game/models/mech'
import { MUZZLE as DEFENDER_MUZZLE, buildEnforcer, buildGoliath, buildGuard, buildRoomba } from '@/game/models/garrison'
import { weaponParts } from '@/game/models/weaponLab'
import { allParts } from '@/game/models/propKit'
import type { Rig } from '@/game/models/kit'

const boxOf = (geos: BufferGeometry[]): Box3 => {
  const b = new Box3()
  for (const g of geos) {
    g.computeBoundingBox()
    b.union(g.boundingBox!)
  }
  return b
}

/** Vertices of a rig's parts on one bone, in that bone's frame (bind pose). */
const boneVerts = (rig: Rig, bone: string): Vector3[] => {
  const bones = rig.mesh.skeleton.bones
  const bi = bones.findIndex((b) => b.name === bone)
  rig.mesh.skeleton.bones[0]!.updateMatrixWorld(true)
  const inv = rig.mesh.skeleton.boneInverses[bi]!
  const out: Vector3[] = []
  for (const p of rig.parts) {
    if (p.bone !== bi) continue
    const pos = p.geo.attributes.position!
    for (let i = 0; i < pos.count; i++) out.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(inv))
  }
  return out
}

describe('the mech\'s weapons (#167)', () => {
  it('each muzzle is on its weapon\'s foremost face, at the bore\'s middle', () => {
    for (const w of WEAPON_IDS) {
      const b = boxOf(allParts(weaponModelParts(w)))
      const [, y, z] = MUZZLE[w]
      // Nothing of the weapon sticks out past its muzzle (the barrel runs down −y).
      expect(b.min.y, w).toBeGreaterThan(y - 0.004)
      expect(b.min.y, w).toBeLessThan(y + 0.004)
      expect(Math.abs(MUZZLE[w][0]), w).toBeLessThan(1e-6)
      // The muzzle is inside the weapon's outline from the front.
      expect(z, w).toBeGreaterThan(b.min.z)
      expect(z, w).toBeLessThan(b.max.z)
    }
  })

  it('the parts at the very front ring the muzzle: it is a bore, not a face', () => {
    for (const w of WEAPON_IDS) {
      const front = allParts(weaponModelParts(w)).flatMap((g) => {
        const pos = g.attributes.position!
        const pts: Vector3[] = []
        for (let i = 0; i < pos.count; i++) {
          const v = new Vector3().fromBufferAttribute(pos, i)
          if (v.y < MUZZLE[w][1] + 0.01) pts.push(v)
        }
        return pts
      })
      expect(front.length, w).toBeGreaterThan(8)
      // Round the muzzle on every side.
      const [, , mz] = MUZZLE[w]
      const ang = new Set(front.map((v) => Math.round(((Math.atan2(v.z - mz, v.x) + Math.PI) / (Math.PI * 2)) * 8) % 8))
      expect(ang.size, w).toBe(8)
    }
  })

  it('the rig carries the same models, and its muzzle bones say the same', () => {
    const rig = buildMech()
    for (const w of WEAPON_IDS) {
      const [bone, x, y, z] = MUZZLE_TIP[w]
      const verts = boneVerts(rig, bone)
      expect(verts.length, w).toBeGreaterThan(50)
      // In the bone's frame the foremost vertex is the muzzle's own depth.
      const minY = Math.min(...verts.map((v) => v.y))
      expect(Math.abs(minY - y), w).toBeLessThan(0.006)
      expect(Math.abs(x), w).toBeLessThan(1e-6)
      if (w === 'minigun') expect(z).toBeCloseTo(MUZZLE.minigun[2] - MINIGUN_SPIN_AT[2], 6)
    }
  })

  it('posed and aimed, the muzzle is the foremost point of the drawn weapon in the world', () => {
    const rig = buildMech()
    for (const w of WEAPON_IDS) {
      const s = { ...restPose(), weapon: w as WeaponId, aim: 1 }
      poseMech(rig, s)
      rig.root.updateMatrixWorld(true)
      const m = muzzleWorld(rig, w, new Vector3())!
      // Aimed, the barrel points along +z: the muzzle is (nearly) the weapon's furthest point forward.
      const bone = rig.bones[MUZZLE_TIP[w][0]]!
      const verts = boneVerts(rig, MUZZLE_TIP[w][0]).map((v) => v.applyMatrix4(bone.matrixWorld))
      const maxZ = Math.max(...verts.map((v) => v.z))
      expect(maxZ - m.z, w).toBeLessThan(0.05)
      expect(m.z, w).toBeGreaterThan(0.6)
    }
  })

  it('the weapons lab racks the same weapons, muzzle up', () => {
    for (const w of WEAPON_IDS) {
      const b = boxOf(allParts(weaponParts(w)))
      // Muzzle up: the weapon's top is its muzzle, at the drawn size.
      expect(b.max.y, w).toBeCloseTo(-MUZZLE[w][1] * 0.8, 2)
    }
  })

  it('each weapon wears its button\'s colour', () => {
    expect(WEAPON_LOOK.sniper.body).toBe('#4de8ff')
    expect(WEAPON_LOOK.minigun.body).toBe('#9a78ff')
    expect(WEAPON_LOOK.rocket.body).toBe('#ff5576')
  })
})

describe('the defenders\' weapons', () => {
  const rigs: Record<keyof typeof DEFENDER_MUZZLE, () => Rig> = {
    rifle: () => buildGuard(),
    marksman: () => buildGuard(false, false, false, 'marksman'),
    roomba: () => buildRoomba(),
    enforcerL: () => buildEnforcer(),
    enforcerR: () => buildEnforcer(),
    goliath: buildGoliath
  }
  it('each muzzle is at its barrel\'s foremost point', () => {
    for (const [k, make] of Object.entries(rigs) as Array<[keyof typeof DEFENDER_MUZZLE, () => Rig]>) {
      const [bone, x, y, z] = DEFENDER_MUZZLE[k]
      const verts = boneVerts(make(), bone)
      expect(verts.length, k).toBeGreaterThan(0)
      // The barrel's axis is the muzzle's one far-out coordinate.
      const axis = Math.abs(y) > Math.abs(z) ? 'y' : 'z'
      const sign = Math.sign(axis === 'y' ? y : z)
      const far = Math.max(...verts.map((v) => sign * v[axis]))
      expect(Math.abs(far - sign * (axis === 'y' ? y : z)), k).toBeLessThan(0.06)
      void x
    }
  })
})
