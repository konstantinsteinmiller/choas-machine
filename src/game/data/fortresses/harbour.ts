import { CellKind } from '../../world/grid'
import { FortressBuilder, pileWorth, type Fortress } from '../../world/fortress'
import { mulberry32 } from '../../world/rng'
import { NO_ANSWERS, type Answers } from '../../sim/adapt'

/**
 * ─── The Harbour (round 4, #79) ──────────────────────────────────────────────
 *
 * The third fortress: a dockyard on the island's north edge at dusk, where
 * cargo ships hang moored over the cloud sea. Two piers run out into the
 * open; a ship lies beside each, boarded by a plank and a ladder (or the
 * hook). Two dock cranes stand on the quay: perches with a cable from each
 * jib down onto a ship. Behind the quay, rows of containers one and two high
 * make alleys; two warehouses are roofed, with a skylight each. A harbour
 * wall with one gate closes the yard to the south, where the perch stands.
 *
 *   north: the cloud sea      SHIP A ─ pier A        pier B ─ SHIP B (bridge: the Warden)
 *   ═══════════════════════ quay: crane A ═════════ crane B ══════════════════
 *      WAREHOUSE W     │  container rows and alleys  │   WAREHOUSE E
 *   ─────────────────────────── harbour wall, gate ───────────────────────────
 *   south: the approach, the perch and its cable onto the west warehouse
 */

export const HARBOUR_LEVELS = 3
/** A container's height; two stacked. */
const BOX = 2.6
const DOCK_WALL_H = 5

/** Salvage: [cx, cz, amount, big?]. */
const PILES: ReadonlyArray<readonly [number, number, number, boolean?]> = [
  [6, 33, 34], // 0 · the west warehouse, under its roof
  [24, 34, 38], // 1 · an alley among the containers
  [6, 6, 40], // 2 · ship A's deck
  [7, 14, 42], // 3 · ship A's cabin roof (the crane's cable lands there)
  [41, 7, 40], // 4 · the end of pier B
  [47, 42, 40], // 5 · the east warehouse
  [33, 25, 38], // 6 · the quay, by crane B
  [20, 52, 30], // 7 · outside the wall, by the approach
  [53, 12, 80, true] // 8 · ship B's bridge: the Warden's
]
const ALWAYS = [0, 8]
const KITS: ReadonlyArray<readonly [number, number]> = [[10, 40], [28, 38], [42, 20], [54, 40], [16, 24]]
const CRATES: ReadonlyArray<readonly [number, number]> = [[5, 40], [40, 35], [57, 4]]
const BARRELS: ReadonlyArray<readonly [number, number]> = [[24, 24], [60, 27], [21, 38], [33, 42], [5, 14], [52, 6]]

