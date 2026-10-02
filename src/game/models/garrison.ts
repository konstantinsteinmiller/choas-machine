import { BoxGeometry, CylinderGeometry } from 'three'
import { RigBuilder, cap, dome, ell, pose, nudge, rbox, rcone, rcyl, sph, stripUv, torus, type Rig } from './kit'
import { PAL } from './palette'

/**
 * ─── The garrison ────────────────────────────────────────────────────────────
 *
 * Everything that defends a fortress: human guards and their Commander, the
 * surveillance drone, the Enforcer mech and the Goliath Tank. Each is one
 * skinned rig built in code (three draw calls with its outline) and a pose
 * function that turns the simulation's few numbers into bone rotations.
 *
 * All face +z. The proportions are deliberately toy-like: big heads on the
 * guards, a big eye on the drone, so every silhouette reads at sniping range.
 */

// ─── Guard and Commander ─────────────────────────────────────────────────────

export const GUARD_EYE = 1.5
export const GUARD_HEIGHT = 1.72
/** Centre and radius of a guard's head above its feet: the headshot zone. */
export const GUARD_HEAD_Y = 1.5
export const GUARD_HEAD_R = 0.24

/** The leg as built below: hip joint to knee, knee to ankle, ankle to sole. */
const G_THIGH = 0.32
const G_SHIN = 0.3
const G_LEG = G_THIGH + G_SHIN

export const buildGuard = (commander = false): Rig => {
  const cloth = commander ? PAL.commander : PAL.uniform
  const clothDeep = commander ? PAL.commanderDeep : PAL.uniformDeep
  const trim = commander ? PAL.commanderTrim : PAL.uniformTrim
  const b = new RigBuilder()
  b.bone('hips', null, [0, 0.78, 0])
  b.bone('chest', 'hips', [0, 0.14, 0])
  b.bone('head', 'chest', [0, 0.42, 0])

  b.part('hips', rbox(0.4, 0.26, 0.28, 0.5, 8, 6), clothDeep)
  b.part('chest', rbox(0.46, 0.44, 0.3, 0.45, 10, 8), cloth, { p: [0, 0.2, 0] })
  b.part('chest', rbox(0.3, 0.06, 0.04, 0.6, 6, 4), trim, { p: [0, 0.3, 0.15] })
  // A big friendly head under a helmet (or the Commander's cap).
  b.part('head', sph(0.22, 10, 8), PAL.skin, { p: [0, 0.2, 0] })
  if (commander) {
    b.part('head', rcyl(0.25, 0.1, 0.03, 10), cloth, { p: [0, 0.37, 0] })
    b.part('head', rbox(0.3, 0.03, 0.18, 0.6, 6, 4), PAL.boot, { p: [0, 0.33, 0.19] })
    b.part('head', sph(0.035, 6, 5), trim, { p: [0, 0.38, 0.23], glow: true, outline: false })
  } else {
    b.part('head', dome(0.245, Math.PI * 0.52, 10, 6), PAL.helmet, { p: [0, 0.22, 0] })
    b.part('head', rbox(0.34, 0.04, 0.1, 0.6, 6, 4), PAL.helmet, { p: [0, 0.24, 0.2] })
  }
  b.mirror((side) => {
    b.part('head', sph(0.032, 6, 5), PAL.black, { p: [side * 0.08, 0.2, 0.2], outline: false })
  })

  b.mirror((side, tag) => {
    const x = -side
    b.bone(`arm${tag}`, 'chest', [x * 0.29, 0.36, 0])
    b.bone(`fore${tag}`, `arm${tag}`, [0, -0.26, 0])
    b.part(`arm${tag}`, cap(0.075, 0.16, 6, 3), cloth, { p: [0, -0.13, 0] })
    b.part(`fore${tag}`, cap(0.065, 0.14, 6, 3), cloth, { p: [0, -0.11, 0] })
    b.part(`fore${tag}`, sph(0.07, 6, 5), PAL.skinDeep, { p: [0, -0.25, 0] })
    b.bone(`leg${tag}`, 'hips', [x * 0.12, -0.1, 0])
    b.bone(`shin${tag}`, `leg${tag}`, [0, -G_THIGH, 0])
    // The boot is its own bone: a foot that rolls from heel to toe is most of
    // what makes a walk read as a person's.
    b.bone(`foot${tag}`, `shin${tag}`, [0, -G_SHIN, 0])
    b.part(`leg${tag}`, cap(0.09, 0.18, 6, 3), clothDeep, { p: [0, -0.16, 0] })
    b.part(`shin${tag}`, cap(0.08, 0.16, 6, 3), clothDeep, { p: [0, -0.14, 0] })
    b.part(`foot${tag}`, rbox(0.17, 0.12, 0.3, 0.5, 6, 6), PAL.boot, { p: [0, 0, 0.05] })
  })

  // The rifle, in the right hand, barrel along the forearm.
  b.bone('rifle', 'foreR', [0, -0.25, 0.03])
  b.part('rifle', rbox(0.07, 0.36, 0.11, 0.5, 6, 6), PAL.gunMetal, { p: [0, -0.05, 0] })
  b.part('rifle', stripUv(new CylinderGeometry(0.022, 0.022, 0.5, 6)), PAL.gunDark, { p: [0, -0.45, 0] })
  b.part('rifle', rbox(0.06, 0.2, 0.09, 0.5, 6, 4), PAL.gunDark, { p: [0, 0.2, -0.02] })

  return b.build({ outline: 0.018, height: GUARD_HEIGHT })
}

