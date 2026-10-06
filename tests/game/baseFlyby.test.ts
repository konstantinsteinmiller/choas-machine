// The robo dog's flyby over the Command Base: every 10 to 20 seconds, on an
// arc of its own each time, always in the sky behind the base, banking into
// its turns.

import { describe, expect, it } from 'vitest'
import { Group } from 'three'
import {
  FLYBY_GAP_MAX, FLYBY_GAP_MIN, FLYBY_HIGH, FLYBY_LOW, FLYBY_NEAR, Flyby, arcAt, flightAt, nextGap, planFlight, type FlightPose
} from '@/game/scenes/baseFlyby'
import { mulberry32 } from '@/game/world/rng'

const pose = (): FlightPose => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 })

describe('the flyby (round 5)', () => {
  it('comes every 10 to 20 seconds', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 500; i++) {
      const g = nextGap(rand)
      expect(g).toBeGreaterThanOrEqual(FLYBY_GAP_MIN)
      expect(g).toBeLessThanOrEqual(FLYBY_GAP_MAX)
    }
    expect(FLYBY_GAP_MIN).toBe(10)
    expect(FLYBY_GAP_MAX).toBe(20)
  })

  it('every arc stays behind the base, in the sky, and starts and ends off the picture', () => {
    const rand = mulberry32(11)
    const p = pose()
    for (let i = 0; i < 300; i++) {
      const f = planFlight(rand)
      // A flight is over before the next can start.
      expect(f.dur).toBeLessThan(FLYBY_GAP_MIN)
      for (let k = 0; k <= 1.0001; k += 0.02) {
        flightAt(f, k, p)
        expect(p.z).toBeLessThanOrEqual(FLYBY_NEAR)
        expect(p.y).toBeGreaterThanOrEqual(FLYBY_LOW)
        expect(p.y).toBeLessThanOrEqual(FLYBY_HIGH)
      }
      // Its ends are far out to the sides: more than 50° off the camera's line (at +z 8).
      for (const k of [0, 1]) {
        flightAt(f, k, p)
        expect(Math.abs(Math.atan2(p.x, 8 - p.z))).toBeGreaterThan(0.87)
      }
    }
  })

  it('no two arcs are the same: side, height and bow all vary', () => {
    const rand = mulberry32(3)
    const flights = Array.from({ length: 40 }, () => planFlight(rand))
    expect(new Set(flights.map(f => Math.sign(f.p0[0]))).size).toBe(2)
    const spread = (v: number[]): number => Math.max(...v) - Math.min(...v)
    expect(spread(flights.map(f => f.p1[1]))).toBeGreaterThan(5)
    expect(spread(flights.map(f => f.p1[0]))).toBeGreaterThan(25)
    expect(spread(flights.map(f => f.p1[2]))).toBeGreaterThan(15)
  })

  it('banks into its turn, level on a straight line, and is slow through the middle', () => {
    const p = pose()
    // Bowed away from the base, then toward it: it banks one way, then the other.
    const left = { p0: [70, 8, -40] as [number, number, number], p1: [0, 8, -70] as [number, number, number], p2: [-70, 8, -40] as [number, number, number], dur: 6 }
    const right = { ...left, p1: [0, 8, -30] as [number, number, number] }
    const straight = { ...left, p1: [0, 8, -40] as [number, number, number] }
    const a = flightAt(left, 0.5, pose()).bank
    const b = flightAt(right, 0.5, pose()).bank
    expect(Math.sign(a)).toBe(-Math.sign(b))
    expect(Math.abs(a)).toBeGreaterThan(0.1)
    expect(Math.abs(flightAt(straight, 0.5, p).bank)).toBeLessThan(1e-3)
    // Half speed through the middle, quicker at the ends.
    expect(arcAt(0.52) - arcAt(0.48)).toBeLessThan(0.04 * 0.6)
    expect(arcAt(0.04) - arcAt(0)).toBeGreaterThan(0.04 * 1.3)
  })

  it('flies on its schedule: built the first time, hidden between flights, launched again a gap later', () => {
    const parent = new Group()
    const f = new Flyby(parent, mulberry32(5), 0)
    f.update(5)
    expect(parent.children.length).toBe(0)
    let t = 0
    while (!f.flying && t < 25) { t += 0.1; f.update(t) }
    expect(t).toBeGreaterThanOrEqual(FLYBY_GAP_MIN - 0.1)
    expect(t).toBeLessThanOrEqual(FLYBY_GAP_MAX + 0.1)
    const dog = parent.children[0]!
    expect(dog.visible).toBe(true)
    const start = t
    while (f.flying) { t += 0.1; f.update(t) }
    expect(dog.visible).toBe(false)
    while (!f.flying) { t += 0.1; f.update(t) }
    expect(t - start).toBeGreaterThanOrEqual(FLYBY_GAP_MIN - 0.2)
    expect(t - start).toBeLessThanOrEqual(FLYBY_GAP_MAX + 0.2)
    f.dispose()
    expect(parent.children.length).toBe(0)
  })
})
