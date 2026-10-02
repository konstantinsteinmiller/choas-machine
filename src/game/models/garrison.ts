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
    b.bone(`shin${tag}`, `leg${tag}`, [0, -0.32, 0])
    b.part(`leg${tag}`, cap(0.09, 0.18, 6, 3), clothDeep, { p: [0, -0.16, 0] })
    b.part(`shin${tag}`, cap(0.08, 0.16, 6, 3), clothDeep, { p: [0, -0.14, 0] })
    b.part(`shin${tag}`, rbox(0.17, 0.12, 0.3, 0.5, 6, 6), PAL.boot, { p: [0, -0.3, 0.05] })
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
  speed: number
  /** 0 rifle slung … 1 shouldered and aimed. */
  aim: number
  /** 0 calm … 1 looking about (suspicious). */
  wary: number
  /** Head turn relative to the body, radians. */
  lookYaw: number
  /** 0 alive … 1 lying dead; the fall plays out between. */
  dead: number
  /** Which way the body falls: 1 forward, −1 backward. */
  fallDir: number
}

export const poseGuard = (rig: Rig, s: GuardPose): void => {
  const walk = s.speed * (1 - s.dead)
  const swing = Math.sin(s.stride)
  const lift = Math.cos(s.stride)
  const alive = 1 - s.dead
  // The fall: the whole body tips over its feet and sinks to the ground.
  const fall = s.dead * s.dead * (3 - 2 * s.dead)
  nudge(rig, 'hips', 0, -Math.abs(swing) * 0.025 * walk - fall * 0.62, fall * 0.35 * s.fallDir)
  pose(rig, 'hips', fall * 1.45 * s.fallDir, 0, 0)
  pose(rig, 'chest', 0.05 * walk + fall * 0.15 * s.fallDir, -swing * 0.12 * walk, 0)
  pose(
    rig, 'head',
    Math.sin(s.time * 1.3) * 0.04 * alive - 0.15 * s.aim,
    s.lookYaw + Math.sin(s.time * 2.3) * 0.5 * s.wary * alive,
    fall * 0.4
  )
  for (const [tag, sign] of [['L', 1], ['R', -1]] as const) {
    const sw = swing * sign
    pose(rig, `leg${tag}`, -sw * 0.6 * walk - fall * 0.2 * sign, 0, 0)
    pose(rig, `shin${tag}`, (0.2 + Math.max(0, lift * sign) * 0.8) * walk + fall * 0.3, 0, 0)
  }
  // Rifle arm: slung low while calm, up when alarmed; the left hand follows.
  const armR = -0.35 + sw0(swing) * 0.25 * walk * (1 - s.aim)
  pose(rig, 'armR', armR * (1 - s.aim) + -1.45 * s.aim + fall * 0.9, 0.15 * s.aim, 0.1 * (1 - s.aim) + fall * 0.5)
  pose(rig, 'foreR', -0.5 * (1 - s.aim) - 0.1 * s.aim, 0, 0)
  pose(rig, 'armL', (swing * 0.45 * walk) * (1 - s.aim) - 1.0 * s.aim - fall * 0.6, -0.5 * s.aim, -0.1 - fall * 0.7)
  pose(rig, 'foreL', -0.3 - 0.7 * s.aim, 0, 0)
}
const sw0 = (v: number): number => -v

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
}

export const poseDrone = (rig: Rig, s: DronePose): void => {
  nudge(rig, 'body', 0, Math.sin(s.time * 2.4) * 0.05, 0)
  pose(rig, 'body', s.pitch, 0, s.roll)
  pose(rig, 'eye', s.eyePitch, s.eyeYaw, 0)
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
  nudge(rig, 'hips', 0, -0.45 * slump - Math.abs(swing) * 0.06 * walk, 0)
  pose(rig, 'hips', 0, 0, s.dead * 0.25)
  pose(rig, 'torso', 0.4 * slump + s.aimPitch * up, s.aimYaw * up, s.dead * 0.2)
  pose(rig, 'head', 0.35 * slump, Math.sin(s.time * 0.9) * 0.3 * up * (1 - Math.min(1, Math.abs(s.aimYaw) * 4)), 0)
  for (const [tag, sign] of [['L', 1], ['R', -1]] as const) {
    pose(rig, `leg${tag}`, -swing * sign * 0.4 * walk - 0.5 * slump, 0, 0)
    pose(rig, `knee${tag}`, (0.15 + Math.max(0, Math.cos(s.stride) * sign) * 0.5) * walk + 0.9 * slump, 0, 0)
    pose(rig, `arm${tag}`, 0.5 * slump, 0, -sign * 0.08 * slump)
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
  nudge(rig, 'hull', 0, Math.sin(s.time * 31) * 0.012 * s.rumble * alive - s.dead * 0.25, 0)
  pose(rig, 'hull', Math.sin(s.time * 23) * 0.004 * s.rumble * alive, 0, s.dead * 0.12)
  pose(rig, 'turret', 0, s.turretYaw, s.dead * 0.18)
  pose(rig, 'barrel', -s.barrelPitch + s.dead * 0.35, 0, 0)
  nudge(rig, 'barrel', 0, 0, -0.5 * s.recoil)
  rig.glowMaterial.color.setScalar(0.15 + 0.85 * alive)
}
