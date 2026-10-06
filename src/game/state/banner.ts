import { shallowReactive } from 'vue'

/**
 * ─── The big moment banners ──────────────────────────────────────────────────
 *
 * Full-width headline cards over the game view, in the style of an Elden Ring
 * "ENEMY FELLED" or a GTA "WASTED" (Round 5, #150: copied from Mega Droid):
 * `cleared` (blue) as the robo dog lifts the mech out, `wasted` (red) as the
 * mech goes down. The sim raises one with `showBanner` and paces its own follow-up
 * (results, defeat modal) on `BANNER_HOLD`; the HUD renders whatever is in
 * `banner` and replays its entrance whenever `seq` changes.
 */

export type BannerKind = 'cleared' | 'wasted'

export const banner = shallowReactive({
  kind: '' as BannerKind | '',
  /** Bumped on every `showBanner`, so the same kind twice still replays. */
  seq: 0
})

/** Seconds (sim time) a banner holds before the sim moves on. */
export const BANNER_HOLD: Record<BannerKind, number> = {
  cleared: 2.2,
  wasted: 2.6
}

/** How much sooner than `BANNER_HOLD` the card's own animation ends, so it
 *  has faded out before the follow-up (results, defeat modal) opens. */
export const BANNER_TAIL = 0.15

/** Seconds the card's CSS animation runs, entrance to fade-out included. */
export const bannerSeconds = (kind: BannerKind): number =>
  Math.max(0.6, Math.round((BANNER_HOLD[kind] - BANNER_TAIL) * 1000) / 1000)

export const showBanner = (kind: BannerKind): void => {
  banner.kind = kind
  banner.seq++
}

export const clearBanner = (): void => {
  banner.kind = ''
}

// Dev preview: `__banner('wasted')` from the console or a screenshot script.
// The `import.meta.env.DEV` literal folds to false in every build, so this
// never ships.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __banner?: typeof showBanner }).__banner = showBanner
}
