/**
 * ─── The height grid ─────────────────────────────────────────────────────────
 *
 * A fortress is a floating island cut into square cells, each with ONE top
 * height: the ground, a cover block, a wall you can walk along, a tower roof.
 * Everything spatial in the game asks this module: where can a body stand,
 * can it step from here to there, what does a bullet hit, can a guard see the
 * mech, which way does a patrol walk.
 *
 * It is pure: plain arrays in, numbers out, no three.js and no Vue, so every
 * rule below is unit-tested and the same code can run a balance simulation.
 *
 * Coordinates: world x and z in metres, the grid's corner at the origin, y up.
 * Cell (cx, cz) covers x in [cx·CELL, (cx+1)·CELL) and the same in z.
 * One height per cell means nothing can be walked under a BLOCK; ladders and
 * cables are links between cells, not cells, so they may cross above the
 * ground. A cell may also carry a ROOF (round 4, #96 #93): a slab overhead
 * that bodies walk under and may stand on, that stops rounds, sight, light and
 * the camera. A hole is a cell with no slab.
 */

/** Edge length of a cell in metres. */
export const CELL = 2
/** The height of a cell that is not part of the island: nothing stands there. */
export const VOID = -1000
/** Highest ledge a body walks up without climbing (a kerb, a stair tread). */
export const STEP_UP = 0.55
/** Deepest drop a body walks off without it counting as a fall. */
export const STEP_DOWN = 0.55
/** A roof slab's thickness (#96). */
export const ROOF_T = 0.4
/** A body this close under a roof's top, or above it, stands on the roof. */
const ROOF_SNAP = 0.9
/** Room under a roof: the slab's underside is at least this far over the floor (a mech, and its jump). */
export const ROOF_HEADROOM = 4

export const CellKind = {
  /** Open ground of the island. */
  Ground: 0,
  /** Low cover: a crate, a barrier. Chest-high, so a crouched mech hides. */
  Cover: 1,
  /** Structure: a wall, a building, a tower. Its top can be walked on. */
  Block: 2,
  /** A stair tread: rises one step per cell so a patrol can reach a wall. */
  Stair: 3,
  /** A marked pad: the insertion perch, the extraction point. */
  Pad: 4
} as const
export type CellKind = (typeof CellKind)[keyof typeof CellKind]

/** A ladder up the side of a block: stand in the low cell, climb to the high. */
export interface Ladder {
  /** The low cell, at the foot. */
  cx: number
  cz: number
  /** Direction from the foot to the block it climbs: one of (±1, 0), (0, ±1). */
  dx: number
  dz: number
}

/** A cable between two high points, walked like a tightrope. */
export interface Cable {
  ax: number
  az: number
  bx: number
  bz: number
}

export interface Grid {
  /** Cells along x. */
  w: number
  /** Cells along z. */
  d: number
  /** Top height per cell, row-major (`cz * w + cx`), or VOID. */
  h: Float32Array
  kind: Uint8Array
  /** How each cell's top is DRESSED (`Surf`): looks only, never the rules. */
  surf: Uint8Array
  /** Cover of another kind (`Shade`): a pool of shadow, a thicket to crouch in. */
  shade: Uint8Array
  /**
   * Under a solid prop (`Surf.Heap`): the height of the floor it stands on,
   * below the raised top the rules use. VOID elsewhere. Looks only: the mesh
   * draws the floor and the faces down from there (#79).
   */
  base: Float32Array
  /**
   * Tall props the cells do not carry (a crane's mast and boom, lamp posts,
   * vent stacks above their collision block): boxes that stop rounds, sight
   * and the camera like a wall does (#69). `boxAt` lists, per cell, the boxes
   * that reach into it.
   */
  boxes: Box[]
  boxAt: Map<number, number[]>
  /** A roof slab's underside per cell, or VOID for open sky (#96). Its top is `ROOF_T` higher. */
  roof: Float32Array
  ladders: Ladder[]
  cables: Cable[]
}

/**
 * The dressing of a cell's top. The simulation never reads it.
 * `Plate`: steel decking instead of bare ground. `Hazard`: decking with a
 * warning border (gates, pads). `Heap`: a solid prop stands on the cell and
 * draws it itself, so the mesh builder leaves the block out.
 */
