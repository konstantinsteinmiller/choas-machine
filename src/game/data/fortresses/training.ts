import { FortressBuilder, type Fortress } from '../../world/fortress'

/**
 * ─── The training ground (#57, #58) ──────────────────────────────────────────
 *
 * Ten small rooms in a row, west to east, each one lesson: the mech crosses
 * them one after another and a gate in each doorway opens once the room's
 * lesson is done. Show, don't tell: a ghost of the mech shows each lesson
 * (`sim/training.ts`); the only words are the one line on why scrap matters.
 *
 * Every room is 10 × 12 cells inside, walled all round (too high for any
 * hook), with a doorway two cells wide in the middle of its east wall. The
 * hook room has no doorway: its east wall is low enough to hook over.
 */

export const TRAINING_ID = 'training'

/** The lessons, one per room, in the order they are crossed. */
export const LESSON_IDS = ['move', 'cover', 'weapons', 'blade', 'decoy', 'box', 'hook', 'beacon', 'salvage', 'extract'] as const
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
    b.wall(east, za, east, zb, r.lesson === 'hook' ? ROOM_WALL_H : ROOM_WALL_H)
    if (r.lesson === 'hook') b.fill(east, za + 1, east, zb - 1, HOOK_WALL_H)
    if (r.door) b.gate(r.door.cx, r.door.cz0, r.door.cx, r.door.cz1)
  })

  const at = (i: number, lx: number, lz: number): [number, number] => roomCell(i, lx, lz)
  const E = Math.PI / 2
  const W = -Math.PI / 2

  // 0 · Move and look: an empty room; the mech starts by its west wall.
  const [ix, iz] = at(0, 2, 7)
  b.insert(ix, iz, E)

  // 1 · Crouch and cover: a sentry in the far corner watches the room; a
  //     low wall of cover runs along the way through.
  b.sentry(...at(1, 9, 2), W)
  b.cover(...at(1, 1, 5), 8, 'x')

  // 2 · Weapons: a sentry with its back turned at the far end (the rifle),
  //     two guards facing the corner (the launcher), and room for the minigun.
  b.sentry(...at(2, 10, 2), Math.PI)
  b.guard([at(2, 8, 11)], 0).guard([at(2, 9, 11)], 0)
  b.solid('stack', ...at(2, 3, 11), 1.4).solid('stack', ...at(2, 6, 1), 1.4)

  // 3 · The blade: a guard at the far end with its back to the way in (from
  //     behind), and one facing the north wall, come at from the side (close in).
  b.guard([at(3, 8, 7)], E)
  b.guard([at(3, 5, 11)], 0)

  // 4 · The decoy: a guard in front of the way out, looking back at the way
  //     in; a screen of cover hides the doorway it comes in by.
  b.guard([at(4, 9, 7)], W)
  b.cover(...at(4, 3, 4), 6, 'z')

  // 5 · The hide box: a searchlight on the north wall sweeps the way across.
  b.searchlight(...at(5, 6, 12), [[...at(5, 3, 7), 0.8], [...at(5, 8, 7), 0.8], [...at(5, 6, 4), 0.6]])

  // 6 · The hook: the way out is over the east wall.
  // 7 · The beacon: put it out of action.
  b.beacon(...at(7, 6, 9))
  // 8 · Salvage: a pile to strip.
  b.salvage(...at(8, 6, 9), 30)
  // 9 · The way out.
  const [ex, ez] = at(9, 6, 7)
  b.extract(ex, ez)

  // A few props so the rooms read as a yard, not a box.
  b.prop('lamp', ...at(0, 9, 11), Math.PI).prop('cone', ...at(0, 5, 2)).prop('flag', ...at(9, 2, 2))
  b.prop('barrel', ...at(3, 2, 11)).prop('tires', ...at(5, 1, 1), 0.5).prop('lamp', ...at(8, 2, 11), Math.PI)
  return b.build()
}
