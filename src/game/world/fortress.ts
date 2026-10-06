import type { Answers } from '../sim/adapt'
import type { ThemeId } from '../data/themes'
import { addBox, addRoof, findHoles, CELL, cellHeight, CellKind, cellKind, cellMid, inGrid, makeGrid, ROOF_HEADROOM, Surf, VOID, type Grid, Shade } from './grid'

/**
 * ─── A fortress, as data ─────────────────────────────────────────────────────
 *
 * A fortress is authored with the builder below: an island, the structures on
 * it, the ways up, and the posts of everything that guards it. The result is
 * plain data: the mesh builder draws it, the simulation plays on it, and a
 * test can walk every patrol route without a renderer.
 *
 * Authoring is in CELLS (whole numbers, x to the right, z toward the viewer),
 * which keeps a layout readable as a map; everything in the result is in
 * world metres.
 */

/** Heights the kit builds with, in metres. The mech stands 2.0 tall (eyes at
 *  1.95) and crouches to 1.32, so cover hides it crouched, it sees over cover
 *  standing, and a wall hides it standing. */
export const COVER_H = 1.8
/** How long a chatting pair talks before one walks its round. */
export const CHAT_S = 9
export const WALL_H = 4
export const TOWER_H = 8
/** Rise of one stair tread: under the step-up limit, so a patrol walks it. */
export const TREAD_H = 0.5
/** A scrap heap: low enough to climb, high enough to hide a crouched mech. */
export const HEAP_H = 1.5
/** A searchlight's lamp stands this far above whatever it is mounted on. */
export const SEARCHLIGHT_MAST = 2.3

export interface Point { x: number; z: number }

/** One stop on a patrol: where, how long to stand, and where to look then. */
export interface Waypoint extends Point {
  /** Seconds to stand here before moving on. */
  wait: number
  /** Heading while standing, in radians (0 looks along +z); absent = keep. */
  look?: number
}

export type PostKind = 'guard' | 'sentry' | 'commander' | 'drone' | 'searchlight' | 'enforcer' | 'goliath' | 'hound' | 'roomba'

export interface Post {
  kind: PostKind
  x: number
  z: number
  /** Heading at rest, radians. */
  facing: number
  /** Guards, the commander and drones walk or fly this loop; others stand. */
  route: Waypoint[]
  /** Drones: height above the ground they fly at. */
  altitude: number
  /** Held back: arrives with a reinforcement wave once the base is on full alert. */
  reserve?: boolean
  /**
   * A boss (#40): no sniper drops it with one round, no blade takes it from
   * behind, and the first hit on it sends the whole base to full alert. The
   * Warden is the Commander; the Foreman a marked Enforcer; the Goliath is
   * the Goliath.
   */
  boss?: 'warden' | 'foreman' | 'goliath'
  /** The Warden carries a riot shield: rounds from in front stop on it. */
  shield?: boolean
  /** A guard it stands and chats with (an index into `posts`). */
  partner?: number
  /**
   * An Engineer walks to whatever the mech broke and fixes it; a grenadier
   * lobs a grenade at where the mech was last seen (#90); a marksman holds a
   * tower with a long rifle and a laser sight (#90).
   */
  role?: 'engineer' | 'grenadier' | 'marksman'
  /** A Roomba's gun: the SMG, or (`shotgun`) the close-range one (#72). */
  gun?: 'shotgun'
  /**
   * Armoured (#146): only an explosion hurts it; rounds and the blade glance
   * off its plate. The rocket lesson's target; the Airship's engines.
   */
  armoured?: boolean
  /** A training target: it never wakes, never fights back (#146). */
  dummy?: boolean
  /** Its hit points, in place of its kind's (a training target's). */
  hp?: number
  /** A searchlight that is a Watchtower lamp (#144): it cannot be destroyed, sweeps slowly, and rings the alarm the moment it finds the mech. */
  watch?: boolean
  /** A searchlight behind armoured glass in a cage (#163): rounds glance off it, nothing breaks it. */
  caged?: boolean
}

export type DecorKind =
  | 'lamp' | 'antenna' | 'barrel' | 'flag'
  | 'heap' | 'tires' | 'pipes' | 'crane' | 'generator' | 'girder' | 'tank' | 'spool' | 'stack' | 'cone'
  | 'net' | 'tangle' | 'rail'
export interface Decor { kind: DecorKind; x: number; y: number; z: number; rot: number }

/**
 * The parts of a prop that are taller (or wider) than the cell it stands on
 * carries, as boxes in the prop's own frame (x, y, z from its foot; turned
 * with it): they stop rounds, sight and the camera (#69). A crane is solid to
 * 2.4 m in the grid and drawn to 10.7 m, its boom reaching 8 m out.
 */
