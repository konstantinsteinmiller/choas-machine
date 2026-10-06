import { BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3, type BufferGeometry } from 'three'
import { RigBuilder, blendPose, cap, dome, ell, merge, paint, pose, nudge, rbox, rcone, rcyl, sph, stripUv, torus, xform, type Rig } from './kit'
import { outlineMat, toonVC } from './toon'
import { PAL } from './palette'
import { stanceSweep } from '../sim/gait'

/**
 * Where a defender's rounds leave its weapon: the bone, and the muzzle in that
 * bone's frame (read off the parts below). The mission draws the flash and
 * the tracer from here, so a round never starts anywhere but the barrel.
 * The Enforcer fires its two arm guns in turn.
 */
export const MUZZLE = {
  rifle: ['rifle', 0, -0.72, 0],
  marksman: ['rifle', 0, -1.17, 0],
  roomba: ['turret', 0, 0.02, 0.56],
  enforcerL: ['gunL', 0, 0, 1.17],
  enforcerR: ['gunR', 0, 0, 1.17],
  goliath: ['barrel', 0, 0, 3.22]
} as const satisfies Record<string, readonly [string, number, number, number]>

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
/** How far a leg leans per unit of the idle weight shift: the pelvis's sideways move over the leg's length, and its roll (#157). */
const IDLE_PLANT = 0.06 + 0.035 / G_LEG

