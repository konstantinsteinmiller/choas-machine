import { FortressBuilder, pileWorth, type Fortress } from '../../world/fortress'
import { mulberry32 } from '../../world/rng'
import { NO_ANSWERS, type Answers } from '../../sim/adapt'

/**
 * ─── The Steel Keep: the Bastion at threat III (jam build) ───────────────────
 *
 * A real concentric castle (Beaumaris, Anglesey) rebuilt in metal slabs. A
 * low outer curtain with twelve towers; inside it the killing ground, a band
 * 14 m wide watched from both rings; then the inner ward, its walls 10 m (too
 * high for the hook), two gatehouses each set off from the outer gates so no
 * one walks straight through, and the keep, the highest tower, on its
 * north-east corner: the Warden and the big pile.
 *
 * It is parkour, and it is a plan: the killing ground is where a mech gets
 * surrounded (both rings see into it, the hound runs it, the reserves come in
 * through both outer gates). The way in goes over it instead: the perch's
 * cable onto an outer tower, a cable climbing to an inner tower, the inner
 * wall's top, and a last cable to the keep. Or the north-east corner tower's
 * cable straight up to the keep, for whoever gets round to it unseen.
 *
 *   outer curtain 6 m · 12 towers 9 m          inner ward 10 m · towers 12-13 m · keep 16 m
 *   ┌──────────────── north gate (offset) ───────────────────┐
 *   │   ┌────── inner north gate ─────────────── KEEP ┐       │
 *   │   │  great hall          goliath                │  killing ground
 *   │   │  barracks     chapel                        │       │
 *   │   └────────────────── inner south gate ─────────┘       │
 *   └──── south gate ─────────────────────────────────────────┘
 *        perch (11 m) on the rock, its cable onto the south-west tower
 */

const CURTAIN_H = 6
const OUTER_TOWER_H = 9
const INNER_H = 10
const INNER_TOWER_H = 13
const GATE_TOWER_H = 12
const KEEP_H = 16

/** Salvage: [cx, cz, amount, big?]. */
const PILES: ReadonlyArray<readonly [number, number, number, boolean?]> = [
  [23, 47, 32], // 0 · the killing ground, inside the south gate
  [15, 30, 34], // 1 · the killing ground, west
  [48, 26, 34], // 2 · the killing ground, east
  [12, 30, 36], // 3 · the outer wall's top, west
  [25, 36, 38], // 4 · the barracks, under its roof
  [27, 27, 38], // 5 · the great hall's roof
  [36, 35, 40], // 6 · the chapel's roof
  [19, 31, 40], // 7 · the inner west tower's top
  [43, 20, 72, true] // 8 · the keep's top: the Warden's
]
const ALWAYS = [0, 8]
const KITS: ReadonlyArray<readonly [number, number]> = [[16, 46], [47, 40], [30, 40], [22, 25], [46, 15]]
// Round 5 (#143): two crates more than the Bastion's first map, threat III.
const CRATES: ReadonlyArray<readonly [number, number]> = [[16, 17], [40, 38], [46, 5], [14, 40]]
const BARRELS: ReadonlyArray<readonly [number, number]> = [[48, 45], [33, 22], [16, 24], [24, 41]]

