import {
  CanvasTexture, RepeatWrapping, ClampToEdgeWrapping, SRGBColorSpace, LinearMipmapLinearFilter, LinearFilter, type Texture
} from 'three'
import { mulberry32 } from './rng'
import { TEXTURE_FILES } from '../assets/overrides'

/**
 * Canvas-baked GREYSCALE detail maps. The colour comes from vertex colours
 * (per sector theme), the texture only adds panel seams, bevels, rivets and a
 * little grain — so one baked texture serves every sector. Baked once, at
 * boot, from the loader (see `boot.ts`), never lazily by the render loop.
 *
 * Every surface shares ONE atlas (four cells in a row: floor plate, wall
 * plate, container side, blank), so a whole chunk of the fortress is a single
 * draw call. Every quad spans exactly one cell, so nothing tiles across a seam.
 */

let atlasTex: Texture | null = null
let glowTex: Texture | null = null
let ringTex: Texture | null = null

const make = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Texture => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  // Baked once, with `grain` reading pixels back per region: a CPU-backed
  // canvas does that without GPU readbacks (and without Chrome's warning).
  const g = c.getContext('2d', { willReadFrequently: true })!
  draw(g)
  const t = new CanvasTexture(c)
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.colorSpace = SRGBColorSpace
  t.minFilter = LinearMipmapLinearFilter
  t.magFilter = LinearFilter
  t.anisotropy = 4
  return t
}

const grain = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, amount: number) => {
  const rng = mulberry32(seed)
  const img = g.getImageData(x, y, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount
    d[i] = Math.max(0, Math.min(255, d[i]! + n))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + n))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + n))
  }
  g.putImageData(img, x, y)
}

const roundRectPath = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** One floor cell: a big bevelled plate with a smaller inset plate and rivets. */
const drawFloor = (g: CanvasRenderingContext2D, ox: number) => {
  const S = 256
  g.fillStyle = '#e4e4e4'
  g.fillRect(ox, 0, S, S)
  g.fillStyle = '#ffffff'
  g.fillRect(ox, 0, S, 6)
  g.fillRect(ox, 0, 6, S)
  g.fillStyle = '#a8a8a8'
  g.fillRect(ox, S - 6, S, 6)
  g.fillRect(ox + S - 6, 0, 6, S)
  g.strokeStyle = '#7a7a7a'
  g.lineWidth = 3
  g.strokeRect(ox + 1.5, 1.5, S - 3, S - 3)
  roundRectPath(g, ox + 44, 44, S - 88, S - 88, 26)
  g.fillStyle = '#d2d2d2'
  g.fill()
  g.lineWidth = 4
  g.strokeStyle = '#bdbdbd'
  g.stroke()
  for (const [x, y] of [[22, 22], [S - 22, 22], [22, S - 22], [S - 22, S - 22]] as const) {
    g.beginPath()
    g.arc(ox + x, y, 7, 0, Math.PI * 2)
    g.fillStyle = '#9a9a9a'
    g.fill()
    g.beginPath()
    g.arc(ox + x - 2, y - 2, 3, 0, Math.PI * 2)
    g.fillStyle = '#f4f4f4'
    g.fill()
  }
  grain(g, ox, 0, S, S, 11, 10)
}

/**
 * One wall cell: a steel plate two metres square, as a scrapyard would weld
 * it on. A bevelled rim, a row of rivets down each side, a stiffening rib
 * across the middle, weld beads, and streaks where the rain runs off the
 * rivets. Canvas y grows downward; v = 0 is the plate's BOTTOM after flipY.
 */