export const buildGuard = (commander = false, shield = false, engineer = false, kit: 'grenadier' | 'marksman' | null = null): Rig => {
  const cloth = commander ? PAL.commander : PAL.uniform
  const clothDeep = commander ? PAL.commanderDeep : PAL.uniformDeep
  const trim = commander ? PAL.commanderTrim : PAL.uniformTrim
  const b = new RigBuilder()
  b.bone('hips', null, [0, 0.78, 0])
  b.bone('chest', 'hips', [0, 0.14, 0])
  b.bone('head', 'chest', [0, 0.42, 0])

  // Round 5 (#147): the guard brought up to the rest of the cast. The same
  // bones and proportions (the big friendly head is the headshot), with the
  // kit a soldier carries: a vest with pouches, a belt, pads at the shoulder,
  // elbow and knee, gloved fists, soled boots, a neck, a face, a real rifle.
  b.part('hips', rbox(0.4, 0.26, 0.28, 0.5, 12, 8), clothDeep)
  // The belt: a band round the hips, its buckle, a pouch on each side.
  b.part('hips', rbox(0.44, 0.07, 0.32, 0.4, 12, 4), PAL.boot, { p: [0, 0.08, 0] })
  b.part('hips', rbox(0.08, 0.06, 0.03, 0.4, 6, 4), trim, { p: [0, 0.08, 0.165], outline: false })
  b.mirror((side) => b.part('hips', rbox(0.09, 0.11, 0.1, 0.35, 6, 6), PAL.vest, { p: [side * 0.2, 0.02, 0.06] }))
  b.part('chest', rbox(0.46, 0.44, 0.3, 0.45, 14, 10), cloth, { p: [0, 0.2, 0] })
  // The neck, up into the head.
  b.part('chest', rcyl(0.075, 0.12, 0.02, 10, 1), PAL.skinDeep, { p: [0, 0.43, 0] })
  if (!commander) {
    // The vest over the chest: a plate in front and behind, straps over the
    // shoulders, three magazine pouches, the trim as a name tape.
    b.part('chest', rbox(0.5, 0.34, 0.36, 0.35, 14, 8), PAL.vest, { p: [0, 0.2, 0] })
    b.mirror((side) => b.part('chest', rbox(0.1, 0.05, 0.36, 0.4, 6, 4), PAL.vest, { p: [side * 0.15, 0.4, 0] }))
    for (const px of [-0.13, 0, 0.13]) {
      b.part('chest', rbox(0.1, 0.13, 0.07, 0.35, 6, 6), PAL.vestDeep, { p: [px, 0.12, 0.2] })
      b.part('chest', rbox(0.1, 0.03, 0.08, 0.4, 6, 3), PAL.vest, { p: [px, 0.185, 0.2], outline: false })
    }
    b.part('chest', rbox(0.24, 0.045, 0.03, 0.6, 6, 4), trim, { p: [0, 0.31, 0.185], outline: false })
    // A radio on the left shoulder strap, its stub antenna.
    b.part('chest', rbox(0.06, 0.1, 0.045, 0.4, 6, 4), PAL.gunDark, { p: [-0.15, 0.32, 0.2] })
    b.part('chest', rcyl(0.008, 0.12, 0.004, 5, 1), PAL.gunDark, { p: [-0.17, 0.42, 0.2], outline: false })
  } else {
    b.part('chest', rbox(0.3, 0.06, 0.04, 0.6, 6, 4), trim, { p: [0, 0.3, 0.15] })
  }
  // A big friendly head under a helmet (or the Commander's cap): ears, a nose.
  b.part('head', sph(0.22, 16, 12), PAL.skin, { p: [0, 0.2, 0] })
  b.mirror((side) => b.part('head', ell(0.035, 0.06, 0.045, 8, 6), PAL.skinDeep, { p: [side * 0.215, 0.19, 0] }))
  b.part('head', ell(0.035, 0.04, 0.045, 8, 6), PAL.skinDeep, { p: [0, 0.155, 0.205], outline: false })
  if (commander) {
    // The Warden: an armoured helm with a glowing visor and a crest, and
    // heavy plates on the shoulders. One round does not do it.
    b.part('head', dome(0.27, Math.PI * 0.56, 12, 7), PAL.steelDeep, { p: [0, 0.21, 0] })
    b.part('head', rbox(0.4, 0.07, 0.08, 0.6, 6, 4), PAL.glowRed, { p: [0, 0.22, 0.22], glow: true, outline: false })
    b.part('head', rbox(0.06, 0.16, 0.34, 0.5, 4, 6), cloth, { p: [0, 0.48, -0.02] })
    b.part('head', sph(0.04, 6, 5), trim, { p: [0, 0.57, 0.12], glow: true, outline: false })
    b.mirror((side) => {
      b.part('chest', sph(0.13, 8, 6), PAL.steelDeep, { p: [side * 0.3, 0.38, 0] })
    })
    b.part('chest', rbox(0.38, 0.2, 0.06, 0.5, 6, 4), PAL.steelDeep, { p: [0, 0.18, 0.16] })
  } else if (engineer) {
    // The Engineer: a hard hat with a lamp, and a tool pack on his back.
    b.part('head', dome(0.255, Math.PI * 0.5, 10, 6), PAL.hazard, { p: [0, 0.22, 0] })
    b.part('head', rbox(0.5, 0.035, 0.5, 0.6, 6, 4), PAL.hazard, { p: [0, 0.23, 0.02] })
    b.part('head', sph(0.05, 6, 5), PAL.glowWhite, { p: [0, 0.38, 0.2], glow: true, outline: false })
    b.part('chest', rbox(0.34, 0.36, 0.18, 0.4, 6, 6), PAL.steelDeep, { p: [0, 0.22, -0.24] })
    b.part('chest', rbox(0.06, 0.3, 0.06, 0.4, 4, 4), PAL.hazard, { p: [0.12, 0.42, -0.3] })
  } else {
    // The helmet: a shell, its rim, a strap under the chin, goggles up on the brow.
    b.part('head', dome(0.245, Math.PI * 0.52, 16, 8), PAL.helmet, { p: [0, 0.22, 0] })
    b.part('head', torus(0.24, 0.022, 6, 24), PAL.helmetDeep, { p: [0, 0.23, 0], r: [Math.PI / 2, 0, 0] })
    b.part('head', rbox(0.34, 0.04, 0.1, 0.6, 6, 4), PAL.helmet, { p: [0, 0.24, 0.2] })
    b.part('head', torus(0.218, 0.012, 4, 16, Math.PI), PAL.boot, { p: [0, 0.2, 0.01], r: [0, 0, Math.PI], outline: false })
    b.part('head', rbox(0.3, 0.07, 0.05, 0.5, 8, 4), PAL.boot, { p: [0, 0.36, 0.205] })
    b.mirror((side) => b.part('head', rcyl(0.034, 0.03, 0.01, 10, 1), PAL.lens, { p: [side * 0.07, 0.36, 0.235], r: [Math.PI / 2, 0, 0], outline: false }))
  }
  b.mirror((side) => {
    b.part('head', sph(0.032, 6, 5), PAL.black, { p: [side * 0.08, 0.2, 0.2], outline: false })
  })

  b.mirror((side, tag) => {
    const x = -side
    b.bone(`arm${tag}`, 'chest', [x * 0.29, 0.36, 0])
    b.bone(`fore${tag}`, `arm${tag}`, [0, -0.26, 0])
    b.part(`arm${tag}`, cap(0.075, 0.16, 10, 3), cloth, { p: [0, -0.13, 0] })
    // A pad on the shoulder and one on the elbow.
    b.part(`arm${tag}`, ell(0.1, 0.07, 0.095, 10, 6), commander ? PAL.steelDeep : PAL.vest, { p: [0, -0.02, 0] })
    b.part(`fore${tag}`, cap(0.065, 0.14, 10, 3), cloth, { p: [0, -0.11, 0] })
    b.part(`fore${tag}`, ell(0.06, 0.055, 0.06, 8, 6), PAL.vestDeep, { p: [0, 0.0, -0.035] })
    // A gloved fist: the cuff, the back of the hand, the curled fingers, the thumb.
    b.part(`fore${tag}`, rcyl(0.066, 0.05, 0.015, 10, 1), PAL.boot, { p: [0, -0.2, 0] })
    b.part(`fore${tag}`, rbox(0.09, 0.1, 0.075, 0.45, 8, 6), PAL.boot, { p: [0, -0.265, 0] })
    b.part(`fore${tag}`, rbox(0.085, 0.045, 0.06, 0.45, 8, 4), PAL.bootDeep, { p: [0, -0.32, 0.02] })
    b.part(`fore${tag}`, cap(0.02, 0.035, 6, 2), PAL.boot, { p: [-x * 0.045, -0.27, 0.035], r: [0.3, 0, -x * 0.5] })
    b.bone(`leg${tag}`, 'hips', [x * 0.12, -0.1, 0])
    b.bone(`shin${tag}`, `leg${tag}`, [0, -G_THIGH, 0])
    // The boot is its own bone: a foot that rolls from heel to toe is most of
    // what makes a walk read as a person's.
    b.bone(`foot${tag}`, `shin${tag}`, [0, -G_SHIN, 0])
    b.part(`leg${tag}`, cap(0.09, 0.18, 10, 3), clothDeep, { p: [0, -0.16, 0] })
    // A thigh pocket.
    b.part(`leg${tag}`, rbox(0.06, 0.1, 0.1, 0.35, 6, 6), cloth, { p: [-x * 0.085, -0.17, 0.01] })
    b.part(`shin${tag}`, cap(0.08, 0.16, 10, 3), clothDeep, { p: [0, -0.14, 0] })
    // The knee pad.
    b.part(`shin${tag}`, rbox(0.11, 0.11, 0.06, 0.45, 8, 6), PAL.vest, { p: [0, -0.01, 0.07] })
    // The boot: the upper with its laced tongue, a toe cap, a thick sole.
    b.part(`foot${tag}`, rbox(0.17, 0.11, 0.3, 0.5, 10, 6), PAL.boot, { p: [0, 0.01, 0.05] })
    b.part(`foot${tag}`, rbox(0.1, 0.06, 0.08, 0.4, 6, 4), PAL.bootDeep, { p: [0, 0.055, 0.12], outline: false })
    b.part(`foot${tag}`, rbox(0.15, 0.06, 0.11, 0.5, 8, 4), PAL.bootDeep, { p: [0, -0.005, 0.15] })
    b.part(`foot${tag}`, rbox(0.185, 0.035, 0.32, 0.3, 10, 4), PAL.sole, { p: [0, -0.0425, 0.05] })
  })

  // The riot shield, held square in front: a steel plate with a hazard rim
  // and a little window to look through. The Warden's is tall; a guard's
  // (#90) is carried lower, the head showing over it, and can be knocked away
  // (its own bone, so it can go).
  if (shield) {
    const k = commander ? 1 : 0.78
    const dy = commander ? 0.04 : -0.16
    b.bone('shield', 'chest', [0.08, dy, 0.42])
    b.part('shield', rbox(0.72 * (commander ? 1 : 0.94), 1.24 * k, 0.06, 0.25, 6, 8), PAL.steelDeep)
    b.part('shield', rbox(0.76, 0.08, 0.07, 0.4, 6, 3), PAL.hazard, { p: [0, 0.61 * k, 0] })
    b.part('shield', rbox(0.76, 0.08, 0.07, 0.4, 6, 3), PAL.hazard, { p: [0, -0.61 * k, 0] })
    b.part('shield', rbox(0.34, 0.08, 0.02, 0.6, 4, 3), PAL.glowCyan, { p: [0, 0.34 * k, 0.035], glow: true, outline: false })
  }
  // A grenadier (#90): a satchel of grenades across the chest, two on the belt.
  if (kit === 'grenadier') {
    b.part('chest', rbox(0.5, 0.08, 0.06, 0.5, 6, 3), PAL.boot, { p: [0, 0.18, 0.16], r: [0, 0, 0.7] })
    for (const gx of [-0.13, 0.13]) b.part('hips', sph(0.065, 8, 6), PAL.hazard, { p: [gx, 0.02, 0.17] })
    b.part('chest', sph(0.065, 8, 6), PAL.hazard, { p: [0.1, 0.32, 0.18] })
  }

  // The rifle, in the right hand, barrel along the forearm: the receiver, a
  // ribbed handguard round the barrel, a curved magazine, the stock, a sight,
  // and a muzzle brake where every round leaves it (MUZZLE.rifle).
  b.bone('rifle', 'foreR', [0, -0.25, 0.03])
  b.part('rifle', rbox(0.07, 0.36, 0.11, 0.5, 8, 8), PAL.gunMetal, { p: [0, -0.05, 0] })
  b.part('rifle', stripUv(new CylinderGeometry(0.022, 0.022, 0.5, 10)), PAL.gunDark, { p: [0, -0.45, 0] })
  b.part('rifle', rbox(0.065, 0.2, 0.075, 0.45, 8, 6), PAL.gunDark, { p: [0, -0.31, 0] })
  for (const ry of [-0.25, -0.31, -0.37]) b.part('rifle', rbox(0.07, 0.012, 0.08, 0.3, 6, 2), PAL.gunMetal, { p: [0, ry, 0], outline: false })
  b.part('rifle', rcyl(0.032, 0.06, 0.01, 10, 1), PAL.gunMetal, { p: [0, -0.69, 0] })
  b.part('rifle', rbox(0.05, 0.08, 0.14, 0.4, 6, 6), PAL.gunDark, { p: [0, -0.06, 0.1], r: [0.35, 0, 0] })
  b.part('rifle', rbox(0.06, 0.2, 0.09, 0.5, 8, 6), PAL.gunDark, { p: [0, 0.2, -0.02] })
  b.part('rifle', rbox(0.055, 0.06, 0.12, 0.45, 6, 4), PAL.gunDark, { p: [0, 0.31, -0.03] })
  b.part('rifle', rbox(0.035, 0.1, 0.04, 0.4, 6, 4), PAL.gunDark, { p: [0, -0.08, -0.075] })
  b.part('rifle', rcyl(0.012, 0.012, 0.004, 6, 1), PAL.glowCyan, { p: [0, -0.135, -0.075], glow: true, outline: false })
  // A marksman (#90): a long barrel, a scope and the laser's red eye.
  if (kit === 'marksman') {
    b.part('rifle', stripUv(new CylinderGeometry(0.016, 0.016, 0.5, 6)), PAL.gunDark, { p: [0, -0.9, 0] })
    b.part('rifle', stripUv(new CylinderGeometry(0.035, 0.035, 0.22, 8)), PAL.gunMetal, { p: [0, -0.2, 0.09] })
    b.part('rifle', sph(0.025, 6, 5), PAL.glowRed, { p: [0, -0.62, 0.05], glow: true, outline: false })
  }

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
  /** Seized from behind (alive); on the blade; the life going out of it. Each 0 … 1. */
  gripped: number
  impaled: number
  limp: number
  /** 0 … 1 driven down onto its knees (a backstab, `sim/backstab.ts`). */
  kneel: number
  /** 0 … 1 down on one knee to look at something on the floor (a body it found, #148). */
  inspect: number
  /** 0 … 1 at work with both hands: cranking a beacon, an Engineer at a repair (#148). */
  work: number
  /** 0 … 1 on fire (#148): arms flailing, beating at itself. */
  burning: number
  /** 0 … 1 a shield guard's shield raised over his head, the body crouched behind it (#151). */
  shieldUp: number
  /** Seconds since it died; 0 while alive. */
  deadT: number
  /** How it goes down. */
  death: HumanDeath
}

