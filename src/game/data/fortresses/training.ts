import { FortressBuilder, type Fortress } from '../../world/fortress'

/**
 * ─── The training ground (#57, #58) ──────────────────────────────────────────
 *
 * Small rooms in a row, west to east, each one lesson: the mech crosses them
 * one after another and a gate in each doorway opens once the room's lesson
 * is done. Show, don't tell: a hologram of the mech over a projector disc
 * shows each lesson, again and again until it is done (`sim/training.ts`,
 * #87); the only words are the one line on why scrap matters.
 *
 * Every room is 10 × 12 cells inside, walled all round (too high for any
 * hook), with a doorway two cells wide in the middle of its east wall. The
 * hook room has no doorway: its east wall is low enough to hook over.
 */

export const TRAINING_ID = 'training'

/** The lessons, one per room, in the order they are crossed. */
export const LESSON_IDS = [
  'move', 'jump', 'cover', 'weapons', 'rocket', 'supply', 'blade', 'burn', 'decoy', 'box', 'hook', 'rope', 'beacon', 'salvage', 'extract'
] as const
export type LessonId = (typeof LESSON_IDS)[number]

/** A room's cells: its inside, and the doorway out (cells) if it has one. */
export interface Room {
  lesson: LessonId
  /** Inside, inclusive, in cells. */
  x0: number
  x1: number
  z0: number
  z1: number
  /** The doorway in the east wall (one column, two cells), or null. */
  door: { cx: number; cz0: number; cz1: number } | null
}

/** Margin of open ground round the rooms, and each room's inside size. */
const OX = 2
const OZ = 2
const ROOM_W = 10
const ROOM_D = 12
/** Room walls are higher than any hook reaches; the hook room's east wall is not. */
export const ROOM_WALL_H = 16
export const HOOK_WALL_H = 6
/** The jump room's two platforms, the gap between them a jump wide (#95). */
export const JUMP_DECK_H = 2.5
/** The jump room's gap (room cells): the column between the two decks. */
export const JUMP_PIT_COL = 5
/**
 * The cover room's crates (#155): as high as the sentry's eye, so a crouched
 * mech behind them is out of its sight, and low enough that a mech standing
 * up right behind them shoots over them (a rifle round leaves its shoulder
 * at 1.73 m; at the old 1.8 m every round met the crate).
 */
export const COVER_ROOM_H = 1.5
/** The rope room's tower, and the platform a rope from it reaches (#94). */
export const ROPE_TOWER_H = 4
export const ROPE_DECK_H = 2
/** The rocket room's ledge (#146), its parapet, and the target's hit points. */
export const ROCKET_LEDGE_H = 4
export const ROCKET_PARAPET_H = 5.2
export const ROCKET_TARGET_HP = 300
/** Where the rocket room's target stands (room cells). */
export const ROCKET_TARGET: readonly [number, number] = [8, 3]
/** The disguise room's corridor (#163): its two rows, the doorway's. */
export const BOX_LANE: readonly [number, number] = [6, 7]
/** The doorways: the middle two rows of a room. */
const DOOR_Z0 = OZ + 6
const DOOR_Z1 = OZ + 7

/** The rooms of the training ground, west to east. */
export const TRAINING_ROOMS: readonly Room[] = LESSON_IDS.map((lesson, i) => {
  const x0 = OX + 1 + i * (ROOM_W + 1)
  const last = i === LESSON_IDS.length - 1
  return {
    lesson, x0, x1: x0 + ROOM_W - 1, z0: OZ + 1, z1: OZ + ROOM_D,
    door: last || lesson === 'hook' ? null : { cx: x0 + ROOM_W, cz0: DOOR_Z0, cz1: DOOR_Z1 }
  }
})

/** A cell in room `i`, from the room's own corner (1, 1 is its first cell inside). */
export const roomCell = (i: number, lx: number, lz: number): [number, number] => {
  const r = TRAINING_ROOMS[i]!
  return [r.x0 + lx - 1, r.z0 + lz - 1]
}

