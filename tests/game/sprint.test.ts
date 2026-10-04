// Round 2, R1: the crouch stands on the floor, the mech can sprint, and
// running feet are heard.

import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { buildMech, poseMech, restPose } from '@/game/models/mech'
import { makePlayer, stepPlayer, RUN_SPEED, SPRINT_SPEED, CROUCH_SPEED, AIM_SPEED, type Player, type Wish } from '@/game/sim/player'
import { makeGrid, type Grid } from '@/game/world/grid'
import { FortressBuilder } from '@/game/world/fortress'
import { makeGarrison, hearAt, stepGarrison, drainEvents } from '@/game/sim/garrison'
import { DEFAULT_BINDINGS, actionForCode, codesFor } from '@/game/engine/keyBindings'

const DT = 1 / 60
const flat = (): Grid => {
  const g = makeGrid(40, 40)
  g.h.fill(0)
  return g
}
const wish = (extra: Partial<Wish> = {}): Wish => ({ mx: 0, mz: 1, crouch: false, aiming: false, aimYaw: 0, ...extra })
const run = (p: Player, g: Grid, w: Wish, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepPlayer(p, g, i === 0 ? w : { ...w, crouch: false }, DT)
}
const speed = (p: Player): number => Math.hypot(p.vx, p.vz)

describe('the mech stands on the floor', () => {
  /** The lower ankle's height: 0.08 when a sole is flat on the ground. */
  const lowerAnkle = (pose: Parameters<typeof poseMech>[1]): number => {
    const rig = buildMech()
    poseMech(rig, pose)
    rig.root.updateMatrixWorld(true)
    const v = new Vector3()
    return Math.min(...['L', 'R'].map(tag => rig.bones[`foot${tag}`]!.getWorldPosition(v).y))
  }

  it('crouched and still, a foot is on the ground: not under it, not above it', () => {
    const y = lowerAnkle({ ...restPose(), crouch: 1 })
    expect(y).toBeGreaterThan(0.06)
    expect(y).toBeLessThan(0.1)
  })

  // #107: the hips now put the leg's lowest SOLID point on the floor (a rolled
  // toe, the shin's box), so the ankle itself may stand higher than 8 cm in a
  // stride; `mechFeet.test.ts` checks the skinned legs against the floor.
  it('half-way into the crouch too, and all the way through a crouched stride', () => {
    for (const crouch of [0.25, 0.5, 0.75, 1]) {
      for (let stride = 0; stride < Math.PI * 2; stride += 0.4) {
        for (const sp of [0, 0.5, 1]) {
          const y = lowerAnkle({ ...restPose(), crouch, stride, speed: sp })
          expect(y, `crouch ${crouch} stride ${stride.toFixed(1)} speed ${sp}`).toBeGreaterThan(0.045)
          expect(y, `crouch ${crouch} stride ${stride.toFixed(1)} speed ${sp}`).toBeLessThan(0.3)
        }
      }
    }
  })

  it('walking and sprinting upright keep the standing foot down as well', () => {
    for (const sprint of [0, 1]) {
      for (let stride = 0; stride < Math.PI * 2; stride += 0.3) {
        const y = lowerAnkle({ ...restPose(), stride, speed: 1, sprint })
        expect(y).toBeGreaterThan(0.045)
        expect(y).toBeLessThan(0.3)
      }
    }
  })

  it('in the air and on a ladder the legs hang free: nothing is pulled to the floor', () => {
    const still = lowerAnkle(restPose())
    expect(lowerAnkle({ ...restPose(), air: 1 })).toBeGreaterThan(still)
    expect(lowerAnkle({ ...restPose(), climb: 1, climbPhase: 1 })).toBeGreaterThan(still)
  })
})

describe('sprint', () => {
  it('is faster than a run, by a margin a player feels', () => {
    expect(SPRINT_SPEED / RUN_SPEED).toBeGreaterThan(1.35)
    expect(SPRINT_SPEED / RUN_SPEED).toBeLessThan(1.6)
    const g = flat()
    const p = makePlayer(20, 0, 20)
    run(p, g, wish({ sprint: true }), 1.2)
    expect(speed(p)).toBeCloseTo(SPRINT_SPEED, 1)
    expect(p.sprinting).toBe(true)
    expect(p.sprint).toBeGreaterThan(0.9)
    run(p, g, wish(), 1)
    expect(speed(p)).toBeCloseTo(RUN_SPEED, 1)
    expect(p.sprinting).toBe(false)
  })

  it('stands a crouched mech up: one intent, one key', () => {
    const g = flat()
    const p = makePlayer(20, 0, 20)
    run(p, g, wish({ crouch: true }), 0.5)
    expect(p.crouched).toBe(true)
    expect(speed(p)).toBeCloseTo(CROUCH_SPEED, 1)
    run(p, g, wish({ sprint: true }), 1.2)
    expect(p.crouched).toBe(false)
    expect(speed(p)).toBeCloseTo(SPRINT_SPEED, 1)
  })

  it('does nothing while aiming, and nothing standing still', () => {
    const g = flat()
    const p = makePlayer(20, 0, 20)
    run(p, g, wish({ sprint: true, aiming: true }), 1)
    expect(speed(p)).toBeCloseTo(AIM_SPEED, 1)
    expect(p.sprinting).toBe(false)
    const q = makePlayer(20, 0, 20)
    run(q, g, wish({ mx: 0, mz: 0, sprint: true }), 0.5)
    expect(q.sprinting).toBe(false)
    expect(q.sprint).toBe(0)
  })

  it('is on Shift, held; crouch keeps C alone; pause can be rebound', () => {
    expect(DEFAULT_BINDINGS.sprint).toEqual(['ShiftLeft', 'ShiftRight'])
    expect(actionForCode('ShiftLeft')).toBe('sprint')
    expect(actionForCode('ShiftRight')).toBe('sprint')
    expect(codesFor('crouch')).toEqual(['KeyC'])
    expect(actionForCode('KeyP')).toBe('pause')
  })
})

describe('running feet are heard', () => {
  const base = () => {
    const b = new FortressBuilder('t', 30, 30)
    b.ground(0, 0, 29, 29)
    b.insert(2, 2, 0)
    b.extract(27, 27)
    b.sentry(10, 10, 0)
    b.sentry(25, 25, 0)
    const f = b.build()
    return { f, gar: makeGarrison(f) }
  }

  it('a guard in earshot goes to look, and the alarm does not move', () => {
    const { gar } = base()
    const near = gar.units[0]!
    const far = gar.units[1]!
    const heard = hearAt(gar, near.x + 3, near.z, 9)
    expect(heard).toBe(1)
    expect(near.state).toBe('suspicious')
    expect(far.state).toBe('patrol')
    expect(gar.alert.level).toBe(0)
    expect(drainEvents(gar).some(e => e.type === 'suspicious' && e.id === near.id)).toBe(true)
  })

  it('nobody in earshot: nothing happens; a second noise does not restart the first look', () => {
    const { f, gar } = base()
    expect(hearAt(gar, 2, 2, 3)).toBe(0)
    const near = gar.units[0]!
    hearAt(gar, near.x + 3, near.z, 9)
    drainEvents(gar)
    const target = { x: 2, y: 0, z: 2, feetY: 0, height: 2.5, crouched: false, visible: false }
    for (let i = 0; i < 30; i++) stepGarrison(gar, f.grid, target, DT)
    // Already looking: a second footfall is not a second "huh?".
    expect(hearAt(gar, near.x + 3, near.z, 9)).toBe(0)
    expect(drainEvents(gar).filter(e => e.type === 'suspicious')).toHaveLength(0)
  })
})
