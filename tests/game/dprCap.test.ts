// The canvas never draws below the display's own pixel ratio (up to 3×), on
// every device class: a 3× phone drawn at 1.6× and stretched up measured
// SOFT (backing-store ratio 0.67). The user's rule for every renderer.

import { describe, expect, it } from 'vitest'
import { MAX_DPR, dprCap } from '@/game/engine/renderer'

describe('the device pixel ratio cap', () => {
  it('is 3, so a 3× phone draws at 3×; anything sharper than that draws at 3×', () => {
    expect(MAX_DPR).toBe(3)
    expect(dprCap()).toBe(MAX_DPR)
    for (const dpr of [1, 1.5, 1.6, 2, 2.625, 3]) expect(Math.min(dpr, dprCap())).toBe(dpr)
    expect(Math.min(4, dprCap())).toBe(3)
  })
})
