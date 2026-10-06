import {
  Box3, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, DynamicDrawUsage,
  Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Sprite, SpriteMaterial, SRGBColorSpace, type Scene
} from 'three'
import { CELL, VOID, cellHeight, floorAt, hasLineOfSight, heightAt, inGrid, raycast, surfaceAt, toCell, type Grid } from '../world/grid'
import { PAL } from '../models/palette'
import { Wreckage } from '../fx/wreckage'
import { Shatter } from '../fx/shatter'
import type { PostKind } from '../world/fortress'
import { dome, paint, rbox, merge, type Rig } from '../models/kit'
import {
  buildDrone, buildEnforcer, buildGoliath, buildGuard, buildLampCage, buildSearchlight, poseSearchlight, type SearchlightPose, restGuardPose, poseDrone, poseEnforcer, poseGoliath, poseGuard,
  type DronePose, type EnforcerPose, type GoliathPose, type GuardPose, buildRoomba, poseRoomba, type RoombaPose
} from '../models/garrison'
import { makeBlobShadow } from '../fx/markers'
import { poseRagdoll } from '../models/ragdollPose'
import { DOG_STAND, HOUND_SCALE, buildRobodog, poseRobodog, restDogPose, type DogPose } from '../models/robodog'
import { angleDelta } from './player'
import { STEP } from '../engine/clock'
import { SPECS, SUSPECT_AT, spotCentre, spotRadius, viewerOf, shieldUp, type Garrison, type Unit , isLight } from './garrison'

/**
 * ─── The garrison, drawn ─────────────────────────────────────────────────────
 *
 * One rig per defender, plus everything that makes stealth READABLE: the
 * vision cone on the ground in front of each guard (clipped by walls and
 * cover, so the player sees what hides them), the searchlight under each
 * drone, and the mark over a head that is getting curious ("?") or sure ("!").
 *
 * All the cones are ONE mesh with one draw call; its vertices are rewritten a
 * few units per frame.
 */

/**
 * A cone is cast as this many slices: a ray along each edge finds the
 * stretches of ground the eye sees along it (`sightSpans`), and each slice is
 * filled between its two rays, stretch to stretch, so the edge runs from one
 * ray's hit to the next along the face of whatever stopped them.
 */
const CONE_SEGS = 48
/** Quads one cone may use; its stretches get rings about CONE_STEP apart (wider when that is too many). */
const CONE_QUADS = CONE_SEGS * 12
const CONE_VERTS = CONE_QUADS * 6
const CONE_STEP = 2.5
/** A point on the ground counts as watched if the eye sees this far above it:
 *  under the top of cover, so the lee of a cover block is drawn dark. */
const CONE_PROBE_Y = 0.9
/** Ground that steps by more than this is a new stretch: the cone lies flat on each level. */
const CONE_STEP_Y = 0.3
/** Neighbouring grid points further apart in height than this are a cliff:
 *  nothing is drawn across it (the lights' pools). */
const CONE_CLIFF = 1.2
/** Numbers per strip in the scratch list (see `strip`). */
const STRIP = 9
/** Casting a cone (its rays) is the dear part: this many a frame, the most out of date first.
 *  In between, each cone is carried and turned with its unit every frame (`placeCone`). */
const CONE_CASTS = 3
/** The cone leads its unit by this much of its motion, so it never trails the body (s). */
const CONE_LEAD_S = 0.05
/** Marks over a unit start this far above the top of its model (m). */
const MARK_GAP = 0.18
/** A light's pool: a polar grid draped on the ground and clipped by whatever
 *  stands between it and the lamp or the middle of the pool (#69). */
const POOL_SEGS = 20
const POOL_RINGS = 3
const POOL_VERTS = POOL_SEGS * POOL_RINGS * 6
const POOL_ALPHA = 0.24
const CALM = new Color('#e9fdff')
/** A tagged unit's diamond and round: the scope's own cyan. */
const TAG = new Color('#5fe9ff')
const WARY = new Color('#ffe14d')
/** Noticing, not yet looking: white (Odyssey's first band). */
const NOTICE = new Color('#ffffff')
const HOT = new Color('#ff3b5c')

/** A stretch of ground an eye sees along one ray: from `t0` to `t1` metres out, standing at `y` where it starts. */
export interface Span {
  t0: number; t1: number; y: number
  /** All of it on the one floor height `y`. */
  flat: boolean
}

// Scratch for `sightSpans`: the boxes met so far, as rectangles in the ray's
// vertical plane (ta, tb along it; y0, y1 high), and which boxes are in.
const _rects: number[] = []
let _boxSeen = new Int32Array(0)
let _boxStamp = 0
// The eye, the probe point's height, and what stands before the current cell.
let _eye = 0
let _probe = 0
let _horizon = -Infinity
let _cellT0 = 0
let _cellTop = VOID

/**
 * Does the eye see the probe point `t` metres out along the ray? The very
 * test `raycast` makes, solved in the ray's vertical plane: every cell
 * crossed before is a column (its top is a slope the line must clear: the
 * horizon), the probe's own cell must not be entered under its top, and no
 * box (a roof, a mast, a lamp post) may stand across the line.
 */
const seesAt = (t: number): boolean => {
  if (t < 1e-3) return true
  const s = (_probe - _eye) / t
  if (s < _horizon) return false
  if (_cellTop !== VOID && _eye + s * _cellT0 < _cellTop - 1e-9) return false
  // `hasLineOfSight` stops a hair short of the target.
  const end = t - 0.02
  for (let k = 0; k < _rects.length; k += 4) {
    const lo = _rects[k]!
    const hi = Math.min(_rects[k + 1]!, end)
    if (lo > hi) continue
    const v0 = _eye + s * lo
    const v1 = _eye + s * hi
    if (Math.max(v0, v1) >= _rects[k + 2]! && Math.min(v0, v1) <= _rects[k + 3]!) return false
  }
  return true
}

/**
 * The stretches of ground an eye at `eyeY` over (ox, oz) sees along the unit
 * direction (dx, dz), out to `range`: a point counts as seen when the eye
 * sees `probe` metres above the floor there, by the same line of sight the
 * defenders use (`hasLineOfSight`), and the floor is below the eye (nobody
 * sees the top of a wall taller than they are). A stretch ends exactly where the next
 * one is hidden (a wall's face, the lee of cover, a lamp post's shadow) and
 * where the floor steps by more than CONE_STEP_Y; it starts again where
 * ground shows past it. The floor is the one a body at `feetY` would see:
 * the roof it stands on, or the floor under a roof over it. Writes into
 * `out` (reusing its objects) and returns how many.
 */