export interface GuardPose {
  time: number
  stride: number
  /** 0 standing … 1 at a run (a patrol walks at about 0.4). */
  speed: number
  /** 0 rifle carried … 1 shouldered and aimed. */
  aim: number
  /** 0 calm … 1 looking about (searching). */
  wary: number
  /** 0 at ease … 1 creeping toward something it does not like. */
  caution: number
  /** 1 the moment something startles it, back to 0 within half a second. */
  startle: number
  /** 0 … 1 the rifle's kick. */
  recoil: number
  /** Head turn relative to the body, radians. */
  lookYaw: number
  /** This one's own number, 0 … 1: its gait, its posture, when it fidgets. */
  seed: number
  /** The Commander carries himself differently. */
  proud: boolean
  /** 0 alive … 1 lying dead; the fall plays out between. */
  dead: number
  /** Which way the body falls: 1 forward, −1 backward. */
  fallDir: number
}

export const restGuardPose = (): GuardPose => ({
  time: 0, stride: 0, speed: 0, aim: 0, wary: 0, caution: 0, startle: 0, recoil: 0, lookYaw: 0, seed: 0.5, proud: false, dead: 0, fallDir: 1
})

const sat = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (v: number): number => { const k = sat(v); return k * k * (3 - 2 * k) }
/** A bump that rises and falls once over 0 … 1. */
const bump = (v: number): number => (v <= 0 || v >= 1 ? 0 : Math.sin(v * Math.PI) ** 2)

/**
 * A person, not a wind-up toy. What that takes, in order of how much each
 * buys:
 *
 * - the pelvis moves: it drops onto the stepping foot, turns with the stride
 *   and the chest turns against it;
 * - the foot rolls: heel down first, toe off last;
 * - the gait is full at a WALK. A patrol walks at 40 % of its run; scaling
 *   the stride by speed made every patrol shuffle;
 * - nobody stands still: weight shifts from leg to leg, the chest breathes,
 *   and every so often a guard looks at his boots, rolls his shoulders or
 *   scratches under his helmet;
 * - no two are alike: `seed` gives each its own stride, swagger and timing.
 */
