import { FortressBuilder, type Fortress } from '../../world/fortress'
import { mulberry32 } from '../../world/rng'
import { NO_ANSWERS, type Answers } from '../../sim/adapt'

/**
 * ─── The Foundry (round 4, #93) ──────────────────────────────────────────────
 *
 * The second fortress, built rooms first (after Chaos Theory's "meatballs and
 * spaghetti"): seven rooms at three floor heights, each its own place with its
 * own hero props, cut out of one solid block of works too tall for any hook,
 * then joined by roofed halls, stair tunnels and ladder shafts, each with at
 * least one bend, so no sight line runs from room to room. Every room has at
 * least two ways in, the hubs three.
 *
 *            ┌───────────── the block (25 m) ─────────────┐
 *   north    │ VAULT (4 m)   SALVAGE CORE (8 m, the Foreman)│
 *            │      │  stairs ───┘  │ ladder shaft          │
 *            │      │        CRANE HUB (4 m) ── FURNACE PIT │
 *            │   stairs        │ stairs        ladder │     │
 *   west  ═► │ LANDING BAY ── SMELTING HALL ── HANGAR ─┘    │ ◄═ south-east
 *            └──────────────────────────────────────────────┘
 *
 * Floors: the bay, the smelting hall, the hangar and the furnace pit at 0;
 * the vault and the hub at 4; the core at 8. The Roombas are at home here.
 * Layout coordinates are written in a 52 × 52 frame; the island then grows a
 * ring round the block (`at` maps the frame for what is added after).
 */

export const FOUNDRY_LEVELS = 5
export const FOUNDRY_PAD = 6
/** The block the rooms are cut from: taller than a hook ever reaches from the core's floor. */
const MASS_H = 25

/** A cell rectangle in the frame. */
type R = readonly [number, number, number, number]

/** The rooms: [x0, z0, x1, z1], their floor. */
const ROOMS: Readonly<Record<'bay' | 'smelt' | 'hangar' | 'vault' | 'hub' | 'pit' | 'core', { r: R; h: number }>> = {
  bay: { r: [2, 38, 11, 49], h: 0 },
  smelt: { r: [18, 36, 33, 49], h: 0 },
  hangar: { r: [39, 34, 49, 49], h: 0 },
  vault: { r: [2, 4, 13, 17], h: 4 },
  hub: { r: [19, 19, 32, 30], h: 4 },
  pit: { r: [41, 18, 49, 29], h: 0 },
  core: { r: [19, 2, 32, 12], h: 8 }
}

/** Flat hall segments, carved and roofed: [x0, z0, x1, z1, floor]. */
const HALLS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  // Bay → smelting hall.
  [12, 46, 15, 47, 0], [14, 40, 15, 45, 0], [16, 40, 17, 41, 0],
  // Smelting hall → hangar.
  [34, 44, 35, 45, 0], [36, 37, 37, 45, 0], [38, 37, 38, 38, 0],
  // Smelting hall → the stairs up to the hub, and from their top into it.
  [20, 33, 21, 35, 0], [30, 31, 31, 34, 4],
  // Bay → the stairs up to the vault, and on in.
  [6, 30, 7, 37, 0], [6, 20, 9, 21, 4], [8, 18, 9, 19, 4],
  // Vault → the stairs up to the core, and on in.
  [14, 14, 15, 15, 4], [24, 13, 25, 15, 8],
  // Hub → the ladder shaft up into the core.
  [27, 17, 30, 18, 4], [29, 13, 30, 16, 4],
  // Hub → the furnace pit's ledge.
  [33, 22, 35, 23, 4], [34, 24, 35, 27, 4], [36, 26, 38, 27, 4],
  // Furnace pit → hangar: down, along, down again.
  [42, 30, 43, 30, 0], [42, 31, 47, 32, 0], [46, 33, 47, 33, 0]
]

/** Stair tunnels: [x, z, dir, to height] (two wide), carved and roofed. */
const STAIRS: ReadonlyArray<readonly [number, number, 'n' | 'e', number]> = [
  [22, 33, 'e', 4], // smelting hall → hub
  [6, 29, 'n', 4], // bay → vault
  [16, 14, 'e', 8] // vault → core
]

