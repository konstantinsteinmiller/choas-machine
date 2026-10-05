// The robo dog (and the Scrap Hound) walks, trots and gallops like a real
// quadruped: the paws come down in a dog's order, a planted paw holds still on
// the floor while the body goes over it, nothing goes under the floor, the
// body bobs and rocks with the stride while the head rides steadier, and the
// board it folds into is the board it always was.

import { describe, expect, it } from 'vitest'
import { Euler, Quaternion, Vector3 } from 'three'
import { BOARD_HOVER, DOG_STAND, STRIDE_PER_UNIT, buildRobodog, poseRobodog, restDogPose } from '@/game/models/robodog'
import { SPECS } from '@/game/sim/garrison'

const TAGS = ['FL', 'FR', 'BL', 'BR'] as const
type Tag = typeof TAGS[number]

interface Frame {
  /** Lowest skinned vertex of the whole dog, and of each paw. */
  lowest: number
  paw: Record<Tag, { y: number; z: number }>
  deckY: number
  deckPitch: number
  /** Where the neck sits on the deck, were it bolted on (what the head would ride without the neck's help). */
  mountY: number
  headY: number
  headPitch: number
}

const v = new Vector3()
const q = new Quaternion()
const e = new Euler()
const pitchOf = (o: { getWorldQuaternion: (q: Quaternion) => Quaternion }): number => {
  // The pitch of the bone's forward axis (+z), nose down positive.
  o.getWorldQuaternion(q)
  v.set(0, 0, 1).applyQuaternion(q)
  return Math.atan2(-v.y, Math.hypot(v.x, v.z))
}

/**
 * The dog going along the floor at a hound's `speed` (m/s), sampled at 120 fps
 * for `secs`: its root moves on exactly as far as the stride says.
 */
const go = (speed: number, secs: number, hostile = true): Frame[] => {
  const rig = buildRobodog(hostile)
  const geo = rig.mesh.geometry
  const n = geo.attributes.position!.count
  const skin = geo.attributes.skinIndex!
  const bones = rig.mesh.skeleton.bones
  const pawOf = new Map<number, Tag>(TAGS.map(t => [bones.indexOf(rig.bones[`paw${t}`]!), t] as [number, Tag]))
  const s = restDogPose()
  const frames: Frame[] = []
  // A hound is 0.6 the size: a metre is 1/0.6 of the rig's units.
  const perFrame = speed / 0.6 / 120
  for (let i = 0; i < secs * 120; i++) {
    const d = i * perFrame
    s.time = i / 120
    s.stride = d * STRIDE_PER_UNIT
    s.run = Math.min(1, speed / SPECS.hound.run)
    poseRobodog(rig, s)
    rig.root.position.set(0, DOG_STAND, d)
    rig.root.updateMatrixWorld(true)
    const paw = Object.fromEntries(TAGS.map(t => [t, { y: Infinity, z: 0 }])) as Frame['paw']
    let lowest = Infinity
    for (let k = 0; k < n; k++) {
      rig.mesh.getVertexPosition(k, v)
      v.applyMatrix4(rig.mesh.matrixWorld)
      lowest = Math.min(lowest, v.y)
      const t = pawOf.get(skin.getX(k))
      if (t && v.y < paw[t].y) paw[t].y = v.y
    }
    for (const t of TAGS) paw[t].z = rig.bones[`paw${t}`]!.getWorldPosition(v).z
    const deck = rig.bones.deck!
    frames.push({
      lowest,
      paw,
      deckY: deck.getWorldPosition(v).y,
      deckPitch: pitchOf(deck),
      mountY: deck.localToWorld(v.set(0, -0.05, 0.95)).y,
      headY: rig.bones.head!.getWorldPosition(v).y,
      headPitch: pitchOf(rig.bones.head!)
    })
  }
  return frames
}

const DOWN = 0.012
const planted = (f: Frame, t: Tag): boolean => f.paw[t].y < DOWN
/** Every touchdown, in order: which paw, and when (s). */
const touchdowns = (frames: Frame[]): Array<[Tag, number]> => {
  const out: Array<[Tag, number]> = []
  for (let i = 1; i < frames.length; i++) {
    for (const t of TAGS) if (planted(frames[i]!, t) && !planted(frames[i - 1]!, t)) out.push([t, i / 120])
  }
  return out
}
const range = (xs: number[]): number => Math.max(...xs) - Math.min(...xs)