const PROP_BOXES: Partial<Record<DecorKind, ReadonlyArray<readonly [number, number, number, number, number, number]>>> = {
  crane: [[-0.6, 0, -0.6, 0.6, 10.3, 0.6], [-0.75, 9.2, -2.6, 0.75, 10.75, 0.75], [-0.2, 10.3, 0.75, 0.2, 10.7, 7.95]],
  stack: [[-0.42, 0, -0.42, 0.42, 4.8, 0.42]],
  lamp: [[-0.12, 0, -0.12, 0.12, 3.4, 0.12], [-0.25, 3.0, 0.1, 0.25, 3.4, 0.85]],
  antenna: [[-0.1, 0, -0.1, 0.1, 4.75, 0.1], [-0.5, 2.5, -0.5, 0.5, 2.7, 0.5]],
  girder: [[-0.45, 0, -0.1, 0.65, 3.4, 1.05]],
  generator: [[0.36, 1.0, -0.39, 0.64, 2.1, -0.11]]
}

/** The small piles are worth this share of what their table says (jam build: 30 % less). */
export const SMALL_PILE = 0.7
/** The big pile (the highest point, the boss's) is worth this many small piles. */
export const BIG_PILE = 3

/**
 * What pile `i` of a fortress's table is worth: a small one 30 % less than
 * written, the big one three times an average small one.
 */
export const pileWorth = (piles: ReadonlyArray<readonly [number, number, number, boolean?]>, i: number): number => {
  const [, , amount, big] = piles[i]!
  const smalls = piles.filter(p => !p[3])
  const avg = smalls.reduce((s, p) => s + p[2], 0) / Math.max(1, smalls.length)
  return Math.round(big ? BIG_PILE * avg * SMALL_PILE : amount * SMALL_PILE)
}

/** A pile of salvage: where it lies, and how much it is worth. */
export interface SalvageSpot {
  x: number
  y: number
  z: number
  /** Salvage it yields. */
  amount: number
  /** The big one (on the keep, by the Commander): drawn larger, worth more. */
  big: boolean
}

export interface Fortress {
  id: string
  grid: Grid
  /** Where the mech lands: a perch overlooking the base. */
  insert: Point & { facing: number }
  /** Where the grapple line takes it out. */
  extract: Point
  posts: Post[]
  decor: Decor[]
  /** What the raid is for (`sim/salvage.ts`). */
  salvage: SalvageSpot[]
  /** Alarm beacons (siren masts): a guard who runs to one and lights it puts the whole base on alert. */
  beacons: Array<{ x: number; y: number; z: number }>
  /** Generators: one cut, the Warden's shield has no power. */
  generators?: Array<{ x: number; y: number; z: number }>
  /** What the base learned from the last raid (`sim/adapt.ts`). */
  answers?: Answers
  /** Repair kits and ammo crates lying about (#76, #101). */
  supplies?: Array<{ kind: 'kit' | 'crate'; x: number; y: number; z: number }>
  /** Exploding barrels (#78): the cell, and the floor the barrel stands on. */
  barrels?: Array<{ cx: number; cz: number; x: number; y: number; z: number }>
  /** Its look (#79): palette, sky, haze. The dusk when unset. */
  theme?: ThemeId
  /** The Airship circles it (#142). */
  airship?: boolean
}

/** An exploding barrel's cell is raised this much: it is cover (`sim/barrels.ts` BARREL_H). */
const BARREL_CELL_H = 1.3

const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const
export type Dir = keyof typeof DIRS

export class FortressBuilder {
  grid: Grid
  private insertAt: (Point & { facing: number }) | null = null
  private extractAt: Point | null = null
  private posts: Post[] = []
  private decor: Decor[] = []
  private piles: SalvageSpot[] = []
  private beaconSpots: Array<{ x: number; y: number; z: number }> = []
  private generatorSpots: Array<{ x: number; y: number; z: number }> = []
  private supplySpots: Array<{ kind: 'kit' | 'crate'; x: number; y: number; z: number }> = []
  private barrelSpots: Array<{ cx: number; cz: number; x: number; y: number; z: number }> = []
  private themeId: ThemeId | undefined
  private withAirship = false

  /** The Airship circles this fortress (#142). */
  airship(): this {
    this.withAirship = true
    return this
  }

  constructor(readonly id: string, w: number, d: number) {
    this.grid = makeGrid(w, d)
  }

