// The fixed-step clock (`engine/clock.ts`): a fixed 60 Hz step at every
// frame rate, slow motion as a time scale on the accumulator, and a backlog
// cap so a stalled tab does not fast-forward the game.

import { describe, expect, it } from 'vitest'
import { advance, MAX_FRAME, MAX_STEPS, STEP } from '@/game/engine/clock'

/** Run `seconds` of real time at `fps` and count the logic steps taken. */
const run = (seconds: number, fps: number, scale: number): number => {
  let acc = 0
  let steps = 0
  for (let f = 0; f < Math.round(seconds * fps); f++) {
    const t = advance(acc, 1 / fps, scale)
    acc = t.acc
    steps += t.steps
  }
  return steps
}

describe('the fixed-step clock', () => {
  it('takes 60 steps a second at any display rate', () => {
    for (const fps of [30, 60, 120, 144]) {
      expect(Math.abs(run(2, fps, 1) - 120), `${fps} fps`).toBeLessThanOrEqual(1)
    }
  })

  it('does not lose a step to float error at exactly 60 fps', () => {
    let acc = 0
    for (let f = 0; f < 600; f++) {
      const t = advance(acc, STEP, 1)
      expect(t.steps, `frame ${f}`).toBe(1)
      acc = t.acc
    }
  })

  it('slow motion takes proportionally fewer steps, never shorter ones', () => {
    expect(Math.abs(run(2, 60, 0.1) - 12)).toBeLessThanOrEqual(1)
    expect(Math.abs(run(2, 60, 0.5) - 60)).toBeLessThanOrEqual(1)
  })

  it('a frozen clock takes no step and keeps its place', () => {
    const t = advance(STEP * 0.4, 0.016, 0)
    expect(t.steps).toBe(0)
    expect(t.acc).toBeCloseTo(STEP * 0.4)
  })

  it('reports where the render sits between two steps', () => {
    const t = advance(0, STEP * 1.25, 1)
    expect(t.steps).toBe(1)
    expect(t.alpha).toBeCloseTo(0.25)
    expect(t.alpha).toBeGreaterThanOrEqual(0)
    expect(t.alpha).toBeLessThan(1)
  })

  it('caps a long frame and drops the backlog instead of fast-forwarding', () => {
    const t = advance(0, 3, 1)
    expect(t.steps).toBeLessThanOrEqual(MAX_STEPS)
    expect(t.steps).toBe(Math.min(MAX_STEPS, Math.floor(MAX_FRAME / STEP + 1e-9)))
    expect(t.acc).toBeLessThan(STEP)
  })

  it('treats a broken scale or frame time as harmless', () => {
    expect(advance(0, STEP, Number.NaN).steps).toBe(1)
    expect(advance(0, STEP, -4).steps).toBe(0)
    expect(advance(0, -1, 1)).toEqual({ steps: 0, acc: 0, alpha: 0 })
  })
})
