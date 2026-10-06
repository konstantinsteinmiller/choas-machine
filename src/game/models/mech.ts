import { BoxGeometry, CylinderGeometry, Quaternion, Vector3 } from 'three'
import { RigBuilder, cap, ell, pose, nudge, rbox, rcyl, scaleBone, sph, stripUv, torus, type Rig } from './kit'
import { PAL } from './palette'
import type { WeaponId } from '../data/ids'

/**
 * Where each weapon's nose is on its bone (the bone's local frame: the barrel
 * runs down −y). The round's flash, trail and rocket leave from here, in the
 * game and in the story's scenes (#117).
 */
export const MUZZLE_TIP: Readonly<Record<WeaponId, readonly [string, number, number, number]>> = {
  sniper: ['sniper', 0, -1.42, 0.02], minigun: ['minigunBarrels', 0, -0.66, 0], rocket: ['rocket', 0, -0.95, 0.06]
}

/**
 * ─── The mech ────────────────────────────────────────────────────────────────
 *
 * The player's machine: about 2.5 m tall, chunky and friendly, lilac armour
 * over a dark suit with a pink visor. One skinned mesh (three draw calls with
 * its outline), built in code.
 *
 * It faces +z. Its right arm carries the retractable energy blade and holds
 * whichever of the three weapons is drawn; all three are part of the rig and
 * the two that are holstered are scaled to nothing, so switching costs no
 * draw call and no rebuild.
 *
 * Arms hang along their bone's -y. Raising a shoulder by -90° about x points
 * the arm, and whatever it holds, along +z.
 */

/**
 * The mech is built at its design size and drawn at this share of it: a
 * little taller than a guard, not a head and a half (the blade meets a
 * guard's neck at a believable angle). Every size below is the drawn one.
 */
export const MECH_SCALE = 0.8
/** Standing eye height, crouched eye height, and the body's radius (m). */
// Standing, the eye sits just under the helmet's top: it still clears a cover block (1.8 m).
export const MECH_EYE = 1.95
export const MECH_EYE_CROUCH = 1.4 * MECH_SCALE
export const MECH_RADIUS = 0.42 * MECH_SCALE
export const MECH_HEIGHT = 2.5 * MECH_SCALE
/** Top of the helmet when crouched: what must stay under a cover block. */
export const MECH_HEIGHT_CROUCH = 1.65 * MECH_SCALE

const _down = new Vector3(0, -1, 0)
const _qa = new Quaternion()
const _qb = new Quaternion()
const _qi = new Quaternion()
const _qc = new Quaternion()
const _qe = new Quaternion()
const _va = new Vector3()
const _vb = new Vector3()
const _vs = new Vector3()

/** The blade's tip, shoulder frame, with the elbow bent `phi` (rad, negative: forward). */
const tipAt = (e: Vector3, b: Vector3, phi: number, out: Vector3): Vector3 =>
  out.set(e.x + b.x, e.y + b.y * Math.cos(phi) - b.z * Math.sin(phi), e.z + b.y * Math.sin(phi) + b.z * Math.cos(phi))

/** The most the elbow bends for a thrust (rad). */
const ELBOW_MAX = 2.3

/**
 * Aim the blade arm along the world direction `dir` (unit), blended in by
 * `w`: the shoulder turns so the line from the shoulder to the blade's tip
 * points that way. With `reach` (m, world) the elbow bends so the tip is that
 * far from the shoulder (a two-bone reach, the elbow down and back); without
 * it the arm is straight. Called after `poseMech` and after the rig is
 * placed; a kill's choreography uses it to cock the arm and to drive the
 * blade at a mark (`sim/backstab.ts`, `sim/airStrike.ts`, `sim/killPose.ts`).
 */
export const aimBladeArm = (rig: Rig, dir: Vector3, w: number, reach?: number): void => {
  const blade = rig.bones.blade
  if (!blade) return
  aimArm(rig, 'R', dir, w, reach, _tipR.set(blade.position.x, blade.position.y + BLADE_TIP_LOCAL, blade.position.z))
}

/** The free hand's palm in its forearm's frame (design size). */
const HAND_LOCAL = new Vector3(0, -0.45, 0.02)
const _tipR = new Vector3()
const _vd = new Vector3()