/**
 * The ways a person falls:
 * `back`   shot from the front: the head snaps, the body goes over backward;
 * `front`  from behind: the knees give, then it folds onto its face;
 * `spin`   a burst: it is turned round and dropped on its side;
 * `thrown` a blast: off its feet, heels over head, onto its back.
 */
export type HumanDeath = 'back' | 'front' | 'spin' | 'thrown'

export const restGuardPose = (): GuardPose => ({
  time: 0, stride: 0, speed: 0, aim: 0, wary: 0, caution: 0, startle: 0, recoil: 0, lookYaw: 0, seed: 0.5, proud: false, gripped: 0, impaled: 0, limp: 0, kneel: 0, inspect: 0, work: 0, burning: 0, shieldUp: 0, deadT: 0, death: 'back'
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
  if (s.deadT > DEATH_BLEND) { poseGuardDeath(rig, s); return }
  poseGuardAlive(rig, s)
  if (s.deadT <= 0) return
  // The first instant of dying: out of whatever it was doing, into the fall.
  const bones = GUARD_BONES
  for (let i = 0; i < bones.length; i++) {
    const b = rig.bones[bones[i]!]!
    _q[i]!.copy(b.quaternion)
    _p[i]!.copy(b.position)
  }
  poseGuardDeath(rig, s)
  const w = smooth(s.deadT / DEATH_BLEND)
  for (let i = 0; i < bones.length; i++) {
    const b = rig.bones[bones[i]!]!
    b.quaternion.copy(_q[i]!.slerp(b.quaternion, w))
    b.position.copy(_p[i]!.lerp(b.position, w))
  }
}

const DEATH_BLEND = 0.12
const GUARD_BONES = ['hips', 'chest', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR'] as const
const _q = GUARD_BONES.map(() => new Quaternion())
const _p = GUARD_BONES.map(() => new Vector3())

/** How long each fall takes to come to rest, seconds: nothing moves after. */
export const DEATH_SECONDS: Readonly<Record<HumanDeath, number>> = { back: 1.0, front: 1.25, spin: 1.1, thrown: 1.3 }

/**
 * The fall, as a little piece of acting rather than a tip-over: a reaction to
 * the hit, the body giving way in an order (head, knees, the rest), a landing
 * with a bounce, and limbs that come to rest a moment after the body does.
 * Lying, the hips are 14 cm off the ground: the thickness of the body.
 */
const poseGuardDeath = (rig: Rig, s: GuardPose): void => {
  const k = s.deadT
  const own = s.seed - 0.5
  const hit = bump(k / 0.3)
  const LIE = -0.64
  let hipY = 0
  let hipZ = 0
  let hipX = 0
  let pitch = 0
  let yaw = 0
  let roll = 0
  let chest = 0
  let head = 0
  let headYaw = 0
  let armL = 0; let armR = 0; let armLz = -0.1; let armRz = 0.1
  let foreL = -0.2; let foreR = -0.3
  let legL = 0; let legR = 0; let kneeL = 0.05; let kneeR = 0.05
  if (s.death === 'back') {
    // The head goes first, the heels leave the ground, flat on the back.
    const f = smooth((k - 0.06) / 0.5)
    const land = bump((k - 0.5) / 0.28)
    const rest = smooth((k - 0.55) / 0.4)
    pitch = -1.5 * f
    hipY = LIE * f + land * 0.07
    hipZ = -0.45 * f
    head = -0.7 * hit + 0.15 * rest
    headYaw = own * 1.2 * rest
    chest = -0.25 * hit
    armL = -2.2 * bump(f * 0.9) - 0.5 * rest
    armR = -1.9 * bump(f * 0.9) - 0.2 * rest
    armLz = -0.1 - 1.2 * rest
    armRz = 0.1 + 0.9 * rest
    foreL = -0.2 - 0.5 * rest
    legL = -0.9 * bump(f * 0.85)
    legR = -0.6 * bump(f * 0.95) - 0.5 * rest
    kneeR = 0.05 + 0.9 * rest
    kneeL = 0.05 + 0.6 * bump(f)
  } else if (s.death === 'front') {
    // The knees give, it sits back on its heels for a breath, then folds
    // forward onto its face.
    const kneel = smooth(k / 0.32)
    const f = smooth((k - 0.42) / 0.5)
    const land = bump((k - 0.85) / 0.25)
    const rest = smooth((k - 0.9) / 0.35)
    hipY = -0.36 * kneel * (1 - f) + LIE * f + land * 0.05
    hipZ = 0.5 * f
    pitch = -0.12 * kneel * (1 - f) + 1.5 * f
    kneeL = 0.05 + 1.9 * kneel * (1 - f)
    kneeR = 0.05 + 1.9 * kneel * (1 - f) + 0.35 * rest
    legL = -0.55 * kneel * (1 - f)
    legR = -0.55 * kneel * (1 - f)
    chest = 0.35 * kneel * (1 - f) + 0.1 * f
    head = 0.6 * kneel * (1 - f) - 0.2 * f
    headYaw = (own > 0 ? 1 : -1) * 1.1 * f
    armL = 0.2 * kneel - 1.1 * f
    armR = 0.2 * kneel + 0.3 * f
    armLz = -0.1 - 0.5 * rest
    armRz = 0.1 + 0.3 * rest
    foreL = -0.2 - 0.9 * f
  } else if (s.death === 'spin') {
    // Turned by the rounds, legs tangling, down on its side.
    const f = smooth((k - 0.05) / 0.6)
    const land = bump((k - 0.6) / 0.28)
    const rest = smooth((k - 0.65) / 0.4)
    const dir = own > 0 ? 1 : -1
    yaw = dir * 2.6 * smooth(k / 0.55)
    roll = dir * 1.5 * f
    hipY = LIE * f + land * 0.06
    hipX = dir * 0.3 * f
    chest = 0.2 * hit
    head = 0.3 * rest
    armL = -1.6 * bump(f) - 0.9 * rest
    armR = -1.2 * bump(f) + 0.2 * rest
    armLz = -0.1 - 0.8 * bump(f)
    armRz = 0.1 + 0.8 * bump(f)
    legL = -0.5 * f
    legR = 0.35 * f
    kneeL = 0.05 + 1.0 * f
    kneeR = 0.05 + 0.4 * f
  } else {
    // Off its feet: up, over, and down on its back a couple of metres away.
    const f = sat(k / 0.75)
    const land = bump((k - 0.75) / 0.3)
    const rest = smooth((k - 0.8) / 0.4)
    const arc = Math.sin(f * Math.PI)
    pitch = -(Math.PI * 2 + 1.5) * smooth(f)
    hipY = arc * 1.5 + LIE * smooth(f) + land * 0.1
    hipZ = -2.2 * smooth(f)
    armL = -2.4 * arc - 0.4 * rest
    armR = -2.0 * arc - 0.6 * rest
    armLz = -0.1 - 1.0 * rest - 0.6 * arc
    armRz = 0.1 + 1.1 * rest + 0.6 * arc
    legL = -0.8 * arc
    legR = -0.3 * arc - 0.4 * rest
    kneeL = 0.05 + 1.0 * arc
    kneeR = 0.05 + 0.6 * arc + 0.7 * rest
    head = -0.3 * arc
    headYaw = own * rest
  }
  nudge(rig, 'hips', hipX, hipY, hipZ)
  pose(rig, 'hips', pitch, yaw, roll)
  pose(rig, 'chest', chest, 0, 0)
  pose(rig, 'head', head, headYaw, 0)
  pose(rig, 'armL', armL, 0, armLz)
  pose(rig, 'armR', armR, 0, armRz)
  pose(rig, 'foreL', foreL, 0, 0)
  pose(rig, 'foreR', foreR, 0, 0)
  pose(rig, 'legL', legL, 0, 0.08)
  pose(rig, 'legR', legR, 0, -0.08)
  pose(rig, 'shinL', kneeL, 0, 0)
  pose(rig, 'shinR', kneeR, 0, 0)
  pose(rig, 'footL', 0.5, 0, 0)
  pose(rig, 'footR', 0.5, 0, 0)
}

const poseGuardAlive = (rig: Rig, s: GuardPose): void => {
  const alive = 1
  // A walk is a whole gait from a slow pace on; a run lengthens it.
  const walk = smooth(s.speed / 0.3) * alive
  const run = smooth((s.speed - 0.55) / 0.4) * alive
  const still = (1 - walk) * alive
  const calm = (1 - s.aim) * (1 - s.caution) * (1 - s.gripped)
  // Seized, and then run through: it is pulled back onto the hand, arches
  // on the blade with its feet barely on the ground, and then everything
  // lets go from the head down.
  const grip = s.gripped * (1 - s.impaled)
  const stuck = s.impaled * (1 - s.limp)
  const gone = s.impaled * s.limp
  const tremble = Math.sin(s.time * 43) * 0.02 * stuck
  const own = s.seed - 0.5
  const swagger = 1 + own * 0.5
  const t = s.time

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
  const stance = ((0.22 * s.caution + 0.28 * s.aim) * (1 - s.gripped) + 0.3 * gone) * (1 - s.kneel)
  // On its knees: the thighs upright, the shins back along the floor.
  const kneel = s.kneel
  let reach = 0
  for (const [tag, sign] of [['L', 1], ['R', -1]] as const) {
    const ph = s.stride + (sign > 0 ? 0 : Math.PI)
    const sw = Math.sin(ph)
    const up = Math.max(0, Math.cos(ph))
    // Forward further than back, the way a stride really is. On the floor the
    // leg sweeps back at an even rate, heel strike to toe-off, so the foot
    // stays where it was put while the body passes over it (#148); in the air
    // it swings forward again.
    const thigh = -(stanceSweep(ph) * (0.46 + 0.22 * run) + 0.1) * walk * swagger
      - stance
      // Standing: the leg without the weight is a little bent.
      - 0.1 * Math.max(0, -shift * sign)
      - (0.08 + 0.06 * sign) * kneel
    const knee = (0.14 + up * (0.95 + 0.5 * run) + Math.max(0, sw) * 0.12) * walk
      + stance * 2
      + 0.22 * Math.max(0, -shift * sign)
      + 1.62 * kneel
    // Heel first (toes up as the leg reaches), toe last (heel up as it leaves).
    const roll = (Math.max(0, sw) * 0.3 * (1 - up) - Math.max(0, -sw) * 0.45 * up) * walk
    // Standing, the weight moves over one foot and then the other; the feet
    // stay where they are (#157): each leg leans against the pelvis's sideways
    // shift and roll by just as much, so the soles do not slide.
    pose(rig, `leg${tag}`, thigh, 0, sign * (0.07 + 0.06 * s.aim) * alive - shift * IDLE_PLANT)
    pose(rig, `shin${tag}`, knee, 0, 0)
    // Kneeling, the foot lies flat behind the shin, its top on the floor.
    pose(rig, `foot${tag}`, (-(thigh + knee) - roll) * (1 - kneel) + 1.4 * kneel, 0, 0)
    // The lowest of knee and ankle stands on the floor (kneeling, the knee; the knee cap's thickness under it).
    const kneeDown = G_THIGH * Math.cos(hipPitch + thigh)
    reach = Math.max(reach, kneeDown - 0.06 * kneel, kneeDown + G_SHIN * Math.cos(hipPitch + thigh + knee))
  }

  // ── Pelvis and spine ──
  const swing = Math.sin(s.stride)
  const sink = (G_LEG - reach) * alive
  nudge(
    rig, 'hips',
    shift * 0.035 + swing * 0.012 * walk,
    -sink + 0.05 * stuck,
    -0.04 * s.startle - 0.05 * grip + 0.06 * s.impaled
  )
  pose(
    rig, 'hips',
    hipPitch * alive,
    swing * 0.16 * walk * swagger,
    Math.cos(s.stride) * 0.05 * walk * swagger + shift * 0.06
  )
  pose(
    rig, 'chest',
    0.04 * walk + 0.14 * run + 0.22 * s.caution + 0.1 * s.aim - 0.06 * s.recoil - 0.22 * s.startle - 0.2 * grip - 0.24 * stuck + 0.2 * gone + tremble
      + breathe * 0.012 * alive + lookDown * 0.18 - shrug * 0.12 - (s.proud ? 0.07 * calm : 0),
    -swing * 0.3 * walk * swagger * calm,
    -Math.cos(s.stride) * 0.04 * walk - shift * 0.05
  )
  pose(
    rig, 'head',
    -0.04 * walk - 0.16 * s.caution - 0.15 * s.aim + lookDown * 0.55 + 0.25 * s.startle - 0.4 * grip - 0.34 * stuck + 0.75 * gone
      + Math.sin(t * 1.3) * 0.03 * alive + (s.proud ? -0.08 * calm : 0),
    (s.lookYaw + Math.sin(t * 2.3) * 0.5 * s.wary + swing * 0.14 * walk * calm) * alive,
    scratch * 0.2
  )

  // ── Arms ──
  // The rifle hand carries the rifle low and lets it swing a little; ready
  // across the body when wary; shouldered when aiming.
  const ready = Math.max(s.caution * 0.8, s.aim)
  const carryR = -0.3 + swing * 0.22 * walk * swagger - shrug * 0.15
  pose(
    rig, 'armR',
    (carryR * (1 - ready) - 1.45 * ready - 0.12 * s.recoil + 0.5 * s.startle) * (1 - s.impaled) + 0.25 * grip - 0.7 * stuck,
    0.15 * ready,
    0.1 * (1 - ready) + shrug * 0.12 + 0.75 * stuck + 0.15 * gone
  )
  pose(rig, 'foreR', ((-0.5 - 0.12 * walk) * (1 - ready) - 0.1 * ready - 0.25 * s.startle) * (1 - gone) - 0.1 * gone, 0, 0)
  // The free arm swings against its leg, bends as it comes forward, and is
  // the one that scratches. The Commander keeps his behind his back.
  const swingL = -swing * (0.5 + 0.35 * run) * walk * swagger
  const behind = s.proud ? calm : 0
  pose(
    rig, 'armL',
    (swingL - 0.05) * (1 - ready) * (1 - behind) + 0.45 * behind - 1.0 * ready - 2.5 * scratch - shrug * 0.15
      + 0.6 * s.startle - 1.7 * grip - 0.9 * stuck,
    -0.5 * ready + 0.5 * behind,
    -0.1 - 0.25 * scratch - shrug * 0.14 - 0.3 * s.startle - 0.8 * stuck - 0.15 * gone
  )
  pose(
    rig, 'foreL',
    ((-0.22 - Math.max(0, -swingL) * 0.9 - 0.3 * run) * (1 - ready) * (1 - behind) - 0.9 * behind - 0.7 * ready - 1.5 * scratch) * (1 - s.gripped)
      - 1.6 * grip - 0.5 * stuck - 0.1 * gone,
    0, 0
  )
  poseGuardActions(rig, s)
}

/**
 * What a guard does with its body besides walking (#148), laid over the gait:
 * down on one knee to look at what lies on the floor, both hands at work, and
 * on fire.
 */
const poseGuardActions = (rig: Rig, s: GuardPose): void => {
  const t = s.time
  // The riot shield up over the head (#151): the plate lifted to the face,
  // the left arm high behind it, a crouch, the head down behind the rim.
  const sh = rig.bones.shield
  if (sh) {
    const up = s.shieldUp * (1 - s.gripped)
    const rest = rig.rest.shield!.p
    sh.position.set(rest.x, rest.y + SHIELD_LIFT * up, rest.z + 0.04 * up)
    if (up > 0.001) {
      blendPose(rig, 'armL', -1.55, 0, -0.2, up)
      blendPose(rig, 'foreL', -0.9, 0, 0, up)
      blendPose(rig, 'chest', 0.2, 0, 0, up)
      blendPose(rig, 'head', 0.3, 0, 0, up)
      const hips = rig.bones.hips!
      hips.position.y -= 0.08 * up
    }
  }
  // One knee: the left foot planted ahead, the right knee on the floor, the
  // body bent over what it looks at, the free hand reaching down to it.
  const ins = s.inspect * (1 - s.gripped)
  if (ins > 0.001) {
    blendPose(rig, 'legL', -1.45, 0, 0.08, ins)
    blendPose(rig, 'shinL', 1.5, 0, 0, ins)
    blendPose(rig, 'footL', -0.05, 0, 0, ins)
    blendPose(rig, 'legR', 0.06, 0, -0.08, ins)
    blendPose(rig, 'shinR', 1.62, 0, 0, ins)
    blendPose(rig, 'footR', 1.35, 0, 0, ins)
    blendPose(rig, 'hips', 0.05, 0, 0, ins)
    blendPose(rig, 'chest', 0.42, 0.12, 0, ins)
    blendPose(rig, 'head', 0.4, Math.sin(t * 0.9) * 0.2, 0, ins)
    blendPose(rig, 'armL', -1.0, 0, -0.15, ins)
    blendPose(rig, 'foreL', -0.35, 0, 0, ins)
    blendPose(rig, 'armR', -0.55, 0, 0.12, ins)
    // The hips come down until the right knee is on the floor.
    const hips = rig.bones.hips!
    const rest = rig.rest.hips!.p.y
    hips.position.y += (rest - (G_LEG - G_THIGH - 0.07) - hips.position.y) * ins
  }
  // Both hands at a crank or a panel: the right turning, the left steadying, leaning in.
  const wk = s.work * (1 - s.gripped)
  if (wk > 0.001) {
    const crank = Math.sin(t * 7)
    const crank2 = Math.cos(t * 7)
    blendPose(rig, 'armR', -1.2 + crank * 0.14, 0.15, 0.12 + crank2 * 0.08, wk)
    blendPose(rig, 'foreR', -0.4 + crank2 * 0.35, 0, 0, wk)
    blendPose(rig, 'armL', -1.05, -0.2, -0.12, wk)
    blendPose(rig, 'foreL', -0.65, 0, 0, wk)
    blendPose(rig, 'chest', 0.24, crank * 0.06, 0, wk)
    blendPose(rig, 'head', 0.28, 0, 0, wk)
  }
  // On fire: both arms thrown up and beating, the head thrashing, the body
  // twisting away from the flames.
  const bn = s.burning
  if (bn > 0.001) {
    const f1 = Math.sin(t * 13)
    const f2 = Math.sin(t * 11 + 1.3)
    const f3 = Math.sin(t * 7 + 0.4)
    blendPose(rig, 'armL', -2.5 + f1 * 0.55, 0, -0.45 + f2 * 0.35, bn)
    blendPose(rig, 'foreL', -1.0 + f2 * 0.7, 0, 0, bn)
    blendPose(rig, 'armR', -2.3 + f2 * 0.55, 0, 0.45 + f1 * 0.35, bn)
    blendPose(rig, 'foreR', -0.9 + f1 * 0.7, 0, 0, bn)
    blendPose(rig, 'head', -0.35 + f1 * 0.2, f3 * 0.6, 0, bn)
    blendPose(rig, 'chest', -0.12 + f2 * 0.12, f3 * 0.35, 0, bn)
  }
}

/** How far a guard's riot shield rises when he raises it (#151): `hitscan.ts` GUARD_SHIELD_UP. */
const SHIELD_LIFT = 0.54

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
  /** Seconds since it was shot down; 0 while it flies. `landed` once it is on the ground. */
  deadT: number
  landed: boolean
}

export const poseDrone = (rig: Rig, s: DronePose): void => {
  if (s.deadT > 0) {
    // Shot down: it tumbles all the way to the ground, rotors windmilling,
    // and lies there on its side.
    const tumble = s.landed ? 0 : s.deadT
    nudge(rig, 'body', 0, 0, 0)
    pose(rig, 'body', s.landed ? 0.35 : tumble * 9, tumble * 4, s.landed ? 1.1 : tumble * 6)
    pose(rig, 'eye', 0.6, 0, 0)
    for (let i = 0; i < 4; i++) rig.bones[`rotor${i}`]!.rotation.y = s.spin * (i % 2 === 0 ? 1 : -1)
    rig.glowMaterial.color.setScalar(s.landed ? 0.12 : 0.4 + 0.6 * Math.max(0, Math.sin(s.time * 40)))
    return
  }
  rig.glowMaterial.color.setScalar(1)
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

// ─── Searchlight ─────────────────────────────────────────────────────────────

/** The lamp's lens: what a sniper puts out. Above the mast's foot, metres. */
export const SEARCHLIGHT_LENS_R = 0.45

/**
 * A lamp on a mast. The rig's origin is the LAMP (it stands `SEARCHLIGHT_MAST`
 * above whatever it is bolted to, and the mast hangs down from it), so the
 * simulation's position for it is the thing a round has to hit.
 */
export const buildSearchlight = (): Rig => {
  const b = new RigBuilder()
  b.bone('mast', null, [0, 0, 0])
  b.bone('yoke', 'mast', [0, 0, 0])
  b.bone('lamp', 'yoke', [0, 0, 0])
  // The mast and its foot, down to the tower top.
  b.part('mast', rcyl(0.09, 1.9, 0.02, 8), PAL.steelDark, { p: [0, -1.25, 0] })
  b.part('mast', rcyl(0.3, 0.16, 0.04, 10), PAL.steelDeep, { p: [0, -2.2, 0] })
  b.part('mast', rbox(0.5, 0.1, 0.5, 0.4, 6, 4), PAL.hazard, { p: [0, -2.08, 0] })
  // The yoke: two arms that hold the lamp and let it tip.
  b.part('yoke', rcyl(0.16, 0.16, 0.04, 10), PAL.steelDeep, { p: [0, -0.34, 0] })
  b.mirror((side) => {
    b.part('yoke', rbox(0.08, 0.5, 0.14, 0.5, 6, 4), PAL.steelDeep, { p: [side * 0.42, -0.12, 0] })
  })
  // The lamp: a drum with a hooded lens.
  b.part('lamp', rcyl(0.36, 0.62, 0.08, 14), PAL.steel, { r: [Math.PI / 2, 0, 0] })
  b.part('lamp', rcyl(0.41, 0.14, 0.04, 14), PAL.steelDark, { p: [0, 0, 0.32], r: [Math.PI / 2, 0, 0] })
  b.part('lamp', rcyl(0.33, 0.06, 0.02, 14), PAL.glowWhite, { p: [0, 0, 0.37], r: [Math.PI / 2, 0, 0], glow: true, outline: false })
  b.part('lamp', rbox(0.3, 0.2, 0.2, 0.5, 6, 4), PAL.steelDark, { p: [0, 0.05, -0.36] })
  b.part('lamp', sph(0.05, 6, 5), PAL.glowRed, { p: [0, 0.215, -0.36], glow: true, outline: false })
  return b.build({ outline: 0.02, height: 0.8 })
}

// ─── Roomba (#72) ────────────────────────────────────────────────────────────

/**
 * A Roomba: a knee-high disc robot with a gun turret on its back. The dome is
 * its eye and its weak spot (a red ring), the bumper its hazard stripe. The
 * Peashooter carries a short SMG; the Buckshot a fat double barrel.
 */
export const buildRoomba = (shotgun = false): Rig => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 0.27, 0])
  b.bone('turret', 'body', [0, 0.44, -0.22])
  b.part('body', rcyl(0.58, 0.32, 0.08, 18), PAL.steel)
  b.part('body', rcyl(0.6, 0.08, 0.03, 18), PAL.hazard, { p: [0, -0.06, 0] })
  b.part('body', rcyl(0.5, 0.05, 0.02, 18), PAL.steelDark, { p: [0, -0.18, 0] })
  // The dome and its glowing eye ring: what a sniper aims at.
  b.part('body', dome(0.24, Math.PI * 0.5, 12, 6), PAL.steelDark, { p: [0, 0.16, 0.12] })
  b.part('body', torus(0.11, 0.022, 6, 14), PAL.glowRed, { p: [0, 0.27, 0.33], r: [-0.5, 0, 0], glow: true, outline: false })
  b.part('body', sph(0.075, 8, 6), PAL.glowRed, { p: [0, 0.27, 0.32], glow: true, outline: false })
  // Its little brushes at the front.
  b.mirror((side) => {
    b.part('body', rcyl(0.11, 0.03, 0.01, 8), PAL.steelDeep, { p: [side * 0.36, -0.178, 0.42] })
  })
  // The gun on its back.
  b.part('turret', rbox(0.07, 0.3, 0.07, 0.5, 4, 4), PAL.steelDark, { p: [0, -0.16, 0] })
  b.part('turret', rbox(0.22, 0.14, 0.26, 0.5, 6, 4), PAL.gunMetal)
  if (shotgun) {
    b.mirror((side) => {
      b.part('turret', stripUv(new CylinderGeometry(0.045, 0.045, 0.42, 8)), PAL.gunDark, { p: [side * 0.05, 0.02, 0.3], r: [Math.PI / 2, 0, 0] })
    })
  } else {
    b.part('turret', stripUv(new CylinderGeometry(0.03, 0.03, 0.46, 6)), PAL.gunDark, { p: [0, 0.02, 0.32], r: [Math.PI / 2, 0, 0] })
    b.part('turret', rbox(0.05, 0.12, 0.05, 0.5, 4, 4), PAL.gunDark, { p: [0, -0.08, 0.1] })
  }
  return b.build({ outline: 0.02, height: 0.7 })
}

