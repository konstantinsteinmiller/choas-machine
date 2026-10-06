// The rigs (`models/mech.ts`, `models/garrison.ts`): each character is one
// skinned mesh plus one outline, with the bones its pose function drives.

import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { buildMech, poseMech, restPose, MECH_HEIGHT, MECH_HEIGHT_CROUCH, MECH_EYE, MECH_EYE_CROUCH, MECH_SCALE } from '@/game/models/mech'
import { COVER_H } from '@/game/world/fortress'
import {
  buildGuard, poseGuard, restGuardPose, buildDrone, poseDrone, buildEnforcer, poseEnforcer, buildGoliath, poseGoliath,
  ENFORCER_JOINTS, GUARD_HEIGHT
} from '@/game/models/garrison'
import type { Rig } from '@/game/models/kit'
import { WEAPON_IDS } from '@/game/data/ids'

const bounds = (rig: Rig): { minY: number; maxY: number } => {
  rig.mesh.geometry.computeBoundingBox()
  const b = rig.mesh.geometry.boundingBox!
  return { minY: b.min.y, maxY: b.max.y }
}
const finite = (rig: Rig): boolean =>
  Object.values(rig.bones).every(b => [...b.position.toArray(), ...b.quaternion.toArray(), ...b.scale.toArray()].every(Number.isFinite))

const RIGS: Array<[string, () => Rig]> = [
  ['mech', buildMech],
  ['guard', () => buildGuard(false)],
  ['commander', () => buildGuard(true)],
  ['drone', buildDrone],
  ['enforcer', buildEnforcer],
  ['goliath', buildGoliath]
]

describe('every rig', () => {
  it.each(RIGS)('%s is one skinned mesh and one outline', (_name, build) => {
    const rig = build()
    expect(rig.root.children).toHaveLength(2)
    expect(rig.outline).toBeTruthy()
    // A lit group and a glow group: two materials, so three draw calls.
    expect(Array.isArray(rig.mesh.material) ? rig.mesh.material.length : 1).toBeLessThanOrEqual(2)
    const g = rig.mesh.geometry
    expect(g.attributes.skinIndex!.count).toBe(g.attributes.position!.count)
  })

  // The mech is one, not a crowd, and carries its three weapons in full
  // detail (#167): it gets a little more room than the defenders.
  it.each(RIGS)('%s is light enough for a crowd of them', (name, build) => {
    const tris = build().mesh.geometry.index!.count / 3
    expect(tris).toBeLessThan(name === 'mech' ? 12000 : 9000)
  })
})

describe('the mech', () => {
  it('stands on the ground at its stated height', () => {
    const rig = buildMech()
    // The feet, not the mesh's lowest point: in the bind pose the holstered
    // weapons hang from the arm below the floor, scaled away when posed.
    rig.root.updateMatrixWorld(true)
    const foot = new Vector3()
    for (const tag of ['L', 'R']) {
      rig.bones[`foot${tag}`]!.getWorldPosition(foot)
      // The sole is 8 cm under the ankle bone.
      expect(foot.y).toBeGreaterThan(0.05)
      expect(foot.y).toBeLessThan(0.12)
    }
    const head = new Vector3()
    rig.bones.head!.getWorldPosition(head)
    expect(head.y + 0.42).toBeGreaterThan(MECH_HEIGHT - 0.1)
    expect(head.y + 0.42).toBeLessThan(MECH_HEIGHT + 0.15)
  })

  it('carries all three weapons and shows only the one drawn', () => {
    const rig = buildMech()
    for (const drawn of WEAPON_IDS) {
      poseMech(rig, { ...restPose(), weapon: drawn, aim: 1 })
      for (const w of WEAPON_IDS) {
        expect(rig.bones[w]!.scale.x, `${w} while holding ${drawn}`).toBeCloseTo(w === drawn ? 1 : 0.001)
      }
    }
  })

  it('sheathes the blade until it is used, and puts the gun away to stab', () => {
    const rig = buildMech()
    poseMech(rig, restPose())
    expect(rig.bones.blade!.scale.y).toBeLessThan(0.01)
    poseMech(rig, { ...restPose(), blade: 1 })
    expect(rig.bones.blade!.scale.y).toBeCloseTo(1)
    poseMech(rig, { ...restPose(), stab: 0.5 })
    expect(rig.bones.blade!.scale.y).toBeCloseTo(1)
    expect(rig.bones.sniper!.scale.x).toBeCloseTo(0.001)
  })

  it('crouched, the whole mech fits under a cover block; standing, its eyes clear it', () => {
    const rig = buildMech()
    const head = new Vector3()
    const top = (): number => {
      rig.root.updateMatrixWorld(true)
      rig.bones.head!.getWorldPosition(head)
      // The helmet reaches 0.42 (drawn at MECH_SCALE) above the head bone when upright.
      return head.y + 0.42 * MECH_SCALE
    }
    poseMech(rig, restPose())
    // The mech is drawn at MECH_SCALE: its helmet shows over cover, its eyes clear it.
    expect(top()).toBeGreaterThan(COVER_H + 0.15)
    expect(MECH_EYE).toBeGreaterThan(COVER_H)
    poseMech(rig, { ...restPose(), crouch: 1 })
    expect(top()).toBeLessThan(MECH_HEIGHT_CROUCH)
    expect(MECH_HEIGHT_CROUCH).toBeLessThan(COVER_H)
    expect(MECH_EYE_CROUCH).toBeLessThan(COVER_H)
  })

  it('every pose channel keeps the bones finite', () => {
    const rig = buildMech()
    const channels = ['speed', 'crouch', 'aim', 'recoil', 'blade', 'stab', 'climb', 'cable', 'air'] as const
    for (const c of channels) {
      poseMech(rig, { ...restPose(), [c]: 1, stride: 2.2, time: 3.3, climbPhase: 1.1, aimPitch: 0.4, spin: 9 })
      expect(finite(rig), c).toBe(true)
    }
  })
})