export const sightSpans = (
  g: Grid, ox: number, oz: number, feetY: number, eyeY: number,
  dx: number, dz: number, range: number, probe: number, out: Span[]
): number => {
  let n = 0
  let cx = toCell(ox)
  let cz = toCell(oz)
  const stepX = dx > 0 ? 1 : -1
  const stepZ = dz > 0 ? 1 : -1
  const invX = dx !== 0 ? 1 / Math.abs(dx) : Infinity
  const invZ = dz !== 0 ? 1 / Math.abs(dz) : Infinity
  let tMaxX = dx !== 0 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL)) * invX : Infinity
  let tMaxZ = dz !== 0 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL)) * invZ : Infinity
  const tDeltaX = CELL * invX
  const tDeltaZ = CELL * invZ
  if (_boxSeen.length < g.boxes.length) _boxSeen = new Int32Array(g.boxes.length * 2)
  _boxStamp++
  _rects.length = 0
  _eye = eyeY
  _horizon = -Infinity
  let t0 = 0
  // The open stretch's end and the floor it last stood on.
  let open = false
  let lastY = 0
  const close = (t: number): void => {
    if (open) out[n - 1]!.t1 = t
    open = false
  }
  const begin = (t: number, y: number): void => {
    if (open && Math.abs(y - lastY) <= CONE_STEP_Y && t - out[n - 1]!.t1 < 1e-6) {
      if (y !== lastY) out[n - 1]!.flat = false
      lastY = y
      return
    }
    close(t)
    const sp = out[n] ?? (out[n] = { t0: 0, t1: 0, y: 0, flat: true })
    sp.t0 = t
    sp.t1 = t
    sp.y = y
    sp.flat = true
    n++
    open = true
    lastY = y
  }
  for (;;) {
    const exit = Math.min(tMaxX, tMaxZ)
    const t1 = Math.min(exit, range)
    const inside = inGrid(g, cx, cz)
    // Boxes reaching into this cell: their cut through the ray's plane.
    const props = inside && g.boxes.length > 0 ? g.boxAt.get(cz * g.w + cx) : undefined
    if (props) {
      for (const bi of props) {
        if (_boxSeen[bi] === _boxStamp) continue
        _boxSeen[bi] = _boxStamp
        const b = g.boxes[bi]!
        let ta = 0
        let tb = Infinity
        if (Math.abs(dx) < 1e-12) { if (ox < b.x0 || ox > b.x1) continue } else {
          const a0 = (b.x0 - ox) / dx
          const a1 = (b.x1 - ox) / dx
          ta = Math.max(ta, Math.min(a0, a1))
          tb = Math.min(tb, Math.max(a0, a1))
        }
        if (Math.abs(dz) < 1e-12) { if (oz < b.z0 || oz > b.z1) continue } else {
          const a0 = (b.z0 - oz) / dz
          const a1 = (b.z1 - oz) / dz
          ta = Math.max(ta, Math.min(a0, a1))
          tb = Math.min(tb, Math.max(a0, a1))
        }
        if (ta <= tb) _rects.push(ta, tb, b.y0, b.y1)
      }
    }
    const top = inside ? cellHeight(g, cx, cz) : VOID
    const floor = inside ? surfaceAt(g, cx, cz, feetY) : VOID
    // A floor at or over the eye (a wall's top) shows the eye no ground: the cone stops at its face.
    if (floor === VOID || floor >= eyeY) close(t0)
    else if (t1 > t0) {
      _probe = floor + probe
      _cellT0 = t0
      _cellTop = top
      // Sample the cell's stretch of the ray, and pin each change down. The
      // columns' tests can only change once inside a cell (the line to the
      // probe turns one way as it moves out): its two ends say it all. A box
      // can hide a band in the middle, so with boxes about it is sampled.
      const lo = t0 + 0.005
      const hi = t1 >= range ? t1 : t1 - 0.005
      // (A box wholly over both the eye and the probe, a roof overhead, can hide nothing.)
      let boxed = false
      const over = Math.max(eyeY, _probe)
      for (let k = 0; k < _rects.length && !boxed; k += 4) boxed = _rects[k]! <= t1 && _rects[k + 2]! <= over
      const steps = boxed ? Math.max(1, Math.ceil((hi - lo) / 0.5)) : 1
      let prevT = lo
      let prev = seesAt(lo)
      if (prev) begin(t0, floor)
      else close(t0)
      for (let k = 1; k <= steps; k++) {
        const t = k === steps ? hi : lo + ((hi - lo) * k) / steps
        const now = seesAt(t)
        if (now !== prev) {
          let a = prevT
          let b = t
          for (let it = 0; it < 9; it++) {
            const m = (a + b) * 0.5
            if (seesAt(m) === prev) a = m
            else b = m
          }
          const edge = (a + b) * 0.5
          if (now) begin(edge, floor)
          else close(edge)
        }
        prev = now
        prevT = t
      }
      if (prev) out[n - 1]!.t1 = t1
    }
    // This cell now stands between the eye and everything further out.
    if (top !== VOID) _horizon = Math.max(_horizon, top <= eyeY ? (top - eyeY) / exit : t0 > 0 ? (top - eyeY) / t0 : Infinity)
    if (t1 >= range || _horizon === Infinity) break
    if (tMaxX < tMaxZ) {
      cx += stepX
      tMaxX += tDeltaX
    } else {
      cz += stepZ
      tMaxZ += tDeltaZ
    }
    t0 = exit
    if ((cx < 0 && stepX < 0) || (cx >= g.w && stepX > 0) || (cz < 0 && stepZ < 0) || (cz >= g.d && stepZ > 0)) break
  }
  return n
}

const _box = new Box3()

/**
 * How high the top of a unit's model stands over its feet, as it is drawn
 * (the hound is scaled down and lifted onto its legs; a guard's helmet
 * counts): the marks over a unit sit above this, never in its face.
 */
export const modelTop = (rig: Rig, kind: PostKind): number => {
  // One rig of a kind (and its kit: a different part count) stands as high as
  // the next: worked out once (#36; it skins every vertex to find out).
  const key = `${kind}:${rig.mesh.geometry.attributes.position!.count}`
  const hit = tops.get(key)
  if (hit !== undefined) return hit
  const top = measureTop(rig, kind)
  tops.set(key, top)
  return top
}
const tops = new Map<string, number>()

const measureTop = (rig: Rig, kind: PostKind): number => {
  const root = rig.root
  const hound = kind === 'hound'
  if (hound) poseRobodog(rig, restDogPose())
  else if (kind === 'guard' || kind === 'sentry' || kind === 'commander') poseGuard(rig, restGuardPose())
  root.position.set(0, hound ? DOG_STAND * HOUND_SCALE : 0, 0)
  root.rotation.set(0, 0, 0)
  root.scale.setScalar(hound ? HOUND_SCALE : 1)
  root.updateMatrixWorld(true)
  _box.setFromObject(root)
  root.position.set(0, 0, 0)
  root.scale.setScalar(1)
  return _box.isEmpty() ? SPECS[kind].height : _box.max.y
}

interface UnitView {
  rig: Rig
  /** A caged searchlight's glass and bars (#163); it stands with the lamp, it does not turn with it. */
  cage: { group: Group; dispose(): void } | null
  shadow: Mesh
  mark: Sprite | null
  /** Drones: the light on the ground and the beam down to it. */
  spot: Mesh | null
  beam: Mesh | null
  /** The pool's grid points, scratch: x, y, z, alpha. */
  pool: Float32Array | null
  /** Index of its cone in the shared mesh, or −1. */
  cone: number
  guard: GuardPose | null
  drone: DronePose | null
  enforcer: EnforcerPose | null
  goliath: GoliathPose | null
  /** The Scrap Hound's gallop. */
  dog: DogPose | null
  lamp: SearchlightPose | null
  /** Eased 0 … 1 pose values. */
  aim: number
  wary: number
  caution: number
  /** Humans: eased 0 … 1 while the mech has hold of it. */
  grip: number
  /** Humans (#148): eased 0 … 1 down on one knee by a body it found; at work on a crank or a repair. */
  kneelBy: number
  work: number
  /** A shield guard's shield, eased 0 … 1 (#151). */
  shieldUp: number
  spin: number
  /** Drones: last frame's heading, and the bank it is easing into. */
  lastYaw: number
  bank: number
  /** The mark's pop when the state changes. */
  pop: number
  /** Tagged through the scope: a diamond over it (seen through walls) and its round on the ground. */
  tag: Sprite | null
  route: Line | null
  lastState: string
  /** Seconds left of the flash a hit gives it. */
  flash: number
  /** It burst: the rig is gone and its pieces lie where they fell. */
  wrecked: boolean
  /** A drone that fell whole has hit the ground (and shed a few parts). */
  landed: boolean
  roomba: RoombaPose | null
  /** The top of its model over its feet, as drawn: its marks sit over that. */
  top: number
  /** The cone as last cast: from where and facing where, on which frame, in which state and colour, and how many of its vertices it uses. */
  clipX: number
  clipZ: number
  clipYaw: number
  clipFrame: number
  clipState: string
  clipTint: Color | null
  used: number
  /** Where the cone was last laid (NaN: lay it again). */
  laidX: number
  laidZ: number
  laidYaw: number
}

