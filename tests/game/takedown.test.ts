// Round 2, R4: the blade from behind, choreographed.

import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  TAKEDOWN, TD_STAB, TD_IN, TD_PULL, TD_FREE, TD_END, TD_HOLD, takedownPose, victimPose, takedownCam
} from '@/game/sim/takedown'
import { makeCinePose } from '@/game/sim/cine'
import { buildMech, poseMech, restPose } from '@/game/models/mech'
import { buildGuard, poseGuard, restGuardPose } from '@/game/models/garrison'
import { FortressBuilder } from '@/game/world/fortress'
import { makeGarrison, killUnit, stepGarrison, drainEvents, type Target } from '@/game/sim/garrison'

const td = () => ({ grab: 0, draw: 0, plunge: 0, blade: 0 })

describe('the takedown\'s beats', () => {
  it('come in order: draw, stab, hold, pull, out', () => {
    expect(TD_STAB).toBeGreaterThan(0.2)
    expect(TD_IN).toBeGreaterThan(TD_STAB)
    expect(TD_PULL - TD_IN).toBeGreaterThan(0.6)
    expect(TD_FREE).toBeGreaterThan(TD_PULL)
    expect(TD_END).toBeGreaterThan(TD_FREE)
    expect(TD_HOLD).toBeCloseTo(TAKEDOWN.hold + TAKEDOWN.pull, 6)
    // Long enough to be a moment, short enough not to be a cutscene.
    expect(TD_END).toBeGreaterThan(1.6)
    expect(TD_END).toBeLessThan(2.6)
  })

  it('the blade is hidden until it springs, overshoots, and is put away at the end', () => {
    expect(takedownPose(0, td()).blade).toBe(0)
    expect(takedownPose(TAKEDOWN.draw * 0.3, td()).blade).toBe(0)
    let peak = 0
    for (let t = 0; t < TD_STAB; t += 0.01) peak = Math.max(peak, takedownPose(t, td()).blade)
    expect(peak).toBeGreaterThan(1.1)
    expect(takedownPose(TD_IN, td()).blade).toBeCloseTo(1, 2)
    expect(takedownPose(TD_PULL, td()).blade).toBeCloseTo(1, 2)
    expect(takedownPose(TD_END + 0.2, td()).blade).toBe(0)
  })

  it('the arm is cocked before it goes through, is through for the whole hold, and comes home', () => {
    const cocked = takedownPose(TD_STAB - 0.02, td())
    expect(cocked.draw).toBeGreaterThan(0.9)
    expect(cocked.plunge).toBe(0)
    expect(cocked.grab).toBeGreaterThan(0.9)
    for (const t of [TD_IN, (TD_IN + TD_PULL) / 2, TD_PULL]) expect(takedownPose(t, td()).plunge).toBeCloseTo(1, 2)
    const after = takedownPose(TD_END, td())
    expect(after.plunge).toBe(0)
    expect(after.grab).toBe(0)
    expect(after.draw).toBeLessThan(0.05)
  })

  it('the target is seized at once, run through at the stab, and limp before the blade leaves', () => {
    const v = { gripped: 0, impaled: 0, limp: 0 }
    expect(victimPose(0.12, v).gripped).toBeGreaterThan(0.9)
    expect(victimPose(TD_STAB - 0.01, v).impaled).toBe(0)
    expect(victimPose(TD_IN, v).impaled).toBeCloseTo(1, 2)
    expect(victimPose(TD_IN, v).limp).toBe(0)
    expect(victimPose(TD_PULL, v).limp).toBeGreaterThan(0.7)
  })
})

describe('the blade really goes through', () => {
  /** Mech at the origin facing +z, its target a reach ahead facing the same way. */
  const stage = (t: number) => {
    const mech = buildMech()
    const guard = buildGuard()
    guard.root.position.set(0, 0, TAKEDOWN.reach)
    const p = takedownPose(t, td())
    poseMech(mech, { ...restPose(), grab: p.grab, draw: p.draw, plunge: p.plunge, blade: p.blade })
    const v = victimPose(t, { gripped: 0, impaled: 0, limp: 0 })
    poseGuard(guard, { ...restGuardPose(), ...v })
    mech.root.updateMatrixWorld(true)
    guard.root.updateMatrixWorld(true)
    const base = mech.bones.blade!.getWorldPosition(new Vector3())
    // The blade runs along the bone's −y, 0.09 to 0.91 m from it.
    const dir = new Vector3(0, -1, 0).transformDirection(mech.bones.blade!.matrixWorld)
    return { mech, guard, base, dir, tip: base.clone().addScaledVector(dir, 0.91) }
  }

  it('at the hold, it passes through the middle of the target\'s body and its tip is out in front', () => {
    const { guard, base, dir, tip } = stage((TD_IN + TD_PULL) / 2)
    const chest = guard.bones.chest!.getWorldPosition(new Vector3())
    // Closest the blade's line comes to the middle of the torso.
    const torso = chest.clone().add(new Vector3(0, 0.15, 0))
    const along = torso.clone().sub(base).dot(dir)
    const miss = base.clone().addScaledVector(dir, along).distanceTo(torso)
    expect(along).toBeGreaterThan(0.09)
    expect(along).toBeLessThan(0.91)
    expect(miss).toBeLessThan(0.16)
    // The body is 0.3 m deep: the tip is clear of its front, where a camera in
    // front of the target sees it.
    expect(tip.z).toBeGreaterThan(chest.z + 0.2)
    expect(tip.y).toBeGreaterThan(0.7)
    expect(tip.y).toBeLessThan(1.35)
    expect(Math.abs(tip.x)).toBeLessThan(0.3)
  })

  it('cocked, the blade is still behind the target', () => {
    const { tip } = stage(TD_STAB - 0.03)
    expect(tip.z).toBeLessThan(TAKEDOWN.reach - 0.1)
  })

  it('the free hand is on the target, at shoulder height', () => {
    const { mech, guard } = stage(TD_IN)
    // The hand is at the end of the forearm, 0.45 m along it.
    const hand = new Vector3(0, -0.45, 0).applyMatrix4(mech.bones.foreL!.matrixWorld)
    const neck = guard.bones.head!.getWorldPosition(new Vector3())
    expect(hand.distanceTo(neck)).toBeLessThan(0.45)
  })
})