export const Surf = { Bare: 0, Plate: 1, Hazard: 2, Heap: 3 } as const
export type Surf = (typeof Surf)[keyof typeof Surf]

/**
 * Cover that is not a wall (round 3, after Odyssey): bit flags per cell.
 * `Shadow`: a pool of shadow, where the mech is slower to make out.
 * `Brush`: a thicket (a camo net, a tangle of cable): crouched in it the mech
 * is not seen at all unless somebody is right on top of it.
 */
export const Shade = { None: 0, Shadow: 1, Brush: 2 } as const

export const shadeAt = (g: Grid, x: number, z: number): number => {
  const cx = Math.floor(x / CELL)
  const cz = Math.floor(z / CELL)
  return cx >= 0 && cz >= 0 && cx < g.w && cz < g.d ? g.shade[cz * g.w + cx]! : 0
}

export const cellSurf = (g: Grid, cx: number, cz: number): Surf =>
  cx >= 0 && cz >= 0 && cx < g.w && cz < g.d ? (g.surf[cz * g.w + cx]! as Surf) : Surf.Bare

export const makeGrid = (w: number, d: number): Grid => ({
  w,
  d,
  h: new Float32Array(w * d).fill(VOID),
  kind: new Uint8Array(w * d),
  surf: new Uint8Array(w * d),
  shade: new Uint8Array(w * d),
  base: new Float32Array(w * d).fill(VOID),
  boxes: [],
  boxAt: new Map(),
  roof: new Float32Array(w * d).fill(VOID),
  ladders: [],
  cables: []
})

export const inGrid = (g: Grid, cx: number, cz: number): boolean => cx >= 0 && cz >= 0 && cx < g.w && cz < g.d

/** Top height of a cell; VOID outside the grid. */
export const cellHeight = (g: Grid, cx: number, cz: number): number =>
  inGrid(g, cx, cz) ? g.h[cz * g.w + cx]! : VOID

export const cellKind = (g: Grid, cx: number, cz: number): CellKind =>
  inGrid(g, cx, cz) ? (g.kind[cz * g.w + cx]! as CellKind) : CellKind.Ground

export const toCell = (v: number): number => Math.floor(v / CELL)
/** World coordinate of a cell's centre along one axis. */
export const cellMid = (c: number): number => (c + 0.5) * CELL

/** Height of the surface under a world position; VOID off the island. */
export const heightAt = (g: Grid, x: number, z: number): number => cellHeight(g, toCell(x), toCell(z))

/**
 * Where a cable leaves its first end's platform and reaches its second's, as
 * fractions of the way from one cell's middle to the other's: the
 * line runs from edge to edge, the mech walks flat to the edge first.
 */
/**
 * Where a cable's line is strung (m): from one platform's edge to the
 * other's, at foot height. The rope the gun shoots and the ropes a fortress
 * is built with are drawn from these, by one builder (`fx/ropeLine.ts`).
 */
export const cableEnds = (g: Grid, c: Cable): { ax: number; ay: number; az: number; bx: number; by: number; bz: number } => {
  const ax = cellMid(c.ax)
  const az = cellMid(c.az)
  const bx = cellMid(c.bx)
  const bz = cellMid(c.bz)
  const s = cableSpan(g, c)
  return {
    ax: ax + (bx - ax) * s.ta, ay: cellHeight(g, c.ax, c.az) + 0.06, az: az + (bz - az) * s.ta,
    bx: ax + (bx - ax) * s.tb, by: cellHeight(g, c.bx, c.bz) + 0.06, bz: az + (bz - az) * s.tb
  }
}

export const cableSpan = (g: Grid, c: Cable): { ta: number; tb: number } => {
  const ax = cellMid(c.ax)
  const az = cellMid(c.az)
  const bx = cellMid(c.bx)
  const bz = cellMid(c.bz)
  const ay = cellHeight(g, c.ax, c.az)
  const by = cellHeight(g, c.bx, c.bz)
  const len = Math.hypot(bx - ax, bz - az)
  const n = Math.max(2, Math.ceil(len / 0.05))
  const on = (t: number, y: number): boolean => Math.abs(heightAt(g, ax + (bx - ax) * t, az + (bz - az) * t) - y) < 0.05
  let ta = 0
  while (ta < 1 && on(ta + 1 / n, ay)) ta += 1 / n
  let tb = 1
  while (tb > ta && on(tb - 1 / n, by)) tb -= 1 / n
  return { ta: Math.min(ta, tb), tb }
}