/**
 * The free (left) hand onto a point in the world, blended in by `w`: the
 * shoulder turns and the elbow bends so the palm is there (`aimArm`). A
 * kill's choreography uses it to clamp the hand over a guard's mouth or on
 * its shoulder.
 */
export const reachFreeHand = (rig: Rig, at: { x: number; y: number; z: number }, w: number): void => {
  const sh = rig.bones.shoulderL
  if (!sh || w <= 0) return
  rig.root.updateMatrixWorld(true)
  sh.getWorldPosition(_vs)
  _vb.set(at.x - _vs.x, at.y - _vs.y, at.z - _vs.z)
  const reach = _vb.length()
  if (reach < 1e-4) return
  aimArm(rig, 'L', _vd.copy(_vb).multiplyScalar(1 / reach), w, reach, HAND_LOCAL)
}

/**
 * An arm along the world direction `dir` (unit), blended in by `w`: the
 * shoulder turns so the line from it to `tip` (a point in the forearm's frame:
 * the blade's point, the palm) points that way, and with `reach` (m, world)
 * the elbow bends so the tip is that far from the shoulder.
 */
const aimArm = (rig: Rig, side: 'L' | 'R', dir: Vector3, w: number, reach: number | undefined, tip: Vector3): void => {
  const sh = rig.bones[`shoulder${side}`]
  const fore = rig.bones[`fore${side}`]
  if (!sh || !fore || !sh.parent || w <= 0) return
  rig.root.updateMatrixWorld(true)
  // The elbow: bisect for the bend that gives the reach.
  let phi = 0
  const tx = tip.x
  const ty = tip.y
  const tz = tip.z
  if (reach !== undefined) {
    const e = _va.copy(fore.position)
    const b = _vb.set(tx, ty, tz)
    const want = reach / sh.getWorldScale(_vs).x
    let lo = -ELBOW_MAX
    let hi = 0
    if (tipAt(e, b, hi, _vs).length() <= want) phi = 0
    else if (tipAt(e, b, lo, _vs).length() >= want) phi = lo
    else {
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2
        if (tipAt(e, b, mid, _vs).length() > want) hi = mid
        else lo = mid
      }
      phi = (lo + hi) / 2
    }
  }
  // The line to the tip in the shoulder's frame, turned onto its own "down"
  // about its x (so the bend stays in the arm's plane), then down onto `dir`.
  _qe.identity()
  if (phi !== 0) {
    tipAt(_va.copy(fore.position), _vb.set(tx, ty, tz), phi, _vs)
    _vs.x = 0
    _qe.setFromUnitVectors(_vs.normalize(), _down)
  }
  sh.parent.getWorldQuaternion(_qa)
  _qb.setFromUnitVectors(_down, dir)
  _qa.invert().multiply(_qb).multiply(_qe)
  sh.quaternion.slerp(_qa, Math.min(1, w))
  _qc.setFromAxisAngle(_vs.set(1, 0, 0), phi)
  fore.quaternion.slerp(_qc, Math.min(1, w))
}

/** The blade's tip in its bone's frame (an 0.82 m blade centred 0.5 m out, design size). */
export const BLADE_TIP_LOCAL = -0.91

/** x of the mech's own right (it faces +z, so its right is -x). */
const RIGHT = -1

