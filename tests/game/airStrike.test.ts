// The assassination from above (after Assassin's Creed Odyssey / Origins):
// off the rope feet first, the blade into the neck, riding the body down,
// kneeling on it, up again — one fluid motion, always with its kill-cam.

import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  AIR_CROUCH_S, AIR_FLIGHT_MAX_S, AIR_FLIGHT_MIN_S, airAt, airCam, airMark, planAir, type AirPlan
} from '@/game/sim/airStrike'
import { bodySink, placeKillBody } from '@/game/sim/killPose'
import { buildMech, poseMech, restPose, BLADE_TIP_LOCAL } from '@/game/models/mech'

const FLAT = (): number => 0
const from = { x: 0, y: 5, z: 0 }
const guard = { x: 0, y: 0, z: 4 }
const HEAD = 1.6

/** The mech posed as the mission poses it, `t` into the move. */
const posed = (plan: AirPlan, t: number) => {
  const rig = buildMech()
  const b = airAt(plan, t)
  const s = restPose()
  s.crouch = b.crouch
  s.air = b.air
  s.blade = b.blade
  s.stow = 1
  poseMech(rig, s)
  const mark = airMark(plan, b)
  const off = placeKillBody(rig, b, plan.yaw, b, mark)
  if (b.phase !== 'crouch' && b.phase !== 'flight') rig.root.position.y += bodySink(rig, 0)
  rig.root.updateMatrixWorld(true)
  return { rig, b, mark, off: Math.hypot(off.x, off.y, off.z), tip: rig.bones.blade!.localToWorld(new Vector3(0, BLADE_TIP_LOCAL, 0)) }
}

