import {
  AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh, Matrix4,
  Mesh, MeshBasicMaterial, Object3D, Quaternion, Uint16BufferAttribute, Float32BufferAttribute, Vector3
} from 'three'
import { ell, merge, paint, paintBy, rcyl, sph, stripUv, torus, xform, type V3 } from '../models/kit'
import { glowVC, outlineMat, toonVC, toonVCInstanced } from '../models/toon'
import { PAL } from '../models/palette'

/**
 * ─── The grappling hook, drawn ───────────────────────────────────────────────
 *
 * A grapnel in the mech's own kit: a lilac crown with a rounded nose, a steel
 * shank with two grip rings and a cyan power band, an eye at the back where
 * the cable runs in, and four curved tines that end in pointed flukes. In the
 * air the tines are flung open and the head spins; once it bites they snap in
 * and the band flashes.
 *
 * The cable is a braided steel line (two dark strands and a cyan tracer,
 * painted as a helix, four turns a segment), a faint additive halo round it.
 * In the air it sags and whips, less the nearer the hook is to the wall; on
 * the bite it twangs once and then runs straight and taut.
 *
 * Eight draws however long the line: the head's body, outline and glow, the
 * tines and their outline (four instances each), the cable, its outline and
 * its halo (CABLE_SEGS instances each). Nothing is allocated per frame.
 *
 * The head's front (its nose) sits at `to` and it points along from → to;
 * the cable runs from `from` to the eye, HOOK_EYE behind the nose.
 */

/** Nose to the eye's middle, where the cable ends (m). */
export const HOOK_EYE = 0.385
/** Nose to the back of the eye: the head's whole length (m). */
export const HOOK_LEN = 0.44
/** Segments in the cable. */
export const CABLE_SEGS = 14
/** Cable radius (m). */
export const CABLE_R = 0.02
/** How long the line twangs after the bite (s). */
export const TWANG_S = 0.35
/** How long the tines take to snap from open to biting (s). */
const SNAP_S = 0.09
const TINES = 4
/** Tine pivot: on the crown's rim, buried in the collar. */
const TINE_ROOT = 0.055
const TINE_Z = -0.1
/** Tine swing about its own pivot: flung open in the air, tucked in once it bites. */
const TINE_OPEN = -0.45
const TINE_BITE = 0.12

export interface GrappleOpts {
  /** In the air (thrown or recalled): open claws, a slack line. */
  flying: boolean
  /** Seconds, any clock that runs on. */
  time: number
  /** 0 … 1 the hook's way to the wall (`GrappleRun.hook`): the slack goes out as it nears 1. */
  progress?: number
}

export interface GrappleVisual {
  /** Add this to the scene once; it stays at the origin (the cable is drawn in world space). */
  readonly group: Object3D
  /** The head alone (positioned at `to`). */
  readonly head: Object3D
  update(from: Vec3, to: Vec3, yaw: number, opts: GrappleOpts): void
  setVisible(v: boolean): void
  dispose(): void
}

export interface Vec3 { x: number; y: number; z: number }

// ─── Geometry ────────────────────────────────────────────────────────────────

const part = (g: BufferGeometry, color: string, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]): BufferGeometry => paint(xform(g, p, r), color)

/**
 * One tine in its pivot's frame: from the pivot it runs out along +X and
 * curls back along −Z on an arc of radius `R` through `arc` radians, tapering
 * to a point, with a spade-shaped fluke widening it sideways (±Y) near the
 * tip. One ring per step with no seam vertex, so the normals are smooth all
 * round and the outline hull cannot crack; a point closes the tip.
 */