export interface RoombaPose {
  time: number
  /** 0 calm … 1 it has the mech: the turret tracks, the body judders. */
  alarm: number
  /** 0 … 1 the gun's kick. */
  recoil: number
  /** Turret yaw relative to the body. */
  aimYaw: number
  speed: number
}

export const poseRoomba = (rig: Rig, s: RoombaPose): void => {
  // It hums along, jiggling a little on its wheels; it judders when it is angry.
  nudge(rig, 'body', 0, Math.sin(s.time * 23) * 0.006 * (0.4 + s.speed) + Math.sin(s.time * 47) * 0.01 * s.alarm, 0)
  pose(rig, 'body', Math.sin(s.time * 9) * 0.015 * s.speed, 0, Math.sin(s.time * 7) * 0.012 * s.speed)
  nudge(rig, 'turret', 0, 0, -0.06 * s.recoil)
  pose(rig, 'turret', -0.1 * s.recoil, s.aimYaw, 0)
}

export interface SearchlightPose {
  time: number
  /** Where the lamp points: round the mast, and down. Radians. */
  yaw: number
  pitch: number
  /** 0 calm … 1 it has something: the lamp shakes on its yoke. */
  alarm: number
}

export const poseSearchlight = (rig: Rig, s: SearchlightPose): void => {
  // The rig's root already turns with the unit: the yoke only carries the
  // wobble of an old motor, the lamp the tilt.
  pose(rig, 'yoke', 0, s.yaw + Math.sin(s.time * 31) * 0.012 * s.alarm, 0)
  pose(rig, 'lamp', s.pitch + Math.sin(s.time * 2.2) * 0.01 + Math.sin(s.time * 27) * 0.015 * s.alarm, 0, 0)
}