/** Salvage: [cx, cz, amount, big?]. */
const PILES: ReadonlyArray<readonly [number, number, number, boolean?]> = [
  [4, 40, 32], // 0 · the landing bay: the first, by the way in
  [31, 38, 36], // 1 · the smelting hall, among the tanks
  [44, 48, 36], // 2 · the hangar floor, under the catwalks
  [4, 6, 40], // 3 · the server vault
  [21, 28, 40], // 4 · the crane hub
  [47, 20, 40], // 5 · the furnace pit
  [7, 33, 34], // 6 · in the tunnel to the vault
  [31, 11, 40], // 7 · the core's far corner
  [26, 6, 72, true] // 8 · the salvage core: the Foreman's
]
const ALWAYS = [0, 8]
const KITS: ReadonlyArray<readonly [number, number]> = [[10, 48], [32, 48], [12, 15], [31, 21], [42, 47]]
const CRATES: ReadonlyArray<readonly [number, number]> = [[3, 47], [43, 28], [20, 11]]
const BARRELS: ReadonlyArray<readonly [number, number]> = [[26, 46], [45, 25], [48, 22], [11, 6], [28, 21], [42, 36]]

export const buildFoundry = (level = 1, run = 0, answers: Answers = NO_ANSWERS): Fortress => {
  const rng = mulberry32(0xf0d + run * 7919)
  const b = new FortressBuilder('foundry', 52, 52).look('foundry')
  b.fill(0, 0, 51, 51, MASS_H)

  // ── Rooms first ──
  for (const { r, h } of Object.values(ROOMS)) b.ground(r[0], r[1], r[2], r[3], h)
  // ── Then the ways between them ──
  for (const [x0, z0, x1, z1, h] of HALLS) b.ground(x0, z0, x1, z1, h)
  for (const [x, z, dir, to] of STAIRS) b.stairs(x, z, dir, to, 2)
  // The doors out to the yard: west into the bay, south out of the hangar.
  b.gate(0, 42, 1, 43).gate(44, 50, 45, 51)

  // The hangar's catwalks, a cable between them; the pit's ledge and its ladder; the shaft's ladder.
  b.fill(48, 36, 49, 49, 4).fill(39, 40, 40, 49, 4)
  b.ladder(47, 46, 'e').ladder(41, 46, 'w')
  b.cable(40, 43, 48, 43)
  b.fill(39, 22, 40, 29, 4)
  b.ladder(41, 26, 'w')
  b.ladder(29, 13, 'n')

  // ── Roofs over every hall and tunnel (not over the shaft's ladder) ──
  for (const [x0, z0, x1, z1] of HALLS) {
    if (x0 === 29 && z0 === 13) { b.roof(29, 15, 30, 16); continue }
    b.roof(x0, z0, x1, z1)
  }
  b.roof(22, 33, 29, 34).roof(6, 22, 7, 29).roof(16, 14, 23, 15)

  // ── Each room its own: floors, hero props, cover ──
  // The landing bay: a hazard-striped pad, a crane over it.
  b.deck(3, 41, 9, 46, true).solid('crane', 9, 39, 2.4, 0).cover(5, 44, 2).cover(9, 47, 1, 'z')
  // The smelting hall: tanks and pipes, slag heaps, a line of cover across.
  b.solid('tank', 22, 39, 1.7, 0).solid('tank', 28, 41, 1.7, Math.PI / 2).solid('pipes', 31, 45, 1, 0)
  b.heap(20, 47, 0.6).heap(32, 37, 1.4).cover(24, 44, 3).cover(29, 47, 2)
  b.shadow(18, 36, 21, 40)
  // The hangar: girders and spools on the floor, a net to crouch in.
  b.deck(41, 36, 47, 49).solid('spool', 43, 39, 1.4, 0.4).solid('stack', 45, 44, 1.4).thicket(42, 42, 'net', 2)
  b.prop('girder', 44, 37, Math.PI / 2)
  // The server vault: racks in rows (stacks), a cold deck.
  b.deck(2, 4, 13, 17)
  for (const z of [7, 11, 15]) b.solid('stack', 5, z, 1.4).solid('stack', 6, z, 1.4).solid('stack', 9, z, 1.4).solid('stack', 10, z, 1.4)
  b.shadow(2, 4, 4, 17)
  // The crane hub: the crane in its middle, cover round it.
  b.solid('crane', 25, 24, 2.4, Math.PI / 4).cover(22, 22, 2).cover(29, 27, 2).cover(22, 28, 1, 'z').solid('generator', 30, 23, 1.1, 0)
  // The furnace pit: tanks and heaps, its floor in shadow.
  b.solid('tank', 45, 21, 1.7, Math.PI / 2).heap(48, 27, 2).heap(43, 19, 0.3).shadow(41, 18, 49, 29)
  // The salvage core: stacks round the big pile.
  b.deck(19, 2, 32, 12).deck(25, 5, 27, 7, true).solid('stack', 23, 4, 1.4).solid('stack', 29, 4, 1.4).solid('stack', 23, 9, 1.4).solid('stack', 29, 9, 1.4)

  // ── Supplies and barrels ──
  for (const [cx, cz] of KITS.slice(0, 3 + Math.floor((level - 1) / 2))) b.kit(cx, cz)
  for (const [cx, cz] of CRATES) b.ammo(cx, cz)
  for (const [cx, cz] of BARRELS) b.fuel(cx, cz)

  // ── Beacons: the smelting hall, the hub, the core ──
  b.beacon(25, 48).beacon(32, 25).beacon(20, 3)

  // ── Salvage: the always-live two, and a rotated set ──
  const need = Math.min(PILES.length, 2 + Math.max(1, level))
  const pool = PILES.map((_, i) => i).filter(i => !ALWAYS.includes(i))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  const live = [...ALWAYS, ...pool.slice(0, Math.max(0, need + 1 - ALWAYS.length))].sort((x, y) => x - y)
  for (const i of live) {
    const [cx, cz, amount, big] = PILES[i]!
    b.salvage(cx, cz, amount, !!big)
  }

  // ── The garrison ──
  const pick = <T>(a: T, z: T): T => (rng() < 0.5 ? a : z)
  // The bay's guard, its back to the door; the smelting hall's pair and its Peashooter.
  b.guard([[8, 43]], Math.PI / 2)
  b.pair([27, 38], pick([[20, 42, 2], [31, 43], [26, 48, 2]], [[31, 48, 2], [20, 44], [26, 37, 2]]))
  b.roomba(pick([[19, 45, 2], [32, 45, 2]], [[25, 37, 2], [25, 43, 2]]), 0)
  // The hub's guard, the vault's, a Peashooter in the hangar.
  b.guard(pick([[20, 20, 3], [31, 20], [31, 29, 2], [20, 29]], [[31, 29, 3], [20, 29], [20, 20, 2], [31, 20]]))
  b.guard([[3, 5, 2], [12, 5], [12, 16, 2], [3, 16]])
  b.roomba([[42, 47, 2], [46, 37, 2]], 0)
  // The Foreman in the core, by the big pile.
  b.enforcer(26, 9, Math.PI, true)

  if (level >= 2) {
    b.grenadier([[22, 21, 3], [29, 21, 3]])
    b.enforcer(26, 42, 0)
    b.drone([[19, 37], [32, 37], [32, 48], [19, 48]], 8)
    b.sentry(48, 41, -Math.PI / 2)
    b.roomba([[42, 20, 2], [42, 28, 2]], 0, true)
    b.engineer([[22, 43, 3], [30, 43], [30, 39, 2]])
  }
  if (level >= 3) {
    b.marksman(49, 48, Math.PI * 1.25)
    b.shieldGuard([[21, 6, 3], [21, 10, 3]])
    b.hound(pick([[3, 40, 2], [10, 48], [10, 40, 2]], [[20, 46, 2], [32, 46], [26, 40, 2]]))
    b.drone([[19, 19], [32, 19], [32, 30], [19, 30]], 10)
  }
  if (level >= 4) {
    b.shieldGuard([[30, 6, 3], [30, 10, 3]])
    b.roomba([[3, 9, 2], [12, 9, 2]], 0, true)
    b.grenadier([[42, 38, 3], [46, 46, 3]])
  }
  if (level >= 5) {
    b.enforcer(46, 24, Math.PI / 2)
    b.guard([[24, 28, 3], [28, 28, 3]])
  }

  // ── The yard round the block, and the ways in and out ──
  b.grow(FOUNDRY_PAD)
  const P = FOUNDRY_PAD
  const at = (cx: number, cz: number): [number, number] => [cx + P, cz + P]
  b.insert(...at(-3, 42), Math.PI / 2).extract(...at(42, 53))
  b.cover(...at(-2, 38), 2, 'z').cover(...at(-1, 47), 2).cover(...at(38, 53), 2).thicket(...at(-1, 34), 'tangle', 2, 'z')
  b.heap(...at(-3, 30), 0.4).heap(...at(47, 52), 1.1)
  b.prop('lamp', ...at(-1, 41), Math.PI / 2).prop('lamp', ...at(-1, 44), Math.PI / 2).prop('flag', ...at(41, 52))
  b.reserve(...at(-2, 42), Math.PI / 2).reserve(...at(-2, 43), Math.PI / 2)
  if (level >= 2) b.reserve(...at(44, 53), Math.PI).reserve(...at(45, 53), Math.PI)

  const f = b.build()
  f.answers = { ...answers }
  return f
}
