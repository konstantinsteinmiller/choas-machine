import { Matrix4, Vector3 } from 'three'
import { RigBuilder, cap, pose, nudge, rbox, rcone, rcyl, scaleBone, sph, type Rig } from './kit'
import { PAL } from './palette'

/**
 * ─── The robo dog ────────────────────────────────────────────────────────────
 *
 * The mech's ride: a jet-powered robot dog that folds into a hover board.
 * Its back IS the board's deck, so the transformation is the dog lying down
 * on its own legs: the legs tuck flat under the deck, the head drops to
 * become the board's nose, the tail goes in, and the two jets at its hips
 * swing down to hold it up.
 *
 * The rig's origin is the middle of the deck's TOP, where the mech stands.
 * Faces +z. Built like every rig here: one skinned mesh, one outline.
 */

/** The deck's top above the ground: standing as a dog, hovering as a board. */
export const DOG_STAND = 1.18
export const BOARD_HOVER = 0.5

const THIGH = 0.5
const DOG_PAL: Record<'mechArmor' | 'mechArmorDeep' | 'mechArmorHi' | 'mechSuit' | 'mechSuitDeep' | 'mechCore' | 'mechEye' | 'mechVisor' | 'gunDark', string> = {
  mechArmor: PAL.mechArmor, mechArmorDeep: PAL.mechArmorDeep, mechArmorHi: PAL.mechArmorHi, mechSuit: PAL.mechSuit,
  mechSuitDeep: PAL.mechSuitDeep, mechCore: PAL.mechCore, mechEye: PAL.mechEye, mechVisor: PAL.mechVisor, gunDark: PAL.gunDark
}
const HOUND_PAL: typeof DOG_PAL = {
  mechArmor: PAL.steel, mechArmorDeep: PAL.steelDark, mechArmorHi: PAL.steel, mechSuit: PAL.steelDeep,
  mechSuitDeep: PAL.steelDark, mechCore: PAL.glowRed, mechEye: PAL.glowRed, mechVisor: PAL.glowRed, gunDark: PAL.gunDark
}
/** The Scrap Hound is the robodog at this size. */
export const HOUND_SCALE = 0.6
const SHIN = 0.52
/** The hips under the deck, and the ankle's height over the paw's sole. */
const HIP_Y = -0.24
const PAW_SOLE = 0.03
/** The shin's box stops this short of the ankle, inside a paw this tall, and its rounded edge reaches this far out from its axis. */
const SHIN_SHORT = 0.08
const PAW_TALL = 0.13
const SHIN_EDGE = 0.09
/** How far the paw's toe reaches ahead of the ankle. */
const PAW_TOE = 0.2
type Leg = 'FL' | 'FR' | 'BL' | 'BR'
/** Each leg: where its hip is on the deck (x, z), and whether it is a foreleg. */
const LEGS: ReadonlyArray<readonly [Leg, number, number, boolean]> = [
  ['FL', 0.33, 0.7, true], ['FR', -0.33, 0.7, true], ['BL', 0.33, -0.7, false], ['BR', -0.33, -0.7, false]
]

