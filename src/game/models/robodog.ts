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

  // Four legs: a thigh, a shin, a paw.
  for (const [tag, x, z] of [['FL', 0.33, 0.7], ['FR', -0.33, 0.7], ['BL', 0.33, -0.7], ['BR', -0.33, -0.7]] as const) {
    b.bone(`thigh${tag}`, 'deck', [x, -0.32, z])
    b.bone(`shin${tag}`, `thigh${tag}`, [0, -THIGH, 0])
    b.part(`thigh${tag}`, cap(0.1, THIGH - 0.12, 8, 3), C.mechSuit, { p: [0, -THIGH / 2, 0] })
    b.part(`thigh${tag}`, sph(0.13, 8, 6), C.mechArmorDeep)
    b.part(`shin${tag}`, rbox(0.17, SHIN, 0.19, 0.45, 6, 6), C.mechArmor, { p: [0, -SHIN / 2, 0] })
    b.part(`shin${tag}`, rbox(0.22, 0.1, 0.3, 0.45, 6, 4), C.mechSuitDeep, { p: [0, -SHIN + 0.02, 0.05] })
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
  /** Gallop cycle, radians; `run` 0 still … 1 flat out. */
  stride: number
  run: number
  /** 0 a dog … 1 a board. */
  fold: number
  /** 0 … 1 how hard the jets push (their glow). */
  thrust: number
}

export const restDogPose = (): DogPose => ({ time: 0, stride: 0, run: 0, fold: 0, thrust: 0 })

/**
 * The dog's legs gallop (front pair and back pair each together, half a cycle
 * apart); folding lays them flat under the deck, front ones back and back
 * ones forward, so nothing hangs below a board.
 */
export const poseRobodog = (rig: Rig, s: DogPose): void => {
  const dog = 1 - s.fold
  const run = s.run * dog
  const front = Math.sin(s.stride)
  const back = Math.sin(s.stride + Math.PI)
  for (const [tag, phase, isFront] of [['FL', front, true], ['FR', front, true], ['BL', back, false], ['BR', back, false]] as const) {
    const swing = phase * 0.85 * run
    const lift = Math.max(0, Math.cos(isFront ? s.stride : s.stride + Math.PI)) * 0.9 * run
    // Folded: the thigh lies along the deck, the shin doubles back under it.
    const foldThigh = isFront ? 1.45 : -1.45
    const foldShin = isFront ? -2.6 : 2.6
    pose(rig, `thigh${tag}`, -swing * (isFront ? 1 : 0.8) + foldThigh * s.fold, 0, 0)
    pose(rig, `shin${tag}`, (isFront ? -lift : lift) + foldShin * s.fold, 0, 0)
  }
  // A gallop rocks the body; a board is steady but for a hover's bob.
  nudge(rig, 'deck', 0, Math.abs(Math.sin(s.stride)) * 0.06 * run + Math.sin(s.time * 3.1) * 0.03 * s.fold, 0)
  pose(rig, 'deck', Math.sin(s.stride * 2) * 0.05 * run, 0, Math.sin(s.time * 2.3) * 0.02 * s.fold)
  // The head: up and alert as a dog, down as the board's nose.
  pose(rig, 'neck', -0.15 * dog + 0.9 * s.fold, 0, 0)
  pose(rig, 'head', Math.sin(s.stride * 2) * 0.08 * run + 0.5 * s.fold, Math.sin(s.time * 1.3) * 0.15 * dog * (1 - run), 0)
  // The tail wags when it is happy to see you, and goes in for the flight.
  pose(rig, 'tail', 0.2 * dog, Math.sin(s.time * 9) * 0.5 * dog * (1 - run), 0)
  scaleBone(rig, 'tail', 1, Math.max(0.05, dog), 1)
  // The jets: back as a dog, straight down as a board.
  const down = s.fold * (Math.PI / 2)
  pose(rig, 'jetL', -down, 0, 0)
  pose(rig, 'jetR', -down, 0, 0)
  rig.glowMaterial.color.setScalar(0.65 + 0.35 * s.thrust + Math.sin(s.time * 40) * 0.05 * s.thrust)
}
