/**
 * ─── How fast a gait turns over (#148) ───────────────────────────────────────
 *
 * A pose's stride is a phase that advances with the ground covered. At a fixed
 * rate per metre the feet skate: a walk's step is short, a run's is long. So
 * the rate follows the pace: a person's full cycle (two steps) is 0.95 m at a
 * walk and stretches to 1.4 m at a run, the lengths at which the guard's own
 * leg sweep (`stanceSweep`) keeps the foot on the ground put under the body
 * (measured in `footPlant.test.ts`; the old fixed rate meant 1.85 m and a foot
 * sliding half the way). Pure.
 */

/**
 * A leg's sweep, +1 forward … −1 back: a sine in the air, and a straight,
 * even sweep back while the foot is on the floor (its phase between π/2 and
 * 3π/2), so a planted foot does not slide.
 */
export const stanceSweep = (ph: number): number => {
  const c = Math.cos(ph)
  if (c >= 0) return Math.sin(ph)
  const a = ((ph - Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  return 1 - (2 * a) / Math.PI
}

/**
 * CM-07's (#148): a 1.65 m cycle walking and 2.15 m sprinting, the lengths its
 * own leg sweep holds the foot at (`footPlant.test.ts`); crouched, its legs
 * step more up than back, so a sneak is short quick steps, a 0.8 m cycle.
 */
export const mechGaitRate = (sprint: number, crouch: number): number => {
  const walk = (2 * Math.PI) / (1.65 + 0.5 * Math.min(1, Math.max(0, sprint)))
  const sneak = (2 * Math.PI) / 0.8
  const c = Math.min(1, Math.max(0, crouch))
  return walk + (sneak - walk) * c
}

/** Radians of stride per metre for a person moving at `speed01` (0 … 1 of a run). */
export const guardGaitRate = (speed01: number): number => {
  const k = Math.min(1, Math.max(0, (speed01 - 0.55) / 0.4))
  const run = k * k * (3 - 2 * k)
  return (2 * Math.PI) / (0.95 + 0.45 * run)
}