const WALK = SPECS.hound.walk
const LOOK = SPECS.hound.look
const RUN = SPECS.hound.run

describe('the hound\'s gaits', () => {
  const walk = go(WALK, 3)
  const trot = go(LOOK, 2)
  const gallop = go(RUN, 2)

  it('walks a four-beat lateral sequence: each hind paw, then the fore paw on its side', () => {
    const seq = touchdowns(walk).slice(2).map(([t]) => t).join(' ')
    const order = 'BL FL BR FR BL FL BR FR BL FL BR FR'
    expect(order).toContain(seq.split(' ').slice(0, 8).join(' '))
    // Evenly: the beats a quarter of a cycle apart.
    const at = touchdowns(walk).slice(2, 10).map(([, s]) => s)
    const gaps = at.slice(1).map((s, i) => s - at[i]!)
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.25)
  })

  it('walking, at least two paws are always down; there is no moment in the air', () => {
    for (const f of walk) expect(TAGS.filter(t => planted(f, t)).length).toBeGreaterThanOrEqual(2)
  })

  it('trots on its diagonals: each hind paw comes down with the opposite fore paw', () => {
    const td = touchdowns(trot).slice(2)
    for (const [t, s] of td.filter(([t]) => t[0] === 'B')) {
      const partner: Tag = t === 'BL' ? 'FR' : 'FL'
      expect(td.some(([o, so]) => o === partner && Math.abs(so - s) < 0.03), `${t} at ${s}`).toBe(true)
    }
  })

  it('gallops: the hind pair, then the fore pair, a beat apart, with the body in the air between', () => {
    const seq = touchdowns(gallop).slice(1).map(([t]) => t)
    const start = seq.indexOf('BL')
    expect(seq.slice(start, start + 8).join(' ')).toBe('BL BR FL FR BL BR FL FR')
    const airborne = gallop.filter(f => TAGS.every(t => !planted(f, t)))
    expect(airborne.length / gallop.length).toBeGreaterThan(0.08)
    // In the air it is high: higher than it is on average.
    const mean = gallop.reduce((a, f) => a + f.deckY, 0) / gallop.length
    expect(airborne.reduce((a, f) => a + f.deckY, 0) / airborne.length).toBeGreaterThan(mean)
  })

  it('a gallop\'s cycle is longer than a walk\'s: it covers ground with longer strides, not just faster ones', () => {
    const cycle = (frames: Frame[]): number => {
      const bl = touchdowns(frames).filter(([t]) => t === 'BL').map(([, s]) => s)
      return (bl[bl.length - 1]! - bl[1]!) / (bl.length - 2)
    }
    const walkStride = cycle(walk) * WALK
    const gallopStride = cycle(gallop) * RUN
    expect(gallopStride).toBeGreaterThan(walkStride * 2)
    // And the gallop is no frantic patter: under four strides a second.
    expect(1 / cycle(gallop)).toBeLessThan(4)
  })

  for (const [name, frames] of [['walking', walk], ['trotting', trot], ['galloping', gallop]] as const) {
    it(`${name}, a planted paw holds still on the floor while the dog goes over it`, () => {
      for (const t of TAGS) {
        let from: number | null = null
        for (const f of frames) {
          if (!planted(f, t)) { from = null; continue }
          if (from === null) from = f.paw[t].z
          expect(Math.abs(f.paw[t].z - from), `${t} slides`).toBeLessThan(0.04)
        }
      }
    })

    it(`${name}, nothing of it goes under the floor, and a paw in the air is lifted clear`, () => {
      for (const f of frames) expect(f.lowest).toBeGreaterThan(-0.015)
      const lifts = TAGS.map(t => Math.max(...frames.map(f => f.paw[t].y)))
      for (const l of lifts) expect(l).toBeGreaterThan(0.05)
    })

    it(`${name}, the body bobs with the stride and the head rides steadier than it`, () => {
      expect(range(frames.map(f => f.deckY))).toBeGreaterThan(0.008)
      if (name === 'walking') {
        // A walk hardly rocks the neck's mount at all: the head stays as still, within millimetres and a degree.
        expect(range(frames.map(f => f.headY))).toBeLessThan(0.01)
        expect(range(frames.map(f => f.headPitch))).toBeLessThan(0.02)
      } else {
        expect(range(frames.map(f => f.headY))).toBeLessThan(range(frames.map(f => f.mountY)))
        expect(range(frames.map(f => f.headPitch))).toBeLessThan(range(frames.map(f => f.deckPitch)))
      }
    })
  }

  it('the gallop rocks the body far more than the walk: nose up on the hind legs, down on the fore', () => {
    expect(range(gallop.map(f => f.deckPitch))).toBeGreaterThan(0.12)
    expect(range(gallop.map(f => f.deckPitch))).toBeGreaterThan(range(walk.map(f => f.deckPitch)) * 2)
  })

  for (const [name, speed] of [['walking', WALK], ['galloping', RUN]] as const) {
    it(`${name}, the knees work: never locked straight, and folded well up to carry the paw`, () => {
      const rig = buildRobodog(true)
      const s = restDogPose()
      const most = Object.fromEntries(TAGS.map(t => [t, 0])) as Record<Tag, number>
      for (let i = 0; i < 240; i++) {
        s.stride = (i / 120) * (speed / 0.6) * STRIDE_PER_UNIT
        s.run = speed / RUN
        poseRobodog(rig, s)
        for (const t of TAGS) {
          const knee = 2 * Math.acos(Math.min(1, Math.abs(rig.bones[`shin${t}`]!.quaternion.w)))
          expect(knee, `${t} knee`).toBeGreaterThan(0.12)
          most[t] = Math.max(most[t], knee)
        }
      }
      for (const t of TAGS) expect(most[t], `${t} knee`).toBeGreaterThan(1)
    })
  }

  it('standing still, all four paws are on the floor and nothing moves but its breath', () => {
    const still = go(0, 1)
    for (const f of still) for (const t of TAGS) expect(planted(f, t)).toBe(true)
    expect(range(still.map(f => f.deckY))).toBeLessThan(0.02)
  })
})

