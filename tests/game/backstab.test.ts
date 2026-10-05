// The backstab, three ways (after Assassin's Creed Odyssey / Origins).

import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  BACKSTAB_VARIANTS, VARIANTS, backstabAt, backstabCam, grabWorld, guardToWorld, guardYawAt, markAt, markWorld, pickVariant, type BackstabVariant
} from '@/game/sim/backstab'
import { placeKillBody } from '@/game/sim/killPose'
import { HIP_Y } from '@/game/sim/airStrike'
import { buildMech, poseMech, restPose, BLADE_TIP_LOCAL } from '@/game/models/mech'
import { buildGuard, poseGuard, restGuardPose } from '@/game/models/garrison'
import { poseBackstabGuard, poseBackstabMech } from '@/game/sim/backstabStage'
import { FortressBuilder } from '@/game/world/fortress'
import { makeGarrison, killUnit, stepGarrison, drainEvents, type Target } from '@/game/sim/garrison'

const G = { x: 3, y: 0.5, z: -2, yaw: 0.7 }
/** How far the free hand may be from the middle of the guard's chest, a shoulder or the neck when it holds him (m). */
const HAND_REACH = 0.3

/** The mech posed as the mission poses it, `t` into a variant; the tip's miss before the pin and after. */
const posed = (variant: BackstabVariant, t: number) => {
  const rig = buildMech()
  const bp = backstabAt(variant, t)
  const s = restPose()
  s.crouch = bp.crouch
  s.grab = bp.grab
  s.blade = bp.blade
  poseMech(rig, s)
  const [fx, , fz] = guardToWorld(G.x, G.y, G.z, G.yaw, bp.mx, 0, bp.mz)
  const mark = markWorld(markAt(variant, t), bp, G.x, G.y, G.z, G.yaw)
  const off = placeKillBody(rig, { x: fx, y: G.y, z: fz }, G.yaw + bp.myaw, { pitch: bp.lean, pivot: HIP_Y, arm: bp.arm, aim: bp.aim, cock: bp.cock, pin: bp.pin }, mark)
  const tip = rig.bones.blade!.localToWorld(new Vector3(0, BLADE_TIP_LOCAL, 0))
  return { rig, bp, mark, off: Math.hypot(off.x, off.y, off.z), tip }
}

describe('the backstab variants', () => {
  it('are three, each with its blows in order, the release after the last blow and the end after the release', () => {
    expect(BACKSTAB_VARIANTS).toHaveLength(3)
    for (const v of BACKSTAB_VARIANTS) {
      const d = VARIANTS[v]
      for (let i = 1; i < d.hits.length; i++) expect(d.hits[i]!.t).toBeGreaterThan(d.hits[i - 1]!.t)
      expect(d.release).toBeGreaterThan(d.hits[d.hits.length - 1]!.t + 0.3)
      expect(d.end).toBeGreaterThan(d.release)
      // A moment, not a cutscene.
      expect(d.end).toBeGreaterThan(1.8)
      expect(d.end).toBeLessThan(3.2)
    }
  })

  it('never plays the same one twice running', () => {
    let last: BackstabVariant | null = null
    for (let i = 0; i < 60; i++) {
      const next = pickVariant(last, (i * 0.618) % 1)
      expect(next).not.toBe(last)
      last = next
    }
    const seen = new Set<BackstabVariant>()
    for (const r of [0, 0.4, 0.99]) seen.add(pickVariant(null, r))
    expect(seen.size).toBe(3)
  })

  it('the kneel variant strikes twice, the second time down into a kneeling guard', () => {
    const d = VARIANTS.kneel
    expect(d.hits).toHaveLength(2)
    expect(backstabAt('kneel', d.hits[1]!.t).kneel).toBeGreaterThan(0.9)
    expect(backstabAt('kneel', d.hits[0]!.t).kneel).toBeLessThan(0.1)
  })

  it('the throat variant turns the guard toward the mech before the blow', () => {
    const t = VARIANTS.throat.hits[0]!.t
    const bp = backstabAt('throat', t)
    expect(bp.turn).toBeGreaterThan(0.9)
    // The guard now faces (roughly) where the mech is.
    const gy = guardYawAt(G.yaw, bp)
    const [mx, , mz] = guardToWorld(G.x, G.y, G.z, G.yaw, bp.mx, 0, bp.mz)
    const toMech = Math.atan2(mx - G.x, mz - G.z)
    const d = Math.atan2(Math.sin(toMech - gy), Math.cos(toMech - gy))
    expect(Math.abs(d)).toBeLessThan(0.9)
  })

  for (const v of BACKSTAB_VARIANTS) {
    it(`${v}: at every blow the blade's tip is in the mark, and the pin shifts the mech only a little`, () => {
      for (const h of VARIANTS[v].hits) {
        const r = posed(v, h.t + 0.02)
        expect(r.bp.pin).toBeGreaterThan(0.95)
        // In: within the blade's depth of the mark.
        expect(r.tip.distanceTo(new Vector3(r.mark.x, r.mark.y, r.mark.z))).toBeLessThan(0.2)
        // The choreography puts the arm there by itself: the pin only corrects.
        expect(r.off).toBeLessThan(0.12)
      }
    })

    it(`${v}: the mech faces the guard and stays behind it until the guard is let go`, () => {
      const d = VARIANTS[v]
      for (let t = 0; t <= d.release; t += 0.05) {
        const bp = backstabAt(v, t)
        // Never inside the guard's body.
        expect(Math.hypot(bp.mx, bp.mz)).toBeGreaterThan(0.3)
      }
    })

    it(`${v}: the kill-cam never cuts: it moves smoothly the whole kill`, () => {
      const cam = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, fov: 0 }
      let prev: typeof cam | null = null
      for (let t = 0; t <= VARIANTS[v].end; t += 1 / 60) {
        backstabCam(cam, v, t, G.x, G.y, G.z, G.yaw, 60)
        if (prev) expect(Math.hypot(cam.x - prev.x, cam.y - prev.y, cam.z - prev.z)).toBeLessThan(0.05)
        prev = { ...cam }
      }
    })
  }
})

