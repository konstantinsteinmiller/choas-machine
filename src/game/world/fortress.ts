import { findHoles, CELL, cellHeight, CellKind, cellKind, cellMid, inGrid, makeGrid, Surf, VOID, type Grid } from './grid'

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

/** Heights the kit builds with, in metres. The mech stands 2.5 tall and
 *  crouches to 1.65, so cover hides it crouched and a wall hides it standing. */
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

export type PostKind = 'guard' | 'sentry' | 'commander' | 'drone' | 'searchlight' | 'enforcer' | 'goliath'

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
}

export type DecorKind =
  | 'lamp' | 'antenna' | 'barrel' | 'flag'
  | 'heap' | 'tires' | 'pipes' | 'crane' | 'generator' | 'girder' | 'tank' | 'spool' | 'stack' | 'cone'
export interface Decor { kind: DecorKind; x: number; y: number; z: number; rot: number }

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
}

const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const
export type Dir = keyof typeof DIRS

export class FortressBuilder {
  readonly grid: Grid
  private insertAt: (Point & { facing: number }) | null = null
  private extractAt: Point | null = null
  private posts: Post[] = []
  private decor: Decor[] = []
  private piles: SalvageSpot[] = []
  private beaconSpots: Array<{ x: number; y: number; z: number }> = []

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
  cover(cx: number, cz: number, len = 1, dir: 'x' | 'z' = 'x'): this {
    for (let i = 0; i < len; i++) this.set(cx + (dir === 'x' ? i : 0), cz + (dir === 'z' ? i : 0), COVER_H, CellKind.Cover)
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
  searchlight(cx: number, cz: number, sweep: Array<[number, number, number?]>): this {
    const top = this.heightOf(cx, cz)
    if (top === VOID) throw new Error(`[fortress ${this.id}] searchlight at ${cx},${cz} is off the island`)
    const route: Waypoint[] = sweep.map(([x, z, wait]) => ({ x: cellMid(x), z: cellMid(z), wait: wait ?? 1.2 }))
    const first = route[0] ?? { x: cellMid(cx), z: cellMid(cz) + 6 }
    this.posts.push({
      kind: 'searchlight', x: cellMid(cx), z: cellMid(cz), facing: Math.atan2(first.x - cellMid(cx), first.z - cellMid(cz)),
      route, altitude: top + SEARCHLIGHT_MAST
    })
    return this
  }

  /** An alarm beacon (a siren mast) on the cell's top. */
  beacon(cx: number, cz: number): this {
    const h = this.heightOf(cx, cz)
    if (h === VOID) throw new Error(`[fortress ${this.id}] beacon at ${cx},${cz} is off the island`)
    this.beaconSpots.push({ x: cellMid(cx), y: h, z: cellMid(cz) })
    return this
  }

  /** A pile of salvage on the cell's top. */
  salvage(cx: number, cz: number, amount = 40, big = false): this {
    const h = this.heightOf(cx, cz)
    if (h === VOID) throw new Error(`[fortress ${this.id}] salvage at ${cx},${cz} is off the island`)
    this.piles.push({ x: cellMid(cx), y: h, z: cellMid(cz), amount, big })
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
    this.decor.push({ kind, x: cellMid(cx), y: base, z: cellMid(cz), rot })
    return this
  }

  /** An Enforcer mech, dormant until the alarm. */
  enforcer(cx: number, cz: number, facing = 0, foreman = false): this {
    this.post('enforcer', [[cx, cz]], facing)
    if (foreman) this.posts[this.posts.length - 1]!.boss = 'foreman'
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
      beacons: this.beaconSpots
    }
  }
}

/** World size of a fortress's grid along x and z, in metres. */
export const fortressSize = (f: Fortress): { x: number; z: number } => ({ x: f.grid.w * CELL, z: f.grid.d * CELL })
