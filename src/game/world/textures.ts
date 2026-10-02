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
 * Floors and walls share ONE atlas (floor cell on the left half, wall cell on
 * the right) so a whole room's floor + walls is a single draw call. Every quad
 * spans exactly one cell, so no tiling across the atlas seam is ever needed.
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

/** One wall cell: vertical seams, a mid band, a vent grille, soft top light. */
const drawWall = (g: CanvasRenderingContext2D, ox: number) => {
  const S = 256
  const grad = g.createLinearGradient(0, 0, 0, S)
  grad.addColorStop(0, '#cfcfcf')
  grad.addColorStop(1, '#f4f4f4')
  g.fillStyle = grad
  g.fillRect(ox, 0, S, S)
  g.fillStyle = '#8c8c8c'
  g.fillRect(ox, 0, 4, S)
  g.fillStyle = '#ffffff'
  g.fillRect(ox + 4, 0, 3, S)
  // Mid band (canvas y grows downward; v = 0 is the wall BOTTOM after flipY)
  g.fillStyle = '#b3b3b3'
  g.fillRect(ox, S * 0.42, S, 18)
  g.fillStyle = '#f7f7f7'
  g.fillRect(ox, S * 0.42 + 14, S, 4)
  // Vent grille, upper third
  g.fillStyle = '#9d9d9d'
  for (let i = 0; i < 5; i++) {
    roundRectPath(g, ox + S * 0.3, S * 0.12 + i * 12, S * 0.4, 6, 3)
    g.fill()
  }
  // Lower panel
  roundRectPath(g, ox + 26, S * 0.58, S - 52, S * 0.34, 18)
  g.fillStyle = '#dcdcdc'
  g.fill()
  g.lineWidth = 3
  g.strokeStyle = '#b0b0b0'
  g.stroke()
  grain(g, ox, 0, S, S, 23, 8)
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

/** Floor (u 0–0.5) + wall (u 0.5–1) atlas. */
export const levelAtlas = (): Texture => {
  if (atlasTex) return atlasTex
  atlasTex = make(512, 256, (g) => {
    drawCell(g, 0, 'floor', drawFloor)
    drawCell(g, 256, 'wall', drawWall)
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