  private set(cx: number, cz: number, h: number, kind: CellKind): void {
    if (!inGrid(this.grid, cx, cz)) throw new Error(`[fortress ${this.id}] cell ${cx},${cz} is off the grid`)
    const i = cz * this.grid.w + cx
    this.grid.h[i] = h
    this.grid.kind[i] = kind
  }

  /** Height of a cell as built so far. */
  heightOf(cx: number, cz: number): number {
    return cellHeight(this.grid, cx, cz)
  }

  /**
   * The island's ground: an ellipse inscribed in the grid, with a margin, its
   * rim roughened so the outline does not read as a drawn circle.
   */
  island(margin = 1, roughness = 0.08): this {
    const { w, d } = this.grid
    const rx = w / 2 - margin
    const rz = d / 2 - margin
    for (let cz = 0; cz < d; cz++) {
      for (let cx = 0; cx < w; cx++) {
        const nx = (cx + 0.5 - w / 2) / rx
        const nz = (cz + 0.5 - d / 2) / rz
        const a = Math.atan2(nz, nx)
        const wobble = 1 + roughness * (Math.sin(a * 5 + 1.3) + 0.6 * Math.sin(a * 9 + 0.4))
        if (nx * nx + nz * nz <= wobble * wobble) this.set(cx, cz, 0, CellKind.Ground)
      }
    }
    return this
  }

  /**
   * Widen the island by `pad` cells on every side (#88): everything built so
   * far moves `pad` cells in, and a new island (a rounded square, so the
   * corners get room too) is laid round it. Later calls use the new cells.
   */
  grow(pad: number, margin = 2): this {
    const old = this.grid
    const g = makeGrid(old.w + pad * 2, old.d + pad * 2)
    const m = pad * CELL
    for (let cz = 0; cz < old.d; cz++) {
      for (let cx = 0; cx < old.w; cx++) {
        const i = cz * old.w + cx
        const j = (cz + pad) * g.w + cx + pad
        g.h[j] = old.h[i]!
        g.kind[j] = old.kind[i]!
        g.surf[j] = old.surf[i]!
        g.shade[j] = old.shade[i]!
        g.base[j] = old.base[i]!
        g.roof[j] = old.roof[i]!
      }
    }
    this.grid = g
    for (const b of old.boxes) addBox(g, { x0: b.x0 + m, y0: b.y0, z0: b.z0 + m, x1: b.x1 + m, y1: b.y1, z1: b.z1 + m })
    for (const l of old.ladders) g.ladders.push({ ...l, cx: l.cx + pad, cz: l.cz + pad })
    for (const c of old.cables) g.cables.push({ ax: c.ax + pad, az: c.az + pad, bx: c.bx + pad, bz: c.bz + pad })
    // The new ground: a rounded square (|x|⁴ + |z|⁴ ≤ 1), its rim roughened.
    const rx = g.w / 2 - margin
    const rz = g.d / 2 - margin
    for (let cz = 0; cz < g.d; cz++) {
      for (let cx = 0; cx < g.w; cx++) {
        if (g.h[cz * g.w + cx]! !== VOID) continue
        const nx = (cx + 0.5 - g.w / 2) / rx
        const nz = (cz + 0.5 - g.d / 2) / rz
        const a = Math.atan2(nz, nx)
        const wobble = 1 + 0.05 * (Math.sin(a * 5 + 1.3) + 0.6 * Math.sin(a * 9 + 0.4))
        if (nx ** 4 + nz ** 4 <= wobble ** 4) this.set(cx, cz, 0, CellKind.Ground)
      }
    }
    const move = <T extends { x: number; z: number }>(p: T): void => { p.x += m; p.z += m }
    if (this.insertAt) move(this.insertAt)
    if (this.extractAt) move(this.extractAt)
    for (const p of this.posts) { move(p); for (const w of p.route) move(w) }
    for (const d of this.decor) move(d)
    for (const s of this.piles) move(s)
    for (const s of this.beaconSpots) move(s)
    for (const s of this.generatorSpots) move(s)
    for (const s of this.supplySpots) move(s)
    for (const s of this.barrelSpots) { move(s); s.cx += pad; s.cz += pad }
    return this
  }

  /** Fill a rectangle of cells (inclusive corners) with one height and kind. */
  fill(x0: number, z0: number, x1: number, z1: number, h: number, kind: CellKind = CellKind.Block): this {
    for (let cz = Math.min(z0, z1); cz <= Math.max(z0, z1); cz++) {
      for (let cx = Math.min(x0, x1); cx <= Math.max(x0, x1); cx++) this.set(cx, cz, h, kind)
    }
    return this
  }

