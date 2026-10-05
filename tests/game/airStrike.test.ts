// The assassination from above (the dive kill): head first, the blade
// through the head, over the falling body, a roll onto the feet beyond.

import { describe, expect, it } from 'vitest'
import {
  AIR_DIVE_S, AIR_PASS_S, AIR_TOTAL_S, HIP_Y, airAt, pinBlade, pitchedFeet, planAir
} from '@/game/sim/airStrike'

const FLAT = (): number => 0
const from = { x: 0, y: 5, z: 0 }
const guard = { x: 0, y: 0, z: 4 }
const HEAD = 2.3

describe('the dive kill', () => {
  const plan = planAir(from, guard, HEAD, FLAT)

  it('the blow is struck from behind and above the head; it touches down and rolls on beyond', () => {
    expect(plan.blow.z).toBeLessThan(guard.z)
    // The hips are over the head at the blow, never the feet on it.
    expect(plan.blow.y + HIP_Y).toBeGreaterThan(HEAD)
    expect(plan.touch.z).toBeGreaterThan(guard.z)
    expect(plan.end.z).toBeGreaterThan(plan.touch.z)
    expect(plan.end.y).toBe(guard.y)
  })

  // Up to the blow, while the guard still stands (after it, it falls forward from under the mech).
  it('no foot comes down on the guard: below its head, the mech is clear of it until the blow', () => {
    for (let t = 0; t < AIR_DIVE_S; t += 0.01) {
      const b = airAt(plan, t)
      const feet = pitchedFeet(b.x, b.y, b.z, plan.yaw, b.pitch, b.pivot)
      // Clear of its body (a guard is about 0.35 m round), whatever the body does under it.
      if (feet.y < HEAD) expect(Math.hypot(feet.x - guard.x, feet.z - guard.z), `t=${t.toFixed(2)}`).toBeGreaterThan(0.4)
    }
  })

  it('it leans in head first during the dive, the blade arm cocked then driven down, held on the head at the blow', () => {
    expect(airAt(plan, AIR_DIVE_S * 0.5).pitch).toBeGreaterThan(0.9)
    expect(airAt(plan, AIR_DIVE_S * 0.4).draw).toBeGreaterThan(0.5)
    const blow = airAt(plan, AIR_DIVE_S - 1e-3)
    expect(blow.plunge).toBeGreaterThan(0.95)
    expect(blow.pin).toBeGreaterThan(0.95)
    expect(airAt(plan, AIR_DIVE_S + 1e-3).phase).toBe('pass')
  })

  it('moves without a jump between the beats, and ends a whole roll later on its feet', () => {
    let last = airAt(plan, 0)
    for (let t = 0.01; t <= AIR_TOTAL_S + 0.02; t += 0.01) {
      const b = airAt(plan, t)
      if (b.phase !== 'done') expect(Math.hypot(b.x - last.x, b.y - last.y, b.z - last.z), `t=${t.toFixed(2)}`).toBeLessThan(0.35)
      last = b
    }
    expect(airAt(plan, AIR_TOTAL_S - 1e-3).pitch).toBeCloseTo(Math.PI * 2, 1)
    const done = airAt(plan, AIR_TOTAL_S + 0.1)
    expect(done.phase).toBe('done')
    expect(done.pitch).toBe(0)
    expect(done.y).toBe(guard.y)
  })

  it('stays on the guard\'s floor: past an edge the touch-down and the roll come up short', () => {
    const ledge = (x: number, z: number): number | null => (z < 5.2 ? 0 : null)
    const p = planAir(from, guard, HEAD, ledge)
    expect(p.touch.z).toBeLessThanOrEqual(5.2)
    expect(p.end.z).toBeLessThanOrEqual(5.2)
    expect(p.end.z).toBeGreaterThan(guard.z)
  })

  it('the pin puts the blade\'s tip on the mark', () => {
    const tip = { x: 0.4, y: 1.2, z: 3.1 }
    const off = pinBlade(tip, plan.head, 1)
    expect(tip.x + off.x).toBeCloseTo(plan.head.x)
    expect(tip.y + off.y).toBeCloseTo(plan.head.y)
    expect(tip.z + off.z).toBeCloseTo(plan.head.z)
    const none = pinBlade(tip, plan.head, 0)
    expect(Math.hypot(none.x, none.y, none.z)).toBe(0)
  })

  it('a pitch turns round the pivot: a whole turn puts the feet back where they were', () => {
    const a = pitchedFeet(1, 2, 3, 0.5, Math.PI * 2, 0.55)
    expect(a.x).toBeCloseTo(1)
    expect(a.y).toBeCloseTo(2)
    expect(a.z).toBeCloseTo(3)
    // Half a turn, head down: the feet are up over the pivot.
    expect(pitchedFeet(0, 0, 0, 0, Math.PI, 0.55).y).toBeCloseTo(1.1)
  })
})
