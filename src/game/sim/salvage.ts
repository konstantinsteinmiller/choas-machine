import type { SalvageSpot } from '../world/fortress'

/**
 * ─── Salvage ─────────────────────────────────────────────────────────────────
 *
 * What a fortress is raided FOR: piles of salvage (glowing alloy, power cells,
 * machine parts) lying about the base. The mech kneels at one and strips it;
 * enough of them and the way out opens. Back at the Command Base the furnace
 * melts it down for the smithy. Pure.
 */

/** How close the mech must be to a pile to strip it, metres. */
export const SALVAGE_REACH = 1.9
/** Seconds of kneeling and rummaging per pile. */
export const SALVAGE_S = 1.15
/** The clatter of stripping a pile carries this far. */
export const SALVAGE_EARSHOT = 5

export interface Pile extends SalvageSpot {
  id: number
  taken: boolean
}

export const makePiles = (spots: readonly SalvageSpot[]): Pile[] => spots.map((s, id) => ({ ...s, id, taken: false }))

/**
 * Piles a raid must strip at a threat level: three at level I, one more per
 * level, never more than the fortress holds.
 */
export const salvageNeed = (level: number, piles: number): number => Math.min(piles, 2 + Math.max(1, level))

/** The nearest untaken pile within reach, on the level the mech stands on. */
export const pileInReach = (piles: readonly Pile[], x: number, y: number, z: number, reach = SALVAGE_REACH): Pile | null => {
  let best: Pile | null = null
  let bestD = reach
  for (const p of piles) {
    if (p.taken || Math.abs(p.y - y) > 1) continue
    const d = Math.hypot(p.x - x, p.z - z)
    if (d <= bestD) { best = p; bestD = d }
  }
  return best
}

/** The nearest untaken pile anywhere: where the waypoint points. */
export const nearestPile = (piles: readonly Pile[], x: number, z: number): Pile | null => {
  let best: Pile | null = null
  let bestD = Infinity
  for (const p of piles) {
    if (p.taken) continue
    const d = Math.hypot(p.x - x, p.z - z)
    if (d < bestD) { best = p; bestD = d }
  }
  return best
}

export const pilesTaken = (piles: readonly Pile[]): number => piles.reduce((n, p) => n + (p.taken ? 1 : 0), 0)
