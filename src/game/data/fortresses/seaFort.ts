import { FortressBuilder, pileWorth, type Fortress } from '../../world/fortress'
import { mulberry32 } from '../../world/rng'
import { NO_ANSWERS, type Answers } from '../../sim/adapt'

/**
 * ─── The Sea Fort: the Bastion at threat II (jam build) ──────────────────────
 *
 * After Wind Waker's Forsaken Fortress: a fort on a round sea rock, closed by
 * a tall palisade with a wooden walkway along its inside, three searchlights
 * on its corners and its north tower, a patrolled courtyard of crates and
 * shadow, a walled prison block, and a three-tiered keep in the middle with
 * the Warden and the big pile on its summit.
 *
 *            north gate · extraction outside it
 *   NW ┌───────────── walkway (4 m) ───── north tower (12 m) ─┐ NE (cable to the summit)
 *      │  prison                                               │
 *      │  block        ┌──── keep: 4 · 8.5 · 13 m ────┐        │
 *      │               │            summit           │        │
 *      │  courtyard    └─────────── stairs ──────────┘        │
 *   SW └───────── walkway ──── south gate ──── walkway ────────┘ SE
 *          perch on the rock outside, its cable onto the wall top
 *
 * The palisade is 7 m: the hook takes it, or the perch's cable onto its top
 * and the hook down onto the walkway. From the north-east tower a cable
 * climbs to the keep's summit: the way to the Warden over everyone's head.
 */

/** The palisade, the walkway along its inside, the corner towers. */
const PALISADE_H = 7
const WALK_H = 4
const CORNER_H = 10

/** The Sea Fort's mech (the Foreman) has this share of its hit points: the second fortress is a softer step up. */
export const SEA_FORT_MECH_HP = 0.85

/** Salvage: [cx, cz, amount, big?]. */
const PILES: ReadonlyArray<readonly [number, number, number, boolean?]> = [
  [20, 21, 32], // 0 · in the prison block, under its roof
  [13, 40, 34], // 1 · the west walkway
  [44, 44, 34], // 2 · the courtyard's south-east corner
  [38, 19, 36], // 3 · at the north tower's foot
  [37, 26, 38], // 4 · the keep's first tier, north-east
  [50, 30, 38], // 5 · the east walkway
  [19, 44, 34], // 6 · the courtyard's south-west corner
  [29, 29, 40], // 7 · the keep's second tier
  [31, 31, 70, true] // 8 · the summit: the Warden's
]
const ALWAYS = [0, 8]
const KITS: ReadonlyArray<readonly [number, number]> = [[18, 46], [46, 20], [35, 42], [14, 22], [27, 26]]
// Round 5 (#143): one crate more than the Bastion's first map, threat II.
const CRATES: ReadonlyArray<readonly [number, number]> = [[44, 47], [21, 31], [43, 1]]
const BARRELS: ReadonlyArray<readonly [number, number]> = [[40, 45], [22, 28], [46, 36], [27, 47]]

