import { CylinderGeometry, Mesh, PerspectiveCamera, Vector3, type BufferGeometry } from 'three'
import { getRenderer, fovForAspect } from '../engine/renderer'
import { newScene, type GameMode } from '../engine/app'
import { noSlice, type Slice } from '../engine/slicer'
import { merge, paint, stripUv, xform } from '../models/kit'
import { glowVC, toonVC } from '../models/toon'
import { buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import { buildDropship, type Dropship } from '../models/dropship'
import type { Rig } from '../models/kit'
import { makeBlobShadow } from '../fx/markers'
import { buildSky, type Sky } from '../world/sky'
import { runHudTickers } from '../state/hud'
import type { WeaponId } from '../data/ids'

/**
 * ─── The Mobile Command Base ─────────────────────────────────────────────────
 *
 * The hub between missions (GDD 3.2): the mech on its service pad, the
 * dropship behind it, the sky all round. The stations themselves (Armory,
 * Chassis Bay, Forge) are DOM over this scene; the scene is what makes them a
 * place.
 *
 * The mech stands to one side of the picture, away from the panels: left in
 * landscape, high in portrait. That is done with the camera's view offset, so
 * the model stays at the origin and the framing follows the screen.
 */
export class CommandBase implements GameMode {
  scene = newScene()
  camera = new PerspectiveCamera(46, 1, 0.2, 900)
  private rig!: Rig
  private ship!: Dropship
  private sky!: Sky
  private pad!: Mesh
  private padGlow!: Mesh
  private geos: BufferGeometry[] = []
  private pose: MechPose = restPose()
  private time = 0
  private centre = new Vector3(0, 0, 0)
  private w = 1
  private h = 1
  /** The weapon the mech holds up: the Armory sets it to the one being looked at. */
  weapon: WeaponId = 'sniper'
  /** 0 … 1 the mech shows the weapon off (a station is open). */
  present = 0

  static async create(slice: Slice = noSlice, onProgress: (p01: number) => void = () => {}): Promise<CommandBase> {
    const b = new CommandBase()
    b.sky = buildSky(b.scene, b.centre)
    onProgress(0.3)
    await slice()
    // The service pad: a low hex deck with a lit rim.
    const deck = paint(stripUv(new CylinderGeometry(4.2, 4.6, 0.5, 6)), '#7a6fc4')
    const inner = paint(xform(stripUv(new CylinderGeometry(3.3, 3.3, 0.06, 6)), [0, 0.26, 0]), '#5b4fa8')
    const rim = paint(xform(stripUv(new CylinderGeometry(4.25, 4.25, 0.08, 6, 1, true)), [0, 0.2, 0]), '#5fe9ff')
    const ring = paint(xform(stripUv(new CylinderGeometry(1.5, 1.5, 0.03, 24, 1, true)), [0, 0.3, 0]), '#ff5fb7')
    const litGeo = merge([deck, inner])
    const glowGeo = merge([rim, ring])
    for (const g of [deck, inner, rim, ring]) g.dispose()
    b.geos.push(litGeo, glowGeo)
    b.pad = new Mesh(litGeo, toonVC())
    b.padGlow = new Mesh(glowGeo, glowVC())
    b.pad.position.y = -0.27
    b.padGlow.position.y = -0.27
    onProgress(0.5)
    await slice()
    b.rig = buildMech()
    const shadow = makeBlobShadow(0.9)
    shadow.position.y = 0.02
    onProgress(0.8)
    await slice()
    b.ship = buildDropship()
    b.ship.group.position.set(-10, 2.2, -17)
    b.ship.group.rotation.y = 0.7
    b.scene.add(b.pad, b.padGlow, b.rig.root, shadow, b.ship.group)
    onProgress(1)
    b.frame(0)
    return b
  }

  resize(w: number, h: number): void {
    this.w = w
    this.h = h
    this.frame(0)
  }

  /** Aim the camera, and slide the picture so the mech clears the panels. */
  private frame(dt: number): void {
    void dt
    const portrait = this.h > this.w
    const a = 0.55 + Math.sin(this.time * 0.12) * 0.12
    const dist = portrait ? 9.2 : 8.2
    this.camera.position.set(Math.sin(a) * dist, 2.5, Math.cos(a) * dist)
    this.camera.lookAt(0, 1.35, 0)
    const fov = fovForAspect(this.w / Math.max(1, this.h)) * (portrait ? 0.62 : 0.78)
    if (Math.abs(this.camera.fov - fov) > 0.01) this.camera.fov = fov
    // Landscape: the mech in the left third. Portrait: in the upper third.
    const ox = portrait ? 0 : Math.round(this.w * 0.2)
    const oy = portrait ? Math.round(this.h * 0.2) : 0
    this.camera.setViewOffset(this.w, this.h, ox, oy, this.w, this.h)
    this.camera.updateProjectionMatrix()
  }

  update(dt: number): void {
    this.time += dt
  }

  render(_alpha: number, dt: number): void {
    this.frame(dt)
    // The mech idles, turning a little on its pad; with a station open it
    // brings the weapon up to be looked at.
    this.rig.root.rotation.y = 0.35 + Math.sin(this.time * 0.25) * 0.3
    const s = this.pose
    s.time = this.time
    s.weapon = this.weapon
    s.aim += (this.present * 0.85 - s.aim) * Math.min(1, dt * 5)
    s.spin += dt * 4 * this.present
    poseMech(this.rig, s)
    this.ship.group.position.y = 2.2 + Math.sin(this.time * 0.8) * 0.12
    this.sky.update(this.camera.position, this.time)
    runHudTickers(dt)
    const r = getRenderer()
    r.info.reset()
    r.render(this.scene, this.camera)
  }

  dispose(): void {
    this.sky.dispose()
    this.ship.dispose()
    for (const g of this.geos) g.dispose()
    this.rig.mesh.geometry.dispose()
    this.rig.material.dispose()
    this.rig.glowMaterial.dispose()
  }
}