export const buildSteelKeep = (run = 0, answers: Answers = NO_ANSWERS): Fortress => {
  const rng = mulberry32(0x57e + run * 7919)
  const b = new FortressBuilder('bastion', 64, 64).island(2).look('foundry')

  // ── The outer curtain: walls, gates, twelve towers ──
  b.wall(12, 12, 51, 12, CURTAIN_H).wall(12, 51, 51, 51, CURTAIN_H).wall(12, 12, 12, 51, CURTAIN_H).wall(51, 12, 51, 51, CURTAIN_H)
  // The outer gates, set off from the inner ones.
  b.gate(26, 51, 27, 51).gate(36, 12, 37, 12)
  b.tower(10, 10, 2, OUTER_TOWER_H).tower(52, 10, 2, OUTER_TOWER_H).tower(10, 52, 2, OUTER_TOWER_H).tower(52, 52, 2, OUTER_TOWER_H)
  b.tower(20, 11, 2, OUTER_TOWER_H).tower(42, 11, 2, OUTER_TOWER_H).tower(20, 51, 2, OUTER_TOWER_H).tower(42, 51, 2, OUTER_TOWER_H)
  b.tower(11, 20, 2, OUTER_TOWER_H).tower(11, 42, 2, OUTER_TOWER_H).tower(51, 20, 2, OUTER_TOWER_H).tower(51, 42, 2, OUTER_TOWER_H)
  // Up onto the curtain's top from the killing ground.
  b.ladder(13, 30, 'w').ladder(50, 30, 'e').ladder(30, 13, 'n').ladder(32, 50, 's')

  // ── The inner ward: walls too high for the hook, towers, the keep ──
  b.wall(20, 20, 43, 20, INNER_H).wall(20, 43, 43, 43, INNER_H).wall(20, 20, 20, 43, INNER_H).wall(43, 20, 43, 43, INNER_H)
  b.gate(26, 20, 27, 20).gate(36, 43, 37, 43)
  b.tower(24, 19, 2, GATE_TOWER_H).tower(28, 19, 2, GATE_TOWER_H).tower(34, 42, 2, GATE_TOWER_H).tower(38, 42, 2, GATE_TOWER_H)
  b.tower(19, 19, 3, INNER_TOWER_H).tower(19, 41, 3, INNER_TOWER_H).tower(41, 41, 3, INNER_TOWER_H)
  b.tower(19, 31, 2, GATE_TOWER_H).tower(43, 31, 2, GATE_TOWER_H)
  b.tower(41, 18, 4, KEEP_H)
  // From the courtyard: up the inner east wall, the west tower, the keep (the obvious way, watched).
  b.ladder(42, 26, 'e').ladder(21, 32, 'w').ladder(40, 21, 'e')

  // ── The courtyard: the great hall, the chapel, the barracks ──
  b.fill(23, 24, 31, 30, 6).ladder(32, 27, 'w')
  b.fill(34, 33, 38, 37, 5).ladder(33, 35, 'e')
  b.wall(22, 33, 28, 33, 4).wall(22, 39, 28, 39, 4).wall(22, 33, 22, 39, 4).wall(28, 33, 28, 39, 4)
  b.gate(28, 36, 28, 36)
  b.roof(23, 34, 27, 38, { holes: [[25, 36]] })

  // ── The way over: the perch, and cables from tower to tower ──
  b.tower(18, 55, 2, 11).ladder(17, 55, 'e')
  b.cable(18, 55, 20, 52)
  // An outer tower up to an inner one, over the killing ground.
  b.cable(20, 51, 20, 43)
  // The inner north-west tower to the keep, above the inner north wall.
  b.cable(21, 20, 41, 20)
  // The outer north-east corner tower straight up to the keep.
  b.cable(52, 11, 44, 18)
  b.insert(29, 57, Math.PI)
  b.extract(36, 8)

  // ── Cover: the killing ground has little, on purpose; the courtyard more ──
  b.cover(16, 36, 1, 'z').cover(47, 33, 1, 'z').cover(30, 47, 2).cover(39, 16, 2).cover(16, 22, 1)
  b.cover(33, 39, 2).cover(39, 27, 1, 'z').cover(24, 31, 2)
  b.cover(30, 55, 2).cover(36, 58, 1, 'z')
  b.thicket(14, 44, 'tangle', 2, 'z').thicket(48, 18, 'net', 2).thicket(40, 24, 'net', 2)
  b.shadow(13, 13, 19, 14).shadow(44, 45, 50, 50).shadow(21, 40, 31, 42).shadow(32, 21, 40, 22)
  b.solid('pipes', 46, 22, 1.0, 0).solid('generator', 17, 40, 1.1, Math.PI / 2).solid('tank', 24, 22, 1.7, 0)
  b.solid('spool', 39, 39, 1.4, 0.6).solid('tires', 45, 46, 0.9, 1)
  b.heap(46, 37, 0.8).heap(17, 27, 1.9).heap(35, 23, 0.4).heap(48, 14, 1.2).heap(15, 49, 2.4).heap(30, 22, 0.9)
  // The siege crane left in the killing ground's north-west corner.
  b.solid('crane', 15, 15, 2.4, Math.PI / 4)
  // The Warden's shield generator, in the courtyard behind the great hall.
  b.generator(24, 32, 0)
  b.prop('flag', 42, 19).prop('flag', 10, 10).prop('flag', 53, 53).prop('antenna', 20, 20).prop('lamp', 25, 50, 0).prop('lamp', 28, 50, 0)

  // ── Supplies, barrels, beacons ──
  for (const [cx, cz] of KITS.slice(0, 4)) b.kit(cx, cz)
  for (const [cx, cz] of CRATES) b.ammo(cx, cz)
  for (const [cx, cz] of BARRELS) b.fuel(cx, cz)
  b.beacon(29, 46).beacon(33, 32).beacon(46, 28)

  // ── Salvage ──
  const need = Math.min(PILES.length, 5)
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

  // ── The garrison: both rings look into the killing ground ──
  const pick = <T>(a: T, z: T): T => (rng() < 0.5 ? a : z)
  // The curtain's tops, between their towers.
  b.guard([[12, 23, 2], [12, 40, 2]])
  b.guard([[28, 51, 2], [40, 51, 2]])
  b.guard([[51, 23, 2], [51, 40, 2]])
  // The killing ground: a pair by the south gate, a hound round the band, an Enforcer, a grenadier.
  b.pair([29, 48], [[33, 48, 2], [33, 46], [29, 46, 2]])
  b.hound(pick([[16, 16, 1], [47, 16], [47, 47, 1], [16, 47]], [[47, 47, 1], [16, 47], [16, 16, 1], [47, 16]]))
  b.enforcer(46, 44, Math.PI)
  b.grenadier([[16, 26, 3], [16, 38, 3]])
  // The inner ward: a guard down the west strip, a shield at the south gate, the engineer, a Buckshot in the barracks.
  b.guard([[22, 22, 2], [22, 31, 2]])
  b.shieldGuard([[36, 41, 3], [37, 41, 3]], 0)
  b.engineer([[33, 40, 3], [40, 40], [40, 34, 2]])
  b.roomba([[23, 34, 2], [27, 38, 2]], 0, true)
  // The Goliath in the courtyard, the Warden on the keep, eyes on the towers.
  b.goliath(35, 27, Math.PI)
  b.commander([[41, 18, 4], [44, 18, 4], [44, 21, 4], [41, 21, 4]], Math.PI)
  b.marksman(42, 42, Math.PI * 1.25)
  b.sentry(20, 51, 0).sentry(52, 52, Math.PI * 1.25)
  b.searchlight(10, 52, [[16, 46, 1.5], [24, 48, 1], [16, 36, 1.5]])
  b.searchlight(19, 19, [[16, 16, 1.5], [30, 16, 1], [16, 28, 1.5]])
  b.searchlight(53, 11, [[47, 16, 1.5], [47, 28, 1], [36, 16, 1.5]])
  b.drone([[16, 16], [47, 16], [47, 47], [16, 47]], 8)
  b.drone([[24, 33], [39, 33], [39, 39], [24, 39]], 9)
  // A third over the south-east works (#181).
  b.drone([[30, 44], [44, 44], [44, 50], [30, 50]], 8)

  // ── Reinforcements, through both outer gates ──
  b.reserve(26, 53, Math.PI).reserve(27, 53, Math.PI).reserve(36, 10).reserve(37, 10)

  const f = b.build()
  f.answers = { ...answers }
  return f
}