export const buildMech = (): Rig => {
  const b = new RigBuilder()
  b.bone('hips', null, [0, 1.06, 0])
  b.bone('spine', 'hips', [0, 0.17, 0])
  b.bone('chest', 'spine', [0, 0.2, 0])
  b.bone('head', 'chest', [0, 0.66, 0.02])

  // ── Torso ──
  b.part('hips', rbox(0.6, 0.34, 0.42, 0.45, 10, 8), PAL.mechSuit)
  b.part('spine', rcyl(0.2, 0.26, 0.06, 10), PAL.mechSuitDeep, { p: [0, 0.06, 0] })
  b.part('chest', rbox(0.86, 0.6, 0.56, 0.4, 12, 10), PAL.mechArmor, { p: [0, 0.3, 0] })
  b.part('chest', rbox(0.5, 0.24, 0.1, 0.5, 8, 6), PAL.mechArmorHi, { p: [0, 0.4, 0.26] })
  b.part('chest', sph(0.085, 8, 6), PAL.mechCore, { p: [0, 0.2, 0.27], glow: true, outline: false })
  // The pack, with the power line the cyan trims of the base echo.
  b.part('chest', rbox(0.52, 0.5, 0.26, 0.45, 8, 8), PAL.mechSuit, { p: [0, 0.3, -0.36] })
  b.part('chest', rbox(0.08, 0.34, 0.04, 0.6, 6, 6), PAL.mechCore, { p: [0, 0.3, -0.5], glow: true, outline: false })
  // Round 5 (#147), the finer layer the dropship has: rivets at the chest
  // plate's corners, seams down the chest's flanks, cooling slats either side
  // of the pack's power line.
  for (const rx of [-0.21, 0.21]) for (const ry of [0.31, 0.49]) b.part('chest', sph(0.022, 6, 4), PAL.mechArmorDeep, { p: [rx, ry, 0.312], outline: false })
  b.mirror((side) => b.part('chest', rbox(0.022, 0.4, 0.5, 0.5, 4, 6), PAL.mechArmorDeep, { p: [side * 0.428, 0.3, 0], outline: false }))
  for (const sx of [-0.16, 0.16]) for (const sy of [0.2, 0.3, 0.4]) b.part('chest', rbox(0.13, 0.03, 0.03, 0.4, 4, 2), PAL.mechSuitDeep, { p: [sx, sy, -0.492], outline: false })

  // ── Head: a helmet, a visor band, two eyes, an antenna, two ear pods ──
  b.part('head', rbox(0.52, 0.44, 0.48, 0.42, 12, 10), PAL.mechArmor, { p: [0, 0.2, 0] })
  b.part('head', rbox(0.44, 0.17, 0.1, 0.5, 8, 6), PAL.mechVisor, { p: [0, 0.2, 0.21] })
  b.mirror((side) => {
    b.part('head', rbox(0.11, 0.085, 0.04, 0.6, 6, 6), PAL.mechEye, { p: [side * 0.11, 0.2, 0.262], glow: true, outline: false })
    b.part('head', rcyl(0.075, 0.07, 0.03, 8), PAL.mechCore, { p: [side * 0.275, 0.2, 0], r: [0, 0, Math.PI / 2] })
  })
  b.part('head', stripUv(new CylinderGeometry(0.018, 0.018, 0.26, 5)), PAL.mechSuit, { p: [0.16, 0.54, -0.06] })
  b.part('head', sph(0.05, 6, 5), PAL.mechEye, { p: [0.16, 0.69, -0.06], glow: true, outline: false })

  // ── Arms ──
  b.mirror((side, tag) => {
    const x = side * RIGHT
    b.bone(`shoulder${tag}`, 'chest', [x * 0.52, 0.48, 0])
    b.bone(`fore${tag}`, `shoulder${tag}`, [0, -0.42, 0])
    b.part(`shoulder${tag}`, sph(0.19, 10, 8), PAL.mechArmorDeep)
    // An armour band round the shoulder ball.
    b.part(`shoulder${tag}`, torus(0.185, 0.022, 6, 18), PAL.mechArmor, { p: [0, 0.02, 0], r: [0, 0, Math.PI / 2] })
    b.part(`shoulder${tag}`, cap(0.105, 0.24, 8, 3), PAL.mechSuit, { p: [0, -0.22, 0] })
    b.part(`fore${tag}`, rbox(0.22, 0.42, 0.24, 0.45, 8, 8), PAL.mechArmor, { p: [0, -0.2, 0] })
    b.part(`fore${tag}`, sph(0.1, 8, 6), PAL.mechSuitDeep, { p: [0, -0.45, 0] })
  })

  // ── The blade: out of the right forearm, along the arm ──
  b.bone('blade', 'foreR', [0, -0.3, 0.1])
  b.part('blade', stripUv(new BoxGeometry(0.045, 0.82, 0.13)), PAL.mechBlade, { p: [0, -0.5, 0], glow: true, outline: false })
  b.part('blade', stripUv(new BoxGeometry(0.02, 0.86, 0.05)), PAL.glowWhite, { p: [0, -0.5, 0.045], glow: true, outline: false })

  // ── The three weapons, in the right hand, barrels along the arm ──
  b.bone('sniper', 'foreR', [0, -0.45, 0.02])
  b.part('sniper', rbox(0.11, 0.5, 0.16, 0.5, 8, 6), PAL.gunMetal, { p: [0, -0.05, 0.02] })
  b.part('sniper', stripUv(new CylinderGeometry(0.03, 0.03, 1.1, 8)), PAL.gunDark, { p: [0, -0.8, 0.02] })
  b.part('sniper', rcyl(0.05, 0.3, 0.02, 8), PAL.gunMetal, { p: [0, -1.25, 0.02] })
  b.part('sniper', rcyl(0.05, 0.36, 0.02, 8), PAL.gunDark, { p: [0, -0.18, 0.15] })
  b.part('sniper', sph(0.04, 6, 5), PAL.gunAccent, { p: [0, -0.37, 0.15], glow: true, outline: false })
  b.part('sniper', rbox(0.09, 0.34, 0.14, 0.5, 6, 6), PAL.gunDark, { p: [0, 0.32, 0.0] })

  b.bone('minigun', 'foreR', [0, -0.45, 0.02])
  b.bone('minigunBarrels', 'minigun', [0, -0.5, 0.02])
  b.part('minigun', rbox(0.24, 0.5, 0.26, 0.45, 8, 8), PAL.gunMetal, { p: [0, -0.1, 0.02] })
  b.part('minigun', rbox(0.12, 0.2, 0.3, 0.5, 6, 6), PAL.gunDark, { p: [0, 0.1, 0.16] })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    b.part('minigunBarrels', stripUv(new CylinderGeometry(0.026, 0.026, 0.74, 6)), PAL.gunDark, { p: [Math.cos(a) * 0.075, -0.3, Math.sin(a) * 0.075] })
  }
  b.part('minigunBarrels', rcyl(0.12, 0.07, 0.02, 10), PAL.gunMetal, { p: [0, -0.62, 0] })
  b.part('minigunBarrels', rcyl(0.12, 0.07, 0.02, 10), PAL.gunAccent, { p: [0, -0.02, 0], glow: true, outline: false })

  b.bone('rocket', 'foreR', [0, -0.45, 0.02])
  b.part('rocket', rcyl(0.13, 1.1, 0.04, 10), PAL.gunMetal, { p: [0, -0.3, 0.06] })
  b.part('rocket', rcyl(0.165, 0.16, 0.04, 10), PAL.gunDark, { p: [0, -0.86, 0.06] })
  b.part('rocket', rcyl(0.15, 0.14, 0.04, 10), PAL.gunDark, { p: [0, 0.26, 0.06] })
  b.part('rocket', rbox(0.08, 0.2, 0.12, 0.5, 6, 6), PAL.gunAccent, { p: [0, -0.2, 0.2], glow: true, outline: false })

  // ── Legs ──
  b.mirror((side, tag) => {
    const x = side * RIGHT
    b.bone(`thigh${tag}`, 'hips', [x * 0.2, -0.1, 0])
    b.bone(`shin${tag}`, `thigh${tag}`, [0, -0.46, 0])
    b.bone(`foot${tag}`, `shin${tag}`, [0, -0.42, 0])
    b.part(`thigh${tag}`, cap(0.125, 0.26, 8, 3), PAL.mechSuit, { p: [0, -0.23, 0] })
    b.part(`shin${tag}`, rbox(0.25, 0.46, 0.3, 0.45, 8, 8), PAL.mechArmor, { p: [0, -0.2, 0] })
    b.part(`shin${tag}`, ell(0.1, 0.1, 0.08, 8, 6), PAL.mechArmorDeep, { p: [0, 0.0, 0.14] })
    b.part(`foot${tag}`, rbox(0.27, 0.16, 0.46, 0.45, 8, 6), PAL.mechSuitDeep, { p: [0, 0.0, 0.07] })
  })

  const rig = b.build({ outline: 0.022 / MECH_SCALE, height: MECH_HEIGHT })
  rig.root.scale.setScalar(MECH_SCALE)
  return rig
}