/** A cable's height at fraction `t` of the way: flat over each platform, straight from edge to edge. */
export const cableY = (ay: number, by: number, s: { ta: number; tb: number }, t: number): number => {
  if (t <= s.ta) return ay
  if (t >= s.tb) return by
  return ay + (by - ay) * ((t - s.ta) / Math.max(1e-6, s.tb - s.ta))
}

/** A cell's roof underside, or VOID (open sky, or a hole). */
export const roofAt = (g: Grid, cx: number, cz: number): number => (inGrid(g, cx, cz) ? g.roof[cz * g.w + cx]! : VOID)

/**
 * What a body at height `y` stands on in a cell: the roof's top when it is on
 * (or just over) the roof, the cell's own top otherwise. Bodies under a roof
 * see only the floor; the mech on a roof walks it (#96).
 */
export const surfaceAt = (g: Grid, cx: number, cz: number, y: number): number => {
  const r = roofAt(g, cx, cz)
  if (r !== VOID && y >= r + ROOF_T - ROOF_SNAP) return r + ROOF_T
  return cellHeight(g, cx, cz)
}

/** `surfaceAt` for a world position. */
export const floorAt = (g: Grid, x: number, z: number, y: number): number => surfaceAt(g, toCell(x), toCell(z), y)

/**
 * The underside of the roof over a body standing at `y`, or Infinity: what a
 * jump hits its head on.
 */
export const ceilingAt = (g: Grid, x: number, z: number, y: number): number => {
  const r = roofAt(g, toCell(x), toCell(z))
  return r !== VOID && y < r ? r : Infinity
}

/**
 * Lay a roof over cells [cx0..cx1] × [cz0..cz1] with its underside at
 * `under`, leaving out the `holes` (cells). The slabs go in as boxes too, so
 * every ray (a round, a guard's eye, a light pool, the camera) stops at them.
 */
export const addRoof = (
  g: Grid, cx0: number, cz0: number, cx1: number, cz1: number, under: number,
  holes: ReadonlyArray<readonly [number, number]> = []
): void => {
  const hole = new Set(holes.map(([x, z]) => `${x},${z}`))
  for (let cz = Math.min(cz0, cz1); cz <= Math.max(cz0, cz1); cz++) {
    // One box per run of slab along x: few boxes, rays stay cheap.
    let run = -1
    const close = (end: number): void => {
      if (run < 0) return
      addBox(g, { x0: run * CELL, y0: under, z0: cz * CELL, x1: end * CELL - 1e-4, y1: under + ROOF_T, z1: (cz + 1) * CELL - 1e-4 })
      run = -1
    }
    for (let cx = Math.min(cx0, cx1); cx <= Math.max(cx0, cx1) + 1; cx++) {
      const on = cx <= Math.max(cx0, cx1) && inGrid(g, cx, cz) && !hole.has(`${cx},${cz}`)
      if (on) {
        g.roof[cz * g.w + cx] = under
        if (run < 0) run = cx
      } else close(cx)
    }
  }
}

// ─── Standing and moving ─────────────────────────────────────────────────────

export interface MoveRule {
  /** Highest rise the body takes in its stride. */
  up: number
  /** Deepest drop it takes. A patrol keeps to `STEP_DOWN`; the mech drops off
   *  ledges, so it passes a large number. */
  down: number
}

export const WALK: MoveRule = { up: STEP_UP, down: STEP_DOWN }

/** May a body standing at height `from` move onto a surface at height `to`? */
export const canStep = (from: number, to: number, rule: MoveRule = WALK): boolean =>
  to !== VOID && to - from <= rule.up + 1e-6 && from - to <= rule.down + 1e-6

/**
 * Move a circle of radius `r` standing at height `y` by (dx, dz) and return
 * where it ends up, sliding along anything it may not step onto.
 *
 * Each blocking cell near the new position pushes the circle out along the
 * shortest way, so a body rubbing a wall glides and a body walking into a
 * corner rounds it instead of sticking on it. Two passes settle the case of
 * two walls meeting.
 */
