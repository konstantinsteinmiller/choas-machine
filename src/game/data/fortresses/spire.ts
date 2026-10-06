import { COVER_H, FortressBuilder, pileWorth, type Fortress } from '../../world/fortress'
import { CellKind } from '../../world/grid'
import { mulberry32 } from '../../world/rng'
import { NO_ANSWERS, type Answers } from '../../sim/adapt'

/**
 * ─── The Spire (round 5, #144) ───────────────────────────────────────────────
 *
 * The fourth fortress, and the last: a stepped steel tower in signal red at
 * dusk. Five square terraces stand one in the other, each four metres over the
 * last, and the way out is on the very top, twenty metres up. Every terrace is
 * a ring eight metres wide with its own patrol, beacon and salvage; one flight
 * of stairs climbs from each to the next, each on a different side, so the
 * way up spirals round the tower (the guards' way). The mech has more ways
 * up: a ladder on the far side of each ring, cables between the corners, and
 * every terrace's wall is low enough for the hook.
 *
 * Its new thing is the Watchtower: a lamp on a steel column over the top
 * terrace that sweeps the rings below, slow and wide. It cannot be destroyed,
 * and the moment it finds the mech the alarm rings, no uplink to beat. It is
 * easy to dodge, for anyone who remembers it is there. On threat III a second
 * one watches the lowest ring. From threat II the Airship circles it.
 *
 *            T5 (20 m) extraction · the Watchtower
 *         T4 (16 m) the Warden's ring
 *      T3 (12 m)
 *   T2 (8 m)
 * T1 (4 m)                 stairs: T0→T1 south · T1→T2 east · T2→T3 north · T3→T4 west · T4→T5 south
 * T0: the yard round the foot, the perch in its south-west corner
 */

export const SPIRE_LEVELS = 3
/** Each terrace's square (inclusive cells) and height. */
export const TERRACES: ReadonlyArray<readonly [number, number, number]> = [
  [8, 47, 4], [12, 43, 8], [16, 39, 12], [20, 35, 16], [24, 31, 20]
]
/** The top terrace's height: where the way out is. */
export const SPIRE_TOP = 20

/** Salvage: [cx, cz, amount, big?]. */
const PILES: ReadonlyArray<readonly [number, number, number, boolean?]> = [
  [45, 10, 34], // 0 · T1, the north-east corner
  [10, 30, 36], // 1 · T1, the west ring
  [13, 41, 38], // 2 · T2, the south-west corner
  [41, 22, 38], // 3 · T2, the east ring
  [38, 17, 40], // 4 · T3, the north-east corner
  [24, 37, 40], // 5 · T3, the south ring
  [22, 22, 42], // 6 · T4, the north-west corner
  [30, 26, 90, true] // 7 · T5, by the way out: the Warden's
]
const ALWAYS = [7]
const KITS: ReadonlyArray<readonly [number, number]> = [[30, 50], [9, 20], [42, 40], [17, 25], [33, 21]]
const CRATES: ReadonlyArray<readonly [number, number]> = [[50, 30], [13, 20], [37, 30]]
/** One more crate per threat level above I (#143). */
const MORE_CRATES: ReadonlyArray<readonly [number, number]> = [[46, 46], [22, 34]]
const BARRELS: ReadonlyArray<readonly [number, number]> = [[20, 9], [40, 46], [30, 13], [17, 32], [34, 22], [5, 40]]

/** The height of the terrace a cell is on (0 in the yard). */
const terraceAt = (cx: number, cz: number): number => {
  let h = 0
  for (const [a, z, th] of TERRACES) if (cx >= a && cx <= z && cz >= a && cz <= z) h = th
  return h
}