/** Everything the simulation says about the mech's body this frame. */
export interface MechPose {
  /** Seconds, for idle motion. */
  time: number
  /** Walk cycle angle in radians; advances with distance travelled. */
  stride: number
  /** 0 standing still … 1 full stride. */
  speed: number
  /** 0 standing … 1 crouched. */
  crouch: number
  /** 0 walking … 1 sprinting. */
  sprint: number
  /** 0 weapon lowered … 1 aimed. */
  aim: number
  /** Aim up (+) or down (−), radians. */
  aimPitch: number
  weapon: WeaponId
  /** 0 … 1 just fired; decays in the simulation. */
  recoil: number
  /** Minigun barrel angle, radians. */
  spin: number
  /** 0 … 1 through a reload of the weapon in hand; 0 when not reloading (#84). */
  reload: number
  /** 0 blade sheathed … 1 out. */
  blade: number
  /** 0 … 1 through a stab; 0 when not stabbing. */
  stab: number
  /** 0 … 1 on a ladder; `climbPhase` advances with height climbed. */
  climb: number
  climbPhase: number
  /** 0 … 1 balancing on a cable. */
  cable: number
  /** 0 … 1 in the air (a drop). */
  air: number
  /** Seconds since its armor gave out; 0 while it stands. */
  down: number
  /** 0 … 1 kneeling at a pile with both hands in it. */
  loot: number
  /** 0 … 1 under the hide box (the gun is stowed). */
  boxed: number
  /** A takedown: the free hand on the target, the blade arm cocked, the blade arm through. Each 0 … 1. */
  grab: number
  draw: number
  plunge: number
  /** 0 … 1 the weapon put away (the flamethrower: the jet comes from the hand). */
  stow: number
}