export const buildTrainingGround = (): Fortress => {
  const n = TRAINING_ROOMS.length
  const w = OX * 2 + n * (ROOM_W + 1) + 1
  const d = OZ * 2 + ROOM_D + 2
  const b = new FortressBuilder(TRAINING_ID, w, d)
  b.ground(0, 0, w - 1, d - 1)

  // The shell: one long box, cut into rooms.
  const xa = OX
  const xb = OX + n * (ROOM_W + 1)
  const za = OZ
  const zb = OZ + ROOM_D + 1
  b.wall(xa, za, xb, za, ROOM_WALL_H).wall(xa, zb, xb, zb, ROOM_WALL_H)
  b.wall(xa, za, xa, zb, ROOM_WALL_H)
  TRAINING_ROOMS.forEach((r) => {
    const east = r.x1 + 1
    b.wall(east, za, east, zb, ROOM_WALL_H)
    if (r.lesson === 'hook') b.fill(east, za + 1, east, zb - 1, HOOK_WALL_H)
    if (r.door) b.gate(r.door.cx, r.door.cz0, r.door.cx, r.door.cz1)
  })

  const at = (i: number, lx: number, lz: number): [number, number] => roomCell(i, lx, lz)
  const E = Math.PI / 2
  const W = -Math.PI / 2

  // 0 · Move and look: an empty room; the mech starts by its west wall.
  const room = (id: LessonId): number => LESSON_IDS.indexOf(id)
  // In the middle of the room (#112): the drop-in and the camera have room round it.
  const [ix, iz] = at(room('move'), 5, 7)
  b.insert(ix, iz, E)

  // · The jump (#95): a ladder up onto a deck, a gap a jump wide, a second
  //   deck, a drop to the way out. A walk off the edge lands in the pit,
  //   and its ladder goes back up to the first deck.
  {
    const j = room('jump')
    const [ax, az] = at(j, 2, 1)
    const [bx, bz] = at(j, 4, 12)
    b.fill(ax, az, bx, bz, JUMP_DECK_H)
    const [cx, cz] = at(j, 6, 1)
    const [dx, dz] = at(j, 8, 12)
    b.fill(cx, cz, dx, dz, JUMP_DECK_H)
    b.ladder(...at(j, 1, 7), 'e')
    b.ladder(...at(j, 5, 4), 'w').ladder(...at(j, 5, 10), 'w')
  }

  // · Crouch and cover: a sentry in the far corner watches the room; a
  //   low wall of cover runs along the way through.
  b.sentry(...at(room('cover'), 9, 2), W)
  b.cover(...at(room('cover'), 1, 5), 8, 'x', COVER_ROOM_H)

  // · Weapons: a sentry with its back turned at the far end (the rifle),
  //   two guards facing the corner (the minigun).
  {
    const w = room('weapons')
    b.sentry(...at(w, 10, 2), Math.PI)
    b.guard([at(w, 8, 11)], 0).guard([at(w, 9, 11)], 0)
    b.solid('stack', ...at(w, 3, 11), 1.4).solid('stack', ...at(w, 6, 1), 1.4)
  }

  // · The launcher (#146): an armoured mech up on a ledge behind a parapet,
  //   its head and shoulders over it. Nothing walks up there; rounds and
  //   the blade glance off it; a rocket into it, or onto the parapet's top
  //   beside it, takes it. Its blast is what reaches over the cover.
  {
    const k = room('rocket')
    b.fill(...at(k, 5, 1), ...at(k, 10, 4), ROCKET_LEDGE_H)
    b.fill(...at(k, 5, 4), ...at(k, 10, 4), ROCKET_PARAPET_H)
    b.fill(...at(k, 5, 1), ...at(k, 5, 4), ROCKET_PARAPET_H)
    b.rocketTarget(...at(k, ROCKET_TARGET[0], ROCKET_TARGET[1]), 0, ROCKET_TARGET_HP)
    b.solid('stack', ...at(k, 2, 11), 1.4)
  }

  // · Supplies (#76): the rounds just spent are not coming back by
  //   themselves; an ammo crate on the way, and a repair kit.
  b.ammo(...at(room('supply'), 5, 7)).kit(...at(room('supply'), 5, 3))

  // · The blade: a guard at the far end with its back to the way in (from
  //   behind), and one facing the north wall, come at from the side (close in).
  b.guard([at(room('blade'), 8, 7)], E)
  b.guard([at(room('blade'), 5, 11)], 0)

  // · The flamethrower (#99): a guard facing the wall; once it is down,
  //   what is left of it goes before anyone finds it.
  b.guard([at(room('burn'), 6, 10)], 0)

  // · The decoy: a guard in front of the way out, looking back at the way
  //   in; a screen of cover hides the doorway it comes in by.
  b.guard([at(room('decoy'), 9, 7)], W)
  b.cover(...at(room('decoy'), 3, 4), 6, 'z')

  // · The disguise (the hide box, #97, #163): the way across is a corridor
  //   between walls no hook gets over, and a searchlight behind armoured
  //   glass in a cage sweeps it end to end: no way round the light, none
  //   through it but standing still in the box while it passes over.
  {
    const x = room('box')
    b.fill(...at(x, 2, 1), ...at(x, 9, BOX_LANE[0] - 1), ROOM_WALL_H)
    b.fill(...at(x, 2, BOX_LANE[1] + 1), ...at(x, 9, 12), ROOM_WALL_H)
    // On the wall's very edge over the corridor (#163): from the middle of
    // its top, the wall itself hid the corridor from it.
    // It starts at the far end (#171): a mech sent back to the way in is not
    // stood in its pool again, it has the sweep's length to get into its box.
    b.searchlight(...at(x, 5, BOX_LANE[1] + 1), [[...at(x, 9, BOX_LANE[0]), 0.8], [...at(x, 2, BOX_LANE[1]), 0.8]], true, [0, -0.95])
  }

  // · The hook: the way out is over the east wall.
  // · The rope gun (#94): a ladder up a tower, a platform across the room a
  //   rope reaches, and the way out beyond it.
  {
    const r = room('rope')
    const [ax, az] = at(r, 2, 3)
    const [bx, bz] = at(r, 3, 11)
    b.fill(ax, az, bx, bz, ROPE_TOWER_H)
    b.ladder(...at(r, 1, 4), 'e')
    const [cx, cz] = at(r, 8, 5)
    const [dx, dz] = at(r, 9, 9)
    b.fill(cx, cz, dx, dz, ROPE_DECK_H)
  }
  // · The beacon: put it out of action.
  b.beacon(...at(room('beacon'), 6, 9))
  // · Salvage: a pile to strip.
  b.salvage(...at(room('salvage'), 6, 9), 30)
  // · The way out.
  const [ex, ez] = at(room('extract'), 6, 7)
  b.extract(ex, ez)

  // A few props so the rooms read as a yard, not a box.
  b.prop('lamp', ...at(room('move'), 9, 11), Math.PI).prop('cone', ...at(room('move'), 5, 2)).prop('flag', ...at(room('extract'), 2, 2))
  b.prop('barrel', ...at(room('blade'), 2, 11)).prop('tires', ...at(room('box'), 1, 1), 0.5).prop('lamp', ...at(room('salvage'), 2, 11), Math.PI)
  return b.build()
}
