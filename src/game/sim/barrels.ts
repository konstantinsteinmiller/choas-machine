import { CELL, CellKind, Surf, VOID, type Grid } from '../world/grid'

/**
 * ─── Exploding barrels (#78) ─────────────────────────────────────────────────
 *
 * Red fuel drums standing on low pallets about the fortress. A rifle round, a
 * rocket's blast or another barrel going up sets one off: a blast of
 * BARREL_RADIUS that hurts everyone in it (the mech too), throws the nearby
 * barrels after it a beat later, and clears the cell it stood in. The bang is
 * a noise, not an alarm: guards within BARREL_EARSHOT wonder and come to look,
 * which makes a barrel a distraction as much as a weapon. Pure.
 */

export const BARREL_RADIUS = 5
/** The blast as a share of a rocket's (`damage.blast` mul): 300 of 400. */
export const BARREL_POWER = 0.75
/** Most the mech takes standing at its foot. */
export const BARREL_HURT = 60
export const BARREL_EARSHOT = 30
/** Barrels this near one that goes up follow it, this long after. */
export const CHAIN_M = 3.6
export const CHAIN_S = 0.18
/** The drum's height above the floor (its cell is raised by this: cover). */
export const BARREL_H = 1.3

export interface Barrel {
  x: number
  /** The floor it stands on. */
  y: number
  z: number
  cx: number
  cz: number
  live: boolean
  /** Seconds until a barrel that has been set off goes up; −1 when it is not lit. */
  fuse: number
}

/** The barrel standing in a cell, if any (alive). */
export const barrelAt = (list: readonly Barrel[], cx: number, cz: number): Barrel | null =>
  list.find(b => b.live && b.cx === cx && b.cz === cz) ?? null

/** Light it (a round, a blast, a neighbour): it goes up after `delay`. */
export const ignite = (b: Barrel, delay = 0): void => {
  if (!b.live) return
  b.fuse = b.fuse < 0 ? delay : Math.min(b.fuse, delay)
}

/**
 * Count the fuses down. Returns the barrels that go up this step (each is no
 * longer live, its cell back to the floor it stood on); their neighbours are
 * lit for CHAIN_S later.
 */
export const stepBarrels = (list: Barrel[], g: Grid, dt: number): Barrel[] => {
  const out: Barrel[] = []
  for (const b of list) {
    if (!b.live || b.fuse < 0) continue
    b.fuse -= dt
    if (b.fuse > 0) continue
    b.live = false
    b.fuse = -1
    clearCell(g, b)
    out.push(b)
  }
  for (const b of out) {
    for (const o of list) if (o.live && Math.hypot(o.x - b.x, o.z - b.z) <= CHAIN_M) ignite(o, CHAIN_S)
  }
  return out
}

/** The drum is gone: its cell is open floor again. */
const clearCell = (g: Grid, b: Barrel): void => {
  const i = b.cz * g.w + b.cx
  const base = g.base[i]!
  if (base === VOID) return
  g.h[i] = base
  g.kind[i] = CellKind.Ground
  g.surf[i] = Surf.Bare
  g.base[i] = VOID
}

/** A barrel stands again (the training's barrel room set up again, #198): its cell cover once more. */
export const restoreBarrel = (g: Grid, b: Barrel): void => {
  if (b.live) return
  b.live = true
  b.fuse = -1
  const i = b.cz * g.w + b.cx
  g.base[i] = b.y
  g.h[i] = b.y + BARREL_H
  g.kind[i] = CellKind.Cover
  g.surf[i] = Surf.Heap
}

/** How much a barrel going up at (x, z) hurts the mech `d` metres away. */
export const barrelHurt = (d: number): number => (d >= BARREL_RADIUS ? 0 : Math.round(BARREL_HURT * (1 - d / BARREL_RADIUS)))

/** The cell under a point. */
export const cellOf = (x: number): number => Math.floor(x / CELL)
