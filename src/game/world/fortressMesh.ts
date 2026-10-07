import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh } from 'three'
import { CELL, CellKind, ROOF_T, Surf, VOID, cableEnds, cellHeight, cellKind, cellSurf, roofAt, type Grid, Shade } from './grid'
import { buildRopeLines } from '../fx/ropeLine'
import type { Fortress } from './fortress'
import { levelGlowMaterial, glowVC } from '../models/toon'
import { merge } from '../models/kit'
import { levelAtlas } from './textures'
import { noSlice, type Slice } from '../engine/slicer'

/**
 * ─── The fortress as geometry ────────────────────────────────────────────────
 *
 * The height grid drawn as a scrapyard fortress: every structure's top edge
 * is chamfered (no razor-edged cubes), walls are welded from two-metre steel
 * plates that differ a little from one to the next (and some are rust), the
 * tall ones carry stiffening ribs and a row of spikes along the lip, cover
 * is shipping containers, and the ground is bare except where decking has
 * been laid.
 *
 * Colour is per vertex; ONE detail atlas (`textures.ts`: floor plate, wall
 * plate, container side, blank) is multiplied over it, so a chunk is still a
 * single draw call. Two cheap kinds of depth are baked into the colours:
 * corners darken where a taller neighbour stands over them, and walls darken
 * toward their foot.
 *
 * The island is cut into CHUNKS of 8 × 8 cells (16 m). Each chunk is ONE lit
 * mesh and at most one glowing mesh, with its own bounding sphere, so three's
 * frustum culling drops whole chunks: through the sniper scope's narrow view
 * only the few chunks in the reticle are drawn.
 */

/** Cells per chunk side. */
export const CHUNK = 8

/** The look of a base: its colours, per surface. sRGB hex. */
export interface Theme {
  groundA: string
  groundB: string
  rim: string
  cliffTop: string
  cliffFoot: string
  /** Decking laid over the ground, and the warning paint round a gate or a pad. */
  plate: string
  hazard: string
  blockTop: string
  /** Wall plates: most are one of the first two; a few are `rust`. */
  blockSide: string
  blockSideAlt: string
  rust: string
  blockFoot: string
  /** Containers come in these colours, one per run of cover. */
  cover: readonly string[]
  stair: string
  pad: string
  rib: string
  spike: string
  trimWall: string
  trimTower: string
  ladder: string
}

/** Gunmetal and rust under the game's own violet dusk, with its two neons. */
export const SCRAPYARD: Theme = {
  groundA: '#8b7ccf',
  groundB: '#8272c6',
  rim: '#a094e6',
  cliffTop: '#6352ad',
  cliffFoot: '#2a1d5c',
  plate: '#b7b0e0',
  hazard: '#ffd23f',
  blockTop: '#c1bbe6',
  blockSide: '#8b86b8',
  blockSideAlt: '#7a74ab',
  rust: '#b96b4d',
  blockFoot: '#4a4378',
  cover: ['#4fb2c4', '#d0764a', '#e0b23c', '#7a74c8'],
  stair: '#b0a8de',
  pad: '#ff86cb',
  rib: '#5a5490',
  spike: '#3f3870',
  trimWall: '#ff5fb7',
  trimTower: '#5fe9ff',
  ladder: '#5fe9ff'
}
/** The name the rest of the game has always used for the default look. */
export const SYNTHWAVE = SCRAPYARD

/**
 * The island's edge: a sheer lip, then rock tapering in under the island.
 * Both hang from the island's lowest floor, the same for every cell, so a
 * wall or a tower standing on the edge runs its face all the way down and
 * the skirts of neighbouring cells meet.
 */
/** A cell in a pool of shadow is drawn this much darker. */
const SHADOW_DARK = 0.62
const LIP_DEPTH = 2.6
const SKIRT_DEPTH = 11
const SKIRT_TUCK = 0.3
/** How much one taller neighbour darkens a corner. */
const AO_STEP = 0.13
/** How dark a side face gets at its foot. */
const FOOT_SHADE = 0.74
/** The chamfer on a structure's top edge, metres. */
export const BEVEL = 0.14
const BEVEL_STAIR = 0.06
/** A wall this much higher than what is next to it gets ribs and spikes. */
const TALL = 3
/** Share of wall plates that are rust. */
const RUST_SHARE = 0.11

/** The atlas cells, left to right. */
const CELL_FLOOR = 0
const CELL_WALL = 1
const CELL_CRATE = 2
const CELL_BLANK = 3
const ATLAS_N = 4
/** Kept off each cell's edge, so filtering never bleeds a neighbour in. */
const UV_PAD = 0.012