  /** Open ground at a given height (a raised yard, a terrace). */
  ground(x0: number, z0: number, x1: number, z1: number, h = 0): this {
    return this.fill(x0, z0, x1, z1, h, CellKind.Ground)
  }

  /** A wall one cell thick along a straight line of cells. */
  wall(x0: number, z0: number, x1: number, z1: number, h = WALL_H): this {
    if (x0 !== x1 && z0 !== z1) throw new Error(`[fortress ${this.id}] a wall runs along one axis`)
    return this.fill(x0, z0, x1, z1, h, CellKind.Block)
  }

  /** A gap in a wall, back down to the ground: a gate. */
  gate(x0: number, z0: number, x1 = x0, z1 = z0): this {
    return this.fill(x0, z0, x1, z1, 0, CellKind.Ground)
  }

  /** A square tower of `size` cells, its top a platform. */
  tower(cx: number, cz: number, size = 2, h = TOWER_H): this {
    return this.fill(cx, cz, cx + size - 1, cz + size - 1, h, CellKind.Block)
  }

  /** A chest-high cover block. */
  cover(cx: number, cz: number, len = 1, dir: 'x' | 'z' = 'x', h = COVER_H): this {
    for (let i = 0; i < len; i++) this.set(cx + (dir === 'x' ? i : 0), cz + (dir === 'z' ? i : 0), h, CellKind.Cover)
    return this
  }

  /**
   * A flight of stairs: treads rising from the height of the cell behind the
   * first one, in `dir`, until `toH` is reached. `width` cells wide, to the
   * right of the direction of travel.
   */
  stairs(cx: number, cz: number, dir: Dir, toH: number, width = 1): this {
    const [dx, dz] = DIRS[dir]
    const fromH = Math.max(0, this.heightOf(cx - dx, cz - dz))
    const treads = Math.ceil((toH - fromH) / TREAD_H - 1e-9)
    for (let i = 0; i < treads; i++) {
      const h = Math.min(toH, fromH + TREAD_H * (i + 1))
      for (let k = 0; k < width; k++) this.set(cx + dx * i - dz * k, cz + dz * i + dx * k, h, CellKind.Stair)
    }
    return this
  }

  /** A ladder from the cell at its foot up the block next to it, in `dir`. */
  ladder(cx: number, cz: number, dir: Dir): this {
    const [dx, dz] = DIRS[dir]
    const foot = this.heightOf(cx, cz)
    const top = this.heightOf(cx + dx, cz + dz)
    if (foot === VOID || top === VOID || top - foot < 1) {
      throw new Error(`[fortress ${this.id}] ladder at ${cx},${cz} ${dir} climbs nothing`)
    }
    this.grid.ladders.push({ cx, cz, dx, dz })
    return this
  }

  /**
   * A roof over cells [x0..x1] × [z0..z1] (#96): bodies walk under it, the
   * mech can stand on it, rounds and eyes stop at it. `at` is the underside
   * (by default ROOF_HEADROOM over the highest floor beneath); `holes` are
   * the cells left open, skylights to drop through.
   */
  roof(x0: number, z0: number, x1: number, z1: number, opts: { at?: number; holes?: ReadonlyArray<readonly [number, number]> } = {}): this {
    let floor = -Infinity
    for (let cz = Math.min(z0, z1); cz <= Math.max(z0, z1); cz++) {
      for (let cx = Math.min(x0, x1); cx <= Math.max(x0, x1); cx++) floor = Math.max(floor, this.heightOf(cx, cz))
    }
    const at = opts.at ?? floor + ROOF_HEADROOM
    if (at - floor < ROOF_HEADROOM - 1e-6) throw new Error(`[fortress ${this.id}] roof at ${at} leaves under ${ROOF_HEADROOM} m over ${x0},${z0}`)
    addRoof(this.grid, x0, z0, x1, z1, at, opts.holes)
    return this
  }

  /** A cable between two cells, each of which must be a high point. */
  cable(ax: number, az: number, bx: number, bz: number): this {
    for (const [cx, cz] of [[ax, az], [bx, bz]] as const) {
      if (this.heightOf(cx, cz) < WALL_H - 1e-6) {
        throw new Error(`[fortress ${this.id}] cable end ${cx},${cz} is not on a wall or tower`)
      }
    }
    this.grid.cables.push({ ax, az, bx, bz })
    return this
  }

  /** A marked pad (painted on whatever is already there). */
  private pad(cx: number, cz: number): void {
    const h = this.heightOf(cx, cz)
    if (h === VOID) throw new Error(`[fortress ${this.id}] pad at ${cx},${cz} is off the island`)
    this.set(cx, cz, h, CellKind.Pad)
  }