export const buildSeaFort = (run = 0, answers: Answers = NO_ANSWERS): Fortress => {
  const rng = mulberry32(0x5ea + run * 7919)
  const b = new FortressBuilder('bastion', 64, 64).island(2).look('harbour')

  // ── The palisade, its gates and corner towers ──
  b.wall(12, 12, 51, 12, PALISADE_H).wall(12, 51, 51, 51, PALISADE_H).wall(12, 12, 12, 51, PALISADE_H).wall(51, 12, 51, 51, PALISADE_H)
  b.gate(31, 51, 32, 51).gate(31, 12, 32, 12)
  b.tower(10, 10, 2, CORNER_H).tower(52, 10, 2, CORNER_H).tower(10, 52, 2, CORNER_H).tower(52, 52, 2, CORNER_H)

  // ── The walkway round the inside, open at the gates ──
  b.ground(13, 49, 29, 50, WALK_H).ground(34, 49, 50, 50, WALK_H)
  b.ground(13, 13, 29, 14, WALK_H).ground(34, 13, 50, 14, WALK_H)
  b.ground(13, 15, 14, 48, WALK_H).ground(49, 15, 50, 48, WALK_H)
  // Up from the courtyard: stairs in the south-west and the north-east, ladders at the gates.
  b.stairs(16, 41, 's', WALK_H, 2).stairs(46, 22, 'n', WALK_H, 2)
  b.ladder(30, 49, 'w').ladder(33, 49, 'e').ladder(30, 14, 'w').ladder(33, 14, 'e')

  // ── The keep: three tiers, stairs, then ladders ──
  b.fill(25, 25, 38, 38, 4).fill(28, 28, 35, 35, 8.5).fill(30, 30, 33, 33, 13)
  b.stairs(31, 46, 'n', 4, 2)
  b.ladder(31, 36, 'n').ladder(32, 34, 'n')
  // The way over everyone's head: from the north-east corner tower down onto the summit.
  b.cable(52, 11, 33, 30)

  // ── The north tower, the prison block ──
  b.tower(40, 15, 3, 12).ladder(39, 16, 'e')
  b.wall(16, 17, 24, 17, 4).wall(16, 24, 24, 24, 4).wall(16, 17, 16, 24, 4).wall(24, 17, 24, 24, 4)
  b.gate(24, 20, 24, 21)
  b.roof(17, 18, 23, 23, { holes: [[20, 20]] })

  // ── Outside: the rock the board sets the mech on, the perch and its cable onto the wall top ──
  b.tower(21, 56, 2, 10).ladder(23, 56, 'w')
  b.cable(21, 56, 21, 51)
  b.insert(26, 58, Math.PI)
  b.extract(31, 8)

  // ── The courtyard: crates, barrels and shadow to move between ──
  b.cover(20, 34, 2).cover(42, 34, 2).cover(38, 46, 1, 'z').cover(26, 42, 2).cover(44, 26, 1, 'z').cover(18, 28, 1)
  b.cover(29, 54, 2).cover(36, 57, 1, 'z')
  b.thicket(42, 40, 'net', 2).thicket(17, 36, 'tangle', 2, 'z').thicket(34, 20, 'net', 2)
  b.shadow(15, 15, 22, 16).shadow(43, 42, 48, 48).shadow(25, 39, 38, 40).shadow(15, 25, 16, 33)
  for (const [x, z, r] of [[22, 38, 0], [41, 37, 1], [38, 23, 2], [45, 30, 0.5], [19, 41, 1.5]] as const) b.solid('barrel', x, z, 1.0, r)
  b.solid('spool', 43, 21, 1.4, 0.4).solid('generator', 20, 45, 1.1, Math.PI / 2).solid('tires', 47, 44, 0.9, 1)
  b.heap(35, 47, 0.6).heap(18, 32, 1.4).heap(46, 41, 2.2).heap(16, 46, 0.3).heap(44, 17, 1.1).heap(28, 22, 2.6)
  // The dock crane the fort was built round, by the north tower.
  b.solid('crane', 45, 24, 2.4, Math.PI / 2)
  // The Warden's shield generator, on the keep's second tier.
  b.generator(34, 29, Math.PI)
  b.prop('flag', 31, 33).prop('flag', 41, 15).prop('lamp', 30, 45, 0).prop('lamp', 33, 45, 0).prop('antenna', 32, 31)

  // ── Supplies, barrels, beacons ──
  for (const [cx, cz] of KITS.slice(0, 3)) b.kit(cx, cz)
  for (const [cx, cz] of CRATES) b.ammo(cx, cz)
  for (const [cx, cz] of BARRELS) b.fuel(cx, cz)
  b.beacon(40, 41).beacon(27, 27).beacon(14, 30)

  // ── Salvage ──
  const need = Math.min(PILES.length, 4)
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

  // ── The garrison ──
  // The walkway: one on the south-west half. (A playtester on a tablet died
  // ten times here and gave up: the south-east and the west walkway guards,
  // the south yard's drone and 15 % of the Foreman's hit points are gone. A
  // later playtest: a player who fights in the open had no chance against two
  // mechs at once — the second Enforcer is gone, and a robo dog walks the
  // round the keep in place of its guard.)
  b.guard([[15, 49, 2], [28, 49, 2]])
  // The courtyard: a pair at their talk, the robo dog's round the keep, a grenadier, the engineer.
  b.pair([20, 38], [[24, 38, 2], [24, 44], [18, 44, 2], [18, 38]])
  b.hound([[26, 22, 2], [40, 22], [40, 40, 2], [23, 40], [23, 26]])
  b.grenadier([[44, 27, 3], [44, 40, 3]])
  b.engineer([[36, 44, 3], [46, 44], [46, 32, 2]])
  // The prison's jailer: a Peashooter under the roof.
  b.roomba([[18, 19, 2], [22, 22, 2]], 0)
  // The Warden on the summit; the Foreman at the keep's stairs, the one mech.
  b.commander([[30, 30, 4], [33, 30, 4], [33, 33, 4], [30, 33, 4]], Math.PI)
  b.enforcer(34, 43, 0, true)
  // Three searchlights, two sentries, a drone over the courtyard.
  b.searchlight(10, 52, [[18, 46, 1.5], [24, 40, 1], [16, 36, 1.5]])
  b.searchlight(53, 53, [[46, 46, 1.5], [40, 40, 1], [46, 34, 1.5]])
  b.searchlight(41, 16, [[32, 20, 1.5], [24, 22, 1], [44, 28, 1.5]])
  b.sentry(53, 10, Math.PI * 1.25).sentry(10, 10, Math.PI * 0.75)
  b.drone([[19, 22], [19, 44], [44, 44], [44, 22]], 9)

  // ── Reinforcements, through the gates ──
  b.reserve(31, 53, Math.PI).reserve(32, 53, Math.PI).reserve(31, 10).reserve(32, 10)

  const f = b.build()
  for (const p of f.posts) if (p.kind === 'enforcer') p.hpScale = SEA_FORT_MECH_HP
  f.answers = { ...answers }
  return f
}
