// #81: the weapon in the mech's hand points where the round goes. Aimed, the
// barrel's world direction matches the view's pitch whether the mech stands,
// crouches or walks.

import { describe, expect, it } from 'vitest'
import { Vector3, Quaternion } from 'three'
import { buildMech, poseMech, restPose } from '@/game/models/mech'
import { WEAPON_IDS } from '@/game/data/ids'

const barrelPitch = (crouch: number, speed: number, aimPitch: number, weapon: (typeof WEAPON_IDS)[number]): number => {
  const rig = buildMech()
  const s = { ...restPose(), aim: 1, aimPitch, crouch, speed, stride: 0.7, weapon }
  poseMech(rig, s)
  rig.root.updateMatrixWorld(true)
  // Weapons run along their bone's −y (the barrel continues the forearm).
  const q = new Quaternion()
  rig.bones[weapon]!.getWorldQuaternion(q)
  const d = new Vector3(0, -1, 0).applyQuaternion(q)
  return Math.atan2(d.y, Math.hypot(d.x, d.z))
}

describe('the aimed weapon points along the view (#81)', () => {
  for (const weapon of WEAPON_IDS) {
    it(`${weapon}: level, up and down, standing, crouched and walking`, () => {
      for (const crouch of [0, 1]) {
        for (const speed of [0, 1]) {
          for (const p of [-0.8, -0.18, 0, 0.5, 1.0]) {
            const got = barrelPitch(crouch, speed, p, weapon)
            expect(Math.abs(got - p)).toBeLessThan((3 * Math.PI) / 180)
          }
        }
      }
    })
  }
})