  /** Where the mech lands. `facing` in radians, 0 looking along +z. */
  insert(cx: number, cz: number, facing = 0): this {
    this.pad(cx, cz)
    this.insertAt = { x: cellMid(cx), z: cellMid(cz), facing }
    return this
  }

  extract(cx: number, cz: number): this {
    this.pad(cx, cz)
    this.extractAt = { x: cellMid(cx), z: cellMid(cz) }
    return this
  }

  private post(kind: PostKind, cells: ReadonlyArray<readonly [number, number, number?]>, facing: number, altitude = 0): this {
    if (cells.length === 0) throw new Error(`[fortress ${this.id}] a ${kind} needs at least one cell`)
    const route: Waypoint[] = cells.map(([cx, cz, wait]) => ({ x: cellMid(cx), z: cellMid(cz), wait: wait ?? 0 }))
    this.posts.push({ kind, x: route[0]!.x, z: route[0]!.z, facing, route: route.length > 1 ? route : [], altitude })
    return this
  }

  /** A guard walking a loop of cells: `[cx, cz, waitSeconds?]` each. */
  guard(route: ReadonlyArray<readonly [number, number, number?]>, facing = 0): this {
    return this.post('guard', route, facing)
  }

  /**
   * The Scrap Hound: a robot dog on a round of its own. It follows the
   * mech's scent and its noises, sniffs out bodies and stripped piles where
   * no guard would see them, and barks the guards over.
   */
  hound(route: ReadonlyArray<readonly [number, number, number?]>, facing = 0): this {
    return this.post('hound', route, facing)
  }

  /**
   * A Roomba (#72): a knee-high disc robot with a gun on its back, at home in
   * halls and interiors. Its dome is its weak spot. `shotgun` for the close
   * one; otherwise an SMG.
   */
  roomba(route: ReadonlyArray<readonly [number, number, number?]>, facing = 0, shotgun = false): this {
    this.post('roomba', route, facing)
    if (shotgun) this.posts[this.posts.length - 1]!.gun = 'shotgun'
    return this
  }

  /** A guard with a riot shield (#90): rounds from in front stop on it; the head shows over it; a blast knocks it away. */
  shieldGuard(route: ReadonlyArray<readonly [number, number, number?]>, facing = 0): this {
    this.post('guard', route, facing)
    this.posts[this.posts.length - 1]!.shield = true
    return this
  }

  /** A grenadier (#90): a guard who lobs grenades at where the mech was last seen. */
  grenadier(route: ReadonlyArray<readonly [number, number, number?]>, facing = 0): this {
    this.post('guard', route, facing)
    this.posts[this.posts.length - 1]!.role = 'grenadier'
    return this
  }

  /** A marksman on a tower (#90): far sight, a laser that draws on the mech, then a heavy round. */
  marksman(cx: number, cz: number, facing: number): this {
    this.post('sentry', [[cx, cz]], facing)
    this.posts[this.posts.length - 1]!.role = 'marksman'
    return this
  }

  /** The Engineer: a guard on a round who goes to fix whatever was broken. */
  engineer(route: ReadonlyArray<readonly [number, number, number?]>, facing = 0): this {
    this.post('guard', route, facing)
    this.posts[this.posts.length - 1]!.role = 'engineer'
    return this
  }

  /**
   * A pair that chats (a routine, after Odyssey's forts): one guard stands at
   * `at`; the other stands beside it talking for `chatS`, then walks `loop`
   * and comes back to talk again. While they talk they watch each other, not
   * the yard: a moment to slip past.
   */
  pair(at: readonly [number, number], loop: ReadonlyArray<readonly [number, number, number?]>, chatS = CHAT_S): this {
    const [ax, az] = at
    const a = this.posts.length
    this.post('guard', [[ax, az]], Math.PI / 2)
    this.post('guard', [[ax + 1, az, chatS], ...loop], -Math.PI / 2)
    const b = this.posts[a + 1]!
    // Standing to talk, it faces its partner.
    b.route[0]!.look = -Math.PI / 2
    this.posts[a]!.partner = a + 1
    b.partner = a
    return this
  }

  /**
   * A reinforcement: a guard who is not in the base until it goes to full
   * alert, and then comes in at this cell (a gate, a door) with a wave.
   */
  reserve(cx: number, cz: number, facing = 0): this {
    this.post('guard', [[cx, cz]], facing)
    this.posts[this.posts.length - 1]!.reserve = true
    return this
  }

  /** A guard who stands and watches one way (a tower, a gate). */
  sentry(cx: number, cz: number, facing: number): this {
    return this.post('sentry', [[cx, cz]], facing)
  }