describe('the garrison', () => {
  it('a guard stands at its stated height and falls when shot', () => {
    const rig = buildGuard()
    const { minY, maxY } = bounds(rig)
    expect(minY).toBeGreaterThan(-0.05)
    expect(maxY).toBeGreaterThan(GUARD_HEIGHT - 0.2)
    expect(maxY).toBeLessThan(GUARD_HEIGHT + 0.25)
    const pose = restGuardPose()
    poseGuard(rig, pose)
    const up = rig.bones.hips!.position.y
    poseGuard(rig, { ...pose, deadT: 2, death: 'back' })
    expect(rig.bones.hips!.position.y).toBeLessThan(up - 0.5)
    expect(finite(rig)).toBe(true)
  })

  it('the Commander is a guard in his own colours', () => {
    const guard = buildGuard(false).mesh.geometry.attributes.color!.array as Float32Array
    const commander = buildGuard(true).mesh.geometry.attributes.color!.array as Float32Array
    expect(Array.from(commander.slice(0, 60))).not.toEqual(Array.from(guard.slice(0, 60)))
  })

  it('a dormant Enforcer is dark and slumped; awake it stands and lights up', () => {
    const rig = buildEnforcer()
    const base = { time: 0, stride: 0, speed: 0, aimYaw: 0, aimPitch: 0, recoilL: 0, recoilR: 0, deadT: 0 }
    poseEnforcer(rig, { ...base, power: 0 })
    const asleep = rig.bones.hips!.position.y
    const dark = rig.glowMaterial.color.r
    poseEnforcer(rig, { ...base, power: 1 })
    expect(rig.bones.hips!.position.y).toBeGreaterThan(asleep + 0.3)
    expect(rig.glowMaterial.color.r).toBeGreaterThan(dark + 0.5)
    for (const j of ENFORCER_JOINTS) expect(rig.bones[j], j).toBeTruthy()
  })

  it('the Goliath turns its turret and raises its cannon without moving the hull', () => {
    const rig = buildGoliath()
    const base = { time: 0, turretYaw: 0, barrelPitch: 0, recoil: 0, rumble: 0, dead: 0 }
    poseGoliath(rig, base)
    const hull = rig.bones.hull!.quaternion.clone()
    const turret = rig.bones.turret!.quaternion.clone()
    poseGoliath(rig, { ...base, turretYaw: 1.2, barrelPitch: 0.3 })
    expect(rig.bones.hull!.quaternion.equals(hull)).toBe(true)
    expect(rig.bones.turret!.quaternion.equals(turret)).toBe(false)
    expect(rig.bones.vents).toBeTruthy()
  })

  it('a drone spins opposite rotors opposite ways', () => {
    const rig = buildDrone()
    poseDrone(rig, { time: 0, spin: 1, pitch: 0, roll: 0, eyeYaw: 0, eyePitch: 0, alarm: 0, deadT: 0, landed: false })
    expect(rig.bones.rotor0!.rotation.y).toBe(1)
    expect(rig.bones.rotor1!.rotation.y).toBe(-1)
  })
})