export const moveCircle = (
  g: Grid, x: number, z: number, y: number, dx: number, dz: number, r: number, rule: MoveRule = WALK
): { x: number; z: number } => {
  // A move longer than the body is taken in strides shorter than its radius,
  // so the centre can never jump INTO a blocking cell and be pushed out the
  // far side (a dash, a knock-back, a long frame).
  const len = Math.hypot(dx, dz)
  const strides = Math.max(1, Math.ceil(len / (r * 0.9)))
  if (strides > 1) {
    let p = { x, z }
    for (let i = 0; i < strides; i++) p = moveCircle(g, p.x, p.z, y, dx / strides, dz / strides, r, rule)
    return p
  }
  let nx = x + dx
  let nz = z + dz
  for (let pass = 0; pass < 2; pass++) {
    const c0x = toCell(nx - r)
    const c1x = toCell(nx + r)
    const c0z = toCell(nz - r)
    const c1z = toCell(nz + r)
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (canStep(y, surfaceAt(g, cx, cz, y), rule)) continue
        // Closest point of the blocking cell to the circle's centre.
        const px = Math.max(cx * CELL, Math.min(nx, (cx + 1) * CELL))
        const pz = Math.max(cz * CELL, Math.min(nz, (cz + 1) * CELL))
        let ox = nx - px
        let oz = nz - pz
        const d2 = ox * ox + oz * oz
        if (d2 >= r * r) continue
        if (d2 > 1e-12) {
          const dist = Math.sqrt(d2)
          const push = (r - dist) / dist
          nx += ox * push
          nz += oz * push
        } else {
          // The centre is inside the cell: leave by the nearest side.
          const l = nx - cx * CELL
          const rr = (cx + 1) * CELL - nx
          const t = nz - cz * CELL
          const b = (cz + 1) * CELL - nz
          const m = Math.min(l, rr, t, b)
          ox = m === l ? -1 : m === rr ? 1 : 0
          oz = m === t ? -1 : m === b ? 1 : 0
          nx += ox * (m + r)
          nz += oz * (m + r)
        }
      }
    }
  }
  return { x: nx, z: nz }
}

// ─── Rays: bullets and sight ─────────────────────────────────────────────────

/** An axis-aligned box in the world (metres). */
export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

/** Put a solid box in the grid: rays stop at it from now on. */
export const addBox = (g: Grid, b: Box): void => {
  const i = g.boxes.length
  g.boxes.push(b)
  for (let cz = toCell(b.z0); cz <= toCell(b.z1); cz++) {
    for (let cx = toCell(b.x0); cx <= toCell(b.x1); cx++) {
      if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.d) continue
      const k = cz * g.w + cx
      const list = g.boxAt.get(k)
      if (list) list.push(i)
      else g.boxAt.set(k, [i])
    }
  }
}

/** Where a ray enters a box, between `tMin` and `tMax`, or −1 (slab test). Writes the face's normal to `n`. */
const enterBox = (b: Box, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tMin: number, tMax: number, n: number[]): number => {
  let t0 = tMin
  let t1 = tMax
  let axis = -1
  let sign = 0
  const lo = [b.x0, b.y0, b.z0]
  const hi = [b.x1, b.y1, b.z1]
  const o = [ox, oy, oz]
  const d = [dx, dy, dz]
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]!) < 1e-12) {
      if (o[a]! < lo[a]! || o[a]! > hi[a]!) return -1
      continue
    }
    const inv = 1 / d[a]!
    let ta = (lo[a]! - o[a]!) * inv
    let tb = (hi[a]! - o[a]!) * inv
    let s = -1
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; s = 1 }
    if (ta > t0) { t0 = ta; axis = a; sign = s }
    if (tb < t1) t1 = tb
    if (t0 > t1) return -1
  }
  n[0] = axis === 0 ? sign : 0
  n[1] = axis === 1 ? sign : axis === -1 ? 1 : 0
  n[2] = axis === 2 ? sign : 0
  return t0
}
const _n = [0, 0, 0]

export interface RayHit {
  hit: boolean
  /** Distance along the ray to the hit, or `maxDist` when nothing was hit. */
  t: number
  /** Surface normal at the hit (unit, axis-aligned). */
  nx: number
  ny: number
  nz: number
}