export const buildRobodog = (hostile = false): Rig => {
  // The base's Scrap Hound is the same dog in the base's steel, with red eyes.
  const C = hostile ? HOUND_PAL : DOG_PAL
  const b = new RigBuilder()
  b.bone('deck', null, [0, 0, 0])
  // The deck: a long rounded board, a cyan line round its edge.
  b.part('deck', rbox(0.92, 0.26, 2.1, 0.4, 10, 6), C.mechArmor, { p: [0, -0.13, 0] })
  b.part('deck', rbox(0.7, 0.04, 1.7, 0.5, 8, 4), C.mechSuit, { p: [0, 0.005, 0] })
  b.part('deck', rbox(0.95, 0.05, 2.12, 0.45, 10, 4), C.mechCore, { p: [0, -0.2, 0], glow: true, outline: false })
  // Under the deck: the dog's belly, with a power core.
  b.part('deck', rbox(0.6, 0.22, 1.4, 0.45, 8, 6), C.mechSuitDeep, { p: [0, -0.34, 0] })

  // The head, on a short neck at the front: big ears, a visor, a snout.
  b.bone('neck', 'deck', [0, -0.05, 0.95])
  b.bone('head', 'neck', [0, 0.3, 0.12])
  b.part('neck', cap(0.12, 0.22, 8, 3), C.mechSuit, { p: [0, 0.14, 0.04], r: [-0.4, 0, 0] })
  b.part('head', rbox(0.5, 0.42, 0.52, 0.42, 10, 8), C.mechArmor, { p: [0, 0.1, 0.08] })
  b.part('head', rbox(0.3, 0.2, 0.26, 0.45, 8, 6), C.mechArmorHi, { p: [0, 0.0, 0.38] })
  b.part('head', sph(0.06, 6, 5), C.mechSuitDeep, { p: [0, 0.06, 0.52] })
  b.part('head', rbox(0.38, 0.12, 0.06, 0.5, 6, 4), C.mechVisor, { p: [0, 0.18, 0.33] })
  b.mirror((side) => {
    b.part('head', sph(0.045, 6, 5), C.mechCore, { p: [side * 0.09, 0.18, 0.37], glow: true, outline: false })
    b.part('head', rcone(0.09, 0.02, 0.32, 0.02, 6), C.mechArmorDeep, { p: [side * 0.17, 0.42, -0.02], r: [-0.2, 0, side * 0.35] })
  })

  // The tail, with a glowing tip.
  b.bone('tail', 'deck', [0, -0.08, -1.0])
  b.part('tail', rcyl(0.05, 0.5, 0.02, 6, 2), C.mechSuit, { p: [0, 0.2, -0.12], r: [-0.6, 0, 0] })
  b.part('tail', sph(0.07, 6, 5), C.mechEye, { p: [0, 0.42, -0.28], glow: true, outline: false })

  // Four legs: a thigh, a shin, and a paw on an ankle that keeps it flat.
  for (const [tag, x, z] of LEGS) {
    b.bone(`thigh${tag}`, 'deck', [x, HIP_Y, z])
    b.bone(`shin${tag}`, `thigh${tag}`, [0, -THIGH, 0])
    b.bone(`paw${tag}`, `shin${tag}`, [0, -SHIN, 0])
    b.part(`thigh${tag}`, cap(0.1, THIGH - 0.12, 8, 3), C.mechSuit, { p: [0, -THIGH / 2, 0] })
    b.part(`thigh${tag}`, sph(0.13, 8, 6), C.mechArmorDeep)
    // The shin stops inside the paw, so its end stays off the floor however the leg leans.
    b.part(`shin${tag}`, rbox(0.17, SHIN - SHIN_SHORT, 0.19, 0.45, 6, 6), C.mechArmor, { p: [0, -(SHIN - SHIN_SHORT) / 2, 0] })
    b.part(`paw${tag}`, rbox(0.22, PAW_TALL, 0.3, 0.45, 6, 4), C.mechSuitDeep, { p: [0, PAW_TALL / 2 - PAW_SOLE, 0.05] })
  }

  // The jets, one at each hip: they point back as a dog, down as a board.
  b.mirror((side, tag) => {
    b.bone(`jet${tag}`, 'deck', [side * 0.52, -0.16, -0.62])
    b.part(`jet${tag}`, rcyl(0.15, 0.5, 0.04, 10, 2), C.mechSuitDeep, { r: [Math.PI / 2, 0, 0] })
    b.part(`jet${tag}`, rcone(0.15, 0.2, 0.14, 0.02, 10), C.gunDark, { p: [0, 0, -0.3], r: [-Math.PI / 2, 0, 0] })
    b.part(`jet${tag}`, rcyl(0.11, 0.04, 0.01, 10, 1), C.mechEye, { p: [0, 0, -0.37], r: [Math.PI / 2, 0, 0], glow: true, outline: false })
  })

  return b.build({ outline: 0.02, height: DOG_STAND })
}

export interface DogPose {
  time: number
  /**
   * How far it has gone, in stride radians: `STRIDE_PER_UNIT` to a unit of
   * the rig's ground. The gait's own cycle is read off it, a longer one the
   * faster it goes.
   */
  stride: number
  /** 0 still … 1 flat out: it walks, then trots, then gallops. */
  run: number
  /** 0 a dog … 1 a board. */
  fold: number
  /** 0 … 1 how hard the jets push (their glow). */
  thrust: number
}