export const poseGuard = (rig: Rig, s: GuardPose): void => {
  const alive = 1 - s.dead
  // A walk is a whole gait from a slow pace on; a run lengthens it.
  const walk = smooth(s.speed / 0.3) * alive
  const run = smooth((s.speed - 0.55) / 0.4) * alive
  const still = (1 - walk) * alive
  const calm = (1 - s.aim) * (1 - s.caution)
  const own = s.seed - 0.5
  const swagger = 1 + own * 0.5
  const t = s.time

  // ── The fall (R3 replaces this) ──
  const fall = s.dead * s.dead * (3 - 2 * s.dead)

  // ── Idle: weight on one leg, then the other ──
  const shift = Math.sin(t * 0.42 + s.seed * 6) * still * calm
  const breathe = Math.sin(t * 1.7 + s.seed * 9)

  // ── A fidget, now and then ──
  const beat = t / 9 + s.seed * 3
  const which = Math.floor(beat) % 3
  const fidget = bump((beat - Math.floor(beat) - 0.62) / 0.3) * still * calm * (s.proud ? 0 : 1)
  const lookDown = which === 0 ? fidget : 0
  const shrug = which === 1 ? fidget : 0
  const scratch = which === 2 ? fidget : 0

  // ── Legs ──
  const hipPitch = (0.05 + 0.12 * run) * walk + 0.12 * s.caution
  const stance = 0.22 * s.caution + 0.28 * s.aim
  let reach = 0
  for (const [tag, sign] of [['L', 1], ['R', -1]] as const) {
    const ph = s.stride + (sign > 0 ? 0 : Math.PI)
    const sw = Math.sin(ph)
    const up = Math.max(0, Math.cos(ph))
    // Forward further than back, the way a stride really is.
    const thigh = -(sw * (0.46 + 0.22 * run) + 0.1) * walk * swagger
      - stance
      // Standing: the leg without the weight is a little bent.
      - 0.1 * Math.max(0, -shift * sign)
      - fall * 0.2 * sign
    const knee = (0.14 + up * (0.95 + 0.5 * run) + Math.max(0, sw) * 0.12) * walk
      + stance * 2
      + 0.22 * Math.max(0, -shift * sign)
      + fall * 0.3
    // Heel first (toes up as the leg reaches), toe last (heel up as it leaves).
    const roll = (Math.max(0, sw) * 0.3 * (1 - up) - Math.max(0, -sw) * 0.45 * up) * walk
    pose(rig, `leg${tag}`, thigh, 0, sign * (0.07 + 0.06 * s.aim) * alive + 0.04 * shift)
    pose(rig, `shin${tag}`, knee, 0, 0)
    pose(rig, `foot${tag}`, -(thigh + knee) * (1 - fall) - roll, 0, 0)
    reach = Math.max(reach, G_THIGH * Math.cos(hipPitch + thigh) + G_SHIN * Math.cos(hipPitch + thigh + knee))
  }

  // ── Pelvis and spine ──
  const swing = Math.sin(s.stride)
  const sink = (G_LEG - reach) * alive
  nudge(
    rig, 'hips',
    shift * 0.035 + swing * 0.012 * walk,
    -sink - fall * 0.62,
    fall * 0.35 * s.fallDir - 0.04 * s.startle
  )
  pose(
    rig, 'hips',
    hipPitch * alive + fall * 1.45 * s.fallDir,
    swing * 0.16 * walk * swagger,
    Math.cos(s.stride) * 0.05 * walk * swagger + shift * 0.06
  )
  pose(
    rig, 'chest',
    0.04 * walk + 0.22 * s.caution + 0.1 * s.aim - 0.06 * s.recoil - 0.22 * s.startle
      + breathe * 0.012 * alive + lookDown * 0.18 - shrug * 0.12 - (s.proud ? 0.07 * calm : 0)
      + fall * 0.15 * s.fallDir,
    -swing * 0.3 * walk * swagger * calm,
    -Math.cos(s.stride) * 0.04 * walk - shift * 0.05
  )
  pose(
    rig, 'head',
    -0.04 * walk - 0.16 * s.caution - 0.15 * s.aim + lookDown * 0.55 + 0.25 * s.startle
      + Math.sin(t * 1.3) * 0.03 * alive + (s.proud ? -0.08 * calm : 0),
    (s.lookYaw + Math.sin(t * 2.3) * 0.5 * s.wary + swing * 0.14 * walk * calm) * alive,
    scratch * 0.2 + fall * 0.4
  )

  // ── Arms ──
  // The rifle hand carries the rifle low and lets it swing a little; ready
  // across the body when wary; shouldered when aiming.
  const ready = Math.max(s.caution * 0.8, s.aim)
  const carryR = -0.3 + swing * 0.22 * walk * swagger - shrug * 0.15
  pose(
    rig, 'armR',
    carryR * (1 - ready) - 1.45 * ready - 0.12 * s.recoil + 0.5 * s.startle + fall * 0.9,
    0.15 * ready,
    0.1 * (1 - ready) + shrug * 0.12 + fall * 0.5
  )
  pose(rig, 'foreR', (-0.5 - 0.12 * walk) * (1 - ready) - 0.1 * ready - 0.25 * s.startle, 0, 0)
  // The free arm swings against its leg, bends as it comes forward, and is
  // the one that scratches. The Commander keeps his behind his back.
  const swingL = -swing * (0.5 + 0.35 * run) * walk * swagger
  const behind = s.proud ? calm : 0
  pose(
    rig, 'armL',
    (swingL - 0.05) * (1 - ready) * (1 - behind) + 0.45 * behind - 1.0 * ready - 2.5 * scratch - shrug * 0.15
      + 0.6 * s.startle - fall * 0.6,
    -0.5 * ready + 0.5 * behind,
    -0.1 - 0.25 * scratch - shrug * 0.14 - 0.3 * s.startle - fall * 0.7
  )
  pose(
    rig, 'foreL',
    (-0.22 - Math.max(0, -swingL) * 0.9 - 0.3 * run) * (1 - ready) * (1 - behind) - 0.9 * behind - 0.7 * ready - 1.5 * scratch,
    0, 0
  )
}

