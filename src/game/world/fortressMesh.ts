import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh } from 'three'
import { CELL, CellKind, VOID, cellHeight, cellKind, type Grid } from './grid'
import type { Fortress } from './fortress'
import { toonVC, glowVC } from '../models/toon'
import { noSlice, type Slice } from '../engine/slicer'

/**
 * ─── The fortress as geometry ────────────────────────────────────────────────
 *
 * The height grid drawn as flat-shaded blocks: a top face per cell, a side
 * face wherever a neighbour is lower, a rock skirt where the island ends.
 * Colour is per vertex (no textures), with two cheap kinds of depth baked in:
 * corners darken where a taller neighbour stands over them, and side faces
 * darken toward their foot.
 *
 * The island is cut into CHUNKS of 8 × 8 cells (16 m). Each chunk is ONE lit
 * mesh and at most one glowing mesh, with its own bounding sphere, so three's
 * frustum culling drops whole chunks: through the sniper scope's narrow view
 * only the few chunks in the reticle are drawn. A whole 80 m base is about 50
 * draw calls with everything in view, and far fewer on a normal frame.
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
  blockTop: string
  blockSide: string
  blockFoot: string
  coverTop: string
  coverSide: string
  stair: string
  pad: string
  trimWall: string
  trimTower: string
  ladder: string
  cable: string
}

export const SYNTHWAVE: Theme = {
  groundA: '#9a8be0',
  groundB: '#9183d8',
  rim: '#ab9ff2',
  cliffTop: '#6a59b8',
  cliffFoot: '#2a1d5c',
  blockTop: '#c3b6f4',
  blockSide: '#8c7ad6',
  blockFoot: '#56459f',
  coverTop: '#8fd0f4',
  coverSide: '#5a8fd0',
  stair: '#b4a6ec',
  pad: '#ff86cb',
  trimWall: '#ff5fb7',
  trimTower: '#5fe9ff',
  ladder: '#5fe9ff',
  cable: '#ffd3ee'
}

/** The island's edge: a sheer lip, then rock tapering in under the island. */
const LIP_DEPTH = 2.6
const SKIRT_DEPTH = 11
const SKIRT_TUCK = 0.3
/** How much one taller neighbour darkens a corner. */
const AO_STEP = 0.13
/** How dark a side face gets at its foot. */
const FOOT_SHADE = 0.74

/** A growing list of quads: positions, face normals, vertex colours, indices. */
class Quads {
  pos: number[] = []
  nor: number[] = []
  col: number[] = []
  idx: number[] = []