  /** The base commander: the target of a medium fortress. */
  commander(route: ReadonlyArray<readonly [number, number, number?]>, facing = 0, opts: { shield?: boolean } = {}): this {
    this.post('commander', route, facing)
    const p = this.posts[this.posts.length - 1]!
    p.boss = 'warden'
    if (opts.shield) p.shield = true
    return this
  }

  /** A surveillance drone flying a loop at `altitude` metres above the ground. */
  drone(route: ReadonlyArray<readonly [number, number, number?]>, altitude = 6): this {
    return this.post('drone', route, 0, altitude)
  }

  /**
   * A searchlight on a mast, on top of whatever stands at `cx, cz`. Its beam
   * sweeps the ground from one of `sweep`'s points to the next (each
   * `[cx, cz, waitSeconds?]`), holding at each. What the light falls on, the
   * base knows about.
   */
  searchlight(cx: number, cz: number, sweep: Array<[number, number, number?]>, caged = false, nudge: readonly [number, number] = [0, 0]): this {
    const top = this.heightOf(cx, cz)
    if (top === VOID) throw new Error(`[fortress ${this.id}] searchlight at ${cx},${cz} is off the island`)
    const route: Waypoint[] = sweep.map(([x, z, wait]) => ({ x: cellMid(x), z: cellMid(z), wait: wait ?? 1.2 }))
    const first = route[0] ?? { x: cellMid(cx), z: cellMid(cz) + 6 }
    this.posts.push({
      kind: 'searchlight', x: cellMid(cx) + nudge[0], z: cellMid(cz) + nudge[1], facing: Math.atan2(first.x - cellMid(cx), first.z - cellMid(cz)),
      route, altitude: top + SEARCHLIGHT_MAST, ...(caged ? { caged: true, armoured: true } : {})
    })
    return this
  }

  /**
   * The Watchtower (#144): a steel column `h` metres high and the lamp on top
   * of it, sweeping the ground slowly; it cannot be destroyed, and the moment
   * it finds the mech in its pool the alarm rings (no uplink).
   */
  watchtower(cx: number, cz: number, h: number, sweep: Array<[number, number, number?]>): this {
    this.fill(cx, cz, cx, cz, h)
    this.searchlight(cx, cz, sweep)
    Object.assign(this.posts[this.posts.length - 1]!, { watch: true, armoured: true })
    return this
  }

  /** An alarm beacon (a siren mast) on the cell's top. */
  beacon(cx: number, cz: number): this {
    const h = this.heightOf(cx, cz)
    if (h === VOID) throw new Error(`[fortress ${this.id}] beacon at ${cx},${cz} is off the island`)
    this.beaconSpots.push({ x: cellMid(cx), y: h, z: cellMid(cz) })
    return this
  }

  /**
   * The generator that powers the Warden's shield (R25): a solid machine the
   * mech can cut, unseen, as it would sabotage a beacon.
   */
  generator(cx: number, cz: number, rot = 0): this {
    const base = this.heightOf(cx, cz)
    this.solid('generator', cx, cz, 1.1, rot)
    this.generatorSpots.push({ x: cellMid(cx), y: base, z: cellMid(cz) })
    return this
  }

  /** A pile of salvage on the cell's top. */
  salvage(cx: number, cz: number, amount = 40, big = false): this {
    const h = this.heightOf(cx, cz)
    if (h === VOID) throw new Error(`[fortress ${this.id}] salvage at ${cx},${cz} is off the island`)
    this.piles.push({ x: cellMid(cx), y: h, z: cellMid(cz), amount, big })
    return this
  }

  /** A repair kit on the cell's top: it mends the mech's armor (#101). */
  kit(cx: number, cz: number): this {
    const h = this.heightOf(cx, cz)
    if (h === VOID) throw new Error(`[fortress ${this.id}] kit at ${cx},${cz} is off the island`)
    this.supplySpots.push({ kind: 'kit', x: cellMid(cx), y: h, z: cellMid(cz) })
    return this
  }

  /** An ammo crate on the cell's top: rifle rounds, the mini-gun's belt, a rocket (#76). */
  ammo(cx: number, cz: number): this {
    const h = this.heightOf(cx, cz)
    if (h === VOID) throw new Error(`[fortress ${this.id}] ammo at ${cx},${cz} is off the island`)
    this.supplySpots.push({ kind: 'crate', x: cellMid(cx), y: h, z: cellMid(cz) })
    return this
  }

