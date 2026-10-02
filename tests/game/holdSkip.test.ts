// Hold Space to skip the intro (`story/holdSkip.ts`): the
// ring fills over 3 s of the cutscene's clock, skips exactly once, and
// empties the moment the key is let go. A key repeat is not a new press.

import { describe, expect, it } from 'vitest'
import { HOLD_TO_SKIP_S, newHold, pressHold, releaseHold, stepHold, holdProgress } from '@/game/story/holdSkip'

const STEP = 1 / 60

/** Step `h` for `seconds` at 60 Hz; how many steps reported the skip. */
const run = (h: ReturnType<typeof newHold>, seconds: number): number => {
  let fired = 0
  for (let i = 0; i < Math.round(seconds * 60); i++) if (stepHold(h, STEP)) fired++
  return fired
}

describe('hold to skip', () => {
  it('is 3 s', () => {
    expect(HOLD_TO_SKIP_S).toBe(3)
  })

  it('does nothing while the key is up', () => {
    const h = newHold()
    expect(run(h, 5)).toBe(0)
    expect(holdProgress(h)).toBe(0)
  })

  it('fills over 3 s and fires once, on the 180th step at 60 Hz', () => {
    const h = newHold()
    pressHold(h)
    expect(run(h, 1.5)).toBe(0)
    expect(holdProgress(h)).toBeCloseTo(0.5, 5)
    let at = -1
    for (let i = 1; i <= 120; i++) if (stepHold(h, STEP) && at < 0) at = i
    expect(90 + at).toBe(180)
    expect(holdProgress(h)).toBe(1)
    // Held on past full: no second skip.
    expect(run(h, 2)).toBe(0)
  })

  it('empties on release and starts over on the next press', () => {
    const h = newHold()
    pressHold(h)
    run(h, 2.9)
    releaseHold(h)
    expect(holdProgress(h)).toBe(0)
    pressHold(h)
    expect(run(h, 2.9)).toBe(0)
    expect(run(h, 0.1)).toBe(1)
  })

  it('a key repeat (a second press while down) does not restart the fill', () => {
    const h = newHold()
    pressHold(h)
    run(h, 2)
    pressHold(h)
    expect(holdProgress(h)).toBeCloseTo(2 / 3, 5)
    expect(run(h, 1)).toBe(1)
  })

  it('after a skip, a new hold can skip again (a replay)', () => {
    const h = newHold()
    pressHold(h)
    expect(run(h, 3)).toBe(1)
    releaseHold(h)
    pressHold(h)
    expect(run(h, 3)).toBe(1)
  })
})