  /** Four corners in counter-clockwise order seen from the front. */
  add(
    p: readonly number[], n: readonly [number, number, number],
    c0: Color, c1: Color, c2: Color, c3: Color
  ): void {
    const base = this.pos.length / 3
    for (let i = 0; i < 12; i++) this.pos.push(p[i]!)
    for (let i = 0; i < 4; i++) this.nor.push(n[0], n[1], n[2])
    for (const c of [c0, c1, c2, c3]) this.col.push(c.r, c.g, c.b)
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  get empty(): boolean {
    return this.idx.length === 0
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    return g
  }
}

const shade = (c: Color, k: number): Color => c.clone().multiplyScalar(k)

interface Palette {
  top: (kind: CellKind, cx: number, cz: number, rim: boolean) => Color
  side: (kind: CellKind) => Color
  foot: (kind: CellKind) => Color
  cliffTop: Color
  cliffFoot: Color
  trimWall: Color
  trimTower: Color
  ladder: Color
  cable: Color
}

const palette = (t: Theme): Palette => {
  const c = (hex: string): Color => new Color(hex)
  const groundA = c(t.groundA)
  const groundB = c(t.groundB)
  const rim = c(t.rim)
  const blockTop = c(t.blockTop)
  const blockSide = c(t.blockSide)
  const blockFoot = c(t.blockFoot)
  const coverTop = c(t.coverTop)
  const coverSide = c(t.coverSide)
  const stair = c(t.stair)
  const pad = c(t.pad)
  return {
    top: (kind, cx, cz, isRim) => {
      if (kind === CellKind.Pad) return pad
      if (kind === CellKind.Cover) return coverTop
      if (kind === CellKind.Stair) return stair
      if (kind === CellKind.Block) return blockTop
      if (isRim) return rim
      return (cx + cz) % 2 === 0 ? groundA : groundB
    },
    side: (kind) => (kind === CellKind.Cover ? coverSide : blockSide),
    foot: (kind) => (kind === CellKind.Cover ? shade(coverSide, FOOT_SHADE) : blockFoot),
    cliffTop: c(t.cliffTop),
    cliffFoot: c(t.cliffFoot),
    trimWall: c(t.trimWall),
    trimTower: c(t.trimTower),
    ladder: c(t.ladder),
    cable: c(t.cable)
  }
}

/** The four side directions: outward normal, and the two top corners of that
 *  side in cell-local coordinates (0..1), ordered so the face winds outward. */
const SIDES = [
  { dx: 1, dz: 0, a: [1, 1], b: [1, 0] },
  { dx: -1, dz: 0, a: [0, 0], b: [0, 1] },
  { dx: 0, dz: 1, a: [0, 1], b: [1, 1] },
  { dx: 0, dz: -1, a: [1, 0], b: [0, 0] }
] as const

/** Lit and glowing quads of one chunk. */
const buildChunk = (g: Grid, pal: Palette, c0x: number, c0z: number, midX: number, midZ: number): { lit: Quads; glow: Quads } => {
  const lit = new Quads()
  const glow = new Quads()
  const isVoid = (cx: number, cz: number): boolean => cellHeight(g, cx, cz) === VOID

  for (let cz = c0z; cz < Math.min(g.d, c0z + CHUNK); cz++) {
    for (let cx = c0x; cx < Math.min(g.w, c0x + CHUNK); cx++) {
      const h = cellHeight(g, cx, cz)
      if (h === VOID) continue
      const kind = cellKind(g, cx, cz)
      const x0 = cx * CELL
      const x1 = x0 + CELL
      const z0 = cz * CELL
      const z1 = z0 + CELL

      // ── Top ──
      const rim = kind === CellKind.Ground && (isVoid(cx + 1, cz) || isVoid(cx - 1, cz) || isVoid(cx, cz + 1) || isVoid(cx, cz - 1))
      const top = pal.top(kind, cx, cz, rim)
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
        [x0, h, z1, x1, h, z1, x1, h, z0, x0, h, z0], [0, 1, 0],
        ao(-1, 1), ao(1, 1), ao(1, -1), ao(-1, -1)
      )

      // ── Sides ──
      for (const s of SIDES) {
        const nh = cellHeight(g, cx + s.dx, cz + s.dz)
        const ax = x0 + s.a[0] * CELL
        const az = z0 + s.a[1] * CELL
        const bx = x0 + s.b[0] * CELL
        const bz = z0 + s.b[1] * CELL
        if (nh === VOID) {
          // The island's edge. A sheer lip first, so the island has a
          // thickness from every camera height; under it the rock tapers in.
          const tuck = (x: number, z: number): [number, number] => [x + (midX - x) * SKIRT_TUCK, z + (midZ - z) * SKIRT_TUCK]
          const [tax, taz] = tuck(ax, az)
          const [tbx, tbz] = tuck(bx, bz)
          const yl = h - LIP_DEPTH
          const yb = h - SKIRT_DEPTH
          const mid = pal.cliffTop.clone().lerp(pal.cliffFoot, 0.45)
          lit.add([ax, h, az, ax, yl, az, bx, yl, bz, bx, h, bz], [s.dx, 0, s.dz], pal.cliffTop, mid, mid, pal.cliffTop)
          lit.add([ax, yl, az, tax, yb, taz, tbx, yb, tbz, bx, yl, bz], [s.dx, -0.5, s.dz], mid, pal.cliffFoot, pal.cliffFoot, mid)
          continue
        }
        if (nh >= h - 1e-6) continue
        const side = kind === CellKind.Ground || kind === CellKind.Pad ? pal.cliffTop : pal.side(kind)
        const foot = kind === CellKind.Ground || kind === CellKind.Pad ? shade(pal.cliffTop, FOOT_SHADE) : pal.foot(kind)
        lit.add([ax, h, az, ax, nh, az, bx, nh, bz, bx, h, bz], [s.dx, 0, s.dz], side, foot, foot, side)

        // A neon line under the lip of every structure tall enough to read as
        // one: pink on the walls, cyan on the towers and the keep.
        if (kind === CellKind.Block && h - nh >= 2) {
          const t = h >= 5 ? pal.trimTower : pal.trimWall
          const out = 0.02
          const y1 = h - 0.12
          const y0 = h - 0.3
          const ox = s.dx * out
          const oz = s.dz * out
          glow.add([ax + ox, y1, az + oz, ax + ox, y0, az + oz, bx + ox, y0, bz + oz, bx + ox, y1, bz + oz], [s.dx, 0, s.dz], t, t, t, t)
        }
      }
    }
  }
  return { lit, glow }
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

/** Ladders and cables: the ways up, drawn in the neon they are found by. */
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
  for (const c of g.cables) {
    const ax = (c.ax + 0.5) * CELL
    const az = (c.az + 0.5) * CELL
    const bx = (c.bx + 0.5) * CELL
    const bz = (c.bz + 0.5) * CELL
    const ay = cellHeight(g, c.ax, c.az)
    const by = cellHeight(g, c.bx, c.bz)
    beam(q, ax, ay + 0.06, az, bx, by + 0.06, bz, 0.05, pal.cable)
    // An anchor post at each end, so the cable has something to hang from.
    beam(q, ax, ay, az, ax, ay + 0.5, az, 0.09, pal.cable)
    beam(q, bx, by, bz, bx, by + 0.5, bz, 0.09, pal.cable)
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
 * bar keeps moving. Materials are the two shared toon ones (`toonVC`,
 * `glowVC`), so every chunk batches into the same two GL programs.
 */
export const buildFortressMesh = async (
  f: Fortress, theme: Theme = SYNTHWAVE, slice: Slice = noSlice, onProgress: (p01: number) => void = () => {}
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

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { lit, glow } = buildChunk(g, pal, c * CHUNK, r * CHUNK, midX, midZ)
      if (!lit.empty) {
        const geo = lit.geometry()
        const m = new Mesh(geo, toonVC())
        m.name = `chunk:${c},${r}`
        m.matrixAutoUpdate = false
        group.add(m)
        chunks.push(m)
        geos.push(geo)
      }
      if (!glow.empty) {
        const geo = glow.geometry()
        const m = new Mesh(geo, glowVC())
        m.matrixAutoUpdate = false
        group.add(m)
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

  return {
    group,
    chunks,
    dispose: () => {
      for (const geo of geos) geo.dispose()
      group.clear()
    }
  }
}