export const restDogPose = (): DogPose => ({ time: 0, stride: 0, run: 0, fold: 0, thrust: 0 })

/**
 * Stride radians to a unit of the rig's ground: how the garrison drives a
 * hound (3.4 a metre in the sim, ×1.6 in the view, on a dog 0.6 the size).
 * A planted paw goes back under the dog exactly as fast as the dog goes on,
 * so it holds still on the floor.
 */
export const STRIDE_PER_UNIT = 3.4 * 1.6 * HOUND_SCALE

interface Gait {
  /** Where in the cycle each paw comes down (0 … 1). */
  at: Record<Leg, number>
  /** The share of the cycle a paw is down. */
  duty: number
  /** How far the dog goes in one cycle (rig units). */
  cycle: number
  /** How high a paw is carried. */
  lift: number
  /** How much the body bobs, pitches and rolls with the weight on its legs. */
  bob: number
  pitch: number
  roll: number
  /** How much lower it carries itself. */
  crouch: number
  /** How far the hips gather under it and stretch out again (the spine flexing). */
  flex: number
}

/** A walk: four beats, each hind paw followed by the fore paw on its side. */
const WALK: Gait = { at: { BL: 0, FL: 0.25, BR: 0.5, FR: 0.75 }, duty: 0.72, cycle: 1.3, lift: 0.17, bob: 0.05, pitch: 0.03, roll: 0.03, crouch: 0.02, flex: 0 }
/** A trot: the diagonal pairs together, a moment in the air between them. */
const TROT: Gait = { at: { BL: 0, FR: 1, BR: 0.5, FL: 0.5 }, duty: 0.45, cycle: 1.9, lift: 0.2, bob: 0.03, pitch: 0.02, roll: 0.01, crouch: 0.05, flex: 0 }
/** A gallop: the hind pair a beat apart, then the fore pair; in the air twice a stride. */
const GALLOP: Gait = { at: { BL: 0, BR: 0.1, FL: 0.5, FR: 0.6 }, duty: 0.32, cycle: 3.6, lift: 0.26, bob: 0.07, pitch: 0.1, roll: 0, crouch: 0.06, flex: 0.07 }
/** Where in the gallop it is gathered: the hind paws swung up under the chest, in the air. */
const GATHERED = 0.96
const NUMBERS = ['duty', 'cycle', 'lift', 'bob', 'pitch', 'roll', 'crouch', 'flex'] as const

/** The fold: the thigh along the deck, the shin doubled back under it. */
const FOLD_THIGH = 1.45
const FOLD_SHIN = 2.6

const smooth = (k: number): number => {
  const c = Math.min(1, Math.max(0, k))
  return c * c * (3 - 2 * c)
}
const frac = (x: number): number => x - Math.floor(x)
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/** How much of each gait: a walk, a trot from a brisk pace, a gallop flat out. */
const MIX = { walk: 1, trot: 0, gallop: 0 }
const GAIT: Gait = { at: { FL: 0, FR: 0, BL: 0, BR: 0 }, duty: 0, cycle: 0, lift: 0, bob: 0, pitch: 0, roll: 0, crouch: 0, flex: 0 }
const mixGait = (run: number): Gait => {
  const t = smooth((run - 0.35) / 0.25)
  const g = smooth((run - 0.6) / 0.25)
  MIX.walk = 1 - t
  MIX.trot = t * (1 - g)
  MIX.gallop = t * g
  for (const [tag] of LEGS) GAIT.at[tag] = WALK.at[tag] * MIX.walk + TROT.at[tag] * MIX.trot + GALLOP.at[tag] * MIX.gallop
  for (const k of NUMBERS) GAIT[k] = WALK[k] * MIX.walk + TROT[k] * MIX.trot + GALLOP[k] * MIX.gallop
  return GAIT
}

/** A paw's share of the weight: none in the air, most mid-stance. */
const load = (q: number, duty: number): number => (q < duty ? Math.sin((Math.PI * q) / duty) : 0)

/**
 * The body's sway at a point of the cycle, from where its weight is: lowest
 * with the most paws down and highest in the air, nose down on the forelegs
 * and up on the hind ones, leaning over the side that holds it.
 */
