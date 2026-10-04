/**
 * ─── The furnace (#75) ───────────────────────────────────────────────────────
 *
 * Upgrades are bought outright now; the one game that stays is the one with
 * the salvage in it. After a raid the haul goes into the furnace: hold the
 * bellows to keep the heat inside a wandering band while it melts. How well
 * (1–3 stars) adds a share of the haul's scrap on top. It cannot be failed,
 * and it takes a few seconds.
 *
 * Pure: the furnace's rules and the stars. The Vue panel steps it from the
 * frame clock and draws it.
 */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

// ─── The furnace: keep the heat in the band ──────────────────────────────────

/** Seconds in the band that melt the scrap. */
export const MELT_S = 3
/** The heat gauge: how fast the bellows raise it and the fire loses it, per second. */
export const BELLOWS_RISE = 0.62
export const FIRE_FALL = 0.38
/** Half the band's width, and where it drifts. */
export const BAND_HALF = 0.11
/** After this long the scrap melts anyway (a poor melt). */
export const FURNACE_LIMIT_S = 10

export interface Furnace {
  t: number
  /** 0 … 1 the gauge, and how fast it is moving. */
  heat: number
  vel: number
  /** 0 … 1 melted. */
  melt: number
  /** Seconds out of the band since the heat first reached it. */
  out: number
  /** The heat has reached the band at least once. */
  lit: boolean
  /** Seconds above the top of the gauge: sparks, and a worse melt. */
  scorch: number
  done: boolean
}

export const makeFurnace = (): Furnace => ({ t: 0, heat: 0.08, vel: 0, melt: 0, out: 0, lit: false, scorch: 0, done: false })

/** Where the band's middle is at `t`: it wanders, slowly, so holding is not enough. */
export const bandAt = (t: number): number => 0.58 + 0.16 * Math.sin(t * 0.85) + 0.05 * Math.sin(t * 2.3 + 1)

export const inBand = (f: Furnace): boolean => Math.abs(f.heat - bandAt(f.t)) <= BAND_HALF

/** Step the furnace by `dt` with the bellows held or not. */
export const stepFurnace = (f: Furnace, dt: number, pumping: boolean): void => {
  if (f.done) return
  f.t += dt
  // A little weight to it: the gauge eases towards rising or falling.
  const want = pumping ? BELLOWS_RISE : -FIRE_FALL
  f.vel += (want - f.vel) * Math.min(1, dt * 7)
  f.heat = clamp01(f.heat + f.vel * dt)
  if (f.heat >= 0.995) f.scorch += dt
  if (inBand(f)) {
    f.lit = true
    f.melt = clamp01(f.melt + dt / MELT_S)
  } else if (f.lit) {
    f.out += dt
  }
  if (f.melt >= 1 || f.t >= FURNACE_LIMIT_S) f.done = true
}

/** 0 … 1 how well the furnace went: time lost out of the band, and scorching. */
export const furnaceQuality = (f: Furnace): number =>
  f.melt < 1 ? 0.5 * f.melt : clamp01(1 - f.out / (MELT_S * 1.2) - f.scorch * 0.25)

// ─── The result ──────────────────────────────────────────────────────────────

/** Stars for the furnace's quality (0 … 1). */
export const meltStars = (quality: number): 1 | 2 | 3 => (quality + 1e-9 >= 0.8 ? 3 : quality + 1e-9 >= 0.5 ? 2 : 1)

/** Share of the haul's scrap the melt adds on top, by stars. */
export const MELT_BONUS: Readonly<Record<1 | 2 | 3, number>> = { 1: 0, 2: 0.1, 3: 0.25 }