  /**
   * An exploding barrel (#78): a red fuel drum on a pallet. Its cell is cover
   * until it goes up; the barrel draws itself (`models/supplies.ts`).
   */
  fuel(cx: number, cz: number): this {
    const base = this.heightOf(cx, cz)
    if (base === VOID) throw new Error(`[fortress ${this.id}] barrel at ${cx},${cz} is off the island`)
    this.set(cx, cz, base + BARREL_CELL_H, CellKind.Cover)
    this.grid.surf[cz * this.grid.w + cx] = Surf.Heap
    this.grid.base[cz * this.grid.w + cx] = base
    this.barrelSpots.push({ cx, cz, x: cellMid(cx), y: base, z: cellMid(cz) })
    return this
  }

  /** A pool of shadow over a rectangle of cells: the mech is slower to make out in it. */
  shadow(x0: number, z0: number, x1: number, z1: number): this {
    for (let cz = Math.min(z0, z1); cz <= Math.max(z0, z1); cz++) {
      for (let cx = Math.min(x0, x1); cx <= Math.max(x0, x1); cx++) {
        if (inGrid(this.grid, cx, cz)) this.grid.shade[cz * this.grid.w + cx]! |= Shade.Shadow
      }
    }
    return this
  }

  /**
   * A thicket, `len` cells along `dir`: a camo net on poles or a tangle of
   * cable. Walkable; crouched in it the mech is hidden but from right up close.
   */
  thicket(cx: number, cz: number, kind: 'net' | 'tangle', len = 1, dir: 'x' | 'z' = 'x'): this {
    for (let i = 0; i < len; i++) {
      const x = cx + (dir === 'x' ? i : 0)
      const z = cz + (dir === 'z' ? i : 0)
      const h = this.heightOf(x, z)
      if (h === VOID) throw new Error(`[fortress ${this.id}] thicket at ${x},${z} is off the island`)
      this.grid.shade[z * this.grid.w + x]! |= Shade.Brush | Shade.Shadow
      this.decor.push({ kind, x: cellMid(x), y: h, z: cellMid(z), rot: dir === 'x' ? 0 : Math.PI / 2 })
    }
    return this
  }

  /** A railing along the open edge of a ledge, `len` cells along `dir` (looks only). */
  rail(cx: number, cz: number, len = 1, dir: 'x' | 'z' = 'x'): this {
    for (let i = 0; i < len; i++) {
      const x = cx + (dir === 'x' ? i : 0)
      const z = cz + (dir === 'z' ? i : 0)
      this.decor.push({ kind: 'rail', x: cellMid(x), y: this.heightOf(x, z), z: cellMid(z), rot: dir === 'x' ? 0 : Math.PI / 2 })
    }
    return this
  }

  /**
   * Steel decking over the ground in a rectangle of cells (looks only).
   * `hazard`: with the warning paint of a gate or a pad.
   */
  deck(x0: number, z0: number, x1: number, z1: number, hazard = false): this {
    for (let cz = Math.min(z0, z1); cz <= Math.max(z0, z1); cz++) {
      for (let cx = Math.min(x0, x1); cx <= Math.max(x0, x1); cx++) {
        if (!inGrid(this.grid, cx, cz) || this.heightOf(cx, cz) === VOID) continue
        if (cellKind(this.grid, cx, cz) !== CellKind.Ground) continue
        this.grid.surf[cz * this.grid.w + cx] = hazard ? Surf.Hazard : Surf.Plate
      }
    }
    return this
  }

  /**
   * A heap of scrap: a cell wide, too high to see over crouched and low
   * enough to climb. It is cover like a container is; the heap draws itself,
   * so the mesh builder leaves the block underneath undrawn.
   */
  heap(cx: number, cz: number, rot = 0): this {
    const base = this.heightOf(cx, cz)
    if (base === VOID) throw new Error(`[fortress ${this.id}] heap at ${cx},${cz} is off the island`)
    this.set(cx, cz, base + HEAP_H, CellKind.Cover)
    this.grid.surf[cz * this.grid.w + cx] = Surf.Heap
    this.grid.base[cz * this.grid.w + cx] = base
    this.decor.push({ kind: 'heap', x: cellMid(cx), y: base, z: cellMid(cz), rot })
    return this
  }

  /**
   * A prop the mech cannot walk through: the cell under it is raised to `h`
   * (and left undrawn: the prop is what is seen).
   */
  solid(kind: DecorKind, cx: number, cz: number, h: number, rot = 0): this {
    const base = this.heightOf(cx, cz)
    if (base === VOID) throw new Error(`[fortress ${this.id}] ${kind} at ${cx},${cz} is off the island`)
    this.set(cx, cz, base + h, CellKind.Cover)
    this.grid.surf[cz * this.grid.w + cx] = Surf.Heap
    this.grid.base[cz * this.grid.w + cx] = base
    this.decor.push({ kind, x: cellMid(cx), y: base, z: cellMid(cz), rot })
    this.propBoxes(kind, cellMid(cx), base, cellMid(cz), rot)
    return this
  }

