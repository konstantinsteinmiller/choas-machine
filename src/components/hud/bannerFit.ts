/**
 * ─── Sizing the big moment banner ────────────────────────────────────────────
 *
 * Round 5 (#150), copied from Mega Droid. A banner can be one word in English
 * and three in another language ("GAME OVER!" is ten characters in English and
 * nineteen in Indonesian), and a
 * phone held upright is a seventh as wide as an ultrawide monitor. The banner
 * must still read on ONE line everywhere, so its font size is computed, not
 * picked: the text is measured once at a reference size in the real font, and
 * since every metric that sets its width (glyph advances, em-based tracking)
 * scales linearly with the font size, one division gives the size that fills
 * the free width. The band that carries the text is capped on height as well,
 * so a landscape phone keeps most of its game view.
 *
 * No DOM here, so the tests can check the arithmetic itself.
 */

export interface SafeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface BannerFitInput {
  /** The text's rendered width, in px, measured at `refSize`. 0 = not known
   *  yet (no layout, font still loading): the width limit is skipped. */
  measuredWidth: number
  /** The font size, in px, `measuredWidth` was measured at. */
  refSize: number
  /** The viewport, in CSS px. 0 = not known: that limit is skipped. */
  viewportWidth: number
  viewportHeight: number
  /** Safe-area insets (notch, home indicator), in CSS px. */
  insets?: Partial<SafeInsets>
  /** The largest size the design wants, in px, however much room there is. */
  designMax: number
}

/** Share of the free width the text may take: the rest is breathing room for
 *  the glow and the band's fading ends. */
export const BANNER_WIDTH_SHARE = 0.88
/** Share of the viewport height the band may take. */
export const BANNER_HEIGHT_SHARE = 0.3
/** The band's height per px of font size: line height plus top and bottom
 *  padding (`BigBanner.vue` sets both in em from these numbers). */
export const BANNER_LINE_EM = 1.3
export const BANNER_PAD_EM = 0.32
export const BANNER_BAND_EM = BANNER_LINE_EM + 2 * BANNER_PAD_EM
/** The size the text is measured at. Large, so rounding in the measurement
 *  is a small share of the result. */
export const BANNER_REF_SIZE = 100

/**
 * The banner's font size in px: the design maximum, unless the text would not
 * fit the free width at that size, or the band would be too tall. Rounded
 * DOWN to half a pixel, so rounding never tips a fitted line over the edge.
 */
export const fitBannerFontSize = (input: BannerFitInput): number => {
  const { measuredWidth, refSize, viewportWidth, viewportHeight, designMax } = input
  const insets = { top: 0, right: 0, bottom: 0, left: 0, ...input.insets }
  let size = designMax
  if (measuredWidth > 0 && refSize > 0 && viewportWidth > 0) {
    const free = Math.max(0, viewportWidth - insets.left - insets.right) * BANNER_WIDTH_SHARE
    size = Math.min(size, (free / measuredWidth) * refSize)
  }
  if (viewportHeight > 0) {
    const free = Math.max(0, viewportHeight - insets.top - insets.bottom) * BANNER_HEIGHT_SHARE
    size = Math.min(size, free / BANNER_BAND_EM)
  }
  return Math.max(0, Math.floor(size * 2) / 2)
}