/**
 * Cast a ray through the height grid. The direction must be a unit vector.
 *
 * A cell is a solid column from far below up to its top, so within the span
 * the ray spends over a cell it is blocked wherever it is under that top: at
 * the entry if it comes in below it (a wall face), or part-way if it sinks to
 * the top inside the cell (a roof or the ground). VOID cells block nothing.
 */
export const raycast = (
  g: Grid, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number
): RayHit => {
  let cx = toCell(ox)
  let cz = toCell(oz)
  const stepX = dx > 0 ? 1 : -1
  const stepZ = dz > 0 ? 1 : -1
  const invX = dx !== 0 ? 1 / Math.abs(dx) : Infinity
  const invZ = dz !== 0 ? 1 / Math.abs(dz) : Infinity
  // Distance along the ray to the next cell boundary on each axis.
  let tMaxX = dx !== 0 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL)) * invX : Infinity
  let tMaxZ = dz !== 0 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL)) * invZ : Infinity
  const tDeltaX = CELL * invX
  const tDeltaZ = CELL * invZ
  let t0 = 0
  // Which face the ray entered the current cell through (0 = none: the start).
  let enterAxis = 0

  for (;;) {
    const t1 = Math.min(tMaxX, tMaxZ, maxDist)
    const top = cellHeight(g, cx, cz)
    // A tall prop reaching into this cell, met before anything the cell has.
    const props = g.boxes.length > 0 && cx >= 0 && cz >= 0 && cx < g.w && cz < g.d ? g.boxAt.get(cz * g.w + cx) : undefined
    let bt = Infinity
    let bnx = 0
    let bny = 0
    let bnz = 0
    if (props) {
      for (const bi of props) {
        const t = enterBox(g.boxes[bi]!, ox, oy, oz, dx, dy, dz, t0, t1, _n)
        if (t >= 0 && t < bt) { bt = t; bnx = _n[0]!; bny = _n[1]!; bnz = _n[2]! }
      }
    }
    if (top !== VOID) {
      const y0 = oy + dy * t0
      if (y0 < top - 1e-9) {
        // Under the top on entry: the cell's side (or the start is inside it).
        if (enterAxis === 1) return { hit: true, t: t0, nx: -stepX, ny: 0, nz: 0 }
        if (enterAxis === 2) return { hit: true, t: t0, nx: 0, ny: 0, nz: -stepZ }
        return { hit: true, t: 0, nx: 0, ny: 1, nz: 0 }
      }
      const y1 = oy + dy * t1
      if (y1 < top && dy < 0) {
        // Sinks through the top inside this cell (unless a prop is first).
        const t = (top - oy) / dy
        if (bt < t) return { hit: true, t: bt, nx: bnx, ny: bny, nz: bnz }
        return { hit: true, t, nx: 0, ny: 1, nz: 0 }
      }
    }
    if (bt < Infinity) return { hit: true, t: bt, nx: bnx, ny: bny, nz: bnz }
    if (t1 >= maxDist) break
    if (tMaxX < tMaxZ) {
      cx += stepX
      tMaxX += tDeltaX
      enterAxis = 1
    } else {
      cz += stepZ
      tMaxZ += tDeltaZ
      enterAxis = 2
    }
    t0 = t1
    // Left the island's box for good: nothing further out can be hit.
    if ((cx < 0 && stepX < 0) || (cx >= g.w && stepX > 0) || (cz < 0 && stepZ < 0) || (cz >= g.d && stepZ > 0)) break
  }
  return { hit: false, t: maxDist, nx: 0, ny: 0, nz: 0 }
}

/** Is there a clear straight line between two points? */
export const hasLineOfSight = (
  g: Grid, ax: number, ay: number, az: number, bx: number, by: number, bz: number
): boolean => {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len = Math.hypot(dx, dy, dz)
  if (len < 1e-6) return true
  // Stop a hair short of the target, which stands ON a surface.
  return !raycast(g, ax, ay, az, dx / len, dy / len, dz / len, len - 0.02).hit
}

// ─── Paths for patrols ───────────────────────────────────────────────────────

const SQRT2 = Math.SQRT2