/** The "?" and the "!", drawn as shapes: no font, so no wait for one. */
/** A small canvas sprite: a diamond (a tagged unit) or three dots (a pair talking). */
const glyphTexture = (kind: 'tag' | 'chat'): CanvasTexture => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.lineJoin = 'round'
  g.lineCap = 'round'
  const draw = (): void => {
    if (kind === 'tag') {
      g.beginPath()
      g.moveTo(64, 30); g.lineTo(92, 64); g.lineTo(64, 98); g.lineTo(36, 64); g.closePath()
      g.stroke()
    } else {
      for (const x of [38, 64, 90]) { g.beginPath(); g.arc(x, 70, 2, 0, Math.PI * 2); g.stroke() }
    }
  }
  g.strokeStyle = '#150c2b'
  g.lineWidth = kind === 'tag' ? 24 : 30
  draw()
  g.strokeStyle = '#ffffff'
  g.lineWidth = kind === 'tag' ? 12 : 18
  draw()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

const markTexture = (bang: boolean, siren = false): CanvasTexture => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const draw = (): void => {
    if (siren) {
      // A siren lamp with three rays: this one is running to raise the alarm.
      g.beginPath()
      g.arc(64, 78, 22, Math.PI, 0)
      g.lineTo(86, 92)
      g.lineTo(42, 92)
      g.closePath()
      g.stroke()
      for (const [x1, y1, x2, y2] of [[64, 30, 64, 44], [30, 46, 40, 56], [98, 46, 88, 56]]) {
        g.beginPath(); g.moveTo(x1!, y1!); g.lineTo(x2!, y2!); g.stroke()
      }
      return
    }
    if (bang) {
      g.beginPath()
      g.moveTo(64, 26)
      g.lineTo(64, 70)
      g.stroke()
    } else {
      g.beginPath()
      g.arc(64, 46, 20, Math.PI * 1.05, Math.PI * 2.45)
      g.lineTo(64, 76)
      g.stroke()
    }
    g.beginPath()
    g.arc(64, 100, 1, 0, Math.PI * 2)
    g.stroke()
  }
  g.strokeStyle = '#150c2b'
  g.lineWidth = 30
  draw()
  g.strokeStyle = '#ffffff'
  g.lineWidth = 17
  draw()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/**
 * What each machine comes apart into. `half` is the body the pieces start
 * in (metres either side of its middle), `lift` how far up that middle is.
 */
const WRECKS: Partial<Record<PostKind, {
  count: number; size: [number, number]; half: [number, number, number]; lift: number; force: number; colors: readonly string[]
}>> = {
  searchlight: { count: 7, size: [0.1, 0.26], half: [0.3, 0.25, 0.3], lift: -0.1, force: 5.6, colors: [PAL.steel, PAL.steelDeep, PAL.steelDark, PAL.glowWhite] },
  drone: { count: 9, size: [0.1, 0.24], half: [0.3, 0.15, 0.3], lift: 0, force: 6.3, colors: [PAL.steel, PAL.steelDeep, PAL.steelDark, PAL.glowRed] },
  enforcer: { count: 26, size: [0.22, 0.62], half: [0.8, 1.4, 0.6], lift: 0.4, force: 9, colors: [PAL.steel, PAL.steel, PAL.steelDeep, PAL.steelDeep, PAL.steelDark, PAL.steelDark, PAL.glowYellow] },
  // A person blown apart in a kill-cam (#64): cloth, skin, boots and the helmet.
  guard: { count: 16, size: [0.1, 0.28], half: [0.25, 0.8, 0.2], lift: 0.9, force: 7, colors: [PAL.uniform, PAL.uniformDeep, PAL.skin, PAL.boot, PAL.helmet, PAL.uniform] },
  sentry: { count: 16, size: [0.1, 0.28], half: [0.25, 0.8, 0.2], lift: 0.9, force: 7, colors: [PAL.uniform, PAL.uniformDeep, PAL.skin, PAL.boot, PAL.helmet, PAL.uniform] },
  hound: { count: 10, size: [0.1, 0.26], half: [0.3, 0.3, 0.6], lift: 0.5, force: 6.3, colors: [PAL.steel, PAL.steelDeep, PAL.steelDark, PAL.glowRed] },
  roomba: { count: 10, size: [0.1, 0.26], half: [0.5, 0.2, 0.5], lift: 0.25, force: 6, colors: [PAL.steel, PAL.steelDeep, PAL.steelDark, PAL.hazard, PAL.glowRed] },
  goliath: { count: 54, size: [0.35, 1.1], half: [1.9, 1.1, 2.9], lift: 0.5, force: 12, colors: [PAL.steel, PAL.steel, PAL.steelDeep, PAL.steelDeep, PAL.steelDark, PAL.steelDark, PAL.steelDark, PAL.hazard] }
}

/** How hard each machine comes apart into its parts (m/s, `fx/shatter.ts`). */
const SHATTER_FORCE: Partial<Record<PostKind, number>> = {
  drone: 3.2, searchlight: 3, roomba: 3.4, hound: 3.8, enforcer: 4.4, goliath: 5
}

export class GarrisonView {
  readonly group = new Group()
  private views: UnitView[] = []
  private cones: Mesh
  private conePos: Float32Array
  /** Each cone as last cast, around its unit: x and z from where it stood, y as drawn. */
  private coneLocal: Float32Array
  private coneCol: Float32Array
  private conePosAttr: BufferAttribute
  private coneColAttr: BufferAttribute
  private coneCount = 0
  /** Scratch: the cones cast this frame, and how out of date each was. */
  private castPick = new Int32Array(CONE_CASTS)
  private castScore = new Float64Array(CONE_CASTS)
  private flashColor = new Color()
  /** Scratch for one cone: the stretches seen along each of its rays, and how many. */
  private rays: Span[][] = Array.from({ length: CONE_SEGS + 1 }, () => [])
  private rayN = new Int32Array(CONE_SEGS + 1)
  /** Scratch: the strips one cone is filled with, STRIP numbers each (see `strip`). */
  private strips: number[] = []
  private textures: CanvasTexture[]
  private frame = 0
  /** The helmet the base issues after too many headshots: a steel dome and a brow plate. */
  private helmetGeo = merge([
    paint(dome(0.275, Math.PI * 0.55, 10, 6).translate(0, 0.23, 0), PAL.steel),
    paint(rbox(0.42, 0.06, 0.1, 0.5, 6, 4).translate(0, 0.25, 0.21), PAL.steelDeep)
  ])
  /** Generic debris: a person blown apart, a helmet popped off. */
  readonly wreckage: Wreckage
  /** Destroyed machines, each in the parts it was built from (#139). */
  readonly shatter: Shatter
  private beamGeo = new CylinderGeometry(0.03, 1, 1, 16, 1, true)

  /** A body it has found lies within reach of a kneel (#148). */
  private byFoundBody(u: Unit): boolean {
    for (const c of this.gar.units) {
      if (c === u || c.state !== 'dead' || !c.found || c.hidden) continue
      if (Math.abs(c.x - u.x) < 1.9 && Math.abs(c.z - u.z) < 1.9) return true
    }
    return false
  }