describe('each variant\'s beats', () => {
  for (const v of BACKSTAB_VARIANTS) {
    it(`${v}: the blade is in until the hand is on the guard, out at every blow, and put away by the end`, () => {
      const d = VARIANTS[v]
      expect(backstabAt(v, 0).blade).toBeLessThan(0.05)
      for (const h of d.hits) expect(backstabAt(v, h.t).blade).toBeCloseTo(1, 2)
      expect(backstabAt(v, d.end).blade).toBe(0)
      expect(backstabAt(v, d.end).arm).toBe(0)
      expect(backstabAt(v, d.end).grab).toBe(0)
    })

    it(`${v}: the guard is seized before the first blow, run through at it, and limp before it is let go`, () => {
      const d = VARIANTS[v]
      const first = d.hits[0]!.t
      expect(backstabAt(v, first - 0.05).grip).toBeGreaterThan(0.9)
      // Seized first, alive: it arches only as the blade comes in.
      expect(backstabAt(v, d.keys[1]!.t).grip).toBeGreaterThan(0.99)
      expect(backstabAt(v, d.keys[1]!.t).arch).toBeLessThan(0.05)
      const at = backstabAt(v, first)
      expect(at.arch).toBeGreaterThan(0.9)
      expect(at.limp).toBeLessThan(0.05)
      // Going limp before it is let go (the throat kill shoves it away still half alive).
      expect(backstabAt(v, d.release - 0.01).limp).toBeGreaterThan(0.5)
    })
  }
})

describe('both bodies off the mission\'s stage (the training demo, the model bench)', () => {
  /** The mech and the guard posed `t` into a variant, the guard at `G`. */
  const stage = (variant: BackstabVariant, t: number) => {
    const mech = buildMech()
    const guard = buildGuard()
    const s = restPose()
    const bp = poseBackstabMech(mech, s, variant, t, G.x, G.y, G.z, G.yaw)
    const g = restGuardPose()
    guard.root.position.set(G.x, G.y, G.z)
    guard.root.rotation.y = poseBackstabGuard(g, variant, t, G.yaw)
    poseGuard(guard, g)
    mech.root.updateMatrixWorld(true)
    guard.root.updateMatrixWorld(true)
    return { mech, guard, s, g, bp }
  }

  for (const v of BACKSTAB_VARIANTS) {
    it(`${v}: posed as the mission poses it: the weapon put away, the tip in the mark at the blow`, () => {
      const h = VARIANTS[v].hits[0]!
      const ref = posed(v, h.t + 0.02)
      const { mech, s } = stage(v, h.t + 0.02)
      expect(s.stow).toBe(1)
      expect(s.stab).toBe(0)
      const tip = mech.bones.blade!.localToWorld(new Vector3(0, BLADE_TIP_LOCAL, 0))
      expect(tip.distanceTo(ref.tip)).toBeLessThan(1e-6)
      expect(tip.distanceTo(new Vector3(ref.mark.x, ref.mark.y, ref.mark.z))).toBeLessThan(0.2)
    })

    it(`${v}: at every blow the free hand is where the variant puts it (over the mouth, on a shoulder), on the guard as posed`, () => {
      for (const h of VARIANTS[v].hits) {
        const { mech, guard } = stage(v, h.t)
        // The palm, at the end of the forearm.
        const hand = new Vector3(0, -0.45, 0.02).applyMatrix4(mech.bones.foreL!.matrixWorld)
        const bp = backstabAt(v, h.t)
        const at = grabWorld(v, bp, G.x, G.y, G.z, G.yaw)
        expect(hand.distanceTo(new Vector3(at.x, at.y, at.z))).toBeLessThan(0.08)
        // And that is on the body: within a hand's breadth of the head, the neck or a shoulder.
        const points = [guard.bones.head!.localToWorld(new Vector3(0, 0.14, 0.08)), ...['head', 'armL', 'armR'].map(b => guard.bones[b]!.getWorldPosition(new Vector3()))]
        expect(Math.min(...points.map(q => hand.distanceTo(q)))).toBeLessThan(HAND_REACH)
      }
    })

    it(`${v}: held on the blade until let go, then falling forward from where it was turned`, () => {
      const d = VARIANTS[v]
      const held = stage(v, d.release - 0.05)
      expect(held.g.deadT).toBe(0)
      expect(held.g.gripped).toBeGreaterThan(0.9)
      const let_ = stage(v, d.release + 0.4)
      expect(let_.g.death).toBe('front')
      expect(let_.g.deadT).toBeCloseTo(0.4, 6)
      expect(let_.g.kneel).toBe(0)
      expect(let_.guard.root.rotation.y).toBeCloseTo(guardYawAt(G.yaw, backstabAt(v, d.release)), 6)
    })
  }
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
