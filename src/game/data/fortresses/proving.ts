import { FortressBuilder, WALL_H, TOWER_H, type Fortress } from '../../world/fortress'

/**
 * The proving ground: one of everything the fortress kit can build, on an
 * 80 m island. It is the layout the world, the mech's controller and the
 * guards are developed and tested against; the campaign's fortresses are
 * authored the same way, one file each.
 *
 *        north (z = 0)
 *   extraction pad outside the north wall
 *   a walled yard with a gate south and a postern north, four corner towers,
 *   a keep in the middle with a stair up, cover in the yard
 *   the insertion perch south-west, a cable from it to the south-west tower
 *        south (z = 39)
 */
export const buildProvingGround = (): Fortress => {
  const b = new FortressBuilder('proving', 40, 40).island(2)

  // ── The curtain wall, with a gate south and a postern north ──
  b.wall(9, 9, 30, 9).wall(9, 30, 30, 30).wall(9, 9, 9, 30).wall(30, 9, 30, 30)
  b.gate(19, 30, 20, 30).gate(19, 9)

  // ── Corner towers, each with a ladder on its yard side ──
  b.tower(9, 9).tower(29, 9).tower(9, 29).tower(29, 29)
  b.ladder(11, 10, 'w').ladder(28, 10, 'e').ladder(11, 29, 'w').ladder(28, 29, 'e')

  // ── A wall-walk: stairs from the yard up to the east wall ──
  b.stairs(29, 14, 's', WALL_H)

  // ── The keep, with a stair up its south side ──
  b.fill(17, 15, 22, 19, 5)
  b.stairs(16, 24, 'n', 5).fill(16, 15, 16, 14, 5)

  // ── Cover in the yard and outside the gate ──
  b.cover(13, 24, 2).cover(24, 24, 2).cover(13, 13, 1).cover(26, 13, 2, 'z')
  b.cover(18, 33, 1).cover(21, 33, 1).cover(15, 27, 1).cover(23, 21, 2)

  // ── The insertion perch and its cable into the base ──
  b.tower(4, 31, 2, TOWER_H).ladder(6, 32, 'w')
  b.cable(5, 31, 9, 30)
  // A second cable across the yard, tower to keep.
  b.cable(10, 10, 17, 15)
  b.insert(4, 32, -Math.PI * 0.75).extract(19, 4)

  // ── The garrison ──
  b.guard([[12, 12, 2], [27, 12, 2], [27, 27, 2], [12, 27, 2]])
  b.guard([[19, 26, 3], [19, 34, 3]])
  b.guard([[14, 20], [14, 14, 2], [25, 14], [25, 20, 2]])
  b.sentry(29, 29, Math.PI)
  b.sentry(9, 9, Math.PI * 0.25)
  b.commander([[18, 16, 4], [21, 16, 4], [21, 18, 4], [18, 18, 4]])
  b.drone([[12, 12], [27, 12], [27, 27], [12, 27]], 7)
  b.drone([[5, 20], [34, 20]], 9)
  b.enforcer(23, 26, Math.PI).enforcer(15, 12, 0)

  // ── Dressing ──
  b.prop('lamp', 18, 31).prop('lamp', 21, 31).prop('lamp', 12, 20).prop('lamp', 27, 20)
  b.prop('antenna', 20, 17).prop('antenna', 30, 30).prop('flag', 10, 10).prop('flag', 30, 9)
  b.prop('barrel', 26, 26).prop('barrel', 12, 15).prop('barrel', 22, 12)

  return b.build()
}