/** A float list that grows by doubling, written straight into its typed array (#36). */
class Floats {
  a = new Float32Array(1024)
  length = 0
  push(...v: number[]): void {
    if (this.length + v.length > this.a.length) {
      const b = new Float32Array(Math.max(this.a.length * 2, this.length + v.length))
      b.set(this.a)
      this.a = b
    }
    for (let i = 0; i < v.length; i++) this.a[this.length++] = v[i]!
  }
  get array(): Float32Array { return this.a.subarray(0, this.length) }
}
/** The same for indices. */
class Indices {
  a = new Uint32Array(1024)
  length = 0
  push(...v: number[]): void {
    if (this.length + v.length > this.a.length) {
      const b = new Uint32Array(Math.max(this.a.length * 2, this.length + v.length))
      b.set(this.a)
      this.a = b
    }
    for (let i = 0; i < v.length; i++) this.a[this.length++] = v[i]!
  }
}

/**
 * A growing list of quads: positions, face normals, vertex colours, uvs,
 * indices. Round 5 (#36): written into typed arrays as it grows; plain arrays
 * converted at the end were a third of a second of a throttled boot.
 */
class Quads {
  pos = new Floats()
  nor = new Floats()
  col = new Floats()
  uv = new Floats()
  idx = new Indices()

  /**
   * Four corners in counter-clockwise order seen from the front. `cell` is
   * the atlas cell; `v0`/`v1` the share of its height the quad spans (a wall
   * panel shorter than two metres shows only its lower part).
   */
  add(
    p: readonly number[], n: readonly [number, number, number],
    c0: Color, c1: Color, c2: Color, c3: Color,
    cell = CELL_BLANK, v0 = 0, v1 = 1
  ): void {
    const base = this.pos.length / 3
    for (let i = 0; i < 12; i++) this.pos.push(p[i]!)
    for (let i = 0; i < 4; i++) this.nor.push(n[0], n[1], n[2])
    for (const c of [c0, c1, c2, c3]) this.col.push(c.r, c.g, c.b)
    const u0 = (cell + UV_PAD) / ATLAS_N
    const u1 = (cell + 1 - UV_PAD) / ATLAS_N
    const a = UV_PAD + v0 * (1 - 2 * UV_PAD)
    const b = UV_PAD + v1 * (1 - 2 * UV_PAD)
    // Sides arrive top-left, bottom-left, bottom-right, top-right; tops in the
    // same turn order. Either way corner 0 and 3 share `b`, 1 and 2 share `a`.
    this.uv.push(u0, b, u0, a, u1, a, u1, b)
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  /** A triangle (a spike's flank). */
  tri(p: readonly number[], n: readonly [number, number, number], c: Color): void {
    const base = this.pos.length / 3
    for (let i = 0; i < 9; i++) this.pos.push(p[i]!)
    for (let i = 0; i < 3; i++) this.nor.push(n[0], n[1], n[2])
    for (let i = 0; i < 3; i++) this.col.push(c.r, c.g, c.b)
    const u = (CELL_BLANK + 0.5) / ATLAS_N
    this.uv.push(u, 0.5, u, 0.5, u, 0.5)
    this.idx.push(base, base + 1, base + 2)
  }

  get empty(): boolean {
    return this.idx.length === 0
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(this.pos.a.slice(0, this.pos.length), 3))
    g.setAttribute('normal', new BufferAttribute(this.nor.a.slice(0, this.nor.length), 3))
    g.setAttribute('color', new BufferAttribute(this.col.a.slice(0, this.col.length), 3))
    g.setAttribute('uv', new BufferAttribute(this.uv.a.slice(0, this.uv.length), 2))
    const verts = this.pos.length / 3
    const idx = this.idx.a.subarray(0, this.idx.length)
    g.setIndex(new BufferAttribute(verts > 65535 ? idx.slice() : Uint16Array.from(idx), 1))
    g.computeBoundingSphere()
    return g
  }
}

const shade = (c: Color, k: number): Color => c.clone().multiplyScalar(k)