  constructor(private gar: Garrison, private grid: Grid) {
    this.wreckage = new Wreckage(grid)
    this.group.add(this.wreckage.mesh)
    this.shatter = new Shatter(grid)
    this.group.add(this.shatter.group)
    const q = markTexture(false)
    const bang = markTexture(true)
    const siren = markTexture(false, true)
    this.textures = [q, bang, siren, glyphTexture('tag'), glyphTexture('chat')]
    this.beamGeo.translate(0, -0.5, 0)

    for (const u of gar.units) {
      const human = u.kind === 'guard' || u.kind === 'sentry' || u.kind === 'commander'
      const rig = u.kind === 'drone' ? buildDrone()
        : u.kind === 'hound' ? buildRobodog(true)
        : u.kind === 'roomba' ? buildRoomba(u.shotgun)
        : u.kind === 'searchlight' ? buildSearchlight()
        : u.kind === 'enforcer' ? buildEnforcer(u.boss === 'foreman')
          : u.kind === 'goliath' ? buildGoliath()
            : buildGuard(u.kind === 'commander', u.shield, u.role === 'engineer', u.role === 'grenadier' || u.role === 'marksman' ? u.role : null)
      const shadow = makeBlobShadow(SPECS[u.kind].radius * 1.5)
      let mark: Sprite | null = null
      if (human || isLight(u) || u.kind === 'hound' || u.kind === 'roomba') {
        mark = new Sprite(new SpriteMaterial({ map: q, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
        mark.renderOrder = 30
        // Anchored at its foot, which sits over the top of the model (see `update`).
        mark.center.set(0.5, 0)
        mark.visible = false
      }
      let spot: Mesh | null = null
      let beam: Mesh | null = null
      if (isLight(u)) {
        const geo = new BufferGeometry()
        const pos = new BufferAttribute(new Float32Array(POOL_VERTS * 3), 3)
        const col = new BufferAttribute(new Float32Array(POOL_VERTS * 4), 4)
        pos.setUsage(DynamicDrawUsage)
        col.setUsage(DynamicDrawUsage)
        geo.setAttribute('position', pos)
        geo.setAttribute('color', col)
        spot = new Mesh(geo, new MeshBasicMaterial({
          color: CALM.clone(), vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        }))
        spot.frustumCulled = false
        spot.renderOrder = 2
        beam = new Mesh(this.beamGeo, new MeshBasicMaterial({
          // A searchlight's beam is the brighter one: it is how you read where it is looking.
          color: CALM.clone(), transparent: true, opacity: u.kind === 'searchlight' ? 0.12 : 0.07, depthWrite: false, toneMapped: false
        }))
        beam.renderOrder = 3
      }
      const cage = u.caged ? buildLampCage() : null
      if (cage) this.group.add(cage.group)
      const v: UnitView = {
        rig, cage, shadow, mark, spot, beam, pool: spot ? new Float32Array((POOL_SEGS + 1) * (POOL_RINGS + 1) * 4) : null,
        cone: human || u.kind === 'hound' || u.kind === 'roomba' ? this.coneCount++ : -1,
        guard: human ? { ...restGuardPose(), seed: (u.seed * 0.618) % 1, proud: u.kind === 'commander' } : null,
        drone: u.kind === 'drone' ? { time: 0, spin: 0, pitch: 0, roll: 0, eyeYaw: 0, eyePitch: 0.5, alarm: 0, deadT: 0, landed: false } : null,
        enforcer: u.kind === 'enforcer' ? { time: 0, stride: 0, speed: 0, power: 0, aimYaw: 0, aimPitch: 0, recoilL: 0, recoilR: 0, deadT: 0 } : null,
        lamp: u.kind === 'searchlight' ? { time: 0, yaw: 0, pitch: 0.6, alarm: 0 } : null,
        goliath: u.kind === 'goliath' ? { time: 0, turretYaw: 0, barrelPitch: 0, recoil: 0, rumble: 0, dead: 0 } : null,
        dog: u.kind === 'hound' ? restDogPose() : null,
        roomba: u.kind === 'roomba' ? { time: 0, alarm: 0, recoil: 0, aimYaw: 0, speed: 0 } : null,
        aim: 0, wary: 0, caution: 0, grip: 0, kneelBy: 0, work: 0, shieldUp: 0, spin: 0, lastYaw: u.yaw, bank: 0, pop: 0, lastState: u.state, flash: 0, wrecked: false, landed: false,
        tag: null, route: null, top: 0,
        clipX: u.x, clipZ: u.z, clipYaw: u.yaw, clipFrame: 0, clipState: u.state, clipTint: null, used: 0,
        laidX: NaN, laidZ: NaN, laidYaw: NaN
      }
      this.views.push(v)
      this.group.add(rig.root, shadow)
      if (mark) this.group.add(mark)
      // A helmet (R26): a steel cap on the head bone, over the guard's own.
      if (u.helmet && rig.bones.head) {
        const cap = new Mesh(this.helmetGeo, rig.material)
        cap.name = 'helmet'
        rig.bones.head.add(cap)
      }
      v.top = modelTop(rig, u.kind)
      if (spot) this.group.add(spot)
      if (beam) this.group.add(beam)
    }

    // The cones: a fan of triangles per guard, in one buffer.
    const n = Math.max(1, this.coneCount) * CONE_VERTS
    this.conePos = new Float32Array(n * 3)
    this.coneLocal = new Float32Array(n * 3)
    this.coneCol = new Float32Array(n * 4)
    const geo = new BufferGeometry()
    const pos = this.conePosAttr = new BufferAttribute(this.conePos, 3)
    const col = this.coneColAttr = new BufferAttribute(this.coneCol, 4)
    pos.setUsage(DynamicDrawUsage)
    col.setUsage(DynamicDrawUsage)
    geo.setAttribute('position', pos)
    geo.setAttribute('color', col)
    this.cones = new Mesh(geo, new MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    }))
    this.cones.frustumCulled = false
    this.cones.renderOrder = 2
    this.group.add(this.cones)
    for (let i = 0; i < gar.units.length; i++) this.writeCone(i)
  }

  addTo(scene: Scene): void {
    scene.add(this.group)
  }

  /**
   * A machine comes apart: its rig is taken away and rounded cubes in its own
   * colours fly from where it stood. They stay where they land.
   */
  burst(id: number): void {
    const u = this.gar.units[id]
    const v = this.views[id]
    if (!u || !v || v.wrecked) return
    v.wrecked = true
    // A machine comes apart into its own parts, from the pose it died in.
    const force = SHATTER_FORCE[u.kind]
    if (force && this.shatter.break(id, v.rig, { dirX: u.hitX, dirZ: u.hitZ, force, seed: u.seed })) return
    const spec = WRECKS[u.kind]
    if (!spec) return
    this.wreckage.burst({
      x: u.x, y: u.y + spec.lift, z: u.z,
      hx: spec.half[0], hy: spec.half[1], hz: spec.half[2],
      count: spec.count, size: spec.size, colors: spec.colors, force: spec.force,
      dirX: u.hitX, dirZ: u.hitZ
    })
  }

  /** A round took a guard's helmet off: the cap goes, in a few pieces. */
  popHelmet(id: number, dirX: number, dirZ: number): void {
    const v = this.views[id]
    const u = this.gar.units[id]
    const cap = v?.rig.bones.head?.getObjectByName('helmet')
    if (!v || !u || !cap) return
    cap.removeFromParent()
    this.wreckage.burst({ x: u.x, y: u.y + 1.8, z: u.z, hx: 0.15, hy: 0.1, hz: 0.15, count: 3, size: [0.1, 0.18], colors: [PAL.steel, PAL.steelDeep], force: 3.5, dirX: -dirX, dirZ: -dirZ })
  }

  /** Light a defender up for a moment (a hit, the x-ray of a kill-cam). */
  /** A defender's rig as drawn (its bones were posed last frame), for the muzzle of its weapon. */
  rigOf(id: number): Rig | null {
    const v = this.views[id]
    return v && !v.wrecked ? v.rig : null
  }

  /** A unit stood up again (the training ground): its rig whole and showing again. */
  restore(id: number): void {
    const v = this.views[id]
    if (!v) return
    this.shatter.clear(id)
    v.wrecked = false
    v.landed = false
    v.grip = 0
    v.rig.root.visible = true
    v.rig.root.scale.setScalar(1)
    const sb = v.rig.bones.shield
    if (sb) sb.scale.setScalar(1)
    this.flash(id, '#5fe9ff', 0.8)
  }

  flash(id: number, hex: string, seconds = 0.5): void {
    const v = this.views[id]
    if (!v) return
    v.flash = seconds
    this.flashColor.set(hex)
    v.rig.material.emissive.copy(this.flashColor)
  }

  /**
   * Rewrite one guard's cone: where it looks and as far as it sees, lying on
   * the ground. Each ray runs to the face of whatever hides the ground from
   * the guard's eye and starts again where ground shows past it; each slice
   * is filled stretch to stretch between its two rays, so the cone fills
   * everything the guard sees right up to the edge of the next wall, crate or
   * post, and the lee behind it stays dark.
   */
  private writeCone(i: number): void {
    const u = this.gar.units[i]!
    const v = this.views[i]!
    if (v.cone < 0) return
    const base = v.cone * CONE_VERTS
    const p = this.conePos
    const L = this.coneLocal
    const c = this.coneCol
    let w = base
    // Cast from where the simulation has it; `placeCone` carries the shape along with the drawn body.
    v.clipX = u.x
    v.clipZ = u.z
    v.clipYaw = u.yaw + u.look
    v.clipFrame = this.frame
    v.clipState = u.state
    if (u.state !== 'dead' && u.state !== 'combat' && u.state !== 'reserve') {
      const spec = SPECS[u.kind]
      // As wide and as far as it sees right now: wary, chatting, focused (#69).
      const view = viewerOf(u, this.gar.heightened)
      const g = this.grid
      const yaw = u.yaw + u.look
      const tint = this.coneTint(u)
      v.clipTint = tint
      const eyeY = u.y + spec.eye
      const range = view.range
      const angle = (s: number): number => yaw - view.halfAngle + (2 * view.halfAngle * s) / CONE_SEGS
      for (let s = 0; s <= CONE_SEGS; s++) {
        const a = angle(s)
        this.rayN[s] = sightSpans(g, u.x, u.z, u.y, eyeY, Math.sin(a), Math.cos(a), range, CONE_PROBE_Y, this.rays[s]!)
      }
      const st = this.strips
      st.length = 0
      for (let s = 0; s < CONE_SEGS; s++) this.pairSlice(angle(s), s, angle(s + 1), s + 1)
      // Rings about CONE_STEP apart, wider when the cone would want more quads than it has.
      const count = Math.min(st.length / STRIP, CONE_QUADS)
      let step = CONE_STEP
      for (let tries = 0; tries < 24; tries++) {
        let quads = 0
        for (let k = 0; k < count; k++) {
          const o = k * STRIP
          quads += Math.max(1, Math.ceil(Math.max(st[o + 2]! - st[o + 1]!, st[o + 6]! - st[o + 5]!) / step))
        }
        if (quads <= CONE_QUADS) break
        step *= 1.25
      }
      let quads = 0
      const put = (x: number, y: number, z: number, t: number): void => {
        L[w * 3] = x - u.x
        L[w * 3 + 1] = y + 0.07
        L[w * 3 + 2] = z - u.z
        c[w * 4] = tint.r
        c[w * 4 + 1] = tint.g
        c[w * 4 + 2] = tint.b
        // Strong near the guard, fading out toward the edge of its sight.
        const k = Math.min(1, t / range)
        c[w * 4 + 3] = 0.4 * (1 - k) * (1 - k) + 0.08
        w++
      }
      for (let k = 0; k < count; k++) {
        const o = k * STRIP
        const thA = st[o]!, a0 = st[o + 1]!, a1 = st[o + 2]!, yA = st[o + 3]!
        const thB = st[o + 4]!, b0 = st[o + 5]!, b1 = st[o + 6]!, yB = st[o + 7]!
        const flags = st[o + 8]!
        const half = (flags & 1) !== 0
        const flatA = (flags & 2) !== 0
        const flatB = (flags & 4) !== 0
        const sA = Math.sin(thA), cA = Math.cos(thA), sB = Math.sin(thB), cB = Math.cos(thB)
        const n = Math.min(CONE_QUADS - quads, Math.max(1, Math.ceil(Math.max(a1 - a0, b1 - b0) / step)))
        if (n <= 0) break
        quads += n
        let pax = 0, pay = 0, paz = 0, pat = 0, pbx = 0, pby = 0, pbz = 0, pbt = 0
        for (let r = 0; r <= n; r++) {
          const ta = a0 + ((a1 - a0) * r) / n
          const tb = b0 + ((b1 - b0) * r) / n
          const ax = u.x + sA * ta, az = u.z + cA * ta
          const ay = flatA ? yA : this.floorOn(ax, az, u.y, sA, cA, ta, a0, a1, yA)
          const bx = u.x + sB * tb, bz = u.z + cB * tb
          // A half slice (only one ray sees it) lies at its ray's height.
          const by = half ? ay : flatB ? yB : this.floorOn(bx, bz, u.y, sB, cB, tb, b0, b1, yB)
          if (r > 0) {
            put(pax, pay, paz, pat); put(ax, ay, az, ta); put(bx, by, bz, tb)
            put(pax, pay, paz, pat); put(bx, by, bz, tb); put(pbx, pby, pbz, pbt)
          }
          pax = ax; pay = ay; paz = az; pat = ta
          pbx = bx; pby = by; pbz = bz; pbt = tb
        }
      }
    }
    v.used = w - base
    // The quads it does not need: folded to a point, and clear.
    for (; w < base + CONE_VERTS; w++) {
      p[w * 3] = u.x
      p[w * 3 + 1] = u.y
      p[w * 3 + 2] = u.z
      c[w * 4 + 3] = 0
    }
    this.conePosAttr.addUpdateRange(base * 3, CONE_VERTS * 3)
    this.coneColAttr.addUpdateRange(base * 4, CONE_VERTS * 4)
    v.laidX = NaN
    this.placeCone(v, u.x, u.z, v.clipYaw)
  }

  /** The cone's colour: calm while it walks its round unbothered, yellow once something is up. */
  private coneTint(u: Unit): Color {
    return u.state === 'patrol' && u.detect < SUSPECT_AT * 0.5 ? CALM : WARY
  }

  /**
   * Lay a cone where its unit is drawn this frame, at (x, z) facing `yaw`:
   * the shape last cast, carried and turned with the body, so it never
   * trails behind it between two casts.
   */
  private placeCone(v: UnitView, x: number, z: number, yaw: number): void {
    if (v.cone < 0 || v.used === 0) return
    // Standing still: it lies where it was laid.
    if (x === v.laidX && z === v.laidZ && yaw === v.laidYaw) return
    v.laidX = x
    v.laidZ = z
    v.laidYaw = yaw
    const base = v.cone * CONE_VERTS
    const p = this.conePos
    const L = this.coneLocal
    const d = yaw - v.clipYaw
    const s = Math.sin(d)
    const c = Math.cos(d)
    for (let k = base; k < base + v.used; k++) {
      const lx = L[k * 3]!
      const lz = L[k * 3 + 2]!
      p[k * 3] = x + lx * c + lz * s
      p[k * 3 + 1] = L[k * 3 + 1]!
      p[k * 3 + 2] = z - lx * s + lz * c
    }
    this.conePosAttr.addUpdateRange(base * 3, v.used * 3)
  }

  /**
   * The floor under a point `t` along a ray of a stretch from `t0` to `t1`
   * that started at height `y`, looked up a little inside the stretch so a
   * point on its end (a wall's foot) never takes the next cell's height.
   */
  private floorOn(x: number, z: number, feetY: number, sx: number, sz: number, t: number, t0: number, t1: number, y: number): number {
    const lo = t0 + 0.03
    const hi = t1 - 0.03
    const tc = lo < hi ? Math.min(hi, Math.max(lo, t)) : (t0 + t1) * 0.5
    const f = floorAt(this.grid, x + sx * (tc - t), z + sz * (tc - t), feetY)
    return f === VOID ? y : f
  }

  /**
   * Fill one slice, between the rays `ra` (at angle `thA`) and `rb`: each
   * stretch on one is paired with the stretch on the other at the same level
   * that overlaps it, so the edge between them runs from hit to hit along
   * the face that stopped them. Where one ray sees past something (a post's
   * shadow) that the other does not, the other's stretch is split in the
   * middle of the gap, and the shadow tapers between them. A stretch with no
   * partner fills half the slice, out to the bisector.
   */
  private pairSlice(thA: number, ra: number, thB: number, rb: number): void {
    const A = this.rays[ra]!
    const B = this.rays[rb]!
    const nA = this.rayN[ra]!
    const nB = this.rayN[rb]!
    const thM = (thA + thB) * 0.5
    let i = 0
    let j = 0
    let aS = nA > 0 ? A[0]!.t0 : 0
    let bS = nB > 0 ? B[0]!.t0 : 0
    // The next stretch on `L` after `from` at the level `y`.
    const next = (L: Span[], from: number, nL: number, y: number): Span | null => {
      for (let k = from; k < nL; k++) if (Math.abs(L[k]!.y - y) <= CONE_STEP_Y) return L[k]!
      return null
    }
    while (i < nA && j < nB) {
      const a = A[i]!
      const b = B[j]!
      const level = Math.abs(a.y - b.y) <= CONE_STEP_Y
      const overlap = Math.min(a.t1, b.t1) > Math.max(aS, bS)
      if (!level || !overlap) {
        if (a.t1 <= b.t1) {
          this.strip(thA, aS, a.t1, a, thM, aS, a.t1, a, 1)
          if (++i < nA) aS = A[i]!.t0
        } else {
          this.strip(thB, bS, b.t1, b, thM, bS, b.t1, b, 1)
          if (++j < nB) bS = B[j]!.t0
        }
        continue
      }
      if (a.t1 > b.t1) {
        const nb = next(B, j + 1, nB, a.y)
        if (nb && nb.t0 < a.t1) {
          const m = Math.min(a.t1 - 0.01, Math.max(aS + 0.01, (b.t1 + nb.t0) * 0.5))
          this.strip(thA, aS, m, a, thB, bS, b.t1, b, 0)
          aS = m
          if (++j < nB) bS = B[j]!.t0
          continue
        }
      } else if (b.t1 > a.t1) {
        const na = next(A, i + 1, nA, b.y)
        if (na && na.t0 < b.t1) {
          const m = Math.min(b.t1 - 0.01, Math.max(bS + 0.01, (a.t1 + na.t0) * 0.5))
          this.strip(thA, aS, a.t1, a, thB, bS, m, b, 0)
          bS = m
          if (++i < nA) aS = A[i]!.t0
          continue
        }
      }
      this.strip(thA, aS, a.t1, a, thB, bS, b.t1, b, 0)
      if (++i < nA) aS = A[i]!.t0
      if (++j < nB) bS = B[j]!.t0
    }
    for (; i < nA; i++) {
      this.strip(thA, aS, A[i]!.t1, A[i]!, thM, aS, A[i]!.t1, A[i]!, 1)
      if (i + 1 < nA) aS = A[i + 1]!.t0
    }
    for (; j < nB; j++) {
      this.strip(thB, bS, B[j]!.t1, B[j]!, thM, bS, B[j]!.t1, B[j]!, 1)
      if (j + 1 < nB) bS = B[j + 1]!.t0
    }
  }

  /**
   * One strip of a slice: from `a0` to `a1` along the ray at `thA` (part of
   * the stretch `sa`), to `b0` … `b1` along `thB` (of `sb`); `half` when the
   * second side is the bisector. Its last number packs `half` and whether
   * each side lies flat (no floor to look up under it).
   */
  private strip(thA: number, a0: number, a1: number, sa: Span, thB: number, b0: number, b1: number, sb: Span, half: number): void {
    if (a1 - a0 < 1e-3 && b1 - b0 < 1e-3) return
    this.strips.push(thA, a0, a1, sa.y, thB, b0, b1, sb.y, half | (sa.flat ? 2 : 0) | (sb.flat ? 4 : 0))
  }

  /**
   * Rewrite one light's pool round (cx, cz): draped on the ground, and dark
   * wherever a wall or a crate stands between the point and the lamp, or the
   * point and the middle of the pool (the same test the simulation uses for
   * being lit, so what is drawn lit IS lit, #69).
   */
  private writePool(v: UnitView, lx: number, ly: number, lz: number, cx: number, cz: number, radius: number): void {
    const g = this.grid
    const gp = v.pool!
    const mid = heightAt(g, cx, cz)
    const midY = mid === VOID ? 0 : mid
    const H = POOL_RINGS + 1
    for (let s = 0; s <= POOL_SEGS; s++) {
      const a = (s / POOL_SEGS) * Math.PI * 2
      const dx = Math.sin(a)
      const dz = Math.cos(a)
      for (let r = 0; r < H; r++) {
        const k = r / POOL_RINGS
        const o = (s * H + r) * 4
        const x = cx + dx * radius * k
        const z = cz + dz * radius * k
        const floor = r === 0 ? midY : heightAt(g, x, z)
        const y = floor === VOID ? midY : floor
        gp[o] = x
        gp[o + 1] = y + 0.08
        gp[o + 2] = z
        const lit = floor !== VOID && (r === 0 || (hasLineOfSight(g, cx, midY + 1.0, cz, x, y + 0.3, z) && hasLineOfSight(g, lx, ly, lz, x, y + 0.3, z)))
        gp[o + 3] = lit ? POOL_ALPHA * (1 - 0.45 * k) : 0
      }
    }
    const geo = v.spot!.geometry
    const p = geo.attributes.position!.array as Float32Array
    const c = geo.attributes.color!.array as Float32Array
    let w = 0
    const put = (o: number, alpha: number): void => {
      p[w * 3] = gp[o]!
      p[w * 3 + 1] = gp[o + 1]!
      p[w * 3 + 2] = gp[o + 2]!
      c[w * 4] = 1
      c[w * 4 + 1] = 1
      c[w * 4 + 2] = 1
      c[w * 4 + 3] = alpha
      w++
    }
    for (let s = 0; s < POOL_SEGS; s++) {
      for (let r = 0; r < POOL_RINGS; r++) {
        const a = (s * H + r) * 4
        const b = (s * H + r + 1) * 4
        const d = ((s + 1) * H + r) * 4
        const e = ((s + 1) * H + r + 1) * 4
        const ys = [gp[a + 1]!, gp[b + 1]!, gp[d + 1]!, gp[e + 1]!]
        const k = Math.max(...ys) - Math.min(...ys) < CONE_CLIFF ? 1 : 0
        put(a, gp[a + 3]! * k); put(b, gp[b + 3]! * k); put(e, gp[e + 3]! * k)
        put(a, gp[a + 3]! * k); put(e, gp[e + 3]! * k); put(d, gp[d + 3]! * k)
      }
    }
    geo.attributes.position!.needsUpdate = true
    geo.attributes.color!.needsUpdate = true
  }

  /**
   * Draw this frame: `alpha` between the last two steps, `dt` of real time,
   * the camera's position for the marks' size.
   */
  update(alpha: number, dt: number, time: number, camX: number, camY: number, camZ: number): void {
    const units = this.gar.units
    this.frame++
    // A few casts per frame, the cones furthest out of date first (moved,
    // turned, changed state, or simply old); every cone is carried with its
    // unit below, every frame.
    const pick = this.castPick
    const best = this.castScore
    pick.fill(-1)
    best.fill(-Infinity)
    for (let i = 0; i < units.length; i++) {
      const v = this.views[i]!
      if (v.cone < 0) continue
      const u = units[i]!
      const changed = u.state !== v.clipState || (v.used > 0 && this.coneTint(u) !== v.clipTint)
      const score = changed ? 1e6 : Math.hypot(u.x - v.clipX, u.z - v.clipZ) * 2
        + Math.abs(angleDelta(v.clipYaw, u.yaw + u.look)) * 8 + (this.frame - v.clipFrame) * 0.05
      for (let k = 0; k < CONE_CASTS; k++) {
        if (score <= best[k]!) continue
        for (let m = CONE_CASTS - 1; m > k; m--) { best[m] = best[m - 1]!; pick[m] = pick[m - 1]! }
        best[k] = score
        pick[k] = i
        break
      }
    }
    for (let k = 0; k < CONE_CASTS; k++) if (pick[k]! >= 0) this.writeCone(pick[k]!)
    this.cones.geometry.attributes.position!.needsUpdate = true
    this.cones.geometry.attributes.color!.needsUpdate = true
    const ease = Math.min(1, dt * 8)
    this.wreckage.update(dt)
    this.shatter.update(dt)

    for (let i = 0; i < units.length; i++) {
      const u = units[i]!
      const v = this.views[i]!
      // Not in the base yet: nothing of it is drawn.
      // A light the Engineer has fixed is whole again.
      if (v.wrecked && u.state !== 'dead') { v.wrecked = false; this.shatter.clear(i) }
      const here = u.state !== 'reserve' && !v.wrecked && !u.hidden
      v.rig.root.visible = here
      v.shadow.visible = here
      if (!here) {
        if (v.mark) v.mark.visible = false
        if (v.tag) v.tag.visible = false
        if (v.route) v.route.visible = false
        // A light shot to pieces takes its beam and its pool with it (#61).
        if (v.spot) v.spot.visible = false
        if (v.beam) v.beam.visible = false
        continue
      }
      const x = u.px + (u.x - u.px) * alpha
      const y = u.py + (u.y - u.py) * alpha
      const z = u.pz + (u.z - u.pz) * alpha
      const yaw = u.pyaw + angleDelta(u.pyaw, u.yaw) * alpha
      v.rig.root.position.set(x, y, z)
      v.rig.root.rotation.y = yaw
      v.cage?.group.position.set(x, y, z)
      if (v.cone >= 0) {
        // The cone goes with the body as drawn, a touch ahead of its motion (a teleport is not motion).
        const lead = CONE_LEAD_S / STEP
        let lx = (u.x - u.px) * lead
        let lz = (u.z - u.pz) * lead
        const far = Math.hypot(lx, lz)
        if (far > 0.4) { lx = 0; lz = 0 }
        const turn = Math.max(-0.3, Math.min(0.3, angleDelta(u.pyaw, u.yaw) * lead))
        this.placeCone(v, x + lx, z + lz, yaw + turn + u.look)
      }
      const hot = u.state === 'combat'
      const wary = u.state === 'suspicious' || u.state === 'search'
      // At a disguise (#111): puzzled while it stares, the gun up as it backs off to test it.
      const testing = u.inspect?.phase === 'back' || u.inspect?.phase === 'shot'
      const puzzled = !!u.inspect && !testing
      v.aim += ((hot || testing ? 1 : 0) - v.aim) * ease
      v.wary += ((wary ? 1 : 0) - v.wary) * ease
      v.caution += ((wary ? 1 : 0) - v.caution) * Math.min(1, dt * 4)
      if (u.state !== v.lastState) {
        v.lastState = u.state
        v.pop = 1
      }
      v.pop = Math.max(0, v.pop - dt * 3.5)
      if (v.flash > 0) {
        v.flash -= dt
        // The glow dies away rather than switching off.
        v.rig.material.emissive.multiplyScalar(Math.max(0, 1 - dt * 5))
        if (v.flash <= 0) v.rig.material.emissive.setScalar(0)
      }
      const dead = u.state === 'dead'

      // A guard's shield knocked away (#90): it is gone from its arm.
      const sb = v.rig.bones.shield
      if (sb && !u.shield && sb.scale.x > 0.01) sb.scale.setScalar(0.001)
      if (v.guard) {
        const s = v.guard
        s.time = time + u.seed
        s.stride = u.stride
        s.speed = u.speed01
        s.aim = Math.max(v.aim, u.recoil > 0 ? 1 : 0)
        s.wary = u.state === 'search' ? v.wary : 0
        s.caution = v.caution
        // The mark's pop is the moment it noticed: the body jumps with it.
        s.startle = wary || hot ? v.pop : 0
        s.recoil = Math.min(1, u.recoil * 4)
        s.lookYaw = u.look
        // On the blade it is dead in the simulation and not yet falling.
        const held = dead && u.deadT < u.hold
        v.grip += ((u.gripped || held ? 1 : 0) - v.grip) * Math.min(1, dt * 16)
        s.gripped = dead && !held ? 1 : v.grip
        s.impaled = dead ? Math.min(1, u.deadT / 0.07) : 0
        s.limp = dead ? Math.min(1, Math.max(0, (u.deadT - 0.25) / Math.max(0.2, u.hold - 0.3))) : 0
        if (dead && u.hold <= 0) { s.gripped = 0; s.impaled = 0; s.limp = 0 }
        s.kneel = 0
        // What it does with its hands and knees (#148): stopped by a body it
        // found, it goes down on one knee to look; at a beacon's crank or an
        // Engineer's repair, both hands work; on fire, it flails.
        const still = !dead && !u.gripped && u.speed01 < 0.05 && u.state !== 'combat'
        v.kneelBy += ((still && this.byFoundBody(u) ? 1 : 0) - v.kneelBy) * Math.min(1, dt * 4)
        v.work += ((!dead && u.speed01 < 0.05 && (this.gar.runner === u.id || (!!u.job && still)) ? 1 : 0) - v.work) * Math.min(1, dt * 5)
        s.inspect = v.kneelBy
        s.work = v.work
        s.burning = !dead && u.onFire > 0 ? 1 : 0
        // A shield guard's shield (#151): up over his head, down for a peek.
        v.shieldUp += ((shieldUp(u) ? 1 : 0) - v.shieldUp) * Math.min(1, dt * 7)
        s.shieldUp = u.shield ? v.shieldUp : 0
        // In the mech's hands (a backstab, a drop from a rope): posed as the kill's choreography holds it.
        if (u.held) {
          // Seized, it has no thought for its gun.
          s.aim = 0
          s.caution = 0
          s.wary = 0
          s.startle = 0
          s.recoil = 0
          s.gripped = u.held.grip
          s.impaled = u.held.arch
          s.limp = u.held.limp
          s.kneel = u.held.kneel
        }
        s.deadT = dead && !held ? Math.max(1e-3, u.deadT - u.hold) : 0
        s.death = u.death === 'front' || u.death === 'spin' || u.death === 'thrown' ? u.death : 'back'
        // Fallen and let go: the ragdoll has the body now (#64).
        if (u.rag && dead && u.deadT >= u.hold) {
          poseRagdoll(v.rig, u.rag.p, u.rag.q, alpha)
          v.rig.root.scale.setScalar(1)
        } else poseGuard(v.rig, s)
      } else if (v.drone) {
        const s = v.drone
        // The rotors race when it is alarmed.
        if (!dead) v.spin += dt * (38 + 30 * v.caution)
        s.time = time + u.seed
        s.spin = v.spin
        // It banks into its turns like anything that flies.
        const turn = angleDelta(v.lastYaw, yaw) / Math.max(dt, 1e-3)
        v.lastYaw = yaw
        v.bank += (Math.max(-0.5, Math.min(0.5, -turn * 0.25)) - v.bank) * Math.min(1, dt * 4)
        s.pitch = 0.12 * u.speed01
        s.roll = v.bank + Math.sin(time * 0.9 + u.seed) * 0.05
        // The eye looks down the beam: three metres ahead, from its height.
        s.eyePitch = Math.atan2(Math.max(0.5, y - heightAt(this.grid, x, z)), 3) * 0.75
        s.alarm = dead ? 0 : Math.max(v.caution, hot ? 1 : 0)
        s.deadT = dead ? Math.max(1e-3, u.deadT) : 0
        if (dead && !v.landed && y <= heightAt(this.grid, x, z) + 0.25) {
          // It hits the ground whole, and a few parts of it do not stay on.
          v.landed = true
          this.wreckage.burst({ x, y: y + 0.1, z, hx: 0.3, hy: 0.1, hz: 0.3, count: 5, size: [0.1, 0.2], colors: WRECKS.drone!.colors, force: 3.2, dirX: 0, dirZ: 0 })
        }
        s.landed = v.landed
        if (dead && !v.landed) v.spin += dt * 20
        poseDrone(v.rig, s)
      } else if (v.lamp) {
        const s = v.lamp
        const c = spotCentre(u)
        const gy = heightAt(this.grid, c.x, c.z)
        s.time = time + u.seed
        // The root turns with the unit's yaw (toward its light): the lamp only tips.
        s.yaw = 0
        s.pitch = Math.atan2(y - (gy === VOID ? 0 : gy), Math.max(0.5, Math.hypot(c.x - x, c.z - z)))
        s.alarm = Math.max(v.caution, hot ? 1 : 0)
        poseSearchlight(v.rig, s)
      } else if (v.enforcer) {
        const s = v.enforcer
        s.time = time
        s.stride = u.stride * 0.55
        s.speed = u.speed01
        s.power = u.power
        s.aimPitch = hot ? -0.06 : 0
        // The two guns take turns: the kick alternates with the rounds left.
        s.recoilL = u.burst % 2 === 0 ? u.recoil : 0
        s.recoilR = u.burst % 2 === 1 ? u.recoil : 0
        s.deadT = dead ? Math.max(1e-3, u.deadT) : 0
        poseEnforcer(v.rig, s)
      } else if (v.dog) {
        const s = v.dog
        s.time = time + u.seed
        s.stride = u.stride * 1.6
        s.run = Math.min(1, u.speed01)
        v.rig.root.scale.setScalar(HOUND_SCALE)
        // The rig's origin is its back: lift it to standing height.
        v.rig.root.position.y = y + DOG_STAND * HOUND_SCALE
        poseRobodog(v.rig, s)
      } else if (v.roomba) {
        const s = v.roomba
        s.time = time + u.seed
        s.speed = u.speed01
        s.alarm = Math.max(v.caution, hot ? 1 : 0)
        s.recoil = Math.min(1, u.recoil * 4)
        s.aimYaw += (u.look - s.aimYaw) * Math.min(1, dt * 8)
        poseRoomba(v.rig, s)
      } else if (v.goliath) {
        const s = v.goliath
        s.time = time
        s.turretYaw = u.look
        s.recoil = u.recoil
        // The engine shudders while it drives, and harder while a shell is on its way.
        s.rumble = u.power * Math.max(u.speed01, u.shellT > 0 ? 1 : 0.25)
        s.dead = dead ? Math.min(1, u.deadT / 1.2) : 0
        poseGoliath(v.rig, s)
      }

      // The shadow, on whatever is under it.
      const floor = heightAt(this.grid, x, z)
      v.shadow.visible = floor !== VOID && u.kind !== 'searchlight'
      v.shadow.position.set(x, floor + 0.03, z)

      // The searchlight.
      if (v.spot && v.beam) {
        const on = !dead
        v.spot.visible = on
        v.beam.visible = on
        if (on) {
          const c = spotCentre(u)
          const cx = c.x + (x - u.x)
          const cz = c.z + (z - u.z)
          const g = heightAt(this.grid, cx, cz)
          const gy = g === VOID ? 0 : g
          // Lights move: every other frame is plenty for the clipped pool.
          if ((this.frame + u.id) % 2 === 0 || !v.spot.userData.drawn) {
            this.writePool(v, x, y - 0.2, z, cx, cz, spotRadius(u))
            v.spot.userData.drawn = true
          }
          const tint = hot ? HOT : u.detect > 0.05 || wary ? WARY : CALM
          ;(v.spot.material as MeshBasicMaterial).color.lerp(tint, ease)
          ;(v.beam.material as MeshBasicMaterial).color.lerp(tint, ease)
          // The beam: from the drone's eye down to the light, as a cone.
          v.beam.position.set(x, y - 0.1, z)
          const dx = cx - x
          const dy = gy - (y - 0.1)
          const dz = cz - z
          let len = Math.hypot(dx, dy, dz)
          // A beam stops at whatever it meets on the way down (#69).
          const block = len > 0.5 ? raycast(this.grid, x, y - 0.1, z, dx / len, dy / len, dz / len, len - 0.3) : null
          const cut = block?.hit ? block.t / len : 1
          len *= cut
          v.beam.scale.set(spotRadius(u) * cut, len, spotRadius(u) * cut)
          v.beam.rotation.set(0, 0, 0)
          // Tip the cylinder's −y axis along the beam.
          v.beam.rotation.order = 'YXZ'
          v.beam.rotation.y = Math.atan2(dx, dz)
          v.beam.rotation.x = -Math.atan2(Math.hypot(dx, dz), -dy)
        }
      }

      // The mark over its head: its foot sits above the top of the model, so
      // growing with distance or popping it rises and never covers the face.
      let over = y + v.top + MARK_GAP
      if (v.mark) {
        const m = v.mark.material as SpriteMaterial
        const show = !dead && (hot || wary || puzzled || testing || u.detect > 0.06)
        const chat = !dead && !show && u.chatting
        v.mark.visible = show || chat
        if (chat) {
          m.map = this.textures[4]!
          m.color.copy(NOTICE)
          m.opacity = 0.85
          v.mark.position.set(x, over, z)
          const d = Math.hypot(camX - x, camY - y, camZ - z)
          const size = Math.min(Math.max(0.3, d * 0.04), 2.4)
          v.mark.scale.set(size, size, 1)
          over += size * 0.9
        }
        if (show) {
          const bang = hot
          const running = u.runner >= 0
          m.map = this.textures[running ? 2 : bang ? 1 : 0]!
          m.color.copy(bang ? HOT : wary || testing ? WARY : NOTICE)
          m.opacity = bang || wary || puzzled || testing ? 1 : Math.min(1, 0.3 + 0.7 * (u.detect / SUSPECT_AT))
          v.mark.position.set(x, over, z)
          // Keep it readable from sniping range: grow with distance.
          const d = Math.hypot(camX - x, camY - y, camZ - z)
          // Puzzled: the "?" rocks from side to side.
          const size = Math.min(Math.max(0.34, d * 0.055), 4) * (1 + v.pop * 0.6) * (bang || wary || puzzled || testing ? 1 : 0.55 + 0.45 * Math.min(1, u.detect / SUSPECT_AT))
          v.mark.scale.set(size, size, 1)
          m.rotation = puzzled ? Math.sin(time * 4) * 0.35 : 0
          over += size * 0.9
        }
      }

      // Tagged: a diamond over it that shows through walls, and its round.
      if (u.tagged && !v.tag) this.addTag(i)
      if (v.tag) {
        v.tag.visible = !dead
        // Over the mark when there is one.
        v.tag.position.set(x, over, z)
        const d = Math.hypot(camX - x, camY - y, camZ - z)
        const size = Math.min(Math.max(0.3, d * 0.04), 3) * (0.9 + 0.1 * Math.sin(time * 4 + i))
        v.tag.scale.set(size, size, 1)
      }
      if (v.route) v.route.visible = !dead && u.state === 'patrol'
    }
  }

  /** Mark a unit as tagged: the diamond, and its round drawn as a faint line. */
  private addTag(i: number): void {
    const u = this.gar.units[i]!
    const v = this.views[i]!
    const tag = new Sprite(new SpriteMaterial({ map: this.textures[3]!, color: TAG.clone(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
    tag.renderOrder = 31
    tag.center.set(0.5, 0)
    v.tag = tag
    this.group.add(tag)
    const pts = u.route.length > 1 ? u.route : []
    if (pts.length > 1) {
      const pos = new Float32Array((pts.length + 1) * 3)
      pts.forEach((p, k) => {
        const h = heightAt(this.grid, p.x, p.z)
        pos.set([p.x, (h === VOID ? u.y : isLight(u) ? h : h) + 0.25, p.z], k * 3)
      })
      pos.set(pos.subarray(0, 3), pts.length * 3)
      const geo = new BufferGeometry()
      geo.setAttribute('position', new BufferAttribute(pos, 3))
      const line = new Line(geo, new LineBasicMaterial({ color: TAG.clone(), transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false }))
      line.renderOrder = 29
      line.frustumCulled = false
      v.route = line
      this.group.add(line)
    }
  }

  dispose(): void {
    for (const v of this.views) {
      v.rig.mesh.geometry.dispose()
      v.rig.outline?.geometry.dispose()
      v.rig.material.dispose()
      v.rig.glowMaterial.dispose()
      if (v.mark) v.mark.material.dispose()
      if (v.tag) v.tag.material.dispose()
      if (v.route) { v.route.geometry.dispose(); (v.route.material as LineBasicMaterial).dispose() }
      if (v.spot) { v.spot.geometry.dispose(); (v.spot.material as MeshBasicMaterial).dispose() }
      if (v.beam) (v.beam.material as MeshBasicMaterial).dispose()
      v.cage?.dispose()
    }
    this.wreckage.dispose()
    this.shatter.dispose()
    for (const t of this.textures) t.dispose()
    this.helmetGeo.dispose()
    this.beamGeo.dispose()
    this.cones.geometry.dispose()
    ;(this.cones.material as MeshBasicMaterial).dispose()
  }
}
