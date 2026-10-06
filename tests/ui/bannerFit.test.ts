// ─── The big moment banner fits one line on every screen ────────────────────
//
// Round 5 (#150), from Mega Droid. "GAME OVER!" in English and "PERMAINAN BERAKHIR!" in Indonesian, on a phone
// held upright and on an ultrawide: the banner's size is computed from the
// measured width of the words, capped by the band's height and the design's
// own maximum. These pin that arithmetic.

import { describe, expect, it } from 'vitest'
import {
  BANNER_BAND_EM, BANNER_HEIGHT_SHARE, BANNER_REF_SIZE, BANNER_WIDTH_SHARE, fitBannerFontSize
} from '@/components/hud/bannerFit'

const REF = BANNER_REF_SIZE
/** A roomy design maximum, so a case is decided by the limit it is about. */
const BIG = 10_000

const fit = (measuredWidth: number, vw: number, vh: number, extra: Partial<Parameters<typeof fitBannerFontSize>[0]> = {}) =>
  fitBannerFontSize({ measuredWidth, refSize: REF, viewportWidth: vw, viewportHeight: vh, designMax: BIG, ...extra })

/** The width the words take at `size`, given their width at the reference. */
const widthAt = (measured: number, size: number) => (measured / REF) * size

describe('the width limit', () => {
  it('a long line is sized to fill the free width, and no wider', () => {
    const size = fit(1200, 360, 10_000)
    expect(widthAt(1200, size)).toBeLessThanOrEqual(360 * BANNER_WIDTH_SHARE)
    // …and it is not needlessly small: within half a pixel of the exact fit.
    expect(size).toBeGreaterThan((360 * BANNER_WIDTH_SHARE / 1200) * REF - 0.5)
  })

  it('a longer string gets a smaller size on the same screen', () => {
    const short = fit(600, 360, 10_000)
    const long = fit(1200, 360, 10_000)
    expect(long).toBeLessThan(short)
    expect(long).toBeCloseTo(short / 2, 0)
  })

  it('the same words are larger on a wider screen', () => {
    expect(fit(900, 1280, 10_000)).toBeGreaterThan(fit(900, 360, 10_000))
  })

  it('rounds down to half a pixel, so rounding never tips the line over', () => {
    const size = fit(1000, 333, 10_000)
    expect(size * 2).toBe(Math.floor(size * 2))
    expect(widthAt(1000, size)).toBeLessThanOrEqual(333 * BANNER_WIDTH_SHARE)
  })
})

describe('the height cap', () => {
  it('a landscape phone keeps the band under ~30 % of its height', () => {
    // Short words on a 640 × 360 phone: the width would allow far more.
    const size = fit(300, 640, 360)
    expect(size * BANNER_BAND_EM).toBeLessThanOrEqual(360 * BANNER_HEIGHT_SHARE)
    expect(size).toBeLessThan(fit(300, 640, 10_000))
  })

  it('portrait is decided by the width, not the height', () => {
    const size = fit(1000, 360, 640)
    expect(size).toBe(fit(1000, 360, 10_000))
    expect(size * BANNER_BAND_EM).toBeLessThan(640 * BANNER_HEIGHT_SHARE)
  })
})

describe('safe-area insets', () => {
  it('a notch on the left and right takes its width off the free space', () => {
    const plain = fit(1000, 800, 10_000)
    const notched = fit(1000, 800, 10_000, { insets: { left: 44, right: 44 } })
    expect(notched).toBeLessThan(plain)
    expect(widthAt(1000, notched)).toBeLessThanOrEqual((800 - 88) * BANNER_WIDTH_SHARE)
  })

  it('top and bottom insets tighten the height cap', () => {
    const plain = fit(300, 800, 400)
    const inset = fit(300, 800, 400, { insets: { top: 30, bottom: 20 } })
    expect(inset).toBeLessThan(plain)
    expect(inset * BANNER_BAND_EM).toBeLessThanOrEqual((400 - 50) * BANNER_HEIGHT_SHARE)
  })

  it('insets wider than the screen give 0, never a negative size', () => {
    expect(fit(1000, 100, 10_000, { insets: { left: 80, right: 80 } })).toBe(0)
  })
})

describe('the design maximum', () => {
  it('short words on a huge screen stop at the design maximum', () => {
    expect(fit(300, 2560, 1080, { designMax: 150 })).toBe(150)
  })

  it('is a ceiling only: a tighter limit still wins', () => {
    expect(fit(1500, 360, 640, { designMax: 150 })).toBeLessThan(150)
  })

  it('with nothing measured yet (no layout, font loading) it falls back to the caps', () => {
    expect(fit(0, 360, 10_000, { designMax: 150 })).toBe(150)
    expect(fit(0, 640, 360, { designMax: 150 })).toBe(Math.floor((360 * BANNER_HEIGHT_SHARE / BANNER_BAND_EM) * 2) / 2)
  })

  it('an unknown viewport skips that limit instead of collapsing to 0', () => {
    expect(fit(1000, 0, 0, { designMax: 150 })).toBe(150)
  })
})