// ─── Surveillance drone ──────────────────────────────────────────────────────

export const DRONE_RADIUS = 0.45

export const buildDrone = (): Rig => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 0, 0])
  b.part('body', ell(0.34, 0.24, 0.38, 10, 8), PAL.steel)
  b.part('body', rbox(0.5, 0.08, 0.5, 0.5, 8, 6), PAL.steelDeep, { p: [0, 0.08, 0] })
  // The eye: what it sees with, and what a sniper aims at.
  b.bone('eye', 'body', [0, -0.06, 0.26])
  b.part('eye', sph(0.15, 10, 8), PAL.steelDark)
  b.part('eye', sph(0.1, 8, 6), PAL.glowRed, { p: [0, 0, 0.08], glow: true, outline: false })
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const x = Math.cos(a) * 0.46
    const z = Math.sin(a) * 0.46
    b.part('body', stripUv(new CylinderGeometry(0.03, 0.03, 0.5, 5)), PAL.steelDeep, { p: [x * 0.6, 0.1, z * 0.6], r: [Math.PI / 2, 0, -a + Math.PI / 2] })
    b.bone(`rotor${i}`, 'body', [x, 0.16, z])
    b.part(`rotor${i}`, stripUv(new BoxGeometry(0.5, 0.012, 0.06)), PAL.steelDark, { outline: false })
    b.part(`rotor${i}`, rcyl(0.05, 0.08, 0.02, 6), PAL.steelDeep, { p: [0, -0.04, 0] })
  }
  b.part('body', sph(0.04, 6, 5), PAL.glowCyan, { p: [0, 0.14, -0.3], glow: true, outline: false })
  return b.build({ outline: 0.018, height: 0.5 })
}

export interface DronePose {
  time: number
  /** Rotor angle, radians (stops when the drone is shot down). */
  spin: number
  /** Lean into its travel: pitch and roll, radians. */
  pitch: number
  roll: number
  /** Where the eye looks, relative to the body. */
  eyeYaw: number
  eyePitch: number
  /** 0 calm … 1 it thinks it saw something: the eye darts, the body twitches. */
  alarm: number
}

export const poseDrone = (rig: Rig, s: DronePose): void => {
  // It hangs in the air like something with weight under four rotors: a slow
  // bob, a drift from side to side, and a nervous shake when alarmed.
  const jitter = Math.sin(s.time * 41) * 0.02 * s.alarm
  nudge(rig, 'body', Math.sin(s.time * 1.1) * 0.04, Math.sin(s.time * 2.4) * 0.05 + jitter, Math.cos(s.time * 0.9) * 0.03)
  pose(rig, 'body', s.pitch + Math.sin(s.time * 1.7) * 0.03, 0, s.roll + jitter * 2)
  // The eye is alive: it tracks its light, glances about, and darts when alarmed.
  pose(
    rig, 'eye',
    s.eyePitch + Math.sin(s.time * 6.3) * 0.12 * s.alarm,
    s.eyeYaw + Math.sin(s.time * 0.8) * 0.25 * (1 - s.alarm) + Math.sin(s.time * 9.1) * 0.5 * s.alarm,
    0
  )
  for (let i = 0; i < 4; i++) rig.bones[`rotor${i}`]!.rotation.y = s.spin * (i % 2 === 0 ? 1 : -1)
}

