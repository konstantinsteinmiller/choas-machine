/**
 * ─── The fixed-step clock ────────────────────────────────────────────────────
 *
 * Logic runs on a fixed 60 Hz step; rendering interpolates between the last
 * two logic states. Slow motion does not change the step: it feeds the
 * accumulator less time, so the simulation takes FEWER identical steps per
 * real second and the interpolation spreads each one over more frames. The
 * simulation stays deterministic at any time scale, and a kill-cam at a tenth
 * of the speed is still smooth, because the render never shows a raw step.
 */

export const STEP = 1 / 60
/** Steps one frame may run before the backlog is dropped (a stalled tab). */
export const MAX_STEPS = 5
/** Longest real frame the clock accepts (s): a hitch does not fast-forward. */
export const MAX_FRAME = 0.1

export interface Tick {
  /** Logic steps to run this frame. */
  steps: number
  /** Time left in the accumulator afterwards. */
  acc: number
  /** Interpolation factor for the render, 0 ≤ alpha < 1. */
  alpha: number
}

/**
 * Advance the accumulator by one real frame.
 * @param acc    time carried over from the last frame
 * @param dt     real frame time in seconds
 * @param scale  time scale: 1 is real time, 0.1 a tenth, 0 frozen
 */
export const advance = (acc: number, dt: number, scale: number): Tick => {
  const s = Number.isFinite(scale) ? Math.max(0, scale) : 1
  let a = acc + Math.min(MAX_FRAME, Math.max(0, dt)) * s
  let steps = 0
  // The epsilon keeps a frame of exactly one step from being lost to float
  // error (0.1 + 0.2 style), which would show as a stutter every few frames.
  while (a >= STEP - 1e-9 && steps < MAX_STEPS) {
    a -= STEP
    steps++
  }
  if (steps === MAX_STEPS) a = 0
  a = Math.max(0, a)
  return { steps, acc: a, alpha: a / STEP }
}