describe('the assassination from above', () => {
  const behind = planAir(from, guard, HEAD, FLAT, 0)
  const facing = planAir(from, guard, HEAD, FLAT, Math.PI)

  it('knows whether the guard had its back to the mech or faced it', () => {
    expect(behind.front).toBe(false)
    expect(facing.front).toBe(true)
  })

  it('runs crouch, flight, impact, ride, kneel, rise in order, the flight warped onto a fixed range', () => {
    for (const p of [behind, facing, planAir({ x: 0, y: 14, z: 0 }, guard, HEAD, FLAT, 0), planAir({ x: 0, y: 2.2, z: 2 }, guard, HEAD, FLAT, 0)]) {
      expect(p.flight).toBeGreaterThanOrEqual(AIR_FLIGHT_MIN_S)
      expect(p.flight).toBeLessThanOrEqual(AIR_FLIGHT_MAX_S)
      const order = ['crouch', 'flight', 'impact', 'ride', 'kneel', 'rise', 'done']
      let last = 0
      for (let t = 0; t <= p.total + 0.05; t += 0.01) {
        const i = order.indexOf(airAt(p, t).phase)
        expect(i).toBeGreaterThanOrEqual(last)
        last = i
      }
      expect(last).toBe(order.length - 1)
      expect(p.hitAt).toBeCloseTo(AIR_CROUCH_S + p.flight, 6)
      expect(p.releaseAt).toBeGreaterThan(p.hitAt)
    }
  })

  it('moves as one motion: no jump in where the feet are, frame to frame', () => {
    for (const p of [behind, facing]) {
      let prev = airAt(p, 0)
      for (let t = 1 / 60; t <= p.total + 0.1; t += 1 / 60) {
        const b = airAt(p, t)
        // 5 m drop over ~0.6 s at most, eased: never more than 0.25 m a frame.
        expect(Math.hypot(b.x - prev.x, b.y - prev.y, b.z - prev.z)).toBeLessThan(0.25)
        expect(Math.abs(b.pitch - prev.pitch)).toBeLessThan(0.12)
        prev = b
      }
    }
  })

  it('lands with its knees on the shoulders as the blade goes in, then kneels beyond the guard\'s feet the way the body folds', () => {
    const b = airAt(behind, behind.hitAt + 0.01)
    expect(b.phase).toBe('impact')
    // The crouched mech's knees ~0.45 over its feet: at the shoulders.
    expect(b.y + 0.45).toBeGreaterThan(HEAD - 0.5)
    expect(b.y + 0.45).toBeLessThan(HEAD)
    // The body falls on, along the way the mech came: the kneel and the end are past the guard's feet.
    for (const p of [behind, facing]) {
      expect(p.kneel.z).toBeGreaterThan(guard.z)
      expect(p.end.z).toBeGreaterThan(p.kneel.z)
      expect(p.end.y).toBe(guard.y)
    }
  })

  it('the blade arm rises overhead in the flight, is aimed at the mark at the blow and held there, and comes out while kneeling', () => {
    const early = airAt(behind, AIR_CROUCH_S + behind.flight * 0.2)
    expect(early.arm).toBeLessThan(0.1)
    const late = airAt(behind, AIR_CROUCH_S + behind.flight * 0.78)
    expect(late.arm).toBeGreaterThan(0.6)
    expect(late.cock[1]).toBeGreaterThan(0.9)
    const hit = airAt(behind, behind.hitAt + 0.01)
    expect(hit.aim).toBe(1)
    expect(hit.pin).toBe(1)
    const kneel = airAt(behind, behind.total - 0.7)
    expect(kneel.phase === 'kneel' || kneel.phase === 'rise').toBe(true)
    expect(airAt(behind, behind.total + 0.1).blade).toBe(0)
  })

  it('at the blow the blade\'s tip is in the mark (the neck), and the pin only corrects a little', () => {
    for (const p of [behind, facing]) {
      const r = posed(p, p.hitAt + 0.01)
      expect(r.tip.distanceTo(new Vector3(r.mark.x, r.mark.y, r.mark.z))).toBeLessThan(0.2)
      expect(r.off).toBeLessThan(0.35)
    }
  })

  it('the guard\'s knees give under the weight from the blow until it is let go, and the mark goes down with them', () => {
    expect(airAt(behind, behind.hitAt - 0.01).guardKneel).toBe(0)
    expect(airAt(behind, behind.releaseAt).guardKneel).toBeGreaterThan(0.9)
    const b = airAt(behind, behind.releaseAt)
    expect(airMark(behind, b).y).toBeLessThan(behind.mark.y - 0.2)
  })

  it('kneeling on the body and getting up, no part of the mech goes through the floor', () => {
    for (const p of [behind, facing]) {
      for (let t = p.hitAt; t <= p.total; t += 0.03) {
        const { rig } = posed(p, t)
        expect(bodySink(rig, 0, 0)).toBeLessThan(0.005)
      }
    }
  })

  it('stays on the guard\'s floor: next to a drop the kneel and the end come back over the floor', () => {
    // Nothing past z = 4.3: the body would fold out over the edge.
    const edge = planAir(from, guard, HEAD, (x, z) => (z > 4.3 ? null : 0), 0)
    expect(edge.kneel.z).toBeLessThanOrEqual(4.3)
    expect(edge.end.z).toBeLessThanOrEqual(4.3)
  })

  it('always has its kill-cam: high behind, over the guard as it falls, then low and close on the kneeling mech, without a cut', () => {
    const cam = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, fov: 0 }
    airCam(cam, behind, 0.05, from, 60)
    expect(cam.z).toBeLessThan(from.z)
    expect(cam.y).toBeGreaterThan(from.y)
    airCam(cam, behind, behind.hitAt - 0.02, airAt(behind, behind.hitAt - 0.02), 60)
    expect(cam.y).toBeGreaterThan(HEAD + 3)
    airCam(cam, behind, behind.total - 0.7, airAt(behind, behind.total - 0.7), 60)
    expect(cam.y).toBeLessThan(2)
    // Frame by frame of the screen: the move runs in slow time (0.45, the mission's AIR_SLOW).
    let prev: typeof cam | null = null
    for (let t = 0; t <= behind.total; t += 0.45 / 60) {
      airCam(cam, behind, t, airAt(behind, t), 60)
      if (prev) expect(Math.hypot(cam.x - prev.x, cam.y - prev.y, cam.z - prev.z)).toBeLessThan(0.16)
      prev = { ...cam }
    }
  })
})
