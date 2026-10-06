import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderTarget } from 'three'
import { getRenderer } from '../engine/renderer'
import { buildMech, poseMech, restPose } from '../models/mech'
import { DUSK } from '../world/sky'
import { targetToImage } from './disguiseThumbs'

/**
 * CM-07's portrait for the HUD's unit frame (#145): the game's own mech, head
 * and shoulders, drawn once with the game's renderer into an offscreen target
 * and kept as a data URL. Nothing is drawn per frame for it.
 */
/** Pixels a side: the frame shows it up to 4.5rem across, so 216 on a 3x phone. */
const SIZE = 224
const FOV = 26
let cached = ''

export const mechPortrait = (): string => {
  if (cached) return cached
  try {
    const r = getRenderer()
    const scene = new Scene()
    // Lit as the fortress lights the mech, a little brighter from its left.
    scene.add(new HemisphereLight(new Color(DUSK.skyLight), new Color(DUSK.groundLight), 1.2))
    const sun = new DirectionalLight(new Color(DUSK.sun), 1.6)
    sun.position.set(0.7, 0.9, 0.8)
    scene.add(sun)
    const rig = buildMech()
    poseMech(rig, restPose())
    rig.root.rotation.y = 0.42
    scene.add(rig.root)
    rig.root.updateMatrixWorld(true)
    // Framed on the head, the shoulders just in: a unit frame's bust.
    const head = rig.bones.head!.getWorldPosition(new Vector3())
    const aim = head.clone().add(new Vector3(0, -0.02, 0))
    const cam = new PerspectiveCamera(FOV, 1, 0.05, 20)
    cam.position.copy(aim).add(new Vector3(0.12, 0.1, 2.15))
    cam.lookAt(aim)
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
    rig.mesh.geometry.dispose()
    rig.outline?.geometry.dispose()
    const c = document.createElement('canvas')
    c.width = c.height = SIZE
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(SIZE, SIZE)
    img.data.set(targetToImage(px, SIZE))
    ctx.putImageData(img, 0, 0)
    cached = c.toDataURL('image/png')
  } catch {
    cached = ''
  }
  return cached
}
