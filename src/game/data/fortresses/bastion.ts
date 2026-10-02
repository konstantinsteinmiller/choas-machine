import { FortressBuilder, WALL_H, TOWER_H, type Fortress } from '../../world/fortress'

/**
 * ─── Bastion ─────────────────────────────────────────────────────────────────
 *
 * The campaign's fortress: one large base that carries every mechanic of the
 * game, played at five threat levels (plan G5). The layout is the same at
 * every level; what the level changes is who is in it.
 *
 *        north (z = 0)
 *   the extraction pad, outside the north gate
 *   ┌───────────────────── north wall ─────────────────────┐
 *   │  the tank park: the Goliath, its back to the wall    │   NORTH WARD
 *   │  the keep (the Commander walks its roof), stair on   │
 *   │  its south face                                      │
 *   ├──────── inner wall: main gate, a postern east ───────┤
 *   │  the yard: cover, patrols, a drone                   │   SOUTH WARD
 *   └───────────────────── south wall, gate ───────────────┘
 *   the perch, south-west, with a cable onto the corner tower
 *        south (z = 55)
 *
 * Ways in, from quiet to loud:
 *  - the cable from the perch to the south-west tower, then the wall-walk:
 *    the walls are a storey above the yard, so a guard under them is a drop;
 *  - the ladder up the inner wall and the cable from it onto the keep's
 *    roof, behind the Commander;
 *  - the postern in the inner wall, out of the main gate's sight;
 *  - or the gates, and the base's full attention.
 *
 * Levels: I a thin night watch and the Commander. II adds the sentries, the
 * second drone and the Enforcers. III adds the Goliath, which wakes when the
 * Commander falls and must be destroyed too. IV and V add patrols and
 * reinforcements (and the garrison is tougher: `garrison.threatOf`).
 */
export const BASTION_LEVELS = 5

export const buildBastion = (level = 1): Fortress => {
  const b = new FortressBuilder('bastion', 52, 56).island(2)

  // ── The curtain wall and the wall between the wards ──
  b.wall(8, 10, 43, 10).wall(8, 47, 43, 47).wall(8, 10, 8, 47).wall(43, 10, 43, 47)
  b.wall(8, 30, 43, 30)
  // Gates: south, north, and the main gate between the wards; the postern east.
  b.gate(25, 47, 26, 47).gate(25, 10, 26, 10).gate(25, 30, 26, 30).gate(38, 30)

  // ── Corner towers; the south-west one is where the cable from the perch lands ──
  b.tower(8, 10).tower(42, 10).tower(8, 46).tower(42, 46)
  b.ladder(10, 46, 'w').ladder(41, 46, 'e').ladder(10, 11, 'w').ladder(41, 11, 'e')

  // ── The keep, with a stair along its south face up to the roof ──
  b.fill(19, 18, 32, 24, 5)
  b.stairs(10, 25, 'e', 5)
  // The inner wall's own ladder, and a cable from the wall onto the keep's roof.
  b.ladder(21, 31, 'n')
  b.cable(21, 30, 21, 24)

  // ── Cover: in the yard, by the gates, round the keep and in the tank park ──
  b.cover(14, 40, 2).cover(20, 36, 1).cover(31, 36, 1).cover(36, 40, 2)
  b.cover(18, 43, 1).cover(33, 43, 1).cover(13, 34, 1, 'z').cover(38, 34, 1)
  b.cover(23, 50, 1).cover(28, 50, 1)
  b.cover(12, 27, 2).cover(36, 27, 2).cover(34, 21, 1, 'z').cover(16, 15, 1).cover(36, 15, 1)

  // ── The perch, its ladder, and the cable into the base ──
  // It stands on an outcrop of its own, off the island's south-west shoulder.
  b.ground(2, 48, 7, 52)
  b.tower(3, 49, 2, TOWER_H).ladder(5, 50, 'w')
  b.cable(4, 49, 8, 47)
  b.insert(3, 50, Math.PI * 0.82).extract(25, 5)

  // ── The garrison: the night watch (every level) ──
  // Two patrols in the yard, one in the north ward, and the Commander on the roof.
  b.guard([[12, 36, 2], [22, 36], [22, 44, 2], [12, 44]])
  b.guard([[39, 44, 2], [29, 44], [29, 36, 2], [39, 36]])
  b.guard([[11, 27, 3], [11, 13, 2], [17, 13, 3]])
  b.commander([[21, 20, 4], [30, 20, 4], [30, 22, 4], [21, 22, 4]], Math.PI)
  b.drone([[12, 34], [39, 34], [39, 44], [12, 44]], 7)

  if (level >= 2) {
    // Eyes on the towers, a second drone over the north ward, and the machines.
    b.sentry(42, 46, Math.PI * 1.25).sentry(8, 10, Math.PI * 0.25)
    b.guard([[26, 32, 4], [26, 28, 4]], Math.PI)
    b.drone([[12, 13], [40, 13], [40, 27], [12, 27]], 9)
    b.enforcer(29, 28, Math.PI).enforcer(34, 13, Math.PI * 0.5)
  }
  if (level >= 3) {
    // The Goliath: parked with its back to the north wall, facing the keep.
    b.goliath(22, 14, 0)
  }
  if (level >= 4) {
    b.guard([[35, 25, 2], [35, 17, 2], [40, 17], [40, 25]])
    b.sentry(42, 10, Math.PI * 0.75)
    b.guard([[24, 49, 4], [27, 49, 4]], 0)
  }
  if (level >= 5) {
    b.guard([[15, 20, 3], [15, 26, 3]])
    b.sentry(8, 46, Math.PI * 0.75)
    b.enforcer(22, 32, 0)
  }

  // ── Reinforcements, through the gates: two per wave, more at the higher levels ──
  b.reserve(25, 49, Math.PI).reserve(26, 49, Math.PI)
  if (level >= 2) b.reserve(25, 8).reserve(26, 8)
  if (level >= 4) b.reserve(25, 50, Math.PI).reserve(26, 50, Math.PI)

  // ── Dressing ──
  b.prop('lamp', 24, 46).prop('lamp', 27, 46).prop('lamp', 24, 31).prop('lamp', 27, 31)
  b.prop('lamp', 11, 40).prop('lamp', 40, 40).prop('lamp', 13, 20).prop('lamp', 38, 20)
  b.prop('antenna', 25, 21).prop('antenna', 43, 47).prop('flag', 9, 11).prop('flag', 43, 10).prop('flag', 19, 18)
  b.prop('barrel', 30, 41).prop('barrel', 16, 33).prop('barrel', 35, 13).prop('barrel', 28, 27).prop('barrel', 39, 22)

  return b.build()
}