describe('the robo dog still folds into the same board', () => {
  it('lying down, it keeps its paws on the floor until they tuck away, and never reaches lower than the board', () => {
    const rig = buildRobodog()
    const geo = rig.mesh.geometry
    const n = geo.attributes.position!.count
    const lowest = (fold: number): number => {
      poseRobodog(rig, { ...restDogPose(), time: fold, fold })
      rig.root.position.set(0, DOG_STAND + (BOARD_HOVER - DOG_STAND) * fold, 0)
      rig.root.updateMatrixWorld(true)
      let min = Infinity
      for (let i = 0; i < n; i++) {
        rig.mesh.getVertexPosition(i, v)
        v.applyMatrix4(rig.mesh.matrixWorld)
        min = Math.min(min, v.y)
      }
      return min
    }
    // The board's folded legs hang where they always did (it flies; it does not sit).
    const board = lowest(1)
    for (let k = 0; k <= 20; k++) {
      const fold = k / 20
      const y = lowest(fold)
      if (fold <= 0.7) expect(y, `fold ${fold}`).toBeGreaterThan(-0.015)
      expect(y, `fold ${fold}`).toBeGreaterThan(board - 0.015)
    }
  })

  it('as a board, every bone is where the board always had it', () => {
    const rig = buildRobodog()
    const t = 1.7
    // Gallop first: the board forgets the gait.
    for (let i = 0; i < 30; i++) poseRobodog(rig, { time: i / 30, stride: i * 0.5, run: 1, fold: 0, thrust: 0 })
    poseRobodog(rig, { time: t, stride: 40, run: 1, fold: 1, thrust: 1 })
    const at = (name: string, rx: number, ry = 0, rz = 0): void => {
      const want = rig.rest[name]!.q.clone().multiply(q.setFromEuler(e.set(rx, ry, rz)))
      expect(rig.bones[name]!.quaternion.angleTo(want), name).toBeLessThan(1e-6)
    }
    for (const tag of TAGS) {
      const front = tag[0] === 'F'
      at(`thigh${tag}`, front ? 1.45 : -1.45)
      at(`shin${tag}`, front ? -2.6 : 2.6)
      at(`paw${tag}`, 0)
      expect(rig.bones[`thigh${tag}`]!.position.distanceTo(rig.rest[`thigh${tag}`]!.p)).toBeLessThan(1e-9)
    }
    at('deck', 0, 0, Math.sin(t * 2.3) * 0.02)
    expect(rig.bones.deck!.position.y).toBeCloseTo(Math.sin(t * 3.1) * 0.03, 9)
    at('neck', 0.9)
    at('head', 0.5)
    at('tail', 0)
    at('jetL', -Math.PI / 2)
    at('jetR', -Math.PI / 2)
    expect(rig.bones.tail!.scale.y).toBeCloseTo(0.05)
  })
})