/** May a walker go straight from one cell to an adjacent one (8 directions)?
 *  A diagonal needs both of its orthogonal neighbours open: no corner cutting
 *  through the edge of a wall. */
export const cellsLinked = (g: Grid, cx: number, cz: number, nx: number, nz: number, rule: MoveRule = WALK): boolean => {
  const from = cellHeight(g, cx, cz)
  if (from === VOID) return false
  if (!canStep(from, cellHeight(g, nx, nz), rule)) return false
  if (nx !== cx && nz !== cz) {
    return canStep(from, cellHeight(g, nx, cz), rule) && canStep(from, cellHeight(g, cx, nz), rule)
  }
  return true
}

/**
 * A* over cells, 8-connected. Returns the cells from start to goal inclusive,
 * or an empty array when the goal cannot be reached within `maxNodes`.
 */
export const findPath = (
  g: Grid, sx: number, sz: number, tx: number, tz: number, rule: MoveRule = WALK, maxNodes = 4000
): Array<{ cx: number; cz: number }> => {
  if (!inGrid(g, sx, sz) || !inGrid(g, tx, tz)) return []
  if (cellHeight(g, sx, sz) === VOID || cellHeight(g, tx, tz) === VOID) return []
  const n = g.w * g.d
  const start = sz * g.w + sx
  const goal = tz * g.w + tx
  const cost = new Float32Array(n).fill(Infinity)
  const from = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  // Binary heap of cell indices keyed by f = cost + heuristic.
  const heap: number[] = []
  const f = new Float32Array(n)
  const heur = (i: number): number => {
    const ax = Math.abs((i % g.w) - tx)
    const az = Math.abs(Math.floor(i / g.w) - tz)
    return Math.max(ax, az) + (SQRT2 - 1) * Math.min(ax, az)
  }
  const push = (i: number): void => {
    heap.push(i)
    let c = heap.length - 1
    while (c > 0) {
      const p = (c - 1) >> 1
      if (f[heap[p]!]! <= f[heap[c]!]!) break
      const t = heap[p]!
      heap[p] = heap[c]!
      heap[c] = t
      c = p
    }
  }
  const pop = (): number => {
    const top = heap[0]!
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let p = 0
      for (;;) {
        const l = p * 2 + 1
        const r = l + 1
        let m = p
        if (l < heap.length && f[heap[l]!]! < f[heap[m]!]!) m = l
        if (r < heap.length && f[heap[r]!]! < f[heap[m]!]!) m = r
        if (m === p) break
        const t = heap[p]!
        heap[p] = heap[m]!
        heap[m] = t
        p = m
      }
    }
    return top
  }

  cost[start] = 0
  f[start] = heur(start)
  push(start)
  let expanded = 0
  while (heap.length > 0) {
    const cur = pop()
    if (cur === goal) break
    if (closed[cur]) continue
    closed[cur] = 1
    if (++expanded > maxNodes) return []
    const cx = cur % g.w
    const cz = Math.floor(cur / g.w)
    for (let oz = -1; oz <= 1; oz++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oz === 0) continue
        const nx = cx + ox
        const nz = cz + oz
        if (!inGrid(g, nx, nz)) continue
        const ni = nz * g.w + nx
        if (closed[ni] || !cellsLinked(g, cx, cz, nx, nz, rule)) continue
        const c = cost[cur]! + (ox !== 0 && oz !== 0 ? SQRT2 : 1)
        if (c < cost[ni]!) {
          cost[ni] = c
          from[ni] = cur
          f[ni] = c + heur(ni)
          push(ni)
        }
      }
    }
  }
  if (from[goal] === -1 && goal !== start) return []
  const out: Array<{ cx: number; cz: number }> = []
  for (let i = goal; i !== -1; i = from[i]!) out.push({ cx: i % g.w, cz: Math.floor(i / g.w) })
  return out.reverse()
}

/**
 * Can a walker go in a straight line between two world points? Sampled at a
 * quarter cell, each sample must be steppable from the one before.
 */