// ─── Enforcer mech ───────────────────────────────────────────────────────────

export const ENFORCER_HEIGHT = 3.3
export const ENFORCER_RADIUS = 0.95
/** The joints the minigun chews through: knees and shoulders, by bone. */
export const ENFORCER_JOINTS = ['kneeL', 'kneeR', 'armL', 'armR'] as const

export const buildEnforcer = (): Rig => {
  const b = new RigBuilder()
  b.bone('hips', null, [0, 1.45, 0])
  b.bone('torso', 'hips', [0, 0.3, 0])
  b.bone('head', 'torso', [0, 0.95, 0.25])
  b.part('hips', rbox(1.0, 0.5, 0.8, 0.4, 10, 8), PAL.steelDeep)
  b.part('torso', rbox(1.6, 1.15, 1.2, 0.38, 12, 10), PAL.steel, { p: [0, 0.5, 0] })
  b.part('torso', rbox(0.9, 0.5, 0.2, 0.5, 8, 6), PAL.steelDark, { p: [0, 0.45, 0.58] })
  b.part('torso', rbox(0.3, 0.12, 0.06, 0.6, 6, 4), PAL.hazard, { p: [0, 0.1, 0.62] })
  // The sensor head: a visor slit that lights when it wakes.
  b.part('head', rbox(0.56, 0.3, 0.46, 0.45, 8, 6), PAL.steelDeep)
  b.part('head', rbox(0.42, 0.08, 0.06, 0.6, 6, 4), PAL.glowRed, { p: [0, 0, 0.22], glow: true, outline: false })
  b.mirror((side, tag) => {
    const x = -side
    b.bone(`arm${tag}`, 'torso', [x * 1.0, 0.75, 0])
    b.bone(`gun${tag}`, `arm${tag}`, [0, -0.62, 0.1])
    // The shoulder joint glows: it is where the armour is thin.
    b.part(`arm${tag}`, sph(0.3, 10, 8), PAL.steelDark)
    b.part(`arm${tag}`, torus(0.3, 0.05, 6, 12), PAL.glowYellow, { r: [0, 0, Math.PI / 2], glow: true, outline: false })
    b.part(`arm${tag}`, rbox(0.4, 0.62, 0.44, 0.45, 8, 8), PAL.steel, { p: [0, -0.4, 0] })
    b.part(`gun${tag}`, rcyl(0.2, 1.0, 0.05, 10), PAL.steelDeep, { p: [0, 0, 0.4], r: [Math.PI / 2, 0, 0] })
    b.part(`gun${tag}`, rcyl(0.12, 0.3, 0.03, 8), PAL.steelDark, { p: [0, 0, 1.0], r: [Math.PI / 2, 0, 0] })
    b.bone(`leg${tag}`, 'hips', [x * 0.48, -0.15, 0])
    b.bone(`knee${tag}`, `leg${tag}`, [0, -0.6, 0.1])
    b.part(`leg${tag}`, rbox(0.42, 0.7, 0.5, 0.45, 8, 8), PAL.steelDeep, { p: [0, -0.3, 0.05] })
    b.part(`knee${tag}`, sph(0.24, 10, 8), PAL.steelDark)
    b.part(`knee${tag}`, torus(0.24, 0.045, 6, 12), PAL.glowYellow, { r: [0, 0, Math.PI / 2], glow: true, outline: false })
    b.part(`knee${tag}`, rbox(0.46, 0.66, 0.56, 0.42, 8, 8), PAL.steel, { p: [0, -0.36, -0.04] })
    b.part(`knee${tag}`, rbox(0.56, 0.2, 0.84, 0.42, 8, 6), PAL.steelDark, { p: [0, -0.62, 0.08] })
  })
  b.part('torso', rcone(0.12, 0.08, 0.5, 0.02, 8), PAL.steelDark, { p: [0.5, 1.2, -0.4] })
  return b.build({ outline: 0.03, height: ENFORCER_HEIGHT })
}