export const buildSpire = (level = 1, run = 0, answers: Answers = NO_ANSWERS): Fortress => {
  const rng = mulberry32(0x5b1e + run * 7919)
  const b = new FortressBuilder('spire', 56, 56).look('spire')

  // ── The yard round the foot, and the terraces ──
  b.ground(0, 0, 55, 55)
  for (const [a, z, h] of TERRACES) b.fill(a, a, z, z, h)
  // The guards' way up: one flight from each ring to the next, round the tower.
  b.stairs(20, 55, 'n', 4, 2)
  b.stairs(44, 40, 'n', 8, 2)
  b.stairs(35, 15, 'w', 12, 2)
  b.stairs(19, 24, 's', 16, 2)
  b.stairs(22, 32, 'e', 20, 2)
  // The mech's other ways: a ladder on each ring's far side, cables between the corners.
  b.ladder(11, 20, 'e').ladder(15, 30, 'e').ladder(36, 26, 'w').ladder(26, 23, 's')
  b.ladder(7, 30, 'e')
  b.cable(9, 46, 17, 38).cable(46, 9, 38, 17)

  // ── The perch: a mast in the yard's south-west corner, a cable onto the first ring ──
  b.tower(1, 50, 2, 8).insert(2, 51, Math.PI * 0.75)
  b.cable(2, 50, 10, 44)
  b.extract(27, 27)

  // ── Cover on the rings: crates and low walls, places to crouch behind,
  //    standing on whichever terrace they are on ──
  const cover = (cx: number, cz: number, len = 1, dir: 'x' | 'z' = 'x'): void => {
    for (let i = 0; i < len; i++) {
      const x = cx + (dir === 'x' ? i : 0)
      const z = cz + (dir === 'z' ? i : 0)
      b.fill(x, z, x, z, terraceAt(x, z) + COVER_H, CellKind.Cover)
    }
  }
  for (const [x, z, len, dir] of [
    [14, 9, 3, 'x'], [30, 46, 3, 'x'], [46, 18, 3, 'z'], [9, 36, 2, 'z'],
    [20, 13, 2, 'x'], [41, 30, 2, 'z'], [26, 42, 2, 'x'],
    [17, 20, 2, 'z'], [28, 38, 2, 'x'], [38, 26, 2, 'z'],
    [23, 21, 2, 'x'], [33, 27, 1, 'z']
  ] as const) cover(x, z, len, dir)
  b.thicket(5, 10, 'net', 3).thicket(48, 50, 'tangle', 2)
  b.shadow(9, 40, 11, 46).shadow(40, 12, 43, 15).shadow(17, 34, 19, 38)
  // ── Dressing: lamps on the corners, the column's flags, stacks on the yard ──
  for (const [x, z] of [[8, 8], [47, 8], [8, 47], [47, 47]] as const) b.prop('lamp', x, z, 0)
  b.prop('flag', 24, 24).prop('flag', 31, 24).prop('antenna', 12, 12)
  b.solid('stack', 3, 20, 1.4).solid('stack', 52, 36, 1.4).solid('tank', 50, 6, 1.7, 0)
  b.heap(52, 16, 0.6).heap(4, 30, 1.2)

  // ── Supplies and barrels ──
  for (const [cx, cz] of KITS.slice(0, 3 + Math.floor((level - 1) / 2))) b.kit(cx, cz)
  for (const [cx, cz] of [...CRATES, ...MORE_CRATES.slice(0, level - 1)]) b.ammo(cx, cz)
  for (const [cx, cz] of BARRELS) b.fuel(cx, cz)

  // ── Beacons: one on each of the lower three rings ──
  b.beacon(44, 12).beacon(14, 40).beacon(37, 37)

  // ── Salvage: the Warden's always, and a rotated set ──
  const need = Math.min(PILES.length, 2 + Math.max(1, level))
  const pool = PILES.map((_, i) => i).filter(i => !ALWAYS.includes(i))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  const live = [...ALWAYS, ...pool.slice(0, Math.max(0, need + 1 - ALWAYS.length))].sort((x, y) => x - y)
  for (const i of live) {
    const [cx, cz, , big] = PILES[i]!
    b.salvage(cx, cz, pileWorth(PILES, i), !!big)
  }

  // ── The Watchtower: a lamp on a column high over the top, sweeping the
  //    rings' outer halves (the terraces' edges hide their inner halves) ──
  b.watchtower(31, 31, 34, [[9, 26, 2], [26, 9, 2], [46, 26, 2], [26, 46, 2], [17, 17, 1.5], [38, 38, 1.5]])

  // ── The garrison ──
  const pick = <T>(a: T, z: T): T => (rng() < 0.5 ? a : z)
  // The yard at the foot of the stairs; each ring's long walk round.
  b.guard(pick([[12, 52, 2], [40, 52, 2]], [[40, 52, 2], [12, 52, 2]]))
  b.guard(pick([[9, 9, 2], [46, 9], [46, 46, 2], [9, 46]], [[46, 46, 2], [9, 46], [9, 9, 2], [46, 9]]))
  b.guard([[13, 13, 2], [42, 13], [42, 42, 2], [13, 42]])
  b.guard([[38, 38, 2], [17, 38], [17, 17, 2], [38, 17]])
  b.sentry(46, 12, Math.PI)
  // The Warden walks the fourth ring.
  b.commander([[21, 21, 3], [34, 21], [34, 34, 3], [21, 34]], 0, { shield: level >= 3 })
  b.searchlight(42, 42, [[30, 40, 1.5], [40, 30, 1.5], [44, 44, 1]])

  if (level >= 2) {
    b.shieldGuard([[28, 14, 2], [36, 14, 2]])
    b.guard(pick([[10, 12, 2], [10, 44, 2]], [[45, 44, 2], [45, 12, 2]]))
    b.engineer([[14, 20, 3], [14, 36], [20, 41, 2]])
    b.roomba([[18, 18, 2], [37, 18, 2]], 0)
    b.drone([[4, 4], [51, 4], [51, 51], [4, 51]], 11)
    b.enforcer(50, 26, -Math.PI / 2)
    b.airship()
  }
  if (level >= 3) {
    b.grenadier([[22, 28, 3], [33, 28, 3]])
    b.marksman(39, 39, Math.PI * 1.25)
    b.hound(pick([[4, 4, 2], [51, 4, 2]], [[51, 51, 2], [4, 51, 2]]))
    b.shieldGuard([[13, 26, 2], [13, 34, 2]])
    // A second Watchtower over the lowest ring's west side.
    b.watchtower(8, 8, 14, [[9, 20, 2], [20, 9, 2], [9, 40, 2], [40, 9, 2]])
  }

  // ── Reinforcements, up the stairs ──
  b.reserve(21, 52, Math.PI).reserve(22, 52, Math.PI)
  if (level >= 2) b.reserve(45, 38, 0).reserve(44, 38, 0)

  const f = b.build()
  f.answers = { ...answers }
  return f
}
