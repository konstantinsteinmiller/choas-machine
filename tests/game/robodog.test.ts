// Round 2, R7: the robo dog brings the mech in and takes it out.

import { describe, expect, it } from 'vitest'
import {
  BOARD_ARRIVE, DOG_ARRIVE, DOG_FOLDED, RIDER_JUMP, RIDER_LAND, RIDER_ON, introFrame, makeDogFrame, makeRiderFrame, outroFrame
} from '@/game/sim/robodog'
import { DROP_LANDED } from '@/game/sim/cine'
import { BOARD_HOVER } from '@/game/models/robodog'

const P = { x: 20, y: 8, z: 30 }

describe('the drop-in', () => {
  const at = (k: number, facing = 0.7): { dog: ReturnType<typeof makeDogFrame>; rider: ReturnType<typeof makeRiderFrame> } => {
    const dog = makeDogFrame()
    const rider = makeRiderFrame()
    introFrame(dog, rider, k, P.x, P.y, P.z, facing)
    return { dog, rider }
  }

  it('the mech rides in standing on the board, from far behind its perch', () => {
    const { dog, rider } = at(0)
    expect(Math.hypot(dog.x - P.x, dog.z - P.z)).toBeGreaterThan(50)
    expect(dog.fold).toBe(1)
    // On the deck: where the board is.
    expect(P.x + rider.dx).toBeCloseTo(dog.x)
    expect(P.y + rider.dy).toBeCloseTo(dog.y)
    expect(rider.air).toBe(false)
  })

  it('the board brakes over the perch before the mech jumps', () => {
    const { dog } = at(BOARD_ARRIVE)
    expect(Math.hypot(dog.x - P.x, dog.z - P.z)).toBeLessThan(1)
    expect(dog.y - P.y).toBeGreaterThan(1)
    expect(RIDER_JUMP).toBeGreaterThan(BOARD_ARRIVE)
  })

  it('the mech hops up and off, and lands on the establishing shot\'s beat', () => {
    expect(RIDER_LAND).toBe(DROP_LANDED)
    const mid = at((RIDER_JUMP + RIDER_LAND) / 2).rider
    expect(mid.air).toBe(true)
    expect(mid.dy).toBeGreaterThan(1.6)
    const down = at(RIDER_LAND).rider
    expect(down.dx).toBeCloseTo(0)
    expect(down.dy).toBeCloseTo(0)
    expect(down.dz).toBeCloseTo(0)
    expect(down.air).toBe(false)
  })

  it('the board leaves forward and up, and is gone by the end', () => {
    const late = at(0.9).dog
    expect(late.y - P.y).toBeGreaterThan(15)
    expect(at(1).dog.visible).toBe(false)
  })
})

describe('the way out', () => {
  const at = (k: number, yaw = 0): { dog: ReturnType<typeof makeDogFrame>; rider: ReturnType<typeof makeRiderFrame> } => {
    const dog = makeDogFrame()
    const rider = makeRiderFrame()
    outroFrame(dog, rider, k, P.x, P.y, P.z, yaw)
    return { dog, rider }
  }

  it('the dog gallops in from afar as a dog, the mech waiting', () => {
    const { dog, rider } = at(0.05)
    expect(Math.hypot(dog.x - P.x, dog.z - P.z)).toBeGreaterThan(8)
    expect(dog.fold).toBe(0)
    expect(dog.run).toBeGreaterThan(0.9)
    expect(rider.dx === 0 && rider.dy === 0 && rider.dz === 0).toBe(true)
  })

  it('it stops beside the mech, then lies down into a board', () => {
    const arrived = at(DOG_ARRIVE).dog
    expect(Math.hypot(arrived.x - P.x, arrived.z - P.z)).toBeCloseTo(1.7, 1)
    expect(arrived.run).toBe(0)
    const folded = at(DOG_FOLDED).dog
    expect(folded.fold).toBe(1)
    expect(folded.y - P.y).toBeCloseTo(BOARD_HOVER)
  })

  it('the mech hops on as it slides under, and rides it up and away', () => {
    expect(at((DOG_FOLDED + RIDER_ON) / 2).rider.air).toBe(true)
    const on = at(0.8)
    expect(on.rider.air).toBe(false)
    expect(P.x + on.rider.dx).toBeCloseTo(on.dog.x)
    expect(P.y + on.rider.dy).toBeCloseTo(on.dog.y)
    expect(on.dog.y - P.y).toBeGreaterThan(5)
  })
})

describe('the way out flies through nothing solid (#118)', () => {
  it('out of the training ground\'s walled last room: no wall between any two points of the dog\'s run in or the board\'s climb away', async () => {
    const { findDeparture } = await import('@/game/sim/robodog')
    const { buildTrainingGround } = await import('@/game/data/fortresses/training')
    const { hasLineOfSight, heightAt } = await import('@/game/world/grid')
    const f = buildTrainingGround()
    const g = f.grid
    const x = f.extract.x
    const z = f.extract.z
    const y = heightAt(g, x, z)
    for (const facing of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const w = findDeparture(g, x, y, z, facing)
      const dog = makeDogFrame()
      const rider = makeRiderFrame()
      let last: { x: number; y: number; z: number } | null = null
      for (let i = 0; i <= 120; i++) {
        const k = i / 120
        outroFrame(dog, rider, k, x, y, z, w.yaw, w.turn, w.reachIn, w.reachOut)
        if (last && dog.visible && (k < DOG_ARRIVE || k > RIDER_ON)) {
          expect(hasLineOfSight(g, last.x, last.y + 0.5, last.z, dog.x, dog.y + 0.5, dog.z)).toBe(true)
        }
        last = { x: dog.x, y: dog.y, z: dog.z }
      }
    }
  })
})