export interface EnforcerPose {
  time: number
  stride: number
  speed: number
  /** 0 powered down and slumped … 1 awake. */
  power: number
  /** Torso turn toward its target, relative to the legs. */
  aimYaw: number
  aimPitch: number
  /** 0 … 1 recoil of the left and right guns. */
  recoilL: number
  recoilR: number
  /** 0 alive … 1 wrecked. */
  dead: number
}

export const poseEnforcer = (rig: Rig, s: EnforcerPose): void => {
  const up = s.power * (1 - s.dead)
  const walk = s.speed * up
  const swing = Math.sin(s.stride)
  const slump = 1 - up
  // Tons of steel on two legs: each step LANDS (the hips drop and catch), the
  // torso rolls over the leg that carries it, the guns swing late behind.
  const land = Math.pow(Math.abs(swing), 6)
  // Waking, it shudders as the hydraulics take the weight.
  const waking = up * (1 - up) * 4
  const shudder = Math.sin(s.time * 37) * 0.02 * waking
  const idle = Math.sin(s.time * 1.3) * 0.015 * up * (1 - walk)
  nudge(rig, 'hips', 0, -0.45 * slump - (0.05 + land * 0.1) * walk + idle + shudder, 0)
  pose(rig, 'hips', 0.05 * walk, swing * 0.1 * walk, s.dead * 0.25 + Math.cos(s.stride) * 0.06 * walk)
  pose(
    rig, 'torso',
    0.4 * slump + s.aimPitch * up + land * 0.05 * walk + shudder * 2,
    s.aimYaw * up - swing * 0.14 * walk,
    s.dead * 0.2 - Math.cos(s.stride) * 0.05 * walk
  )
  pose(
    rig, 'head',
    0.35 * slump - land * 0.06 * walk,
    Math.sin(s.time * 0.9) * 0.45 * up * (1 - Math.min(1, Math.abs(s.aimYaw) * 4)),
    0
  )
  for (const [tag, sign] of [['L', 1], ['R', -1]] as const) {
    pose(rig, `leg${tag}`, -swing * sign * 0.5 * walk - 0.5 * slump, 0, 0)
    pose(rig, `knee${tag}`, (0.18 + Math.max(0, Math.cos(s.stride) * sign) * 0.85) * walk + 0.9 * slump, 0, 0)
    // The gun arms hang heavy and swing a beat behind the legs.
    pose(rig, `arm${tag}`, 0.5 * slump + Math.sin(s.stride - 0.6) * sign * 0.16 * walk - 0.1 * up, 0, -sign * 0.08 * slump)
  }
  nudge(rig, 'gunL', 0, 0, -0.18 * s.recoilL)
  nudge(rig, 'gunR', 0, 0, -0.18 * s.recoilR)
  // Dormant machines are dark: the glow follows the power.
  rig.glowMaterial.color.setScalar(0.08 + 0.92 * up)
}

// ─── Goliath Tank ────────────────────────────────────────────────────────────

export const GOLIATH_LENGTH = 6.4
export const GOLIATH_RADIUS = 2.6
export const GOLIATH_HEIGHT = 3.0

