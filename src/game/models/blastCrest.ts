import {
  BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter,
  MeshToonMaterial, SRGBColorSpace, Texture
} from 'three'
import { hasRenderer, getRenderer } from '../engine/renderer'
import { mulberry32 } from '../world/rng'
import { toonRamp } from './toon'

/**
 * ─── The blast crest on an exploding barrel ──────────────────────────────────
 *
 * The red drum alone did not read as "this goes up" (owner's playtest), so it
 * carries a hazard shield on each of its four sides: a heater-shaped plate
 * bent round the drum, with an exploding burst painted on it. The plate is
 * real geometry (its outline is the shield's, so the silhouette stays crisp
 * without alpha testing), stood off the drum by centimetres; its sides are
 * walls down into the drum, so from the side it reads as a plate with a
 * thickness, never as paper hovering in front of the barrel.
 *
 * The emblem is drawn ONCE into a canvas (`crestTexture`) and shared by every
 * crest of every barrel through one material (`crestMaterial`): one extra
 * instanced draw for a whole fortress's barrels. Neither is ever disposed per
 * barrel.
 */

/** The shield's width and height (m), tip to top. */
export const CREST_W = 0.42
export const CREST_H = 0.5
/** The face's radius round the drum's axis: 2 cm clear of the ribs (0.435), more of the hazard band (0.425). */
export const CREST_R = 0.456
/** The walls run from inside the drum (radius 0.4) out to the face. */
export const CREST_R_IN = 0.39
/** The tip's height above the barrel's origin. */
export const CREST_Y = 0.42
/** How many crests round the drum, evenly. */
export const CREST_SIDES = 4

type P2 = [number, number]

const quad = (a: P2, c: P2, b: P2, n: number, out: P2[]): void => {
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]])
  }
}

/**
 * The shield's outline in its own flat frame (x across, y up from the tip),
 * counter-clockwise seen from the front, convex: an arched top, straight
 * sides, curving in to the point. The texture traces the same line.
 */
export const crestOutline = (): P2[] => {
  const w = CREST_W / 2
  const h = CREST_H
  const shoulder = h - 0.03
  const hip = 0.5 * h
  const out: P2[] = [[w, shoulder]]
  quad([w, shoulder], [0, h + 0.03], [-w, shoulder], 10, out)
  for (let i = 1; i <= 3; i++) out.push([-w, shoulder + (hip - shoulder) * (i / 3)])
  quad([-w, hip], [-w, 0.14 * h], [0, 0], 8, out)
  quad([0, 0], [w, 0.14 * h], [w, hip], 8, out)
  for (let i = 1; i < 3; i++) out.push([w, hip + (shoulder - hip) * (i / 3)])
  return out
}

/** A point of the flat frame bent onto the drum at radius `r`, on the side facing +z. */
const bend = (x: number, y: number, r: number): [number, number, number] => {
  const a = x / CREST_R
  return [Math.sin(a) * r, CREST_Y + y, Math.cos(a) * r]
}

/** Turn a point (and a direction) by `k` quarter turns round the drum's axis. */
const turn = (p: [number, number, number], k: number): [number, number, number] => {
  const a = (k * Math.PI * 2) / CREST_SIDES
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
}

/** How many rings the face is cut into, centre to rim, so it follows the drum's curve. */
const RINGS = 5

/**
 * The crests' faces, all four in one geometry (position, normal, uv): each a
 * fan of rings from a point a little above the shield's middle out to its
 * outline, bent onto the drum. The uv is the flat frame, so the canvas maps
 * straight onto it.
 */
