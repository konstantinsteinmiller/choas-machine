import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderTarget } from 'three'
import { getRenderer } from '../engine/renderer'
import { buildDisguise, disposeDisguise, type DisguiseId } from '../models/disguises'

/**
 * Little pictures of the disguises for the Chassis Bay's tiles (#97), drawn
 * once with the game's own renderer into an offscreen target and kept as data
 * URLs. The workshop panel covers the pad the mech stands on, so the tiles
 * show what each one is.
 */
const SIZE = 160
const cache = new Map<DisguiseId, string>()

export const disguiseThumb = (id: DisguiseId): string => {
  const hit = cache.get(id)
  if (hit) return hit
  let url = ''
  try {
    const r = getRenderer()
    const scene = new Scene()
    scene.add(new HemisphereLight(new Color('#ffe9ff'), new Color('#4a3a8a'), 1.25))
    const sun = new DirectionalLight(new Color('#fff6e8'), 1.6)
    sun.position.set(3, 5, 4)
    scene.add(sun)
    const g = buildDisguise(id)
    g.visible = true
    g.rotation.y = -0.55
    scene.add(g)
    const cam = new PerspectiveCamera(32, 1, 0.1, 50)
    cam.position.set(0, 2.4, 6.4)
    cam.lookAt(0, 1.15, 0)
    const target = new WebGLRenderTarget(SIZE, SIZE)
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
    // The target is bottom-up: flip it.
    for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4)
    ctx.putImageData(img, 0, 0)
    url = c.toDataURL('image/png')
  } catch {
    url = ''
  }
  cache.set(id, url)
  return url
}
