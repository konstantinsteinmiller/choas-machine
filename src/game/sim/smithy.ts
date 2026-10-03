/**
 * ─── The smithy ──────────────────────────────────────────────────────────────
 *
 * Every upgrade and every weapon tier is made, not bought: the salvage goes
 * into the furnace, the hot metal onto the anvil, the finished part into the
 * quench. Three short games, with a short wait after the first two while the
 * metal melts and then cools. How well each is played sets the part's
 * quality (1–3 stars), and a well-made part wastes less: the stars refund
 * some of the scrap it cost.
 *
 * Pure: the rules of the three games, the stars, the waits. The Vue panels
 * step them from the frame clock and draw them.
 *
 * Designed to be played, not endured: none of the games can be failed (a
 * bad furnace still melts, a missed strike still lands), each takes a few
 * seconds, and the waits are seconds rather than hours.
 */

export type SmithStep = 'furnace' | 'anvil' | 'quench'
export const SMITH_STEPS: readonly SmithStep[] = ['furnace', 'anvil', 'quench']

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

// ─── The waits ───────────────────────────────────────────────────────────────

/** Seconds the metal melts (after the furnace) and cools (after the anvil), per upgrade level 1 … 5. */
export const trackWait = (level: number): number => 6 + 2 * Math.max(1, Math.min(5, level))
/** The same for a weapon tier 2 … 5. */
export const tierWait = (tier: number): number => 10 + 2 * Math.max(2, Math.min(5, tier))

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

// ─── The anvil: strike on the beat ───────────────────────────────────────────

export const STRIKES = 4
/** Seconds to the first beat, and between beats. */
export const ANVIL_LEAD_S = 1.1
export const BEAT_S = 0.95
/** Timing windows, seconds either side of the beat. */
export const PERFECT_S = 0.08
export const GOOD_S = 0.18
/** A beat left this long without a strike is missed. */
export const LATE_S = 0.3

export type Strike = 'perfect' | 'good' | 'off' | 'miss'
export const STRIKE_SCORE: Readonly<Record<Strike, number>> = { perfect: 1, good: 0.65, off: 0.25, miss: 0 }

export interface Anvil {
  t: number
  /** One verdict per beat so far. */
  strikes: Strike[]
  done: boolean
}

export const makeAnvil = (): Anvil => ({ t: 0, strikes: [], done: false })
export const beatAt = (i: number): number => ANVIL_LEAD_S + i * BEAT_S

/** The beat waiting for a strike, or -1 when all are judged. */
export const nextBeat = (a: Anvil): number => (a.strikes.length < STRIKES ? a.strikes.length : -1)

/** 0 … 1 how far the closing ring is for the waiting beat (1 = on the mark). */
export const ringClose = (a: Anvil): number => {
  const i = nextBeat(a)
  if (i < 0) return 0
  return clamp01(1 - (beatAt(i) - a.t) / BEAT_S)
}

export const judgeStrike = (offset: number): Strike => {
  const d = Math.abs(offset)
  return d <= PERFECT_S ? 'perfect' : d <= GOOD_S ? 'good' : 'off'
}

export const stepAnvil = (a: Anvil, dt: number): void => {
  if (a.done) return
  a.t += dt
  const i = nextBeat(a)
  if (i >= 0 && a.t > beatAt(i) + LATE_S) a.strikes.push('miss')
  if (nextBeat(a) < 0) a.done = true
}

/**
 * A strike. It counts for the waiting beat if it is near enough to it; one
 * far too early is a swing at nothing and costs nothing.
 */
export const strike = (a: Anvil): Strike | null => {
  const i = nextBeat(a)
  if (a.done || i < 0) return null
  const off = a.t - beatAt(i)
  if (off < -BEAT_S * 0.5) return null
  const s = judgeStrike(off)
  a.strikes.push(s)
  if (nextBeat(a) < 0) a.done = true
  return s
}

export const anvilQuality = (a: Anvil): number =>
  a.strikes.reduce((n, s) => n + STRIKE_SCORE[s], 0) / STRIKES

// ─── The quench: dip it at cherry red ────────────────────────────────────────

/** Seconds the part takes to cool from white-hot to cold. */
export const QUENCH_S = 2.8
/** The glow (1 white-hot … 0 cold) a perfect dip is made at, and the window around it. */
export const CHERRY = 0.45
export const CHERRY_HALF = 0.08

export interface Quench {
  t: number
  /** The glow at the dip; -1 until dipped. */
  dippedAt: number
  done: boolean
}

export const makeQuench = (): Quench => ({ t: 0, dippedAt: -1, done: false })

/** The part's glow at `t`: it cools fast while white-hot, slower as it reddens. */
export const glowAt = (t: number): number => clamp01(1 - Math.pow(clamp01(t / QUENCH_S), 0.8))

export const stepQuench = (q: Quench, dt: number): void => {
  if (q.done) return
  q.t += dt
  // Left too long: it goes in cold.
  if (q.t >= QUENCH_S) { q.dippedAt = 0; q.done = true }
}

export const dip = (q: Quench): void => {
  if (q.done) return
  q.dippedAt = glowAt(q.t)
  q.done = true
}

export const quenchQuality = (q: Quench): number => {
  if (q.dippedAt < 0) return 0
  const d = Math.abs(q.dippedAt - CHERRY)
  if (d <= CHERRY_HALF) return 1
  return clamp01(1 - (d - CHERRY_HALF) * 2.2)
}

// ─── The result ──────────────────────────────────────────────────────────────

/** Stars for the three steps' qualities. */
export const starsOf = (scores: readonly number[]): 1 | 2 | 3 => {
  if (scores.length === 0) return 1
  // A hair over, so three games at 0.8, 0.7 and 0.9 are the 0.8 they add up to.
  const avg = scores.reduce((n, s) => n + s, 0) / scores.length + 1e-9
  return avg >= 0.8 ? 3 : avg >= 0.5 ? 2 : 1
}

/** Share of the scrap a part of that quality hands back. */
export const REFUND: Readonly<Record<1 | 2 | 3, number>> = { 1: 0, 2: 0.1, 3: 0.25 }
export const refundOf = (paid: number, stars: 1 | 2 | 3): number => Math.round(paid * REFUND[stars])