const drawWall = (g: CanvasRenderingContext2D, ox: number) => {
  const S = 256
  const grad = g.createLinearGradient(0, 0, 0, S)
  grad.addColorStop(0, '#f2f2f2')
  grad.addColorStop(1, '#d6d6d6')
  g.fillStyle = grad
  g.fillRect(ox, 0, S, S)
  // The rim: light along the top and left, dark along the bottom and right.
  g.fillStyle = '#ffffff'
  g.fillRect(ox, 0, S, 5)
  g.fillRect(ox, 0, 5, S)
  g.fillStyle = '#9c9c9c'
  g.fillRect(ox, S - 6, S, 6)
  g.fillRect(ox + S - 6, 0, 6, S)
  g.strokeStyle = '#6f6f6f'
  g.lineWidth = 2.5
  g.strokeRect(ox + 1.25, 1.25, S - 2.5, S - 2.5)
  // Streaks under where the rivets will be.
  const rng = mulberry32(31)
  for (let i = 0; i < 9; i++) {
    const x = ox + 18 + rng() * (S - 36)
    const y = 20 + rng() * 60
    const len = 40 + rng() * 120
    const streak = g.createLinearGradient(0, y, 0, y + len)
    streak.addColorStop(0, 'rgba(120,120,120,0.34)')
    streak.addColorStop(1, 'rgba(120,120,120,0)')
    g.fillStyle = streak
    g.fillRect(x, y, 3 + rng() * 5, len)
  }
  // The stiffening rib, a hand above the middle.
  g.fillStyle = '#b8b8b8'
  g.fillRect(ox + 8, S * 0.44, S - 16, 20)
  g.fillStyle = '#fbfbfb'
  g.fillRect(ox + 8, S * 0.44, S - 16, 4)
  g.fillStyle = '#8e8e8e'
  g.fillRect(ox + 8, S * 0.44 + 16, S - 16, 4)
  // Rivets down both sides and along the rib.
  const rivet = (x: number, y: number, r = 6): void => {
    g.beginPath()
    g.arc(ox + x, y, r, 0, Math.PI * 2)
    g.fillStyle = '#8a8a8a'
    g.fill()
    g.beginPath()
    g.arc(ox + x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2)
    g.fillStyle = '#fafafa'
    g.fill()
  }
  for (let k = 0; k < 6; k++) {
    const y = 26 + k * ((S - 52) / 5)
    rivet(20, y)
    rivet(S - 20, y)
  }
  for (let k = 0; k < 4; k++) rivet(62 + k * 44, S * 0.44 + 10, 4.5)
  // A welded patch, low on one side: scrap is mended with scrap.
  g.fillStyle = '#c6c6c6'
  roundRectPath(g, ox + 132, S * 0.66, 78, 56, 6)
  g.fill()
  g.strokeStyle = '#7d7d7d'
  g.lineWidth = 4
  g.setLineDash([7, 4])
  g.stroke()
  g.setLineDash([])
  grain(g, ox, 0, S, S, 23, 12)
}

/**
 * One crate / container side: corrugated steel between two rails, with
 * corner posts. The colour comes from the vertex paint, so one cell serves
 * the rust-red, the teal and the yellow containers alike.
 */
const drawCrate = (g: CanvasRenderingContext2D, ox: number) => {
  const S = 256
  g.fillStyle = '#e6e6e6'
  g.fillRect(ox, 0, S, S)
  // Corrugation: ridges lit on one flank, shaded on the other.
  const ridge = S / 8
  for (let k = 0; k < 8; k++) {
    const x = ox + k * ridge
    const grad = g.createLinearGradient(x, 0, x + ridge, 0)
    grad.addColorStop(0, '#fcfcfc')
    grad.addColorStop(0.45, '#e2e2e2')
    grad.addColorStop(0.55, '#b4b4b4')
    grad.addColorStop(1, '#d4d4d4')
    g.fillStyle = grad
    g.fillRect(x, 22, ridge, S - 44)
  }
  // Rails, top and bottom, and the posts.
  g.fillStyle = '#9a9a9a'
  g.fillRect(ox, 0, S, 22)
  g.fillRect(ox, S - 22, S, 22)
  g.fillRect(ox, 0, 12, S)
  g.fillRect(ox + S - 12, 0, 12, S)
  g.fillStyle = '#f6f6f6'
  g.fillRect(ox, 0, S, 4)
  g.fillRect(ox, S - 22, S, 3)
  g.strokeStyle = '#666666'
  g.lineWidth = 3
  g.strokeRect(ox + 1.5, 1.5, S - 3, S - 3)
  grain(g, ox, 0, S, S, 47, 10)
}