export const tineGeometry = (R = 0.14, arc = 2.05, r0 = 0.019, rings = 14, sides = 8): BufferGeometry => {
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i < rings; i++) {
    const t = i / rings
    const a = arc * t
    // Centre on the arc and its frame: n points out from the arc's centre, b = Y.
    const cx = R * Math.sin(a)
    const cz = -R + R * Math.cos(a)
    const nx = Math.sin(a)
    const nz = Math.cos(a)
    const thick = r0 * (1 - 0.55 * t)
    const fluke = 1 + 1.3 * Math.exp(-(((t - 0.78) / 0.12) ** 2))
    for (let s = 0; s < sides; s++) {
      const th = (s / sides) * Math.PI * 2
      const u = Math.cos(th) * thick
      const v = Math.sin(th) * thick * fluke
      pos.push(cx + nx * u, v, cz + nz * u)
    }
  }
  // The point: a little past the last ring along the arc.
  const tip = arc * 1.06
  pos.push(R * Math.sin(tip), 0, -R + R * Math.cos(tip))
  // The root: a single vertex closing the start, inside the collar.
  pos.push(-0.01, 0, 0)
  const tipI = rings * sides
  const rootI = tipI + 1
  for (let i = 0; i < rings - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = i * sides + s
      const b = i * sides + ((s + 1) % sides)
      const c = a + sides
      const d = b + sides
      idx.push(a, c, b, b, c, d)
    }
  }
  const last = (rings - 1) * sides
  for (let s = 0; s < sides; s++) {
    idx.push(last + s, tipI, last + ((s + 1) % sides))
    idx.push(rootI, s, (s + 1) % sides)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(new Uint16BufferAttribute(idx, 1))
  g.computeVertexNormals()
  // Steel, brightening to a honed edge at the fluke.
  const steel = new Color(PAL.steel)
  const edge = new Color(PAL.white)
  const c = new Color()
  return paintBy(g, (_x, _y, z) => {
    const k = Math.min(1, Math.max(0, (-z - 0.13) / 0.12))
    return c.copy(steel).lerp(edge, k * 0.8)
  })
}

/** The head without its tines: lit parts and glowing parts, nose at the origin, pointing +Z. */
export const hookHeadGeometry = (): { lit: BufferGeometry; glow: BufferGeometry; parts: BufferGeometry[] } => {
  const ALONG: V3 = [Math.PI / 2, 0, 0]
  const parts = [
    // The nose: a rounded lilac bullet, its tip at z = 0.
    part(ell(0.055, 0.055, 0.07, 12, 8), PAL.mechArmorHi, [0, 0, -0.07]),
    // The crown's collar the tines spring from.
    part(rcyl(0.075, 0.06, 0.022, 14, 2), PAL.mechArmor, [0, 0, -0.11], ALONG),
    // The shank and its two grip rings.
    part(rcyl(0.035, 0.22, 0.015, 10, 2), PAL.gunMetal, [0, 0, -0.24], ALONG),
    part(rcyl(0.045, 0.022, 0.008, 10, 1), PAL.gunDark, [0, 0, -0.225], ALONG),
    part(rcyl(0.045, 0.022, 0.008, 10, 1), PAL.gunDark, [0, 0, -0.29], ALONG),
    // The boss the eye hangs from, and the eye: a ring standing along the shank.
    part(sph(0.042, 10, 8), PAL.steelDeep, [0, 0, -0.345]),
    part(torus(0.04, 0.014, 8, 16), PAL.steelDark, [0, 0, -HOOK_EYE], [0, Math.PI / 2, 0])
  ]
  const glow = [
    // The power band round the shank behind the collar, and an LED between each pair of tines.
    part(torus(0.041, 0.011, 6, 18), PAL.mechCore, [0, 0, -0.163]),
    ...Array.from({ length: TINES }, (_, i) => {
      const a = (i + 0.5) * (Math.PI * 2 / TINES)
      return part(sph(0.016, 6, 4), PAL.glowCyan, [Math.cos(a) * 0.07, Math.sin(a) * 0.07, -0.11])
    })
  ]
  const lit = merge(parts)
  const glowGeo = merge(glow)
  for (const g of glow) g.dispose()
  return { lit, glow: glowGeo, parts }
}

/**
 * A unit cable segment along +Y (base at 0, open ends: its neighbours carry
 * on where it stops), painted as a braid: two dark steel strands and a cyan
 * tracer wound `twists` whole turns per segment, so the helix lines up across
 * every joint.
 */
export const cableGeometry = (twists = 4, sides = 10, rows = 20, radius = CABLE_R): BufferGeometry => {
  const g = stripUv(new CylinderGeometry(radius, radius, 1, sides, rows, true))
  g.translate(0, 0.5, 0)
  const strandA = new Color(PAL.steelDark)
  const strandB = new Color(PAL.mechSuit)
  const tracer = new Color(PAL.mechCore)
  return paintBy(g, (x, y, z) => {
    // Which of the ring's columns this vertex falls in, wound along the length.
    const k = Math.floor(((Math.atan2(z, x) / (Math.PI * 2) + y * twists + 2) % 1) * sides + 0.5) % sides
    return k === 0 ? tracer : k <= sides / 2 ? strandA : strandB
  })
}

