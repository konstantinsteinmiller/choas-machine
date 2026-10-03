import { BoxGeometry, CylinderGeometry } from 'three'
import { RigBuilder, cap, ell, pose, nudge, rbox, rcyl, scaleBone, sph, stripUv, type Rig } from './kit'
import { PAL } from './palette'
import type { WeaponId } from '../data/ids'

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

/** Standing eye height, crouched eye height, and the body's radius (m). */
export const MECH_EYE = 2.25
export const MECH_EYE_CROUCH = 1.4
export const MECH_RADIUS = 0.42
export const MECH_HEIGHT = 2.5
/** Top of the helmet when crouched: what must stay under a cover block. */
export const MECH_HEIGHT_CROUCH = 1.65

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

  return b.build({ outline: 0.022, height: MECH_HEIGHT })
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
}

export const restPose = (): MechPose => ({
  time: 0, stride: 0, speed: 0, crouch: 0, sprint: 0, aim: 0, aimPitch: 0, weapon: 'sniper', recoil: 0, spin: 0,
  blade: 0, stab: 0, climb: 0, climbPhase: 0, cable: 0, air: 0, down: 0, loot: 0, boxed: 0, grab: 0, draw: 0, plunge: 0
})

const HIDDEN = 0.001
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/** The leg, as built in `buildMech`: hip joint to knee, knee to ankle. */
const THIGH_LEN = 0.46
const SHIN_LEN = 0.42
const LEG_LEN = THIGH_LEN + SHIN_LEN
/**
 * The takedown's arm angles (`sim/takedown.ts` has the timing). Worked out
 * from the rig: the blade arm's shoulder is 0.52 m to the right and 1.91 m
 * up, the target's middle is `TAKEDOWN.reach` ahead on the mech's centre line
 * and 1.05 m up, so the straight arm points down, forward and inward. A test
 * checks that the blade really passes through the target and out of its front.
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
  // leg's reach is worked out from its own angles, and the hips sit exactly
  // as high as the longer leg can reach the floor: the standing foot is ON
  // the ground in a crouch, in a stride and in anything between.
  const hipPitch = 0.06 * walk + 0.1 * run
  let reach = 0
  for (const [tag, sign] of [['L', 1], ['R', -1]] as const) {
    const sw = swing * sign
    const li = lift * sign
    // On a cable the steps are short and careful: less reach, a higher lift.
    const walkThigh = -sw * (0.62 + 0.2 * run - 0.22 * s.cable) * walk
    const walkKnee = (0.3 + Math.max(0, li) * (0.75 + 0.35 * run + 0.45 * s.cable)) * walk
    const crouchThigh = -CROUCH_THIGH * s.crouch
    const crouchKnee = CROUCH_KNEE * s.crouch
    const climbThigh = -(0.5 + Math.sin(s.climbPhase * sign) * 0.5) * s.climb
    const climbKnee = (0.6 + Math.sin(s.climbPhase * sign) * 0.5) * s.climb
    const airThigh = -0.35 * s.air * (sign > 0 ? 1 : 0.4)
    const airKnee = 0.7 * s.air
    const thigh = walkThigh + crouchThigh + climbThigh + airThigh
    const knee = walkKnee + crouchKnee + climbKnee + airKnee
    // On a cable each foot is set down on the line under the middle of the
    // body, one in front of the other: the thighs swing in to meet it.
    pose(rig, `thigh${tag}`, thigh, 0, sign * -0.2 * s.cable)
    pose(rig, `shin${tag}`, knee, 0, 0)
    // The sole stays flat in a crouch (it carries the weight) and rolls
    // heel to toe in a stride.
    pose(rig, `foot${tag}`, -(walkThigh + walkKnee) * 0.5 - (crouchThigh + crouchKnee), 0, 0)
    // In the world the leg hangs from hips that lean into the stride.
    reach = Math.max(reach, THIGH_LEN * Math.cos(hipPitch + thigh) + SHIN_LEN * Math.cos(hipPitch + thigh + knee))
  }

  // ── Body ──
  const grounded = (1 - s.climb) * (1 - s.air)
  const sink = (LEG_LEN - reach) * grounded
  nudge(rig, 'hips', 0, -sink + s.air * 0.05 - 0.12 * fall + thud * 0.06, -0.12 * s.crouch + 0.55 * fall)
  // Balancing: the hips sway over whichever foot is down, slow and wide.
  const balance = s.cable * (Math.sin(s.stride) * 0.09 + Math.sin(s.time * 1.7) * 0.05)
  pose(rig, 'hips', hipPitch + 1.25 * fall, 0, 0.12 * fall + balance)
  pose(rig, 'spine', 0.5 * s.crouch * (1 - fall) + (0.08 + 0.2 * s.sprint) * walk - s.aimPitch * 0.25 * s.aim, 0, swing * 0.06 * walk)
  nudge(rig, 'chest', 0, breathe, 0)
  pose(rig, 'chest', 0.3 * s.crouch * (1 - fall) - s.aimPitch * 0.25 * s.aim + 0.08 * s.cable, -swing * (0.1 + 0.12 * run) * walk * (1 - s.cable), -balance * 1.6)
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
  // forward and across (`GRAB_*` point the arm at it from where the mech
  // stands, `TAKEDOWN.reach` behind).
  pose(
    rig, 'shoulderL',
    lerp(
      swing * (0.5 + 0.4 * run) * walk * hang - 1.15 * s.aim + s.aimPitch * s.aim - (1.9 + Math.sin(s.climbPhase) * 0.6) * s.climb - 0.3 * s.air,
      GRAB_PITCH, s.grab
    ),
    -0.55 * s.aim * (1 - s.grab),
    // Out to the side (the roll that spreads it is this way round for the left arm).
    lerp((1.35 + seesaw) * s.cable - 0.12 * hang - 0.5 * fall, GRAB_ROLL, s.grab)
  )
  pose(rig, 'foreL', lerp(-(0.25 + 0.9 * run) * hang - 0.9 * s.aim - 0.5 * s.climb - 0.25 * s.cable, -0.1, s.grab), 0, 0)

  // Right arm: the weapon arm. A stab swings it forward and across.
  const thrust = s.stab > 0 ? Math.sin(Math.min(1, s.stab) * Math.PI) : 0
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
        lerp(-swing * (0.5 + 0.4 * run) * walk * hang - 0.3 - 0.45 * s.crouch, -Math.PI / 2 + s.aimPitch + kick, s.aim)
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
    lerp(lerp(lerp(-(0.75 + 0.6 * s.crouch) * hang, -0.05, s.aim) - 0.5 * s.climb - 0.4 * thrust, -1.6, s.draw), 0, s.plunge),
    0, 0
  )

  // ── What is in the hand ──
  // The gun is put away for a stab, a climb, a cable walk and the hide box.
  const armed = s.stab > 0 || td > 0 || s.grab > 0 || s.climb > 0.5 || s.cable > 0.5 || s.boxed > 0.5 ? null : s.weapon
  for (const w of ['sniper', 'minigun', 'rocket'] as const) scaleBone(rig, w, w === armed ? 1 : HIDDEN)
  rig.bones.minigunBarrels!.rotation.y = s.spin
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