/** Nothing but a little grain: bare ground, cliffs, and every flat colour. */
const drawBlank = (g: CanvasRenderingContext2D, ox: number) => {
  const S = 256
  g.fillStyle = '#f6f6f6'
  g.fillRect(ox, 0, S, S)
  grain(g, ox, 0, S, S, 5, 7)
}

// ─── Drop-in detail maps ─────────────────────────────────────────────────────
// public/images/textures/floor.* and wall.* replace the procedural cells (see
// `game/assets/overrides.ts`). They are greyscale detail maps like the baked
// ones — the sector colour still comes from the vertex colours.
const overrideImages = new Map<string, HTMLImageElement>()

/** Load the drop-in detail maps. Awaited by the boot loader BEFORE the atlas
 *  bakes; a file that fails to decode keeps its procedural cell. */
export const loadTextureOverrides = async (): Promise<void> => {
  await Promise.all([...TEXTURE_FILES].map(async ([name, url]) => {
    const img = new Image()
    img.src = url
    try {
      await img.decode()
      overrideImages.set(name, img)
    } catch (e) {
      console.warn(`[textures] drop-in "${name}" could not be decoded — keeping the procedural one`, e)
    }
  }))
}

const drawCell = (g: CanvasRenderingContext2D, ox: number, name: 'floor' | 'wall', draw: typeof drawFloor): void => {
  const img = overrideImages.get(name)
  if (img) g.drawImage(img, ox, 0, 256, 256)
  else draw(g, ox)
}

/**
 * The procedural drawing of one cell, as a PNG data URL: the reference a
 * painting of it is made from (`pnpm art:prompts --references`). Always the
 * drawing, never a drop-in: a reference that is a painting of itself drifts
 * one generation further from the drawing with every re-roll.
 */
export const textureReference = (name: string): string | null => {
  const draw = name === 'floor' ? drawFloor : name === 'wall' ? drawWall : null
  if (!draw) return null
  const c = document.createElement('canvas')
  c.width = c.height = 256
  draw(c.getContext('2d', { willReadFrequently: true })!, 0)
  return c.toDataURL('image/png')
}

/**
 * The level's detail atlas: four cells in a row, each a quarter of u.
 * `fortressMesh.ts` maps every quad to exactly one cell (`ATLAS_CELL`).
 */
export const ATLAS_CELLS = ['floor', 'wall', 'crate', 'blank'] as const
export type AtlasCell = (typeof ATLAS_CELLS)[number]

export const levelAtlas = (): Texture => {
  if (atlasTex) return atlasTex
  atlasTex = make(1024, 256, (g) => {
    drawCell(g, 0, 'floor', drawFloor)
    drawCell(g, 256, 'wall', drawWall)
    drawCrate(g, 512)
    drawBlank(g, 768)
  })
  atlasTex.wrapS = atlasTex.wrapT = ClampToEdgeWrapping
  return atlasTex
}

/** Soft radial glow (particles, pickups, muzzle flashes). White, additive. */
export const glowTexture = (): Texture => {
  if (glowTex) return glowTex
  glowTex = make(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.25, 'rgba(255,255,255,0.85)')
    grad.addColorStop(0.6, 'rgba(255,255,255,0.25)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
  })
  glowTex.wrapS = glowTex.wrapT = ClampToEdgeWrapping
  return glowTex
}

/** Thin ring (telegraph rings, shockwaves). White, additive. */
export const ringTexture = (): Texture => {
  if (ringTex) return ringTex
  ringTex = make(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128)
    g.beginPath()
    g.arc(64, 64, 54, 0, Math.PI * 2)
    g.lineWidth = 10
    g.strokeStyle = 'rgba(255,255,255,1)'
    g.shadowColor = 'rgba(255,255,255,0.9)'
    g.shadowBlur = 8
    g.stroke()
  })
  ringTex.wrapS = ringTex.wrapT = ClampToEdgeWrapping
  return ringTex
}

/** Bake every shared texture now (called from the boot loader). */
export const bakeTextures = (): void => {
  levelAtlas()
  glowTexture()
  ringTexture()
}