export const restPose = (): MechPose => ({
  time: 0, stride: 0, speed: 0, crouch: 0, sprint: 0, aim: 0, aimPitch: 0, weapon: 'sniper', recoil: 0, spin: 0, reload: 0,
  blade: 0, stab: 0, climb: 0, climbPhase: 0, cable: 0, air: 0, down: 0, loot: 0, boxed: 0, grab: 0, draw: 0, plunge: 0, stow: 0
})

const HIDDEN = 0.001
/**
 * The weapon arm's angle aimed level from an upright trunk: the shoulder
 * raises the arm a quarter turn, less the forearm's own small bend, so the
 * barrel (which runs along the forearm) is level. Aiming then subtracts the
 * view's pitch and the trunk's lean (a negative angle about x raises an arm).
 */
const AIM_FORE = -0.05
const AIM_REST = -Math.PI / 2 - AIM_FORE
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/** The leg, as built in `buildMech`: hip joint to knee, knee to ankle. */
const THIGH_LEN = 0.46
const SHIN_LEN = 0.42
const LEG_LEN = THIGH_LEN + SHIN_LEN
/**
 * The leg's solid parts, as built: the shin's rounded box (its middle 0.2 m
 * below the knee, half 0.23 long and 0.15 deep) and the knee pad on its front,
 * the foot's rounded box (0.07 forward of the ankle, half 0.08 high and 0.23
 * long), the thigh's round end at the knee. The boxes are superellipsoids
 * (`rbox`, rounding 0.45): their reach in a direction is a support function.
 */
const SHIN_BOX = { mid: 0.2, len: 0.23, depth: 0.15 }
const KNEE_PAD = { fwd: 0.14, len: 0.1, depth: 0.08 }
const FOOT_BOX = { fwd: 0.07, half: 0.08, len: 0.23 }
const THIGH_R = 0.125
const STAND_SOLE = LEG_LEN + FOOT_BOX.half
/** The dual exponent of a superellipse with rounding 0.45 (p = 2/0.45). */
const RBOX_Q = (2 / 0.45) / (2 / 0.45 - 1)
const reachOf = (a: number, b: number, q: number): number => (Math.abs(a) ** q + Math.abs(b) ** q) ** (1 / q)

/**
 * The lowest point of a leg's solid parts below the thigh's root, for its
 * three angles (radians about x, the bone hanging down at 0): the knee's
 * round end, the shin's box and pad, the foot's box (#107). Pure.
 */