const SWAY = { bob: 0, pitch: 0, roll: 0 }
const LAG = { bob: 0, pitch: 0, roll: 0 }
const sway = (phase: number, gait: Gait, out: typeof SWAY): void => {
  let all = 0
  let fore = 0
  let left = 0
  for (const [tag, , , isFront] of LEGS) {
    const l = load(frac(phase - gait.at[tag]), gait.duty)
    all += l
    fore += isFront ? l : -l
    left += tag[1] === 'L' ? l : -l
  }
  out.bob = -gait.bob * (all - (8 * gait.duty) / Math.PI)
  out.pitch = (gait.pitch * fore) / 2
  out.roll = (-gait.roll * left) / 2
}

/**
 * The gait's clock, one per dog: the cycle is longer the faster it goes, so
 * it is counted up from how far the stride moved since the last frame. A
 * jump (a new dog, a scrubbed cinematic) starts it afresh.
 */
const clocks = new WeakMap<Rig, { stride: number; phase: number }>()
const gaitPhase = (rig: Rig, stride: number, cycle: number): number => {
  const per = STRIDE_PER_UNIT * cycle
  const c = clocks.get(rig)
  if (!c || Math.abs(stride - c.stride) > 6) {
    clocks.set(rig, { stride, phase: stride / per })
    return stride / per
  }
  c.phase += (stride - c.stride) / per
  c.stride = stride
  return c.phase
}

/**
 * Thigh and shin angles that put the ankle (dy, dz) from the hip. The
 * forelegs bend their knees back and the hind legs forward, as a dog's elbow
 * and stifle do, and as the fold tucks them.
 */
const IK: [number, number] = [0, 0]
const reach = (dy: number, dz: number, isFront: boolean): [number, number] => {
  const r = Math.min(Math.max(Math.hypot(dy, dz), 0.05), (THIGH + SHIN) * 0.995)
  const toward = Math.atan2(-dz, -dy)
  const hip = Math.acos(Math.min(1, Math.max(-1, (THIGH * THIGH + r * r - SHIN * SHIN) / (2 * THIGH * r))))
  const knee = Math.PI - Math.acos(Math.min(1, Math.max(-1, (THIGH * THIGH + SHIN * SHIN - r * r) / (2 * THIGH * SHIN))))
  IK[0] = isFront ? toward + hip : toward - hip
  IK[1] = isFront ? -knee : knee
  return IK
}

const _inv = new Matrix4()
const _v = new Vector3()

/**
 * The dog walks, trots and gallops like one: each paw plants and holds still
 * on the floor while the body goes over it, then lifts in an arc and reaches
 * forward; the body bobs and rocks with its weight, the head rides steady,
 * the tail swings a beat behind. Folding lays the legs flat under the deck,
 * front ones back and back ones forward, so nothing hangs below a board.
 */