describe('the camera', () => {
  it('is beside the two until the stab, then cuts to the front of the target', () => {
    const out = makeCinePose()
    // The target at the origin facing +z.
    takedownCam(out, 0.1, 0, 0, 0, 0, 60)
    expect(out.z).toBeLessThan(0)
    expect(Math.abs(out.x)).toBeGreaterThan(1.5)
    takedownCam(out, TD_IN + 0.2, 0, 0, 0, 0, 60)
    expect(out.z).toBeGreaterThan(1.5)
    // Low, at stomach height, looking at the stomach: that is where the tip is.
    expect(out.y).toBeLessThan(1.4)
    expect(out.ty).toBeGreaterThan(0.9)
    expect(out.ty).toBeLessThan(1.3)
    expect(out.fov).toBeLessThan(45)
  })

  it('pushes in during the hold and eases back as the body is let go', () => {
    const a = makeCinePose()
    const b = makeCinePose()
    takedownCam(a, TD_IN, 0, 0, 0, 0, 60)
    takedownCam(b, TD_PULL, 0, 0, 0, 0, 60)
    expect(Math.hypot(b.x, b.z)).toBeLessThan(Math.hypot(a.x, a.z))
    takedownCam(a, TD_END, 0, 0, 0, 0, 60)
    expect(Math.hypot(a.x, a.z)).toBeGreaterThan(Math.hypot(b.x, b.z) + 0.6)
    expect(a.ty).toBeLessThan(b.ty)
  })

  it('follows the target wherever it faces', () => {
    const out = makeCinePose()
    takedownCam(out, TD_IN + 0.2, 10, 2, 5, Math.PI / 2, 60)
    // Facing +x: the front is at a larger x.
    expect(out.x).toBeGreaterThan(11.5)
    expect(out.y).toBeGreaterThan(2.8)
  })
})

describe('in the simulation', () => {
  const base = () => {
    const b = new FortressBuilder('t', 30, 30)
    b.ground(0, 0, 29, 29)
    b.insert(2, 2, 0)
    b.extract(27, 27)
    b.sentry(10, 10, 0)
    b.sentry(10, 14, Math.PI)
    const f = b.build()
    return { f, gar: makeGarrison(f) }
  }
  const mechAt = (x: number, z: number): Target => ({ x, y: 0, z, feetY: 0, height: 2.5, crouched: false, visible: true, moving: 1 } as Target)

  it('a seized guard sees nothing and does nothing', () => {
    const { f, gar } = base()
    const u = gar.units[0]!
    u.gripped = true
    // The mech stands right in front of it, in plain view.
    for (let i = 0; i < 120; i++) stepGarrison(gar, f.grid, mechAt(u.x, u.z + 3), 1 / 60)
    expect(u.state).toBe('patrol')
    expect(u.detect).toBe(0)
    u.gripped = false
    for (let i = 0; i < 120; i++) stepGarrison(gar, f.grid, mechAt(u.x, u.z + 3), 1 / 60)
    expect(u.state).not.toBe('patrol')
  })

  it('a body on the blade is not a body lying about: nobody finds it until it has fallen', () => {
    const { f, gar } = base()
    const victim = gar.units[0]!
    victim.gripped = true
    killUnit(gar, victim.id, victim.x, victim.z - 1, 'blade')
    victim.hold = 5
    expect(victim.gripped).toBe(false)
    expect(victim.death).toBe('front')
    drainEvents(gar)
    const away = { ...mechAt(4, 4), visible: false }
    const events = []
    // The other sentry faces it from eight metres: it would find a body in under a second.
    for (let i = 0; i < 60 * 4; i++) { stepGarrison(gar, f.grid, away, 1 / 60); events.push(...drainEvents(gar)) }
    expect(events.filter(e => e.type === 'body')).toHaveLength(0)
    for (let i = 0; i < 60 * 3; i++) { stepGarrison(gar, f.grid, away, 1 / 60); events.push(...drainEvents(gar)) }
    expect(events.filter(e => e.type === 'body')).toHaveLength(1)
  })
})
