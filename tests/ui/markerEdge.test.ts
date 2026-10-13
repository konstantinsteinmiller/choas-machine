// The objective marker off screen (a playtester stood lost in the rocket room,
// the mech off to the side): it sits at the screen's edge with its arrow
// pointing the way to turn; behind the camera, at the side to turn to,
// pointing left or right, not down at the bottom edge.

import { describe, expect, it } from 'vitest'
import { markerSpot, type MarkerSpot } from '@/components/hud/markerEdge'

const out = (): MarkerSpot => ({ x: 0, y: 0, edge: false, angle: 0 })
const W = 1280
const H = 720

describe('the objective marker\'s place on screen', () => {
  it('on screen it sits on the thing, no arrow', () => {
    const s = markerSpot(0.4, 0.45, false, W, H, out())
    expect(s.edge).toBe(false)
    expect(s.x).toBeCloseTo(0.4 * W)
    expect(s.y).toBeCloseTo(0.45 * H)
  })

  it('off to the left it holds the left edge, inside the screen, the arrow pointing left', () => {
    const s = markerSpot(-0.6, 0.5, false, W, H, out())
    expect(s.edge).toBe(true)
    expect(s.x).toBeGreaterThan(0)
    expect(s.x).toBeLessThan(W * 0.2)
    expect(Math.abs(Math.abs(s.angle) - Math.PI)).toBeLessThan(0.01)
  })

  it('behind the camera it goes to the side to turn to, at mid-height, pointing sideways', () => {
    // Projected mirrored: a point behind and to the left lands right of centre.
    const left = markerSpot(0.7, 1.4, true, W, H, out())
    expect(left.edge).toBe(true)
    expect(left.x).toBeLessThan(W / 2)
    expect(left.y).toBeCloseTo(H / 2)
    expect(Math.abs(Math.abs(left.angle) - Math.PI)).toBeLessThan(0.01)
    const right = markerSpot(0.3, -0.2, true, W, H, out())
    expect(right.x).toBeGreaterThan(W / 2)
    expect(right.y).toBeCloseTo(H / 2)
    expect(Math.abs(right.angle)).toBeLessThan(0.01)
  })

  it('on a phone held sideways too: inside the screen, clear of the corners', () => {
    for (const [px, py, behind] of [[-2, 0.1, false], [3, 0.9, false], [0.5, -1, false], [0.5, 0.5, true]] as const) {
      const s = markerSpot(px, py, behind, 844, 390, out())
      expect(s.edge).toBe(true)
      expect(s.x).toBeGreaterThan(0)
      expect(s.x).toBeLessThan(844)
      expect(s.y).toBeGreaterThan(0)
      expect(s.y).toBeLessThan(390)
    }
  })
})