export const buildGoliath = (): Rig => {
  const b = new RigBuilder()
  b.bone('hull', null, [0, 1.0, 0])
  b.bone('turret', 'hull', [0, 0.75, 0.2])
  b.bone('barrel', 'turret', [0, 0.25, 0.9])
  b.bone('vents', 'hull', [0, 0.35, -2.7])

  b.part('hull', rbox(3.4, 1.1, 5.8, 0.32, 14, 10), PAL.steel)
  b.part('hull', rbox(2.6, 0.5, 2.4, 0.4, 10, 8), PAL.steelDeep, { p: [0, 0.6, -1.3] })
  // The sloped bow plate: the front is where the armour is.
  b.part('hull', rbox(3.0, 0.9, 1.4, 0.35, 10, 8), PAL.steelDeep, { p: [0, 0.2, 2.5], r: [-0.45, 0, 0] })
  b.part('hull', rbox(1.2, 0.14, 0.08, 0.6, 6, 4), PAL.hazard, { p: [0, 0.3, 3.1] })
  b.mirror((side) => {
    // Track pods with their wheels.
    b.part('hull', rbox(0.9, 1.3, 6.2, 0.3, 10, 8), PAL.steelDark, { p: [side * 1.95, -0.35, 0] })
    for (let i = 0; i < 5; i++) {
      b.part('hull', rcyl(0.42, 0.3, 0.06, 10), PAL.steelDeep, { p: [side * 2.38, -0.5, -2.2 + i * 1.1], r: [0, 0, Math.PI / 2] })
    }
    // Missile pods on the turret's shoulders.
    b.part('turret', rbox(0.7, 0.6, 1.1, 0.4, 8, 6), PAL.steelDeep, { p: [side * 1.25, 0.45, -0.2] })
    for (let i = 0; i < 2; i++) {
      b.part('turret', sph(0.11, 6, 5), PAL.glowRed, { p: [side * (1.1 + i * 0.3), 0.5, 0.36], glow: true, outline: false })
    }
  })
  // The turret: a wide dome with a cyclops lens.
  b.part('turret', rbox(2.3, 1.0, 2.6, 0.45, 12, 10), PAL.steel, { p: [0, 0.35, 0] })
  b.part('turret', sph(0.24, 10, 8), PAL.steelDark, { p: [0.7, 0.55, 1.1] })
  b.part('turret', sph(0.16, 8, 6), PAL.glowRed, { p: [0.7, 0.55, 1.22], glow: true, outline: false })
  b.part('turret', stripUv(new CylinderGeometry(0.03, 0.03, 1.4, 5)), PAL.steelDark, { p: [-0.8, 1.4, -0.9] })
  // The cannon.
  b.part('barrel', rcyl(0.26, 3.0, 0.05, 10), PAL.steelDeep, { p: [0, 0, 1.5], r: [Math.PI / 2, 0, 0] })
  b.part('barrel', rcyl(0.36, 0.6, 0.06, 10), PAL.steelDark, { p: [0, 0, 2.9], r: [Math.PI / 2, 0, 0] })
  b.part('barrel', rcyl(0.4, 0.7, 0.08, 10), PAL.steelDark, { p: [0, 0, 0.3], r: [Math.PI / 2, 0, 0] })
  // The rear vents: the weak spot, glowing hot.
  b.part('vents', rbox(2.2, 0.8, 0.3, 0.4, 8, 6), PAL.steelDark)
  for (let i = 0; i < 4; i++) {
    b.part('vents', rbox(0.34, 0.5, 0.1, 0.5, 6, 6), PAL.glowYellow, { p: [-0.78 + i * 0.52, 0, -0.13], glow: true, outline: false })
  }
  return b.build({ outline: 0.04, height: GOLIATH_HEIGHT })
}

export interface GoliathPose {
  time: number
  /** Turret turn relative to the hull, and cannon elevation. */
  turretYaw: number
  barrelPitch: number
  /** 0 … 1 cannon recoil. */
  recoil: number
  /** 0 idle … 1 engine shudder (moving, or about to fire). */
  rumble: number
  /** 0 alive … 1 wrecked. */
  dead: number
}

export const poseGoliath = (rig: Rig, s: GoliathPose): void => {
  const alive = 1 - s.dead
  // The hull rides on its suspension: it shudders with the engine, rocks
  // back when the cannon fires, and breathes at idle.
  nudge(rig, 'hull', 0, Math.sin(s.time * 31) * 0.012 * s.rumble * alive + Math.sin(s.time * 1.1) * 0.02 * alive - s.dead * 0.25, -0.12 * s.recoil * alive)
  pose(rig, 'hull', Math.sin(s.time * 23) * 0.004 * s.rumble * alive - 0.05 * s.recoil * alive, 0, s.dead * 0.12)
  pose(rig, 'turret', 0.03 * s.recoil, s.turretYaw, s.dead * 0.18)
  pose(rig, 'barrel', -s.barrelPitch + Math.sin(s.time * 0.7) * 0.015 * alive + s.dead * 0.35, 0, 0)
  nudge(rig, 'barrel', 0, 0, -0.5 * s.recoil)
  rig.glowMaterial.color.setScalar(0.15 + 0.85 * alive)
}