export const buildHarbour = (level = 1, run = 0, answers: Answers = NO_ANSWERS): Fortress => {
  const rng = mulberry32(0x4a7 + run * 7919)
  const b = new FortressBuilder('harbour', 64, 66).look('harbour')

  // ── The land: the yard, the quay along its north edge; the sea is the open sky ──
  b.ground(2, 22, 61, 63)
  b.deck(2, 22, 61, 23, true)

  // ── Pier A and ship A ──
  b.ground(14, 6, 17, 21).deck(14, 6, 17, 21)
  // Four cells of open sky between each ship and its pier: a channel, not a crevice to seal.
  b.fill(4, 4, 9, 17, 3)
  b.fill(5, 13, 8, 17, 6)
  b.ground(10, 11, 13, 11).ladder(10, 11, 'w')
  b.ladder(6, 12, 's')
  // ── Pier B and ship B: deck, cabin, bridge ──
  b.ground(40, 6, 43, 21).deck(40, 6, 43, 21)
  b.fill(48, 2, 59, 16, 3)
  b.fill(50, 10, 57, 15, 6)
  b.fill(52, 11, 55, 14, 9)
  b.ground(44, 9, 47, 9).ladder(47, 9, 'e')
  b.ladder(49, 12, 'e').ladder(51, 13, 'e')

  // ── The dock cranes: perches on the quay, a cable from each jib onto a ship ──
  b.tower(20, 24, 2, 10).ladder(22, 25, 'w')
  b.cable(20, 24, 7, 15)
  b.tower(36, 24, 2, 10).ladder(38, 25, 'w')
  b.cable(37, 24, 53, 12)

  // ── The container rows: one high and two high, alleys between ──
  const box = (x0: number, z0: number, x1: number, z1: number, high = false): void => {
    b.fill(x0, z0, x1, z1, high ? BOX * 2 : BOX, CellKind.Cover)
  }
  box(16, 28, 23, 29); box(16, 32, 19, 33, true); box(22, 32, 27, 33); box(26, 28, 31, 29, true)
  box(30, 32, 35, 33); box(34, 28, 39, 29); box(16, 36, 21, 37); box(25, 36, 30, 37, true)
  box(34, 36, 39, 37); box(18, 40, 23, 41); box(28, 40, 33, 41)

  // ── The warehouses: walled, roofed, a skylight each, two doors ──
  b.wall(3, 30, 13, 30, DOCK_WALL_H).wall(3, 42, 13, 42, DOCK_WALL_H).wall(3, 30, 3, 42, DOCK_WALL_H).wall(13, 30, 13, 42, DOCK_WALL_H)
  b.gate(8, 30, 9, 30).gate(13, 36, 13, 37)
  b.wall(44, 30, 56, 30, DOCK_WALL_H).wall(44, 44, 56, 44, DOCK_WALL_H).wall(44, 30, 44, 44, DOCK_WALL_H).wall(56, 30, 56, 44, DOCK_WALL_H)
  b.gate(50, 30, 51, 30).gate(44, 37, 44, 38)
  b.roof(4, 31, 12, 41, { holes: [[8, 36]] })
  b.roof(45, 31, 55, 43, { holes: [[50, 37]] })

  // ── The harbour wall, its gate, the approach and the perch ──
  b.wall(2, 48, 61, 48, DOCK_WALL_H).gate(30, 48, 31, 48)
  b.tower(8, 58, 2, 8).insert(9, 59, Math.PI)
  b.cable(9, 58, 8, 42)
  b.extract(15, 7)

  // ── Dressing: the quay's bollards and lamps, the warehouses' racks, cover in the approach ──
  b.solid('stack', 6, 36, 1.4).solid('stack', 10, 34, 1.4).solid('stack', 48, 34, 1.4).solid('stack', 52, 41, 1.4)
  b.solid('generator', 54, 33, 1.1, 0).solid('spool', 18, 25, 1.4, 0.3).solid('spool', 54, 25, 1.4, 1.2)
  b.cover(25, 25, 2).cover(42, 26, 1, 'z').cover(12, 52, 2).cover(40, 54, 2).cover(26, 57, 1, 'z')
  b.thicket(18, 55, 'net', 3).thicket(48, 51, 'tangle', 2).thicket(29, 44, 'net', 2)
  b.shadow(14, 38, 16, 44).shadow(40, 31, 43, 38).shadow(4, 43, 12, 46)
  b.heap(58, 26, 0.4).heap(5, 26, 1.7).heap(22, 46, 0.9)
  for (const x of [6, 24, 40, 56]) b.prop('lamp', x, 23, 0)
  b.prop('flag', 30, 47).prop('flag', 9, 16)

  // ── Supplies and barrels ──
  for (const [cx, cz] of KITS.slice(0, 3 + Math.floor((level - 1) / 2))) b.kit(cx, cz)
  for (const [cx, cz] of CRATES) b.ammo(cx, cz)
  for (const [cx, cz] of BARRELS) b.fuel(cx, cz)

  // ── Beacons: the quay, the east warehouse, ship B's deck ──
  b.beacon(28, 24).beacon(53, 42).beacon(58, 14)

  // ── Salvage: the always-live two, and a rotated set ──
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

  // ── The garrison ──
  const pick = <T>(a: T, z: T): T => (rng() < 0.5 ? a : z)
  // The quay's long walk, a guard out on pier A and one on ship A's deck.
  b.guard(pick([[4, 26, 2], [60, 26, 3]], [[60, 26, 2], [4, 26, 3]]))
  b.guard([[15, 20, 2], [16, 8, 3]])
  b.guard([[5, 6, 2], [9, 6, 2], [9, 11, 2]])
  // A guard in each warehouse; a Peashooter in the alleys.
  b.guard([[5, 32, 2], [11, 32], [11, 40, 2], [5, 40]])
  b.guard([[46, 32, 2], [54, 32], [54, 42, 2], [46, 42]])
  b.roomba(pick([[24, 34, 2], [33, 34, 2]], [[20, 30, 2], [32, 30, 2]]), 0)
  // The Warden on ship B's bridge; a sentry on crane A; a light on the west warehouse's corner.
  b.commander([[52, 11, 4], [55, 11, 4], [55, 14, 4], [52, 14, 4]], Math.PI, { shield: level >= 3 })
  b.sentry(21, 25, Math.PI)
  b.searchlight(13, 42, [[18, 44, 1.5], [24, 46, 1], [16, 50, 1.5]])

  if (level >= 2) {
    b.drone([[4, 25], [60, 25], [60, 20], [4, 20]], 9)
    b.grenadier([[26, 34, 3], [34, 34, 3]])
    b.shieldGuard([[41, 19, 2], [42, 8, 2]])
    b.enforcer(34, 46, Math.PI)
    b.roomba([[46, 39, 2], [54, 35, 2]], 0, true)
    b.engineer([[20, 44, 3], [40, 44], [40, 39, 2]])
  }
  if (level >= 3) {
    b.marksman(37, 25, Math.PI)
    b.goliath(46, 25, -Math.PI / 2)
    b.hound(pick([[6, 45, 2], [24, 45], [24, 30, 2]], [[58, 46, 2], [40, 46], [40, 30, 2]]))
    b.guard([[49, 4, 2], [58, 4, 2], [58, 8, 2]])
  }
  if (level >= 4) {
    b.shieldGuard([[17, 20, 2], [16, 10, 2]])
    b.grenadier([[48, 27, 3], [57, 27, 3]])
    b.drone([[4, 50], [60, 50], [60, 60], [4, 60]], 8)
  }
  if (level >= 5) {
    b.enforcer(12, 26, Math.PI / 2)
    b.roomba([[5, 34, 2], [11, 38, 2]], 0, true)
  }

  // ── Reinforcements, through the gate ──
  b.reserve(30, 50, Math.PI).reserve(31, 50, Math.PI)
  if (level >= 2) b.reserve(30, 46, 0).reserve(31, 46, 0)

  const f = b.build()
  f.answers = { ...answers }
  return f
}