export const legLowest = (a1: number, a2: number, a3: number): number => {
  const ky = -THIGH_LEN * Math.cos(a1)
  const c2 = Math.cos(a2)
  const s2 = Math.sin(a2)
  const c3 = Math.cos(a3)
  const s3 = Math.sin(a3)
  const thigh = ky - THIGH_R
  const shin = ky - SHIN_BOX.mid * c2 - reachOf(SHIN_BOX.len * c2, SHIN_BOX.depth * s2, RBOX_Q)
  const pad = ky - KNEE_PAD.fwd * s2 - reachOf(KNEE_PAD.len * c2, KNEE_PAD.depth * s2, 2)
  const ay = ky - SHIN_LEN * c2
  const foot = ay - FOOT_BOX.fwd * s3 - reachOf(FOOT_BOX.half * c3, FOOT_BOX.len * s3, RBOX_Q)
  return Math.min(thigh, shin, pad, foot)
}
/**
 * The first takedown's arm angles (the `draw`/`plunge` channels; the
 * backstab, `sim/backstab.ts`, now aims the blade arm with `placeKillBody`
 * and leaves them at 0). Worked out from the rig: the blade arm's shoulder is
 * 0.52 m to the right and 1.91 m up, the target's middle 0.72 m ahead on the
 * mech's centre line and 1.05 m up, so the straight arm points down, forward
 * and inward.
 */
const PLUNGE_PITCH = -0.69
const PLUNGE_ROLL = 0.43
const DRAW_PITCH = 1.0
const DRAW_ROLL = -0.3
const GRAB_PITCH = -0.93
const GRAB_ROLL = -0.44

/** Down: how long it kneels before it falls, and when it has come to rest. */
export const MECH_KNEEL_S = 0.45
export const MECH_DOWN_S = 1.45
const smoothstep = (v: number): number => { const k = v < 0 ? 0 : v > 1 ? 1 : v; return k * k * (3 - 2 * k) }
const bumpAt = (v: number): number => (v <= 0 || v >= 1 ? 0 : Math.sin(v * Math.PI))
/** A full crouch: a deep squat, knees forward, feet under the body. */
const CROUCH_THIGH = 1.6
const CROUCH_KNEE = 2.65

/**
 * Put the rig in the pose the simulation describes. Every channel blends, so
 * a crouched, aiming, walking mech is the sum of its three poses.
 */