// ─── The visual ──────────────────────────────────────────────────────────────

const UP = new Vector3(0, 1, 0)
const FWD = new Vector3(0, 0, 1)
const _m = new Matrix4()
const _m2 = new Matrix4()
const _q = new Quaternion()
const _q2 = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _dir = new Vector3()
const _side = new Vector3()
const _down = new Vector3()
const _x = new Vector3()
const _y = new Vector3()
const _a = new Vector3()
const _b = new Vector3()
const _seg = new Vector3()

const instanced = (geo: BufferGeometry, mat: MeshBasicMaterial | ReturnType<typeof toonVCInstanced> | ReturnType<typeof outlineMat>, n: number): InstancedMesh => {
  const m = new InstancedMesh(geo, mat, n)
  m.instanceMatrix.setUsage(DynamicDrawUsage)
  m.frustumCulled = false
  return m
}

export const makeGrappleVisual = (): GrappleVisual => {
  const group = new Group()
  group.name = 'grappleHook'
  const head = new Group()

  // The head: one lit mesh, its outline, its glow.
  const built = hookHeadGeometry()
  for (const g of built.parts) g.dispose()
  const glowMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  const body = new Mesh(built.lit, toonVC())
  const bodyLine = new Mesh(built.lit, outlineMat(0.012))
  bodyLine.renderOrder = -1
  const glow = new Mesh(built.glow, glowMat)
  // The tines: four instances of one bent fluke.
  const tineGeo = tineGeometry()
  const tines = instanced(tineGeo, toonVCInstanced(), TINES)
  const tineLine = instanced(tineGeo, outlineMat(0.012), TINES)
  tineLine.renderOrder = -1
  for (const m of [body, bodyLine, glow]) m.frustumCulled = false
  head.add(body, bodyLine, glow, tines, tineLine)

  // The cable: segments, their outline and a faint halo.
  const cableGeo = cableGeometry()
  const haloGeo = stripUv(new CylinderGeometry(CABLE_R * 1.9, CABLE_R * 1.9, 1, 8, 1, true))
  haloGeo.translate(0, 0.5, 0)
  const haloMat = new MeshBasicMaterial({
    color: PAL.glowCyan, transparent: true, opacity: 0.08, blending: AdditiveBlending, depthWrite: false, toneMapped: false
  })
  const cable = instanced(cableGeo, toonVCInstanced(), CABLE_SEGS)
  const cableLine = instanced(cableGeo, outlineMat(0.006), CABLE_SEGS)
  cableLine.renderOrder = -1
  const halo = instanced(haloGeo, haloMat, CABLE_SEGS)
  group.add(cable, cableLine, halo, head)
  group.visible = false

  // State carried frame to frame.
  let lastT = Number.NaN
  let wasFlying = true
  let biteT = -1e9
  let roll = 0
  let swingSet = Number.NaN

  const setTines = (angle: number): void => {
    if (angle === swingSet) return
    swingSet = angle
    for (let i = 0; i < TINES; i++) {
      _q.setFromAxisAngle(FWD, (i * Math.PI * 2) / TINES)
      _p.set(TINE_ROOT, 0, TINE_Z).applyQuaternion(_q)
      _q2.setFromAxisAngle(UP, angle)
      _q.multiply(_q2)
      _m.compose(_p, _q, _s.set(1, 1, 1))
      tines.setMatrixAt(i, _m)
      tineLine.setMatrixAt(i, _m)
    }
    tines.instanceMatrix.needsUpdate = true
    tineLine.instanceMatrix.needsUpdate = true
  }
  setTines(TINE_OPEN)

  const update = (from: Vec3, to: Vec3, yaw: number, opts: GrappleOpts): void => {
    const t = opts.time
    const dt = Number.isNaN(lastT) ? 0 : Math.max(0, Math.min(0.1, t - lastT))
    lastT = t
    if (wasFlying && !opts.flying) biteT = t
    wasFlying = opts.flying

    // The way the line runs, and a frame round it: `_down` the sag, `_side` the whip.
    _dir.set(to.x - from.x, to.y - from.y, to.z - from.z)
    const len = _dir.length()
    if (len > 1e-4) _dir.divideScalar(len)
    else _dir.set(Math.sin(yaw), 0, Math.cos(yaw))
    _side.crossVectors(_dir, UP)
    if (_side.lengthSq() < 1e-6) _side.set(Math.cos(yaw), 0, -Math.sin(yaw))
    _side.normalize()
    _down.crossVectors(_side, _dir).normalize()
    if (_down.y > 0) _down.negate()

    // The head: nose at `to`, pointing along the line, a tine up (or the way the mech faces).
    _x.copy(Math.abs(_dir.y) < 0.95 ? UP : _y.set(Math.sin(yaw), 0, Math.cos(yaw)))
    _x.cross(_dir).normalize()
    _y.crossVectors(_dir, _x)
    if (opts.flying) roll += dt * 11
    _m.makeBasis(_x, _y, _dir)
    _m2.makeRotationZ(roll)
    _m.multiply(_m2)
    head.quaternion.setFromRotationMatrix(_m)
    head.position.set(to.x, to.y, to.z)

    // The tines: open in the air, snapped in on the bite.
    const sinceBite = t - biteT
    setTines(opts.flying || sinceBite >= SNAP_S
      ? (opts.flying ? TINE_OPEN : TINE_BITE)
      : TINE_OPEN + (TINE_BITE - TINE_OPEN) * (sinceBite / SNAP_S))

    // The band: steady in the air, a white flash on the bite.
    const flash = opts.flying ? 0 : Math.max(0, 1 - sinceBite / 0.25)
    const pulse = 0.85 + 0.15 * Math.sin(t * (opts.flying ? 30 : 4))
    glowMat.color.setScalar(pulse + flash * 1.5)

    // The cable, from the hand to the eye.
    const span = len - HOOK_EYE
    if (span < 0.05) {
      cable.count = cableLine.count = halo.count = 0
      return
    }
    cable.count = cableLine.count = halo.count = CABLE_SEGS
    const k = Math.min(1, Math.max(0, opts.progress ?? 0))
    const slack = opts.flying ? (1 - k) : 0
    const sag = slack * Math.min(0.6, span * 0.12)
    const whip = slack * Math.min(0.18, span * 0.04)
    const twang = !opts.flying && sinceBite < TWANG_S ? (1 - sinceBite / TWANG_S) * Math.min(0.08, span * 0.02) : 0
    const pointAt = (u: number, out: Vector3): Vector3 => {
      const bow = Math.sin(Math.PI * u)
      const off = sag * 4 * u * (1 - u)
      const lat = whip * bow * Math.sin(u * Math.PI * 3 - t * 26) + twang * bow * Math.sin(sinceBite * 70)
      return out.set(
        from.x + _dir.x * span * u + _down.x * off + _side.x * lat,
        from.y + _dir.y * span * u + _down.y * off + _side.y * lat,
        from.z + _dir.z * span * u + _down.z * off + _side.z * lat
      )
    }
    pointAt(0, _a)
    for (let i = 0; i < CABLE_SEGS; i++) {
      pointAt((i + 1) / CABLE_SEGS, _b)
      _seg.subVectors(_b, _a)
      const l = _seg.length()
      _q.setFromUnitVectors(UP, _seg.divideScalar(Math.max(1e-6, l)))
      _m.compose(_a, _q, _s.set(1, l, 1))
      cable.setMatrixAt(i, _m)
      cableLine.setMatrixAt(i, _m)
      halo.setMatrixAt(i, _m)
      _a.copy(_b)
    }
    cable.instanceMatrix.needsUpdate = true
    cableLine.instanceMatrix.needsUpdate = true
    halo.instanceMatrix.needsUpdate = true
    haloMat.opacity = opts.flying ? 0.12 : 0.06 + twang * 1.5
  }

  return {
    group,
    head,
    update,
    setVisible: (v: boolean): void => {
      group.visible = v
      // A fresh throw starts with open claws and no leftover twang.
      if (!v) { lastT = Number.NaN; wasFlying = true; biteT = -1e9 }
    },
    dispose: (): void => {
      built.lit.dispose()
      built.glow.dispose()
      tineGeo.dispose()
      cableGeo.dispose()
      haloGeo.dispose()
      glowMat.dispose()
      haloMat.dispose()
      tines.dispose()
      tineLine.dispose()
      cable.dispose()
      cableLine.dispose()
      halo.dispose()
    }
  }
}