export const poseRobodog = (rig: Rig, s: DogPose): void => {
  const dog = 1 - s.fold
  const run = s.run * dog
  const gait = mixGait(run)
  const phase = gaitPhase(rig, s.stride, gait.cycle)
  // How much of a gait there is: none standing still.
  const go = smooth(run / 0.12)
  sway(phase, gait, SWAY)
  const bob = SWAY.bob * go
  const pitch = SWAY.pitch * go
  // The deck rides the gait; standing it breathes; a board is steady but for a hover's bob.
  const breathe = Math.sin(s.time * 2.2) * 0.006 * dog * (1 - go)
  nudge(rig, 'deck', 0, bob - gait.crouch * go + breathe + Math.sin(s.time * 3.1) * 0.03 * s.fold, 0)
  pose(rig, 'deck', pitch, 0, SWAY.roll * go + Math.sin(s.time * 2.3) * 0.02 * s.fold)
  const deck = rig.bones.deck
  if (deck) {
    deck.updateMatrix()
    _inv.copy(deck.matrix).invert()
  }
  // The floor, from the deck's top: a dog's height below it, nearer as it lies down into a board.
  const floor = -(DOG_STAND + (BOARD_HOVER - DOG_STAND) * s.fold)
  const gather = Math.cos((phase - GATHERED) * Math.PI * 2) * gait.flex * go
  const sweep = gait.duty * gait.cycle * go
  for (const [tag, x, z, isFront] of LEGS) {
    const q = frac(phase - gait.at[tag])
    let along: number
    let up = 0
    let curl = 0
    if (q < gait.duty) {
      // Planted: it goes back under the hip as fast as the dog goes on.
      along = sweep * (0.5 - q / gait.duty)
    } else {
      // In the air: off the floor and back onto it at the floor's own speed, carried in an arc.
      const u = (q - gait.duty) / (1 - gait.duty)
      along = -sweep / 2 + gait.cycle * go * (0.5 - 0.5 * Math.cos(Math.PI * u) - (1 - gait.duty) * u)
      up = gait.lift * go * Math.sin(Math.PI * Math.pow(u, 0.85))
      // (No further than the lift allows: the toe never digs into the floor.)
      curl = Math.min(Math.sin(Math.PI * Math.pow(u, 0.6)) * go * (isFront ? 1.1 : 0.5), Math.asin(Math.min(1, up / 0.22)))
    }
    // The hips gather under it and stretch out again with the gallop.
    const hz = z + (isFront ? -gather : gather)
    nudge(rig, `thigh${tag}`, 0, 0, hz - z)
    _v.set(x, floor + PAW_SOLE + up, z + along).applyMatrix4(_inv)
    const ft = isFront ? FOLD_THIGH : -FOLD_THIGH
    const fs = isFront ? -FOLD_SHIN : FOLD_SHIN
    const dy = lerp(_v.y - HIP_Y, -THIGH * Math.cos(ft) - SHIN * Math.cos(ft + fs), s.fold)
    const dz = lerp(_v.z - hz, -THIGH * Math.sin(ft) - SHIN * Math.sin(ft + fs), s.fold)
    let [thigh, shin] = reach(dy, dz, isFront)
    // A shin leaning far over would put its edge through the floor: the ankle
    // stands that much higher, the paw rolled up onto its toes (as a paw
    // pushing off is).
    const lean = Math.abs(pitch + thigh + shin)
    const clear = Math.max(0, SHIN_EDGE * Math.sin(lean) - SHIN_SHORT * Math.cos(lean) - PAW_SOLE) * dog
    if (clear > 0) [thigh, shin] = reach(dy + clear, dz, isFront)
    const toes = Math.asin(Math.min(1, clear / PAW_TOE))
    pose(rig, `thigh${tag}`, thigh, 0, 0)
    pose(rig, `shin${tag}`, shin, 0, 0)
    // The paw lies flat on the floor (until the legs tuck away); in the air it curls back off it.
    pose(rig, `paw${tag}`, (curl + toes - pitch - thigh - shin) * (1 - smooth((s.fold - 0.6) / 0.4)), 0, 0)
  }
  // The head: up and alert as a dog, down as the board's nose. It rides
  // steady: the neck takes back most of the body's rocking and bobbing, and
  // stretches out ahead at a gallop.
  const steady = Math.max(-0.06, Math.min(0.06, (0.95 * Math.sin(pitch) - bob) * 0.6))
  nudge(rig, 'neck', 0, steady, 0)
  pose(rig, 'neck', -0.15 * dog + 0.9 * s.fold - pitch * 0.75 + 0.25 * MIX.gallop * go, 0, 0)
  pose(rig, 'head', 0.5 * s.fold - 0.15 * MIX.gallop * go, Math.sin(s.time * 1.3) * 0.15 * dog * (1 - run), 0)
  // The tail wags when it is happy to see you, sways with a walk, streams
  // out behind at a gallop, swings a beat behind the body's bob, and goes in
  // for the flight.
  sway(phase - 0.12, gait, LAG)
  const tailUp = 0.2 * dog - (0.15 * MIX.trot + 0.45 * MIX.gallop) * go - LAG.bob * go * 4
  const tailSide = Math.sin(s.time * 9) * 0.5 * dog * (1 - run) + Math.sin(phase * Math.PI * 2) * 0.15 * MIX.walk * go
  pose(rig, 'tail', tailUp, tailSide, 0)
  scaleBone(rig, 'tail', 1, Math.max(0.05, dog), 1)
  // The jets: back as a dog, straight down as a board.
  const down = s.fold * (Math.PI / 2)
  pose(rig, 'jetL', -down, 0, 0)
  pose(rig, 'jetR', -down, 0, 0)
  rig.glowMaterial.color.setScalar(0.65 + 0.35 * s.thrust + Math.sin(s.time * 40) * 0.05 * s.thrust)
}