// ─── Enforcer mech ───────────────────────────────────────────────────────────

export const ENFORCER_HEIGHT = 3.3
export const ENFORCER_RADIUS = 0.95
/** The joints the minigun chews through: knees and shoulders, by bone. */
export const ENFORCER_JOINTS = ['kneeL', 'kneeR', 'armL', 'armR'] as const

export const buildEnforcer = (foreman = false): Rig => {
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
  if (foreman) {
    // The Foreman: a hazard-striped crest on its head and plates on its
    // chest, so it is told from the others across the yard.
    for (let i = 0; i < 5; i++) b.part('head', rbox(0.11, 0.4, 0.5, 0.4, 4, 4), i % 2 ? PAL.steelDeep : PAL.hazard, { p: [(i - 2) * 0.11, 0.32, -0.02] })
    b.part('torso', rbox(0.9, 0.5, 0.12, 0.3, 6, 5), PAL.hazard, { p: [0, 0.55, 0.58] })
  }
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
  /** Seconds since it was wrecked; 0 while it runs. */
  deadT: number
}

export const poseEnforcer = (rig: Rig, s: EnforcerPose): void => {
  // Wrecked in one piece: the lights stutter, the knees let go, and it
  // goes down forward onto its guns.
  const dying = sat(s.deadT / 0.35)
  const topple = smooth((s.deadT - 0.3) / 0.75)
  const crash = bump((s.deadT - 1.0) / 0.3)
  const up = s.power * (1 - dying)
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
  const spark = s.deadT > 0 && s.deadT < 0.9 ? Math.sin(s.time * 53) * 0.03 * (1 - topple) : 0
  nudge(rig, 'hips', spark, -0.45 * slump * (1 - topple * 0.4) - 0.55 * topple + crash * 0.08 - (0.05 + land * 0.1) * walk + idle + shudder, 0.5 * topple)
  pose(rig, 'hips', 0.05 * walk + 1.15 * topple, swing * 0.1 * walk, 0.18 * topple + Math.cos(s.stride) * 0.06 * walk)
  pose(
    rig, 'torso',
    0.4 * slump + s.aimPitch * up + land * 0.05 * walk + shudder * 2,
    s.aimYaw * up - swing * 0.14 * walk,
    0.2 * topple - Math.cos(s.stride) * 0.05 * walk
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
  // …and a dying one stutters before it goes out.
  const stutter = s.deadT > 0 && s.deadT < 0.7 ? (Math.sin(s.time * 61) > 0.2 ? 0.7 : 0) * (1 - s.deadT / 0.7) : 0
  rig.glowMaterial.color.setScalar(0.08 + 0.92 * Math.max(up, stutter))
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

/**
 * The cage round a searchlight that cannot be broken (#163): a drum of
 * armoured glass, steel bars round it, a hood on top, all centred on the lamp
 * (the rig's origin). Round, so it reads the same however the lamp turns
 * inside it; it does not turn with it.
 */
export const LAMP_CAGE_R = 0.78
export const buildLampCage = (): { group: Group; dispose(): void } => {
  const group = new Group()
  group.name = 'lampCage'
  const h = 1.5
  const bars = 8
  const parts: BufferGeometry[] = []
  for (let i = 0; i < bars; i++) {
    const a = (i / bars) * Math.PI * 2
    parts.push(paint(xform(rcyl(0.035, h, 0.01, 8, 1), [Math.sin(a) * LAMP_CAGE_R, 0, Math.cos(a) * LAMP_CAGE_R]), PAL.steelDark))
  }
  // A ring round the foot and the top, and the hood over it.
  parts.push(paint(xform(torus(LAMP_CAGE_R, 0.045, 6, 32), [0, -h / 2 + 0.05, 0], [Math.PI / 2, 0, 0]), PAL.steelDeep))
  parts.push(paint(xform(torus(LAMP_CAGE_R, 0.045, 6, 32), [0, h / 2 - 0.05, 0], [Math.PI / 2, 0, 0]), PAL.steelDeep))
  parts.push(paint(xform(rcone(LAMP_CAGE_R + 0.12, 0.22, 0.28, 0.03, 20), [0, h / 2 + 0.16, 0]), PAL.hazard))
  const steelGeo = merge(parts)
  for (const p of parts) p.dispose()
  const toon = toonVC()
  const line = outlineMat(0.012)
  const steel = new Mesh(steelGeo, toon)
  const steelLine = new Mesh(steelGeo, line)
  steelLine.renderOrder = -1
  // The glass: a faint cyan drum, open at both ends (the rings and the hood close it).
  const glassGeo = new CylinderGeometry(LAMP_CAGE_R - 0.02, LAMP_CAGE_R - 0.02, h - 0.16, 24, 1, true)
  const glassMat = new MeshBasicMaterial({ color: PAL.mechCore, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide, toneMapped: false })
  const glass = new Mesh(glassGeo, glassMat)
  glass.renderOrder = 4
  group.add(steel, steelLine, glass)
  return {
    group,
    dispose: () => { steelGeo.dispose(); glassGeo.dispose(); toon.dispose(); line.dispose(); glassMat.dispose() }
  }
}
