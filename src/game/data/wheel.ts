/**
 * ─── The rifle's fortune wheel (#75) ─────────────────────────────────────────
 *
 * Once the rifle's damage track is at its top, the Armory opens a wheel for it:
 * every win adds damage with no ceiling, each a little less than the one
 * before, and each spin is a little less likely to win and a little dearer.
 * A pity counter guarantees a win after PITY misses in a row, and a miss
 * refunds part of the stake, so a spin never feels like money thrown away.
 * The odds are shown on the wheel, never hidden. Pure arithmetic: the balance
 * test reads it.
 */

/** Misses in a row after which the next spin cannot lose. */
export const PITY = 4
/** Share of a lost stake handed back. */
export const MISS_REFUND = 0.4

/** Tech Scrap for a spin, `wins` wins in. */
export const spinCost = (wins: number): number => Math.round((80 * Math.pow(1.3, wins)) / 5) * 5

/** Chance the next spin wins, `wins` wins in and `misses` misses in a row (pity included). */
export const winChance = (wins: number, misses: number): number =>
  misses >= PITY ? 1 : Math.min(1, Math.max(0.08, 0.9 * Math.pow(0.82, wins)) + misses * 0.05)

/** Rifle damage the next win adds (a share: 0.06 is +6 %). */
export const winGain = (wins: number): number => 0.06 * Math.pow(0.85, wins)

/** Rifle damage all `wins` wins add together. */
export const wheelBonus = (wins: number): number => {
  let b = 0
  for (let i = 0; i < wins; i++) b += winGain(i)
  return b
}

export interface WheelSave {
  wins: number
  /** Misses since the last win. */
  misses: number
}

export const freshWheel = (): WheelSave => ({ wins: 0, misses: 0 })
