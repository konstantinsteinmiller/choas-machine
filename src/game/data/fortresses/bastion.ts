import { FortressBuilder, pileWorth, TOWER_H, type Fortress } from '../../world/fortress'
import { mulberry32 } from '../../world/rng'
import { NO_ANSWERS, type Answers } from '../../sim/adapt'
import { buildSeaFort } from './seaFort'
import { buildSteelKeep } from './steelKeep'

/**
 * ─── Bastion ─────────────────────────────────────────────────────────────────
 *
 * The campaign's fortress, rebuilt in round 3 (R24, #59): a mountain-top
 * stronghold in three rings, each with three ways in, that cannot be read
 * (or shot clean) from the perch. Played at five threat levels (plan G5).
 *
 *        north (z = 0)          the extraction pad, outside the north gate
 *   ┌─────────────────────────── curtain wall ───────────────────────────┐
 *   │ the tank park (the Goliath)                                        │
 *   │      ┌──────────── inner wall, 7 m (a 3 m terrace) ───────┐        │
 *   │ west │  the KEEP (8 m): its roof is the boss arena,        │ east   │
 *   │ lane │  a ring of cover round it                           │ lane   │
 *   │      │  the inner ward                                     │postern │
 *   │      └──────────────── main gate, stairs ──────────────────┘        │
 *   ├──────────┐                                                          │
 *   │ BATTERY  │   the outer yard: barracks, the watchtower,               │
 *   │ (4 m up) │   the searchlight, the pair at their talk                 │
 *   └──────────┴────────────────────── south gate ───────────────────────┘
 *   the perch, south-west: a cable onto the battery's railed ledge
 *
 * Rings, and the ways into each:
 *  - the BATTERY, reached first and up high: the cable onto its ledge (a
 *    ladder down), or a hook up its outer wall; a teaching corner (a guard
 *    with his back turned, a pile). Down into the yard: the stairs east, the
 *    ladder north, or a drop into the camo net below.
 *  - the OUTER YARD: from the battery; the south gate; the east gate.
 *  - the INNER WARD: the main gate's stairs; the east postern's ladder; the
 *    hook over the west wall from the thicket at its foot. And the
 *    watchtower (hook only) has a cable onto the inner wall's top.
 *  - the KEEP: the stairs up its west face; the ladder on its north face;
 *    the cable from the east wall.
 *
 * Sight: the battery's parapet and the two barracks blocks hide most of the
 * yard from the perch; the inner ward is behind 7 m of wall. The watchtower
 * is the early high point that sees into it.
 *
 * Rotation (`run`): which piles are live, and which way one patrol in each
 * zone walks, change from raid to raid (seeded, so a retry is the same raid).
 *
 * Round 4 (R43): the island grows by BASTION_PAD cells on every side, so a
 * ring of open ground runs round the curtain wall (#88: cover, nets, rubble,
 * a shadowed ditch line, two breaches to climb); from threat II roofs with
 * skylights cover the inner ward's arcade and two sheds (#96); more barrels,
 * cables, a kit and a crate (#78 #94 #76); the new defenders by level (#72
 * #90). Layout coordinates below are written in the old 60 × 64 frame and
 * moved by the pad when the island grows (`at` for anything added after).
 */
export const BASTION_LEVELS = 3
/** Cells the island grew by on every side (#88). Old-frame cell + BASTION_PAD = cell. */
export const BASTION_PAD = 6

/** The salvage spots: [cx, cz, amount, big?], each a puzzle of its own. Round 4 (#75) pays a quarter less a pile. */
const PILES: ReadonlyArray<readonly [number, number, number, boolean?]> = [
  [11, 53, 30], // 0 · the teaching corner, on the battery: the guard has his back to it
  [41, 51, 34], // 1 · in the searchlight's sweep, south-east yard
  [21, 44, 34], // 2 · beside the pair at their talk, under the battery's lip
  [9, 24, 34], // 3 · the west lane, between thickets, a sentry above
  [47, 27, 38], // 4 · by the postern, under the east tower's eye
  [37, 33, 38], // 5 · the inner ward, by its beacon
  [21, 17, 38], // 6 · behind the keep, in the ward's shadow
  [42, 11, 38], // 7 · the tank park
  [29, 21, 68, true] // 8 · the keep's roof: the boss arena
]
/** Repair kits (#101): the first three always, one more at III and at V. Ammo crates (#76). Red barrels (#78). */
const KITS: ReadonlyArray<readonly [number, number]> = [[12, 50], [44, 46], [34, 35], [13, 22], [24, 13]]
const CRATES: ReadonlyArray<readonly [number, number]> = [[14, 46], [45, 14]]
const BARRELS: ReadonlyArray<readonly [number, number]> = [[44, 40], [38, 12], [10, 40], [50, 30]]
/** The south-east shed's walls: up to its roof (#96). */
const SHED_H = 4
/** A breach in the curtain (#88): rubble a mech pulls itself up onto. */
const BREACH_H = 1.6
/** The third drone (#176), between the west lane and the inner ward, in today's cells (after the island grew). */
const WEST_DRONE: ReadonlyArray<readonly [number, number]> = [[18, 16], [24, 16], [24, 40], [18, 40]]
/** Always live: the teaching pile and the big one on the keep. */
const ALWAYS = [0, 8]