/** A number in 0 … 1 that belongs to a cell (and a slot on it), the same every time. */
const hash = (cx: number, cz: number, k = 0): number => {
  let h = (Math.imul(cx + 1013, 73856093) ^ Math.imul(cz + 337, 19349663) ^ Math.imul(k + 7, 83492791)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  return (h % 10007) / 10007
}

interface Palette {
  ground: (cx: number, cz: number, rim: boolean) => Color
  plate: Color
  hazard: Color
  blockTop: Color
  blockSide: Color
  blockSideAlt: Color
  rust: Color
  blockFoot: Color
  cover: Color[]
  stair: Color
  pad: Color
  rib: Color
  spike: Color
  cliffTop: Color
  cliffFoot: Color
  trimWall: Color
  trimTower: Color
  ladder: Color
}

const palette = (t: Theme): Palette => {
  const c = (hex: string): Color => new Color(hex)
  const groundA = c(t.groundA)
  const groundB = c(t.groundB)
  const rim = c(t.rim)
  const stain = c('#3c2f6e')
  return {
    // Bare ground is never one flat colour: a little variation per cell, and
    // now and then a dark stain where something leaked.
    ground: (cx, cz, isRim) => {
      const base = isRim ? rim : (cx + cz) % 2 === 0 ? groundA : groundB
      const r = hash(cx, cz, 9)
      if (!isRim && r < 0.09) return base.clone().lerp(stain, 0.35 + r * 2)
      return shade(base, 0.96 + hash(cx, cz, 5) * 0.08)
    },
    plate: c(t.plate),
    hazard: c(t.hazard),
    blockTop: c(t.blockTop),
    blockSide: c(t.blockSide),
    blockSideAlt: c(t.blockSideAlt),
    rust: c(t.rust),
    blockFoot: c(t.blockFoot),
    cover: t.cover.map(c),
    stair: c(t.stair),
    pad: c(t.pad),
    rib: c(t.rib),
    spike: c(t.spike),
    cliffTop: c(t.cliffTop),
    cliffFoot: c(t.cliffFoot),
    trimWall: c(t.trimWall),
    trimTower: c(t.trimTower),
    ladder: c(t.ladder)
  }
}

/**
 * The four side directions: outward normal, and the two top corners of that
 * side in cell-local coordinates (0..1), ordered so the face winds outward.
 */
const SIDES = [
  { dx: 1, dz: 0, a: [1, 1], b: [1, 0] },
  { dx: -1, dz: 0, a: [0, 0], b: [0, 1] },
  { dx: 0, dz: 1, a: [0, 1], b: [1, 1] },
  { dx: 0, dz: -1, a: [1, 0], b: [0, 0] }
] as const

/**
 * The colour of a run of cover: every cell of one container takes the same
 * colour, so a container two cells long is one container, not two crates.
 */
const coverColour = (g: Grid, pal: Palette, cx: number, cz: number): Color => {
  // Walk to the start of the run (toward −x, then −z).
  let sx = cx
  let sz = cz
  while (cellKind(g, sx - 1, sz) === CellKind.Cover && cellHeight(g, sx - 1, sz) === cellHeight(g, cx, cz)) sx--
  while (cellKind(g, sx, sz - 1) === CellKind.Cover && cellHeight(g, sx, sz - 1) === cellHeight(g, cx, cz)) sz--
  return pal.cover[Math.floor(hash(sx, sz, 3) * pal.cover.length) % pal.cover.length]!
}

/**
 * The height a cell SHOWS: its top, or for a cell under a solid prop the
 * floor the prop stands on (the prop is narrower than the cell, so the cell's
 * raised top is never drawn and must not hide a neighbour's face, #79).
 */
export const shownHeight = (g: Grid, cx: number, cz: number): number => {
  const h = cellHeight(g, cx, cz)
  if (h === VOID || cellSurf(g, cx, cz) !== Surf.Heap) return h
  const b = g.base[cz * g.w + cx]!
  return b === VOID ? h : b
}

/** The lowest floor anywhere on the island: the lip and the skirt hang from it. */
export const islandFloor = (g: Grid): number => {
  let lo = Infinity
  for (let cz = 0; cz < g.d; cz++) for (let cx = 0; cx < g.w; cx++) {
    const h = shownHeight(g, cx, cz)
    if (h !== VOID && h < lo) lo = h
  }
  return lo === Infinity ? 0 : lo
}

/** Where the sheer lip under the island's edge ends and the skirt begins. */
export const lipBottom = (g: Grid): number => islandFloor(g) - LIP_DEPTH

/** Lit and glowing quads of one chunk. */
const buildChunk = (g: Grid, pal: Palette, c0x: number, c0z: number, midX: number, midZ: number, base: number): { lit: Quads; glow: Quads } => {
  const lit = new Quads()
  const glow = new Quads()
  const isVoid = (cx: number, cz: number): boolean => cellHeight(g, cx, cz) === VOID
  const yl = base - LIP_DEPTH
  const ySkirt = base - SKIRT_DEPTH
  const skirtMid = pal.cliffTop.clone().lerp(pal.cliffFoot, 0.45)
  /** Rock tapering in under the island from the foot of an edge's lip. */
  const skirt = (ax: number, az: number, bx: number, bz: number, s: { dx: number; dz: number }): void => {
    const tuck = (x: number, z: number): [number, number] => [x + (midX - x) * SKIRT_TUCK, z + (midZ - z) * SKIRT_TUCK]
    const [tax, taz] = tuck(ax, az)
    const [tbx, tbz] = tuck(bx, bz)
    lit.add([ax, yl, az, tax, ySkirt, taz, tbx, ySkirt, tbz, bx, yl, bz], [s.dx, -0.5, s.dz], skirtMid, pal.cliffFoot, pal.cliffFoot, skirtMid)
  }

  for (let cz = c0z; cz < Math.min(g.d, c0z + CHUNK); cz++) {
    for (let cx = c0x; cx < Math.min(g.w, c0x + CHUNK); cx++) {
      const h = cellHeight(g, cx, cz)
      if (h === VOID) continue
      // The island's underside (#149): a floor across the skirt's foot, the
      // cell drawn in toward the middle as the skirt is, so the cells close
      // it exactly. From below there was nothing, and the floors showed through.
      {
        const tuck = (v: number, mid: number): number => v + (mid - v) * SKIRT_TUCK
        const x0 = tuck(cx * CELL, midX)
        const x1 = tuck((cx + 1) * CELL, midX)
        const z0 = tuck(cz * CELL, midZ)
        const z1 = tuck((cz + 1) * CELL, midZ)
        lit.add([x0, ySkirt, z0, x1, ySkirt, z0, x1, ySkirt, z1, x0, ySkirt, z1], [0, -1, 0], pal.cliffFoot, pal.cliffFoot, pal.cliffFoot, pal.cliffFoot)
      }
      const kind = cellKind(g, cx, cz)
      const surf = cellSurf(g, cx, cz)
      // A solid prop stands here and draws itself: all the mesh owes it is
      // the floor it stands on, and that floor's sides down to any lower
      // neighbour (a prop on a ledge's edge left a hole beside it, #79).
      if (surf === Surf.Heap) {
        const gy = shownHeight(g, cx, cz)
        const c = pal.ground(cx, cz, false)
        lit.add([cx * CELL, gy, (cz + 1) * CELL, (cx + 1) * CELL, gy, (cz + 1) * CELL, (cx + 1) * CELL, gy, cz * CELL, cx * CELL, gy, cz * CELL], [0, 1, 0], c, c, c, c)
        for (let si = 0; si < SIDES.length; si++) {
          const s = SIDES[si]!
          const nh = shownHeight(g, cx + s.dx, cz + s.dz)
          const floor = nh === VOID ? yl : nh
          if (floor >= gy - 1e-6) continue
          const ax = cx * CELL + s.a[0] * CELL
          const az = cz * CELL + s.a[1] * CELL
          const bx = cx * CELL + s.b[0] * CELL
          const bz = cz * CELL + s.b[1] * CELL
          if (nh === VOID) skirt(ax, az, bx, bz, s)
          let y = gy
          let k = 0
          while (y > floor + 1e-6) {
            const yb = Math.max(floor, y - CELL)
            const base = hash(cx, cz, si * 16 + k) < 0.5 ? pal.blockSide : pal.blockSideAlt
            lit.add([ax, y, az, ax, yb, az, bx, yb, bz, bx, y, bz], [s.dx, 0, s.dz], base, shade(base, FOOT_SHADE), shade(base, FOOT_SHADE), base, CELL_WALL, 0, (y - yb) / CELL)
            y = yb
            k++
          }
        }
        continue
      }
      const x0 = cx * CELL
      const x1 = x0 + CELL
      const z0 = cz * CELL
      const z1 = z0 + CELL
      const structure = kind === CellKind.Block || kind === CellKind.Cover || kind === CellKind.Stair
      const bevel = !structure ? 0 : kind === CellKind.Stair ? BEVEL_STAIR : BEVEL
      /** Is this side's neighbour lower (so the side is drawn, and its top edge chamfered)? */
      const lower = (dx: number, dz: number): boolean => {
        const nh = shownHeight(g, cx + dx, cz + dz)
        return nh === VOID || nh < h - 1e-6
      }
      const open = { e: lower(1, 0), w: lower(-1, 0), s: lower(0, 1), n: lower(0, -1) }
      const cut = (o: boolean): number => (o && bevel > 0 ? bevel : 0)
      // The top, pulled in from every open edge.
      const tx0 = x0 + cut(open.w)
      const tx1 = x1 - cut(open.e)
      const tz0 = z0 + cut(open.n)
      const tz1 = z1 - cut(open.s)

      // ── Top ──
      const rim = kind === CellKind.Ground && (isVoid(cx + 1, cz) || isVoid(cx - 1, cz) || isVoid(cx, cz + 1) || isVoid(cx, cz - 1))
      const cover = kind === CellKind.Cover ? coverColour(g, pal, cx, cz) : pal.blockSide
      let top = kind === CellKind.Pad ? pal.pad
        : kind === CellKind.Cover ? shade(cover, 1.12)
          : kind === CellKind.Stair ? pal.stair
            : kind === CellKind.Block ? pal.blockTop
              : surf === Surf.Hazard ? pal.hazard
                : surf === Surf.Plate ? pal.plate
                  : pal.ground(cx, cz, rim)
      // A pool of shadow is darker underfoot (`Shade.Shadow`).
      const dark = (g.shade[cz * g.w + cx]! & Shade.Shadow) !== 0 && kind !== CellKind.Cover
      if (dark) top = shade(top, SHADOW_DARK)
      const topCell = kind === CellKind.Cover ? CELL_CRATE
        : kind === CellKind.Block || kind === CellKind.Stair || surf === Surf.Plate || surf === Surf.Hazard ? CELL_FLOOR
          : CELL_BLANK
      // A corner is shared by this cell and three others; each taller one
      // standing over it darkens it.
      const ao = (ox: number, oz: number): Color => {
        let n = 0
        for (const [ax, az] of [[ox, 0], [0, oz], [ox, oz]] as const) {
          const nh = cellHeight(g, cx + ax, cz + az)
          if (nh !== VOID && nh > h + 0.6) n++
        }
        return n === 0 ? top : shade(top, 1 - AO_STEP * n)
      }
      lit.add(
        [tx0, h, tz1, tx1, h, tz1, tx1, h, tz0, tx0, h, tz0], [0, 1, 0],
        ao(-1, 1), ao(1, 1), ao(1, -1), ao(-1, -1), topCell
      )

      // ── Sides ──
      for (let si = 0; si < SIDES.length; si++) {
        const s = SIDES[si]!
        const nh = shownHeight(g, cx + s.dx, cz + s.dz)
        const ax = x0 + s.a[0] * CELL
        const az = z0 + s.a[1] * CELL
        const bx = x0 + s.b[0] * CELL
        const bz = z0 + s.b[1] * CELL
        if (nh === VOID && !structure) {
          // The island's edge. A sheer lip first, so the island has a
          // thickness from every camera height; under it the rock tapers in.
          lit.add([ax, h, az, ax, yl, az, bx, yl, bz, bx, h, bz], [s.dx, 0, s.dz], pal.cliffTop, skirtMid, skirtMid, pal.cliffTop)
          skirt(ax, az, bx, bz, s)
          continue
        }
        // A structure on the island's edge: its face runs down the lip, the skirt under it.
        if (nh === VOID) skirt(ax, az, bx, bz, s)
        const floor = nh === VOID ? yl : nh
        if (floor >= h - 1e-6) continue
        if (!structure) {
          // A step in the ground itself: rock.
          const sideC = pal.cliffTop
          lit.add([ax, h, az, ax, floor, az, bx, floor, bz, bx, h, bz], [s.dx, 0, s.dz], sideC, shade(sideC, FOOT_SHADE), shade(sideC, FOOT_SHADE), sideC)
          continue
        }

        // The chamfer: from the pulled-in top edge down to the face.
        const yEdge = h - bevel
        if (bevel > 0) {
          // The top's own corners on this side (already pulled in on both axes
          // where the neighbouring side is open too), in the face's order.
          const ta = [s.a[0] === 1 ? tx1 : tx0, s.a[1] === 1 ? tz1 : tz0] as const
          const tb = [s.b[0] === 1 ? tx1 : tx0, s.b[1] === 1 ? tz1 : tz0] as const
          const light = shade(top, 1.14)
          lit.add(
            [ta[0], h, ta[1], ax, yEdge, az, bx, yEdge, bz, tb[0], h, tb[1]],
            [s.dx * 0.7071, 0.7071, s.dz * 0.7071], light, light, light, light
          )
          // Where the chamfer runs into a neighbour that does not carry it on
          // (an inside corner, or a taller block), its end is open: close it.
          for (const [corner, t, ox, oz] of [[s.a, ta, ax, az], [s.b, tb, bx, bz]] as const) {
            const px = s.dx !== 0 ? 0 : corner[0] === 1 ? 1 : -1
            const pz = s.dz !== 0 ? 0 : corner[1] === 1 ? 1 : -1
            const nhp = cellHeight(g, cx + px, cz + pz)
            if (nhp === VOID || nhp < h - 1e-6) continue
            const carriesOn = Math.abs(nhp - h) < 1e-6 && cellKind(g, cx + px, cz + pz) === kind
              && (() => { const d = cellHeight(g, cx + px + s.dx, cz + pz + s.dz); return d === VOID || d < nhp - 1e-6 })()
            if (carriesOn) continue
            lit.tri([t[0], h, t[1], ox, h, oz, ox, yEdge, oz], [-px, 0, -pz], light)
            lit.tri([ox, h, oz, t[0], h, t[1], ox, yEdge, oz], [-px, 0, -pz], light)
          }
        }

        // The face, in plates two metres high from the top down. Each plate
        // is its own piece of steel: one of two greys, now and then rust.
        const rise = yEdge - floor
        const isCover = kind === CellKind.Cover
        let y = yEdge
        let k = 0
        while (y > floor + 1e-6) {
          const yb = Math.max(floor, y - CELL)
          const roll = hash(cx, cz, si * 16 + k)
          const base = isCover ? cover
            : kind === CellKind.Stair ? pal.blockSideAlt
              : roll < RUST_SHARE ? pal.rust
                : roll < 0.55 ? pal.blockSide : pal.blockSideAlt
          // Darker toward the foot of the whole wall, not of each plate.
          const at = (yy: number): Color => base.clone().lerp(isCover ? shade(cover, FOOT_SHADE) : pal.blockFoot, Math.min(1, ((yEdge - yy) / Math.max(rise, 0.01)) * (isCover ? 0.6 : 0.75)))
          lit.add(
            [ax, y, az, ax, yb, az, bx, yb, bz, bx, y, bz], [s.dx, 0, s.dz],
            at(y), at(yb), at(yb), at(y),
            isCover ? CELL_CRATE : CELL_WALL, 0, (y - yb) / CELL
          )
          y = yb
          k++
        }

        const tall = kind === CellKind.Block && rise >= TALL
        // A neon line under the lip of every structure tall enough to read as
        // one: pink on the walls, cyan on the towers and the keep.
        if (kind === CellKind.Block && h - floor >= 2) {
          const t = h >= 5 ? pal.trimTower : pal.trimWall
          const out = 0.02
          const y1 = yEdge - 0.1
          const y0 = yEdge - 0.26
          const ox = s.dx * out
          const oz = s.dz * out
          glow.add([ax + ox, y1, az + oz, ax + ox, y0, az + oz, bx + ox, y0, bz + oz, bx + ox, y1, bz + oz], [s.dx, 0, s.dz], t, t, t, t)
        }

        if (tall) {
          // A stiffening rib on every other cell: a post proud of the wall,
          // from the ground to just under the neon.
          if ((cx + cz) % 2 === 0) {
            const half = 0.16
            const out = 0.12
            const mx = (ax + bx) / 2
            const mz = (az + bz) / 2
            // Along the face.
            const ex = (bx - ax) / CELL
            const ez = (bz - az) / CELL
            const top2 = yEdge - 0.4
            const p = (e: number, o: number, yy: number): [number, number, number] => [mx + ex * e + s.dx * o, yy, mz + ez * e + s.dz * o]
            const dark = shade(pal.rib, 0.8)
            lit.add([...p(-half, out, top2), ...p(-half, out, floor), ...p(half, out, floor), ...p(half, out, top2)], [s.dx, 0, s.dz], pal.rib, dark, dark, pal.rib)
            lit.add([...p(-half, 0, top2), ...p(-half, 0, floor), ...p(-half, out, floor), ...p(-half, out, top2)], [-ex, 0, -ez], dark, dark, dark, dark)
            lit.add([...p(half, out, top2), ...p(half, out, floor), ...p(half, 0, floor), ...p(half, 0, top2)], [ex, 0, ez], dark, dark, dark, dark)
          }
          // Spikes along the lip of a WALL (not a tower or the keep): scrap
          // steel cut to points, leaning out. They stand outside the cell, so
          // nothing ever walks through one.
          // Not over a roof: the points would stand through its slab (#96).
          if (h < 5 && roofAt(g, cx + s.dx, cz + s.dz) === VOID) {
            for (const e of [-0.5, 0.5]) {
              const mx = (ax + bx) / 2 + ((bx - ax) / CELL) * e
              const mz = (az + bz) / 2 + ((bz - az) / CELL) * e
              const ex = ((bx - ax) / CELL) * 0.2
              const ez = ((bz - az) / CELL) * 0.2
              const lean = 0.2 + hash(cx, cz, si * 4 + (e > 0 ? 1 : 0)) * 0.22
              const tall2 = 0.5 + hash(cx, cz, si * 4 + (e > 0 ? 3 : 2)) * 0.35
              const b0: [number, number, number] = [mx - ex + s.dx * 0.02, yEdge - 0.02, mz - ez + s.dz * 0.02]
              const b1: [number, number, number] = [mx + ex + s.dx * 0.02, yEdge - 0.02, mz + ez + s.dz * 0.02]
              const tip: [number, number, number] = [mx + s.dx * lean, h + tall2, mz + s.dz * lean]
              const c = hash(cx, cz, si + 40) < 0.3 ? pal.rust : pal.spike
              lit.tri([...b0, ...b1, ...tip], [s.dx, 0.3, s.dz], c)
              lit.tri([...b1, ...b0, ...tip], [-s.dx, 0.3, -s.dz], shade(c, 0.8))
            }
          }
        }
      }
    }
  }
  buildRoofs(g, pal, lit, c0x, c0z)
  return { lit, glow }
}

/**
 * Roof slabs (#96): a deck on top, a dark underside, and an edge where the
 * slab ends (at a hole or open sky). An edge is drawn only above whatever
 * stands beside it, so it never lies in the same plane as a wall's face: no
 * two opaque faces share a plane.
 */
const buildRoofs = (g: Grid, pal: Palette, lit: Quads, c0x: number, c0z: number): void => {
  const under = shade(pal.blockFoot, 0.9)
  for (let cz = c0z; cz < Math.min(g.d, c0z + CHUNK); cz++) {
    for (let cx = c0x; cx < Math.min(g.w, c0x + CHUNK); cx++) {
      const r = roofAt(g, cx, cz)
      if (r === VOID) continue
      const t = r + ROOF_T
      const x0 = cx * CELL
      const x1 = x0 + CELL
      const z0 = cz * CELL
      const z1 = z0 + CELL
      const top = (cx + cz) % 2 === 0 ? pal.plate : shade(pal.plate, 0.95)
      lit.add([x0, t, z1, x1, t, z1, x1, t, z0, x0, t, z0], [0, 1, 0], top, top, top, top, CELL_FLOOR)
      lit.add([x0, r, z0, x1, r, z0, x1, r, z1, x0, r, z1], [0, -1, 0], under, under, under, under)
      for (const s of SIDES) {
        const nr = roofAt(g, cx + s.dx, cz + s.dz)
        if (nr !== VOID && Math.abs(nr - r) < 1e-6) continue
        const nh = shownHeight(g, cx + s.dx, cz + s.dz)
        const bottom = Math.max(r, nh === VOID ? r : nh)
        if (bottom >= t - 1e-6) continue
        const ax = x0 + s.a[0] * CELL
        const az = z0 + s.a[1] * CELL
        const bx = x0 + s.b[0] * CELL
        const bz = z0 + s.b[1] * CELL
        lit.add([ax, t, az, ax, bottom, az, bx, bottom, bz, bx, t, bz], [s.dx, 0, s.dz], pal.hazard, pal.blockSide, pal.blockSide, pal.hazard)
      }
    }
  }
}

/** A box between two points with a square section, as six quads. */
const beam = (q: Quads, ax: number, ay: number, az: number, bx: number, by: number, bz: number, half: number, c: Color): void => {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len = Math.hypot(dx, dy, dz) || 1
  // Two unit vectors across the beam.
  const flat = Math.hypot(dx, dz)
  const ux = flat > 1e-6 ? -dz / flat : 1
  const uz = flat > 1e-6 ? dx / flat : 0
  const vx = (dy * uz) / len
  const vy = (dz * ux - dx * uz) / len
  const vz = (-dy * ux) / len
  const corner = (px: number, py: number, pz: number, su: number, sv: number): [number, number, number] =>
    [px + (ux * su + vx * sv) * half, py + vy * sv * half, pz + (uz * su + vz * sv) * half]
  const faces: Array<[number, number, number, number]> = [[1, 1, 1, -1], [-1, -1, -1, 1], [1, -1, -1, -1], [-1, 1, 1, 1]]
  for (const [s0u, s0v, s1u, s1v] of faces) {
    const p0 = corner(ax, ay, az, s0u, s0v)
    const p1 = corner(ax, ay, az, s1u, s1v)
    const p2 = corner(bx, by, bz, s1u, s1v)
    const p3 = corner(bx, by, bz, s0u, s0v)
    q.add([...p0, ...p1, ...p2, ...p3], [(s0u + s1u) * 0.5 * ux, 0, (s0u + s1u) * 0.5 * uz], c, c, c, c)
  }
}

/** Ladders: the ways up, drawn in the neon they are found by. (The cables are ropes, `fx/ropeLine.ts`.) */
const buildLinks = (g: Grid, pal: Palette): Quads => {
  const q = new Quads()
  for (const l of g.ladders) {
    const foot = cellHeight(g, l.cx, l.cz)
    const top = cellHeight(g, l.cx + l.dx, l.cz + l.dz)
    // The face of the block the ladder runs up, a hand's width proud of it.
    const fx = (l.cx + 0.5 + l.dx * 0.5) * CELL - l.dx * 0.06
    const fz = (l.cz + 0.5 + l.dz * 0.5) * CELL - l.dz * 0.06
    // Across the face.
    const sx = l.dz !== 0 ? 1 : 0
    const sz = l.dx !== 0 ? 1 : 0
    const half = 0.34
    for (const side of [-1, 1]) {
      beam(q, fx + sx * half * side, foot, fz + sz * half * side, fx + sx * half * side, top + 0.25, fz + sz * half * side, 0.045, pal.ladder)
    }
    for (let y = foot + 0.4; y < top; y += 0.45) {
      beam(q, fx - sx * half, y, fz - sz * half, fx + sx * half, y, fz + sz * half, 0.035, pal.ladder)
    }
  }
  return q
}

export interface FortressMesh {
  group: Group
  /** Chunk meshes, for culling statistics and tests. */
  chunks: Mesh[]
  dispose(): void
}

/**
 * Build the fortress's static geometry, one chunk per slice so the loader's
 * bar keeps moving. Round 5 (#147): a chunk's lights ride in its lit mesh
 * (`aGlow`, `levelGlowMaterial`), so each chunk is ONE draw call, all of them
 * in one GL program; the links (cables, ladders' glow) stay `glowVC`.
 */
/** Flag every vertex of a chunk's geometry lit (0) or glowing (1). */
const flagged = (g: BufferGeometry, glow: number): BufferGeometry => {
  g.setAttribute('aGlow', new Float32BufferAttribute(new Float32Array(g.attributes.position!.count).fill(glow), 1))
  return g
}

export const buildFortressMesh = async (
  f: Fortress, theme: Theme = SCRAPYARD, slice: Slice = noSlice, onProgress: (p01: number) => void = () => {}
): Promise<FortressMesh> => {
  const g = f.grid
  const pal = palette(theme)
  const group = new Group()
  group.name = `fortress:${f.id}`
  const chunks: Mesh[] = []
  const geos: BufferGeometry[] = []
  const midX = (g.w * CELL) / 2
  const midZ = (g.d * CELL) / 2
  const cols = Math.ceil(g.w / CHUNK)
  const rows = Math.ceil(g.d / CHUNK)
  const litMaterial = levelGlowMaterial(levelAtlas)
  const base = islandFloor(g)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { lit, glow } = buildChunk(g, pal, c * CHUNK, r * CHUNK, midX, midZ, base)
      const parts = [
        ...(lit.empty ? [] : [flagged(lit.geometry(), 0)]),
        ...(glow.empty ? [] : [flagged(glow.geometry(), 1)])
      ]
      if (parts.length > 0) {
        const geo = parts.length === 1 ? parts[0]! : merge(parts)
        if (parts.length > 1) for (const p of parts) p.dispose()
        geo.computeBoundingSphere()
        const m = new Mesh(geo, litMaterial)
        m.name = `chunk:${c},${r}`
        m.matrixAutoUpdate = false
        group.add(m)
        chunks.push(m)
        geos.push(geo)
      }
      onProgress((r * cols + c + 1) / (rows * cols))
      await slice()
    }
  }

  const links = buildLinks(g, pal)
  if (!links.empty) {
    const geo = links.geometry()
    const m = new Mesh(geo, glowVC())
    m.name = 'links'
    m.matrixAutoUpdate = false
    group.add(m)
    geos.push(geo)
  }
  // The fortress's own ropes: the same braided line and pitons as the rope
  // gun's (#164), not the pale tube and posts they used to be.
  const ropes = buildRopeLines(g.cables.map(c => cableEnds(g, c)))
  group.add(ropes.group)

  return {
    group,
    chunks,
    dispose: () => {
      for (const geo of geos) geo.dispose()
      ropes.dispose()
      group.clear()
    }
  }
}