export const crestFaces = (): BufferGeometry => {
  const ring = crestOutline()
  const n = ring.length
  const c: P2 = [0, 0.55 * CREST_H]
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let k = 0; k < CREST_SIDES; k++) {
    const base = pos.length / 3
    const vert = (x: number, y: number): void => {
      const p = turn(bend(x, y, CREST_R), k)
      const d = turn(bend(x, y, 1), k)
      pos.push(...p)
      nrm.push(d[0], 0, d[2])
      uv.push(x / CREST_W + 0.5, y / CREST_H)
    }
    vert(c[0], c[1])
    for (let r = 1; r <= RINGS; r++) {
      const t = r / RINGS
      for (const p of ring) vert(c[0] + (p[0] - c[0]) * t, c[1] + (p[1] - c[1]) * t)
    }
    for (let i = 0; i < n; i++) idx.push(base, base + 1 + i, base + 1 + ((i + 1) % n))
    for (let r = 1; r < RINGS; r++) {
      const a = base + 1 + (r - 1) * n
      const b = base + 1 + r * n
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        idx.push(a + i, b + i, b + j, a + i, b + j, a + j)
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/**
 * The crests' edges, all four in one geometry (position, normal; painted and
 * merged into the barrel's lit part by `models/supplies.ts`): a wall along the
 * outline from inside the drum out to the face, facing outward, flat-shaded.
 */
export const crestRims = (): BufferGeometry => {
  const ring = crestOutline()
  const n = ring.length
  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  for (let k = 0; k < CREST_SIDES; k++) {
    for (let i = 0; i < n; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % n]!
      const pts = [turn(bend(a[0], a[1], CREST_R_IN), k), turn(bend(b[0], b[1], CREST_R_IN), k), turn(bend(b[0], b[1], CREST_R), k), turn(bend(a[0], a[1], CREST_R), k)]
      // Outward in the flat frame (the outline runs counter-clockwise), bent the same way.
      const ex = b[1] - a[1]
      const ey = -(b[0] - a[0])
      const len = Math.hypot(ex, ey) || 1
      const mx = (a[0] + b[0]) / 2
      const ang = mx / CREST_R
      const out = turn([(ex / len) * Math.cos(ang), ey / len, -(ex / len) * Math.sin(ang)], k)
      const base = pos.length / 3
      for (const p of pts) {
        pos.push(...p)
        nrm.push(...out)
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3))
  g.setIndex(idx)
  // Each wall is wound so its normal agrees with `out`; check and flip where not.
  const p = g.attributes.position!
  for (let t = 0; t < idx.length; t += 3) {
    const [i0, i1, i2] = [idx[t]!, idx[t + 1]!, idx[t + 2]!]
    const ux = p.getX(i1) - p.getX(i0); const uy = p.getY(i1) - p.getY(i0); const uz = p.getZ(i1) - p.getZ(i0)
    const vx = p.getX(i2) - p.getX(i0); const vy = p.getY(i2) - p.getY(i0); const vz = p.getZ(i2) - p.getZ(i0)
    const cx = uy * vz - uz * vy; const cy = uz * vx - ux * vz; const cz = ux * vy - uy * vx
    if (cx * nrm[i0 * 3]! + cy * nrm[i0 * 3 + 1]! + cz * nrm[i0 * 3 + 2]! < 0) {
      g.index!.setX(t + 1, i2)
      g.index!.setX(t + 2, i1)
    }
  }
  return g
}

// ─── The emblem ─────────────────────────────────────────────────────────────

/** The canvas: 512 across, as tall as the shield's aspect asks. */
const TEX_W = 512
const TEX_H = Math.round((TEX_W * CREST_H) / CREST_W)
const INK = '#1c1233'

const shieldPath = (g: CanvasRenderingContext2D, inset = 0): void => {
  const sx = (TEX_W - inset * 2) / CREST_W
  const sy = (TEX_H - inset * 2) / CREST_H
  g.beginPath()
  crestOutline().forEach(([x, y], i) => {
    const px = inset + (x + CREST_W / 2) * sx
    const py = inset + (CREST_H - y) * sy
    if (i === 0) g.moveTo(px, py)
    else g.lineTo(px, py)
  })
  g.closePath()
}

/** A ragged burst: `n` flame tongues, each curling a little, between radii `rIn` and `rOut`. */
const burst = (g: CanvasRenderingContext2D, cx: number, cy: number, n: number, rIn: number, rOut: number, spin: number, seed: number): void => {
  const rng = mulberry32(seed)
  g.beginPath()
  for (let i = 0; i < n; i++) {
    const a0 = spin + (i / n) * Math.PI * 2
    const a1 = spin + ((i + 0.5) / n) * Math.PI * 2
    const a2 = spin + ((i + 1) / n) * Math.PI * 2
    const tip = rOut * (0.78 + rng() * 0.3)
    const r0 = rIn * (0.9 + rng() * 0.15)
    if (i === 0) g.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0)
    // Up one flank of the tongue, curling with the spin, and back down the other.
    const curl = (Math.PI / n) * 0.55
    g.quadraticCurveTo(cx + Math.cos(a0 + curl) * tip * 0.7, cy + Math.sin(a0 + curl) * tip * 0.7, cx + Math.cos(a1) * tip, cy + Math.sin(a1) * tip)
    const back = rIn * (0.9 + rng() * 0.15)
    g.quadraticCurveTo(cx + Math.cos(a1 + curl) * tip * 0.62, cy + Math.sin(a1 + curl) * tip * 0.62, cx + Math.cos(a2) * back, cy + Math.sin(a2) * back)
  }
  g.closePath()
}

/**
 * The emblem, drawn once: a hazard-yellow shield in an ink rim, rays of
 * flash behind, a three-layer burst of flame tongues (deep red, orange,
 * yellow) round a white-hot core, and shards of the drum flying out with
 * speed lines. Big, flat shapes so it reads from across a yard; the tongues
 * and shards are the detail up close.
 */
const drawEmblem = (g: CanvasRenderingContext2D): void => {
  const cx = TEX_W / 2
  const cy = TEX_H * 0.5
  g.save()
  shieldPath(g)
  g.clip()
  // The plate: hazard yellow, warmer toward the rim.
  const bg = g.createRadialGradient(cx, cy, 30, cx, cy, TEX_H * 0.62)
  bg.addColorStop(0, '#fff07a')
  bg.addColorStop(0.55, '#ffd23f')
  bg.addColorStop(1, '#ff9f1c')
  g.fillStyle = bg
  g.fillRect(0, 0, TEX_W, TEX_H)
  // The flash: pale rays out of the centre.
  g.fillStyle = 'rgba(255, 255, 230, 0.45)'
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + Math.cos(a - 0.07) * 600, cy + Math.sin(a - 0.07) * 600)
    g.lineTo(cx + Math.cos(a + 0.07) * 600, cy + Math.sin(a + 0.07) * 600)
    g.closePath()
    g.fill()
  }
  // The hazard header: black and yellow stripes across the top.
  g.save()
  g.beginPath()
  g.rect(0, 0, TEX_W, 66)
  g.clip()
  g.fillStyle = INK
  for (let x = -80; x < TEX_W + 80; x += 56) {
    g.beginPath()
    g.moveTo(x, 66)
    g.lineTo(x + 28, 66)
    g.lineTo(x + 28 + 66, 0)
    g.lineTo(x + 66, 0)
    g.closePath()
    g.fill()
  }
  g.restore()
  g.fillStyle = INK
  g.fillRect(0, 62, TEX_W, 10)
  // Shards of the drum, flying out, each with its speed lines.
  const rng = mulberry32(78)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + 0.35 + (i / 9) * Math.PI * 2 + (rng() - 0.5) * 0.3
    const d = 196 + rng() * 26
    const x = cx + Math.cos(a) * d
    const y = cy + Math.sin(a) * d * 1.05
    const s = 15 + rng() * 9
    g.strokeStyle = INK
    g.lineWidth = 5
    for (const off of [-0.12, 0.12]) {
      g.beginPath()
      g.moveTo(cx + Math.cos(a + off * 0.4) * (d - 70), cy + Math.sin(a + off * 0.4) * (d - 70) * 1.05)
      g.lineTo(cx + Math.cos(a + off * 0.4) * (d - 28), cy + Math.sin(a + off * 0.4) * (d - 28) * 1.05)
      g.stroke()
    }
    g.fillStyle = i % 3 === 0 ? '#d8344a' : INK
    g.beginPath()
    for (let v = 0; v < 4; v++) {
      const b = a + (v / 4) * Math.PI * 2 + rng() * 0.6
      const r = s * (0.55 + rng() * 0.5)
      if (v === 0) g.moveTo(x + Math.cos(b) * r, y + Math.sin(b) * r)
      else g.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r)
    }
    g.closePath()
    g.fill()
    g.strokeStyle = INK
    g.lineWidth = 4
    g.stroke()
  }
  // The burst: an ink rim, then deep red, orange and yellow tongues.
  burst(g, cx, cy, 13, 118, 205, 0.1, 1)
  g.fillStyle = INK
  g.fill()
  g.lineWidth = 22
  g.strokeStyle = INK
  g.stroke()
  burst(g, cx, cy, 13, 112, 196, 0.1, 1)
  g.fillStyle = '#d8344a'
  g.fill()
  burst(g, cx, cy, 11, 82, 150, 0.45, 2)
  g.fillStyle = '#ff6b1a'
  g.fill()
  burst(g, cx, cy, 9, 56, 104, 0.2, 3)
  g.fillStyle = '#ffd23f'
  g.fill()
  // The white-hot core.
  const core = g.createRadialGradient(cx, cy, 4, cx, cy, 62)
  core.addColorStop(0, '#ffffff')
  core.addColorStop(0.55, '#fffbe0')
  core.addColorStop(1, 'rgba(255, 240, 150, 0)')
  g.fillStyle = core
  g.beginPath()
  g.arc(cx, cy, 62, 0, Math.PI * 2)
  g.fill()
  g.restore()
  // The rim: a fat ink edge (half of it falls outside the plate), a bright bevel inside it.
  shieldPath(g)
  g.lineJoin = 'round'
  g.lineWidth = 34
  g.strokeStyle = INK
  g.stroke()
  shieldPath(g, 24)
  g.lineWidth = 6
  g.strokeStyle = '#fff6c2'
  g.stroke()
  // Rivets at the shoulders and the tip.
  for (const [x, y] of [[44, 104], [TEX_W - 44, 104], [cx, TEX_H - 60]] as const) {
    g.fillStyle = INK
    g.beginPath()
    g.arc(x, y, 11, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#c9c4e6'
    g.beginPath()
    g.arc(x - 2, y - 2, 6, 0, Math.PI * 2)
    g.fill()
  }
}

let texture: Texture | null = null
/** The emblem's texture, drawn once and shared (never disposed per barrel). */
export const crestTexture = (): Texture => {
  if (texture) return texture
  // The unit tests run without a document (or with one whose canvas cannot draw): the texture is then blank.
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = TEX_W
    c.height = TEX_H
    const g = c.getContext('2d')
    if (g) drawEmblem(g)
    texture = new CanvasTexture(c)
  } else texture = new Texture()
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  // Seen at a slant round the drum's curve: as sharp as the GPU allows, up to 8.
  texture.anisotropy = hasRenderer() ? Math.min(8, getRenderer().capabilities.getMaxAnisotropy()) : 4
  return texture
}

let material: MeshToonMaterial | null = null
/**
 * The crests' material, shared by every barrel: lit like the rest of the
 * drum, with the emblem lifted a little on its own (an emissive copy of it)
 * so the side away from the light still reads.
 */
export const crestMaterial = (): MeshToonMaterial => {
  if (material) return material
  const map = crestTexture()
  material = new MeshToonMaterial({ map, gradientMap: toonRamp(), emissive: new Color('#ffffff'), emissiveMap: map, emissiveIntensity: 0.35 })
  return material
}