export const buildBastion = (level = 1, run = 0, answers: Answers = NO_ANSWERS): Fortress => {
  // The jam build: threat II and III are their own fortresses on the Bastion's
  // campaign slot (a sea fort, a concentric steel castle), so each mission
  // plays differently. The layout below is threat I's.
  if (level === 2) return buildSeaFort(run, answers)
  if (level === 3) return buildSteelKeep(run, answers)
  const rng = mulberry32(0xba5 + run * 7919)
  // Built in the old 60 × 64 frame, then grown (#88).
  const b = new FortressBuilder('bastion', 60, 64).island(2).look('dusk')
  // The mountain top: a level plateau under the whole curtain.
  b.ground(5, 7, 54, 56)

  // ── The curtain wall, its gates and towers ──
  b.wall(6, 8, 53, 8, 5).wall(6, 55, 53, 55, 5).wall(6, 8, 6, 55, 5).wall(53, 8, 53, 55, 5)
  b.gate(29, 55, 30, 55).gate(29, 8, 30, 8).gate(53, 30, 53, 31)
  b.tower(6, 8, 2, 9).tower(52, 8, 2, 9).tower(52, 54, 2, 9)
  b.ladder(8, 9, 'w').ladder(51, 9, 'e').ladder(51, 54, 'e')

  // ── The battery: the raised south-west ward, the first ring ──
  b.ground(7, 42, 19, 54, 4)
  // The ledge the cable lands on, railed, with a ladder down onto the battery.
  b.fill(7, 49, 8, 51, 6.5).rail(8, 49, 3, 'z')
  b.ladder(9, 50, 'w')
  // Down into the yard: stairs east, a ladder north.
  b.stairs(27, 48, 'w', 4, 2)
  b.ladder(12, 41, 's')
  // The parapet: crates along the battery's yard edges (and the view they block).
  b.solid('stack', 19, 44, 1.4).solid('stack', 19, 52, 1.4).solid('stack', 15, 42, 1.4).solid('generator', 10, 43, 1.1, Math.PI / 2)
  b.solid('spool', 17, 49, 1.4, 0.6).solid('barrel', 13, 46, 1.0)

  // ── The perch: an outcrop off the south-west shoulder, the cable onto the ledge ──
  b.ground(1, 56, 6, 61)
  b.tower(2, 57, 2, TOWER_H)
  b.insert(3, 58, Math.PI * 0.78).extract(29, 4)
  b.cable(3, 57, 8, 50)

  // ── The inner ward: a terrace, walled to 7 m ──
  b.ground(18, 14, 43, 37, 3)
  b.wall(18, 14, 43, 14, 7).wall(18, 37, 43, 37, 7).wall(18, 14, 18, 37, 7).wall(43, 14, 43, 37, 7)
  // 1 · The main gate, and its stairs up from the yard.
  b.ground(29, 37, 30, 37, 3)
  b.stairs(29, 43, 'n', 3, 2)
  // 2 · The postern in the east wall, a ladder up to it from the east lane.
  b.ground(43, 22, 43, 22, 3)
  b.ladder(44, 22, 'w')
  // 3 · The west wall is the hook's: a thicket at its foot to wait in.
  b.thicket(16, 26, 'net', 3, 'z')

  // ── The keep: 8 m, its roof the boss arena ──
  b.fill(25, 18, 34, 25, 8)
  b.stairs(23, 33, 'n', 8, 2)
  b.ladder(30, 17, 's')
  b.cable(43, 21, 34, 21)
  // The cover ring on the roof.
  b.solid('stack', 26, 19, 1.4).solid('stack', 33, 19, 1.4).solid('stack', 26, 24, 1.4).solid('stack', 33, 24, 1.4)
  // The generator that powers the Warden's shield: cut it, unseen, and the shield is dead glass.
  b.generator(29, 19, 0).solid('tank', 30, 24, 1.7, Math.PI / 2)

  // ── The outer yard ──
  // Two barracks blocks: what the perch cannot see behind.
  b.fill(36, 41, 41, 45, 5).fill(22, 49, 25, 53, 5)
  // A third across the west lane, which runs straight north from the perch.
  b.fill(7, 29, 12, 33, 5)
  // The watchtower: the early high point, hook only, with a cable onto the inner wall.
  b.tower(37, 47, 2, 9)
  b.cable(38, 47, 38, 37)
  // Cover every few metres along the ways across.
  b.cover(33, 46, 2).cover(45, 47, 1, 'z').cover(28, 52, 1).cover(47, 38, 2, 'z').cover(11, 33, 2).cover(9, 18, 1, 'z')
  b.cover(48, 18, 2).cover(33, 11, 2).cover(22, 11, 1).cover(14, 36, 1).cover(25, 40, 1)
  // Pools of shadow: under the battery's lip, along the west lane, behind the barracks, the tank park's north wall.
  b.shadow(7, 40, 19, 41).shadow(7, 10, 9, 39).shadow(36, 46, 41, 47).shadow(22, 47, 25, 48).shadow(10, 9, 50, 10).shadow(44, 15, 46, 21)
  // Thickets: the camo net under the battery's lip, cable tangles in the lanes.
  b.thicket(14, 40, 'net', 3).thicket(8, 21, 'tangle', 2, 'z').thicket(8, 27, 'tangle', 1).thicket(46, 24, 'tangle', 2, 'z')
  b.thicket(34, 52, 'tangle', 2).thicket(47, 12, 'net', 2)
  // The inner ward's own cover and shadow.
  b.solid('stack', 21, 28, 1.4).solid('stack', 22, 28, 1.4).solid('stack', 38, 28, 1.4).solid('stack', 39, 28, 1.4).solid('stack', 36, 17, 1.4)
  b.shadow(19, 15, 24, 17).shadow(35, 26, 42, 27)

  // ── Supplies and barrels (#76, #78, #101) ──
  for (const [cx, cz] of KITS.slice(0, 3 + Math.floor((level - 1) / 2))) b.kit(cx, cz)
  for (const [cx, cz] of CRATES) b.ammo(cx, cz)
  for (const [cx, cz] of BARRELS) b.fuel(cx, cz)

  // ── Alarm beacons: the yard, the inner ward, the keep's roof ──
  b.beacon(32, 50).beacon(38, 32).beacon(32, 24)

  // ── Salvage: the always-live two, and a rotated set from the rest ──
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

  // ── The garrison: the night watch (every level) ──
  const pick = <T>(a: T, z: T): T => (rng() < 0.5 ? a : z)
  // The teaching corner: one guard on the battery with his back to the ledge.
  b.guard([[16, 47]], Math.PI / 2)
  // The pair in the south yard: one stands, one walks a loop (two ways round).
  b.pair([20, 45], pick([[26, 45, 2], [33, 49], [29, 53, 2], [21, 46]], [[24, 42, 2], [34, 40], [32, 44, 2], [22, 46]]))
  // The inner ward's patrol.
  b.guard(pick([[20, 30, 3], [27, 30], [27, 34, 2], [20, 34]], [[36, 29, 3], [41, 29], [41, 34, 2], [36, 34]]))
  // The Warden on the keep's roof, inside the cover ring.
  b.commander([[27, 21, 4], [32, 21, 4], [32, 22, 4], [27, 22, 4]], Math.PI, { shield: level >= 4 })
  b.drone([[22, 41], [48, 41], [48, 52], [22, 52]], 8)
  // A second over the inner ward from the first raid on (#176).
  b.drone([[20, 16], [41, 16], [41, 35], [20, 35]], 11)
  // A searchlight on the south-east tower, sweeping the south yard.
  b.searchlight(52, 54, [[44, 50, 1.5], [38, 52, 1], [44, 44, 1.5], [33, 50, 1]])

  if (level >= 2) {
    // Eyes on the towers, a west-lane patrol, the second drone over the inner
    // ward, the machines, the keep's own light, and the Engineer.
    b.sentry(52, 9, Math.PI * 0.75).sentry(7, 9, Math.PI * 0.25)
    b.guard(pick([[9, 12, 3], [9, 36, 2], [13, 38]], [[13, 12, 2], [13, 35, 3], [9, 30]]))
    b.enforcer(30, 29, Math.PI, level === 2).enforcer(40, 18, Math.PI * 0.5)
    b.searchlight(29, 25, [[29, 31, 1.2], [22, 30, 1.2], [36, 33, 1.5], [38, 29, 1.2]])
    b.engineer([[31, 45, 3], [46, 45], [46, 34, 2]])
  }
  if (level >= 3) {
    // The Goliath in the tank park, its back to the north wall; another light.
    b.goliath(29, 11, Math.PI)
    b.searchlight(6, 8, [[12, 14, 1.5], [16, 22, 1], [12, 30, 1.5], [10, 18, 1]])
  }
  if (level >= 4) {
    b.guard([[46, 16, 2], [50, 16], [50, 40, 2], [46, 40]])
    b.sentry(52, 53, Math.PI * 1.25)
    b.searchlight(52, 8, [[46, 14, 1.5], [40, 12, 1], [48, 24, 1.5]])
    b.guard([[28, 54, 4], [31, 54, 4]], 0)
  }
  if (level >= 5) {
    b.guard([[22, 20, 3], [22, 26, 3]])
    b.sentry(7, 54, Math.PI * 0.75)
    b.enforcer(35, 50, 0)
  }

  // ── Reinforcements, through the gates: two per wave, more at the higher levels ──
  b.reserve(29, 57, Math.PI).reserve(30, 57, Math.PI)
  if (level >= 2) b.reserve(29, 6).reserve(30, 6)
  if (level >= 4) b.reserve(55, 30, -Math.PI / 2).reserve(55, 31, -Math.PI / 2)

  // ── The scrapyard: decking, heaps, machines, the small things ──
  b.deck(28, 38, 31, 54).deck(28, 26, 31, 36).deck(22, 9, 37, 13).deck(26, 2, 33, 7)
  b.deck(28, 54, 31, 56, true).deck(28, 7, 31, 9, true).deck(52, 29, 54, 32, true)
  b.heap(44, 52, 0.4).heap(16, 38, 2.1).heap(47, 31, 1.2).heap(12, 15, 0.7).heap(40, 36, 1.9).heap(24, 34, 0.3)
  b.solid('crane', 45, 30, 2.4, Math.PI / 2)
  b.solid('generator', 27, 50, 1.1, Math.PI / 2).solid('generator', 32, 30, 1.1, -Math.PI / 2).solid('generator', 37, 12, 1.1, Math.PI)
  b.solid('tank', 39, 30, 1.7, Math.PI / 2).solid('tank', 15, 11, 1.7, 0)
  b.solid('pipes', 9, 44 - 10, 1.0, 0).solid('pipes', 51, 36, 1.0, 0).solid('pipes', 42, 26, 1.0, 0)
  b.solid('tires', 51, 47, 0.9, 0.5).solid('tires', 16, 31, 0.9, 2).solid('tires', 50, 13, 0.9, 1)
  b.solid('barrel', 35, 37 + 2, 1.0, 0).solid('barrel', 20, 40, 1.0, 1).solid('barrel', 44, 11, 1.0, 2).solid('barrel', 24, 22, 1.0, 3)
  b.prop('girder', 46, 53, Math.PI).prop('girder', 12, 11, 0).prop('cone', 27, 54, 0).prop('cone', 32, 54, 0).prop('cone', 27, 9, 0)
  b.prop('lamp', 27, 39, 0).prop('lamp', 32, 39, 0).prop('lamp', 45, 34, -Math.PI / 2).prop('lamp', 12, 34, Math.PI / 2)
  b.prop('lamp', 27, 9, Math.PI).prop('lamp', 32, 9, Math.PI)
  b.prop('antenna', 30, 23).prop('antenna', 53, 55).prop('flag', 7, 8).prop('flag', 53, 8).prop('flag', 19, 54)
  b.solid('stack', 21, 31, 1.4).solid('stack', 40, 24, 1.4)

  // ── What the base learned last time (R26) ──
  // Rifle kills from the perch: a light on the battery's corner sweeps it.
  if (answers.perchLight) b.searchlight(7, 54, [[3, 58, 1.2], [4, 57, 1], [2, 57, 1.2], [3, 59, 1]])

  // Threat I: the arrival is a lesson to choose from (the jam build: no
  // scripted opening, the intro already showed the moves). The outcrop is
  // widened east into a platform; the board sets the mech down on its
  // south-west corner, a crate in the middle, and one guard at the far edge
  // looking at the fortress, its back to the mech: 13 m away, well out of a
  // walking step's earshot (4.5 m). Blade, rifle, or the loud guns: the
  // battery and the south yard are 20-30 m off, inside a mini-gun's or a
  // rocket's earshot, out of a silenced rifle's.
  if (level === 1) {
    // (East of the perch tower, never over it: its cable starts on its top.)
    b.ground(4, 56, 10, 62)
    b.insert(4, 61, Math.PI * 0.78)
    b.cover(7, 59, 1)
    b.guard([[9, 57]], Math.PI * 0.75)
  }

  // ── Round 4: the island grows, and what is added is placed in the old frame through `at` ──
  b.grow(BASTION_PAD)
  const P = BASTION_PAD
  const at = (cx: number, cz: number): [number, number] => [cx + P, cz + P]
  const route = (r: ReadonlyArray<readonly [number, number, number?]>): Array<[number, number, number?]> => r.map(([x, z, w]) => [x + P, z + P, w])

  // The ring outside the curtain (#88): cover to run between, nets and
  // tangles to crouch in, rubble, a ditch line in shadow along the west and
  // north, and two breaches low enough to pull up through.
  for (const [cx, cz, n, d] of [[0, 20, 2, 'z'], [58, 24, 2, 'z'], [2, 44, 1, 'x'], [57, 46, 1, 'z'], [20, 61, 2, 'x'], [44, 62, 2, 'x'], [14, 3, 2, 'x'], [44, 2, 1, 'x']] as const) {
    b.cover(...at(cx, cz), n, d)
  }
  b.thicket(...at(59, 34), 'net', 3, 'z').thicket(...at(0, 31), 'tangle', 2, 'z').thicket(...at(38, 61), 'net', 2).thicket(...at(-1, 8), 'tangle', 2)
  b.heap(...at(-1, 13), 0.8).heap(...at(59, 12), 1.3).heap(...at(10, 62), 0.5).heap(...at(57, 59), 2)
  b.shadow(...at(1, 12), ...at(4, 50)).shadow(...at(10, 3), ...at(50, 6))
  b.fill(...at(6, 38), ...at(6, 39), BREACH_H).fill(...at(53, 44), ...at(53, 45), BREACH_H)
  b.prop('girder', ...at(5, 37), Math.PI / 2).prop('girder', ...at(54, 46), -Math.PI / 2)

  // More red barrels (#78), a kit and a crate out in the ring (#76 #101), and two more cables (#94).
  for (const [cx, cz] of [[2, 28], [57, 51], [33, 60]] as const) b.fuel(...at(cx, cz))
  b.kit(...at(59, 41)).ammo(...at(-1, 41))
  b.cable(...at(52, 54), ...at(39, 45))
  b.cable(...at(7, 9), ...at(9, 29))

  // Roofs from threat II (#96): the inner ward's arcade along its south wall,
  // a shed over the yard's beacon, one over the south-east pile, one over the
  // west lane. Skylights to drop
  // a blade through; nothing to snipe down into from the perch.
  if (level >= 2) {
    b.roof(...at(19, 34), ...at(42, 36), { holes: [at(24, 35), at(33, 35), at(40, 35)] })
    b.roof(...at(31, 47), ...at(35, 53), { holes: [at(33, 50)] })
    b.roof(...at(8, 14), ...at(12, 22), { holes: [at(10, 17)] })
    // The south-east shed is walled on its west and south (the sides the perch looks in from), open north and east.
    b.wall(...at(38, 49), ...at(38, 54), SHED_H).wall(...at(39, 54), ...at(44, 54), SHED_H)
    b.roof(...at(39, 49), ...at(44, 53), { holes: [at(42, 50)] })
  }

  // The new defenders (#72 #90).
  // A shield at the main gate from the first raid on: rounds from in front
  // stop on it, so the inner ward cannot be cleared from the perch alone.
  b.shieldGuard(route([[29, 35, 3], [30, 35, 3]]), 0)
  // From the first raid on (#176): a Peashooter under the arcade, the Scrap
  // Hound down the east lane (its nose on whoever came over the battery), and
  // a third drone between the west lane and the inner ward.
  b.roomba(route([[21, 35, 2], [40, 35, 2]]), Math.PI / 2)
  b.hound(route([[44, 50, 2], [47, 36], [47, 20, 2], [47, 44]]))
  b.drone(WEST_DRONE, 9)
  if (level >= 2) {
    // A grenadier down the east lane.
    b.grenadier(route([[50, 22, 3], [50, 34, 3]]))
  }
  if (level >= 3) {
    // A Buckshot in the yard shed; a marksman on the watchtower.
    b.roomba(route([[32, 48, 2], [34, 52, 2]]), 0, true)
    b.marksman(...at(38, 48), -Math.PI * 0.3)
  }
  if (level >= 4) {
    b.grenadier(route([[36, 31, 3], [41, 31, 3]]))
    b.shieldGuard(route([[40, 50, 2], [46, 50, 2]]))
  }
  if (level >= 5) b.roomba(route([[9, 15, 2], [11, 21, 2]]), 0)

  const f = b.build()
  f.answers = { ...answers }
  return f
}