export const poseMech = (rig: Rig, s: MechPose): void => {
  const walk = s.speed * (1 - s.climb) * (1 - s.air)
  const swing = Math.sin(s.stride)
  const lift = Math.cos(s.stride)
  const breathe = Math.sin(s.time * 2.1) * 0.012

  const run = s.sprint * walk
  // Down: it drops to its knees, holds there a beat with its lights
  // stuttering, and pitches forward onto its face.
  const fall = s.down > 0 ? smoothstep((s.down - MECH_KNEEL_S) / 0.55) : 0
  const thud = s.down > 0 ? bumpAt((s.down - MECH_KNEEL_S - 0.5) / 0.3) : 0
  // ── Legs first: where the feet end up decides how high the hips ride ──
  // The hips are not lowered by a number that hopes to match the legs. Each
  // leg's lowest solid point (the knee, the shin's box, the rolling foot) is
  // worked out from its own angles, and the hips sit exactly as high as puts
  // the lower leg's lowest point on the floor: nothing of the mech goes under
  // it in a crouch, a sneak, a stride or anything between (#107).
  const hipPitch = 0.06 * walk + 0.1 * run
  let deepest = 0
  for (const [tag, sign] of [['L', 1], ['R', -1]] as const) {
    const sw = swing * sign
    const li = lift * sign
    // On a cable the steps are short and careful: less reach, a higher lift.
    // A sneak takes short steps: a deep squat swinging a full stride would
    // kneel on the trailing knee and lift the other foot off the floor (#107).
    const short = 1 - 0.5 * s.crouch
    const walkThigh = -sw * (0.62 + 0.2 * run - 0.22 * s.cable) * walk * short
    const walkKnee = (0.3 + Math.max(0, li) * (0.75 + 0.35 * run + 0.45 * s.cable)) * walk * short
    const crouchThigh = -CROUCH_THIGH * s.crouch
    const crouchKnee = CROUCH_KNEE * s.crouch
    const climbThigh = -(0.5 + Math.sin(s.climbPhase * sign) * 0.5) * s.climb
    const climbKnee = (0.6 + Math.sin(s.climbPhase * sign) * 0.5) * s.climb
    // In the air the legs keep going (#106): a slow pedal, one leg reaching
    // forward as the other tucks, so a jump has some life in it.
    const pedal = Math.sin(s.time * 5.5 + (sign > 0 ? 0 : Math.PI))
    const airThigh = (-0.35 * (sign > 0 ? 1 : 0.4) - 0.32 * pedal) * s.air
    const airKnee = (0.75 + 0.35 * Math.max(0, -pedal) + 0.15 * pedal) * s.air
    const thigh = walkThigh + crouchThigh + climbThigh + airThigh
    const knee = walkKnee + crouchKnee + climbKnee + airKnee
    // On a cable each foot is set down on the line under the middle of the
    // body, one in front of the other: the thighs swing in to meet it.
    pose(rig, `thigh${tag}`, thigh, 0, sign * -0.2 * s.cable)
    pose(rig, `shin${tag}`, knee, 0, 0)
    // The sole stays flat in a crouch (it carries the weight) and rolls
    // heel to toe in a stride.
    const footRot = -(walkThigh + walkKnee) * 0.5 - (crouchThigh + crouchKnee)
    pose(rig, `foot${tag}`, footRot, 0, 0)
    // In the world the leg hangs from hips that lean into the stride.
    const a1 = hipPitch + thigh
    deepest = Math.max(deepest, -legLowest(a1, a1 + knee, a1 + knee + footRot))
  }

  // ── Body ──
  const grounded = (1 - s.climb) * (1 - s.air)
  const sink = (STAND_SOLE - deepest) * grounded
  nudge(rig, 'hips', 0, -sink + s.air * 0.05 - 0.12 * fall + thud * 0.06, -0.12 * s.crouch + 0.55 * fall)
  // Balancing: the hips sway over whichever foot is down, slow and wide.
  const balance = s.cable * (Math.sin(s.stride) * 0.09 + Math.sin(s.time * 1.7) * 0.05)
  const hipsX = hipPitch + 1.25 * fall
  const spineX = 0.5 * s.crouch * (1 - fall) + (0.08 + 0.2 * s.sprint) * walk - s.aimPitch * 0.25 * s.aim
  const chestX = 0.3 * s.crouch * (1 - fall) - s.aimPitch * 0.25 * s.aim + 0.08 * s.cable
  // How far the trunk leans forward: the arms take it back out of their aim,
  // so a crouched or striding mech still points the gun where it looks (#81).
  const lean = hipsX + spineX + chestX
  pose(rig, 'hips', hipsX, 0, 0.12 * fall + balance)
  pose(rig, 'spine', spineX, 0, swing * 0.06 * walk)
  nudge(rig, 'chest', 0, breathe, 0)
  pose(rig, 'chest', chestX, -swing * (0.1 + 0.12 * run) * walk * (1 - s.cable), -balance * 1.6)
  pose(
    rig, 'head',
    -0.7 * s.crouch * (1 - fall) + (s.down > 0 ? 0.5 * (1 - fall) : 0) - 0.16 * run - s.aimPitch * 0.4 * s.aim + 0.3 * s.cable,
    0.6 * fall,
    Math.sin(s.time * 0.7) * 0.03 * (1 - s.aim)
  )

  // ── Arms ──
  // Left arm: swings with the walk, comes up to steady the weapon, reaches on
  // a ladder, spreads on a cable.
  const hang = 1 - Math.max(s.aim, s.climb, s.cable)
  // Out wide on a cable, and see-sawing against the sway.
  const seesaw = Math.sin(s.time * 2.3) * 0.22 + Math.sin(s.stride) * 0.12
  // In a takedown the free hand goes over the target's far shoulder: up,
  // forward and across (`GRAB_*` point the arm at it from 0.72 m straight
  // behind, where the first takedown stood).
  pose(
    rig, 'shoulderL',
    lerp(
      swing * (0.5 + 0.4 * run) * walk * hang - (1.15 + s.aimPitch + lean) * s.aim - (1.9 + Math.sin(s.climbPhase) * 0.6) * s.climb - 0.3 * s.air,
      GRAB_PITCH, s.grab
    ),
    -0.55 * s.aim * (1 - s.grab),
    // Out to the side (the roll that spreads it is this way round for the left arm).
    lerp((1.35 + seesaw) * s.cable - 0.12 * hang - 0.5 * fall, GRAB_ROLL, s.grab)
  )
  pose(rig, 'foreL', lerp(-(0.25 + 0.9 * run) * hang - 0.9 * s.aim - 0.5 * s.climb - 0.25 * s.cable, -0.1, s.grab), 0, 0)

  // Right arm: the weapon arm. A stab swings it forward and across.
  const thrust = s.stab > 0 ? Math.sin(Math.min(1, s.stab) * Math.PI) : 0
  // The muzzle climbs on a shot.
  const kick = s.recoil * (s.weapon === 'rocket' ? 0.3 : s.weapon === 'sniper' ? 0.18 : 0.05)
  // The blade arm in a takedown: cocked back with the elbow high, then
  // straight through, down and across to the middle of the target's back.
  const td = Math.max(s.draw, s.plunge)
  pose(
    rig, 'shoulderR',
    // Lowered, the long rifle would trail on the floor: the arm carries it
    // forward, more so in a crouch.
    lerp(
      lerp(
        lerp(-swing * (0.5 + 0.4 * run) * walk * hang - 0.3 - 0.45 * s.crouch, AIM_REST - s.aimPitch - lean - kick, s.aim)
          - (1.9 - Math.sin(s.climbPhase) * 0.6) * s.climb - 1.5 * thrust - 0.3 * s.air,
        DRAW_PITCH, s.draw
      ),
      PLUNGE_PITCH, s.plunge
    ),
    0.5 * thrust * (1 - td),
    lerp(lerp(-(1.35 - seesaw) * s.cable + 0.12 * hang, DRAW_ROLL, s.draw), PLUNGE_ROLL, s.plunge)
  )
  pose(
    rig, 'foreR',
    lerp(lerp(lerp(-(0.75 + 0.6 * s.crouch) * hang, AIM_FORE, s.aim) - 0.5 * s.climb - 0.4 * thrust, -1.6, s.draw), 0, s.plunge),
    0, 0
  )

  // ── What is in the hand ──
  // The gun is put away for a stab, a climb, a cable walk and the hide box.
  const armed = s.stab > 0 || td > 0 || s.grab > 0 || s.climb > 0.5 || s.cable > 0.5 || s.boxed > 0.5 || s.stow > 0.5 ? null : s.weapon
  for (const w of ['sniper', 'minigun', 'rocket'] as const) scaleBone(rig, w, w === armed ? 1 : HIDDEN)
  rig.bones.minigunBarrels!.rotation.y = s.spin
  if (s.reload > 0 && armed) {
    // Reloading (#84): the weapon comes down and across the chest, the free
    // hand goes to its breech, works it, and the weapon comes back up.
    const r = Math.sin(Math.min(1, s.reload) * Math.PI)
    const work = Math.sin(s.reload * Math.PI * (s.weapon === 'rocket' ? 3 : 4)) * 0.12 * r
    pose(rig, 'shoulderR', lerp(rig.bones.shoulderR!.rotation.x, -0.95, r), 0, lerp(0, 0.35, r))
    pose(rig, 'foreR', lerp(rig.bones.foreR!.rotation.x, -0.55, r), 0, 0)
    pose(rig, 'shoulderL', lerp(rig.bones.shoulderL!.rotation.x, -1.05 + work, r), 0, lerp(0, -0.55, r))
    pose(rig, 'foreL', lerp(rig.bones.foreL!.rotation.x, -1.25, r), 0, 0)
  }
  if (s.loot > 0) {
    // Rummaging: both arms down into the pile, working in turn.
    const dig = Math.sin(s.time * 11)
    pose(rig, 'shoulderL', lerp(rig.bones.shoulderL!.rotation.x, -1.1 + dig * 0.25, s.loot), 0, -0.2)
    pose(rig, 'shoulderR', lerp(rig.bones.shoulderR!.rotation.x, -1.1 - dig * 0.25, s.loot), 0, 0.2)
    pose(rig, 'foreL', -0.6 * s.loot, 0, 0)
    pose(rig, 'foreR', -0.6 * s.loot, 0, 0)
  }
  // Its lights: steady while it lives, a stutter as it goes, then almost out.
  const lit = s.down <= 0 ? 1 : s.down < MECH_KNEEL_S + 0.5 ? (Math.sin(s.down * 47) > 0 ? 1 : 0.2) : 0.12
  rig.glowMaterial.color.setScalar(lit)
  const out = Math.max(s.blade, thrust > 0 ? 1 : 0)
  // It grows out along the arm; past 1 is the instant it springs.
  scaleBone(rig, 'blade', out > 0.01 ? Math.min(1.25, 0.6 + out * 0.4) : HIDDEN, Math.max(HIDDEN, out), out > 0.01 ? 1 : HIDDEN)
}
