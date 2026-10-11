import { Box3, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Sphere, Vector3, WebGLRenderTarget } from 'three'
import { FREE_PAINT, type PaintId } from '../models/paintIds'
import { getRenderer } from '../engine/renderer'
import { buildDisguise, disposeDisguise, type DisguiseId } from '../models/disguises'
import { DUSK } from '../world/sky'

/**
 * Little pictures of the disguises for the Chassis Bay's tiles (#97), drawn
 * once with the game's own renderer into an offscreen target and kept as data
 * URLs. The workshop panel covers the pad the mech stands on, so the tiles
 * show what each one is.
 */
/** Pixels a side: a tile shows it up to 5rem across, so 240 on a 3x phone. */
const SIZE = 256
const FOV = 32
/** The camera looks down at it a little, from in front and to its left. */
const VIEW = new Vector3(0, 1.25, 6.4).normalize()
const cache = new Map<string, string>()

const toSRGB = (c: number): number => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

/**
 * A render target's pixels as a picture: flipped (the target is bottom-up),
 * and in sRGB. Three draws into a target in LINEAR light (only the canvas
 * gets the sRGB encoding), so the raw pixels shown as they are came out far
 * too dark; and the edges, blended over a clear target, carry their coverage
 * in the colour (premultiplied), which a 2D canvas does not want.
 */
export const targetToImage = (px: Uint8Array, size: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = ((size - 1 - y) * size + x) * 4
      const o = (y * size + x) * 4
      const a = px[i + 3]!
      if (a === 0) continue
      for (let k = 0; k < 3; k++) out[o + k] = Math.round(toSRGB(Math.min(1, px[i + k]! / a)) * 255)
      out[o + 3] = a
    }
  }
  return out
}

/** In the paint the mech wears (#M3): a crimson mech's toaster is crimson. */
export const disguiseThumb = (id: DisguiseId, scheme: PaintId = FREE_PAINT): string => {
  const key = `${id}:${scheme}`
  const hit = cache.get(key)
  if (hit) return hit
  let url = ''
  try {
    const r = getRenderer()
    const scene = new Scene()
    // Lit as the fortress lights the mech (`sky.ts`): the tile shows it as it looks in a raid.
    scene.add(new HemisphereLight(new Color(DUSK.skyLight), new Color(DUSK.groundLight), 1.15))
    const sun = new DirectionalLight(new Color(DUSK.sun), 1.5)
    sun.position.set(0.55, 1, 0.35)
    scene.add(sun)
    const g = buildDisguise(id, scheme)
    g.visible = true
    g.rotation.y = -0.55
    scene.add(g)
    // Framed to its own size: none is cut off (the teddy's antenna was).
    g.updateMatrixWorld(true)
    const ball = new Box3().setFromObject(g).getBoundingSphere(new Sphere())
    const cam = new PerspectiveCamera(FOV, 1, 0.1, 50)
    cam.position.copy(ball.center).addScaledVector(VIEW, (ball.radius / Math.sin((FOV / 2) * Math.PI / 180)) * 0.92)
    cam.lookAt(ball.center)
    const target = new WebGLRenderTarget(SIZE, SIZE, { samples: 4 })
    const prev = r.getRenderTarget()
    const clear = r.getClearAlpha()
    r.setClearAlpha(0)
    r.setRenderTarget(target)
    r.clear()
    r.render(scene, cam)
    const px = new Uint8Array(SIZE * SIZE * 4)
    r.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, px)
    r.setRenderTarget(prev)
    r.setClearAlpha(clear)
    target.dispose()
    disposeDisguise(g)
    const c = document.createElement('canvas')
    c.width = c.height = SIZE
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(SIZE, SIZE)
    img.data.set(targetToImage(px, SIZE))
    ctx.putImageData(img, 0, 0)
    url = c.toDataURL('image/png')
  } catch {
    url = ''
  }
  cache.set(key, url)
  return url
}
