import { Box3, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Sphere, Vector3, WebGLRenderTarget } from 'three'
import { getRenderer } from '../engine/renderer'
import { buildMech, poseMech, restPose } from '../models/mech'
import type { PaintId } from '../models/paintIds'
import { DUSK } from '../world/sky'
import { targetToImage } from './disguiseThumbs'

/**
 * Pictures of the mech in each paint scheme (#M5), drawn with the game's own
 * renderer into an offscreen target and kept as data URLs, like the
 * disguises' (`disguiseThumbs.ts`): a tile's thumbnail, and the frames of a
 * slow turn for the panel's preview (the workshop covers the pad the mech
 * stands on, so the panel shows the scheme itself). Nothing is drawn per
 * frame: the preview flips through its baked frames.
 */
const FOV = 30
/** Frames in one full turn of the preview. */
export const TURN_FRAMES = 24
const cache = new Map<string, string>()

/** The mech in `scheme`, turned `yaw`, `size` pixels square; '' where nothing can draw. */
const shoot = (scheme: PaintId, yaw: number, size: number): string => {
  try {
    const r = getRenderer()
    const scene = new Scene()
    // Lit as the fortress lights the mech: the tile shows it as it looks in a raid.
    scene.add(new HemisphereLight(new Color(DUSK.skyLight), new Color(DUSK.groundLight), 1.2))
    const sun = new DirectionalLight(new Color(DUSK.sun), 1.6)
    sun.position.set(0.6, 1, 0.7)
    scene.add(sun)
    const rig = buildMech(scheme)
    poseMech(rig, restPose())
    rig.root.rotation.y = yaw
    scene.add(rig.root)
    rig.root.updateMatrixWorld(true)
    // Framed to the rest pose's size, the same for every yaw (no breathing zoom as it turns).
    rig.root.rotation.y = 0
    rig.root.updateMatrixWorld(true)
    const ball = new Box3().setFromObject(rig.mesh).getBoundingSphere(new Sphere())
    rig.root.rotation.y = yaw
    rig.root.updateMatrixWorld(true)
    const cam = new PerspectiveCamera(FOV, 1, 0.05, 50)
    const view = new Vector3(0, 0.22, 1).normalize()
    cam.position.copy(ball.center).addScaledVector(view, (ball.radius / Math.sin((FOV / 2) * Math.PI / 180)) * 0.7)
    cam.lookAt(ball.center)
    const target = new WebGLRenderTarget(size, size, { samples: 4 })
    const prev = r.getRenderTarget()
    const clear = r.getClearAlpha()
    r.setClearAlpha(0)
    r.setRenderTarget(target)
    r.clear()
    r.render(scene, cam)
    const px = new Uint8Array(size * size * 4)
    r.readRenderTargetPixels(target, 0, 0, size, size, px)
    r.setRenderTarget(prev)
    r.setClearAlpha(clear)
    target.dispose()
    rig.mesh.geometry.dispose()
    if (rig.outline && rig.outline.geometry !== rig.mesh.geometry) rig.outline.geometry.dispose()
    rig.material.dispose()
    rig.glowMaterial.dispose()
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(size, size)
    img.data.set(targetToImage(px, size))
    ctx.putImageData(img, 0, 0)
    return c.toDataURL('image/png')
  } catch {
    return ''
  }
}

const once = (key: string, f: () => string): string => {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const url = f()
  cache.set(key, url)
  return url
}

/** A tile's picture: three-quarters on. Pixels a side: shown up to 5rem across, so 240 on a 3x phone. */
export const paintThumb = (scheme: PaintId): string => once(`t:${scheme}`, () => shoot(scheme, -0.5, 256))

/**
 * Frame `i` of the preview's slow turn (0 … TURN_FRAMES − 1). Shown up to
 * about 8rem across, so drawn at 384 for a 3x phone; only the scheme looked
 * at is baked, a frame at a time.
 */
export const paintTurnFrame = (scheme: PaintId, i: number): string =>
  once(`f:${scheme}:${i}`, () => shoot(scheme, -0.5 + (i / TURN_FRAMES) * Math.PI * 2, 384))