export const walkLine = (g: Grid, ax: number, az: number, bx: number, bz: number, rule: MoveRule = WALK): boolean => {
  const len = Math.hypot(bx - ax, bz - az)
  const steps = Math.max(1, Math.ceil(len / (CELL * 0.25)))
  let prev = heightAt(g, ax, az)
  if (prev === VOID) return false
  let pcx = toCell(ax)
  let pcz = toCell(az)
  for (let i = 1; i <= steps; i++) {
    const k = i / steps
    const x = ax + (bx - ax) * k
    const z = az + (bz - az) * k
    const cx = toCell(x)
    const cz = toCell(z)
    if (cx === pcx && cz === pcz) continue
    if (!cellsLinked(g, pcx, pcz, cx, cz, rule)) return false
    prev = cellHeight(g, cx, cz)
    pcx = cx
    pcz = cz
  }
  return prev !== VOID
}

/**
 * Turn a cell path into the few world points a walker actually steers for:
 * every point that can be reached in a straight line from the last kept one
 * is skipped, so a patrol crosses a yard on the diagonal rather than in
 * staircase steps.
 */
export const smoothPath = (
  g: Grid, cells: ReadonlyArray<{ cx: number; cz: number }>, rule: MoveRule = WALK
): Array<{ x: number; z: number }> => {
  const pts = cells.map(c => ({ x: cellMid(c.cx), z: cellMid(c.cz) }))
  if (pts.length <= 2) return pts
  const out = [pts[0]!]
  let anchor = 0
  for (let i = 2; i < pts.length; i++) {
    const a = pts[anchor]!
    const b = pts[i]!
    if (!walkLine(g, a.x, a.z, b.x, b.z, rule)) {
      out.push(pts[i - 1]!)
      anchor = i - 1
    }
  }
  out.push(pts[pts.length - 1]!)
  return out
}

/**
 * Holes in the ground: void cells that read as a pit or a crack instead of
 * as the edge of the world. A void with land on two opposite sides (a notch
 * at most three cells across), with land on three sides, or one shut in by land
 * so that it cannot be reached from the map's edge through other voids.
 * Returns their indices.
 */
export const findHoles = (g: Grid): number[] => {
  const { w, d } = g
  const land = (cx: number, cz: number): boolean => cx >= 0 && cz >= 0 && cx < w && cz < d && g.h[cz * w + cx]! > VOID
  // Voids that reach the map's edge through voids.
  const open = new Uint8Array(w * d)
  const stack: number[] = []
  for (let cx = 0; cx < w; cx++) for (const cz of [0, d - 1]) if (!land(cx, cz)) { open[cz * w + cx] = 1; stack.push(cz * w + cx) }
  for (let cz = 0; cz < d; cz++) for (const cx of [0, w - 1]) if (!land(cx, cz) && !open[cz * w + cx]) { open[cz * w + cx] = 1; stack.push(cz * w + cx) }
  while (stack.length) {
    const i = stack.pop()!
    const cx = i % w
    const cz = (i - cx) / w
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]] as const) {
      if (nx < 0 || nz < 0 || nx >= w || nz >= d) continue
      const j = nz * w + nx
      if (open[j] || land(nx, nz)) continue
      open[j] = 1
      stack.push(j)
    }
  }
  const holes: number[] = []
  for (let cz = 0; cz < d; cz++) {
    for (let cx = 0; cx < w; cx++) {
      if (land(cx, cz)) continue
      const i = cz * w + cx
      // Land on both sides across a gap of at most three cells makes a notch
      // or a crevice (a channel between an outcrop and the island).
      const near = (dx: number, dz: number): boolean => land(cx + dx, cz + dz) || land(cx + 2 * dx, cz + 2 * dz) || land(cx + 3 * dx, cz + 3 * dz)
      const gap = (dx: number, dz: number): boolean => {
        // How far land is on each side, and whether together they span at most three voids.
        let a = 0
        while (a < 3 && !land(cx + (a + 1) * dx, cz + (a + 1) * dz)) a++
        let b = 0
        while (b < 3 && !land(cx - (b + 1) * dx, cz - (b + 1) * dz)) b++
        return near(dx, dz) && near(-dx, -dz) && a + b + 1 <= 3
      }
      const sides = [land(cx + 1, cz), land(cx - 1, cz), land(cx, cz + 1), land(cx, cz - 1)].filter(Boolean).length
      if (!open[i] || sides >= 3 || gap(1, 0) || gap(0, 1)) holes.push(i)
    }
  }
  return holes
}