  /** The tall parts of a prop, turned with it, into the grid's boxes. */
  private propBoxes(kind: DecorKind, x: number, y: number, z: number, rot: number): void {
    const c = Math.cos(rot)
    const s = Math.sin(rot)
    for (const [x0, y0, z0, x1, y1, z1] of PROP_BOXES[kind] ?? []) {
      let ax = Infinity
      let az = Infinity
      let bx = -Infinity
      let bz = -Infinity
      for (const [lx, lz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) {
        // As three.js turns an object about y.
        const wx = lx * c + lz * s
        const wz = -lx * s + lz * c
        ax = Math.min(ax, wx); bx = Math.max(bx, wx)
        az = Math.min(az, wz); bz = Math.max(bz, wz)
      }
      addBox(this.grid, { x0: x + ax, y0: y + y0, z0: z + az, x1: x + bx, y1: y + y1, z1: z + bz })
    }
  }

  /** An Enforcer mech, dormant until the alarm. */
  enforcer(cx: number, cz: number, facing = 0, foreman = false): this {
    this.post('enforcer', [[cx, cz]], facing)
    if (foreman) this.posts[this.posts.length - 1]!.boss = 'foreman'
    return this
  }

  /**
   * The rocket lesson's target (#146): an armoured Enforcer that only a blast
   * hurts, powered down for good, with `hp` hit points.
   */
  rocketTarget(cx: number, cz: number, facing: number, hp: number): this {
    this.post('enforcer', [[cx, cz]], facing)
    Object.assign(this.posts[this.posts.length - 1]!, { armoured: true, dummy: true, hp })
    return this
  }

  /** The Goliath Tank: the target of a large fortress. */
  goliath(cx: number, cz: number, facing = 0): this {
    this.post('goliath', [[cx, cz]], facing)
    this.posts[this.posts.length - 1]!.boss = 'goliath'
    return this
  }

  /** Dressing with no gameplay: a lamp, an antenna. Stands on the cell's top. */
  prop(kind: DecorKind, cx: number, cz: number, rot = 0): this {
    const h = this.heightOf(cx, cz)
    if (h === VOID) throw new Error(`[fortress ${this.id}] ${kind} at ${cx},${cz} is off the island`)
    this.decor.push({ kind, x: cellMid(cx), y: h, z: cellMid(cz), rot })
    this.propBoxes(kind, cellMid(cx), h, cellMid(cz), rot)
    return this
  }

  /**
   * Close every hole in the ground (a notch, a crack, a pit shut in by
   * land) with open ground at the height of its highest land neighbour, so
   * no level shows the void through a gap. Repeated until nothing changes:
   * filling one notch can make its neighbour one.
   */
  seal(): this {
    const g = this.grid
    for (let pass = 0; pass < 8; pass++) {
      const holes = findHoles(g)
      if (holes.length === 0) break
      for (const i of holes) {
        const cx = i % g.w
        const cz = (i - cx) / g.w
        let h = 0
        let any = false
        for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]] as const) {
          if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.d) continue
          const nh = g.h[nz * g.w + nx]!
          // Floor height of what is beside it: a wall's foot is the ground.
          if (nh > VOID && g.kind[nz * g.w + nx] === CellKind.Ground) { h = any ? Math.min(h, nh) : nh; any = true }
        }
        this.set(cx, cz, any ? h : 0, CellKind.Ground)
      }
    }
    return this
  }

  /** This fortress's look (`data/themes.ts`). */
  look(theme: ThemeId): this {
    this.themeId = theme
    return this
  }

  build(): Fortress {
    if (!this.insertAt) throw new Error(`[fortress ${this.id}] no insertion point`)
    this.seal()
    if (!this.extractAt) throw new Error(`[fortress ${this.id}] no extraction point`)
    return {
      id: this.id,
      grid: this.grid,
      insert: this.insertAt,
      extract: this.extractAt,
      posts: this.posts,
      decor: this.decor,
      salvage: this.piles,
      beacons: this.beaconSpots,
      generators: this.generatorSpots,
      supplies: this.supplySpots,
      barrels: this.barrelSpots,
      theme: this.themeId,
      ...(this.withAirship ? { airship: true } : {})
    }
  }
}

/** World size of a fortress's grid along x and z, in metres. */
export const fortressSize = (f: Fortress): { x: number; z: number } => ({ x: f.grid.w * CELL, z: f.grid.d * CELL })
