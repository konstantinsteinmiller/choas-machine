// @vitest-environment jsdom
// The Chassis Bay's disguise pictures (#97) are read back from a render
// target. Three draws into a target in LINEAR light, so the raw pixels shown
// as a picture came out far too dark (the shop showed the disguises near-black).

import { describe, expect, it } from 'vitest'
import { targetToImage } from '@/game/art/disguiseThumbs'

describe('a disguise picture from a render target', () => {
  it('comes out in sRGB: a linear mid grey is the picture\'s mid grey', () => {
    // 0.2140 linear is 0.5 in sRGB.
    const px = new Uint8Array([55, 55, 55, 255])
    expect([...targetToImage(px, 1)]).toEqual([128, 128, 128, 255])
  })

  it('keeps white white and the clear background clear', () => {
    expect([...targetToImage(new Uint8Array([255, 255, 255, 255]), 1)]).toEqual([255, 255, 255, 255])
    expect([...targetToImage(new Uint8Array([0, 0, 0, 0]), 1)]).toEqual([0, 0, 0, 0])
  })

  it('takes the coverage out of an edge pixel\'s colour (no dark fringe)', () => {
    // Half covered by white over the clear target: (128, 128, 128, 128) premultiplied.
    expect([...targetToImage(new Uint8Array([128, 128, 128, 128]), 1)]).toEqual([255, 255, 255, 128])
  })

  it('turns the bottom-up target the right way up', () => {
    // Row 0 of the target (the bottom) is white, row 1 (the top) is clear.
    const px = new Uint8Array(16)
    px.fill(255, 0, 8)
    const out = targetToImage(px, 2)
    expect([...out.subarray(0, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect([...out.subarray(8, 16)]).toEqual([255, 255, 255, 255, 255, 255, 255, 255])
  })
})
