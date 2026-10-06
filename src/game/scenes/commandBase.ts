import {
  Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Vector3, type BufferGeometry, type ShaderMaterial
} from 'three'
import { getRenderer, fovForAspect } from '../engine/renderer'
import { newScene, type GameMode } from '../engine/app'
import { noSlice, type Slice } from '../engine/slicer'
import { sceneQuality } from '../engine/quality'
import { merge, sph, type Rig, type V3 } from '../models/kit'
import { glowVC, outlineMat, toonVC } from '../models/toon'
import { buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import { buildDropship, type Dropship } from '../models/dropship'
import { makeBlobShadow } from '../fx/markers'
import { buildSky, type Sky } from '../world/sky'
import { runHudTickers } from '../state/hud'
import { profile } from '../state/profile'
import type { WeaponId } from '../data/ids'
import { buildDisguise, disposeDisguise, type DisguiseId } from '../models/disguises'
import { addParts, assembleParts, newParts, type Prop } from '../models/propKit'
import { PAD_TOP, STATIONS, deckLampParts, deckParts } from '../models/baseDeck'
import { FURNACE_STACK_TOP, furnaceCoreParts, furnaceParts } from '../models/forgeFurnace'
import {
  LAB_ARM_AT, LAB_HOLO_AT, buildLabArm, labParts, labScreenGeometry, makeHoloMaterial, setHoloTime, weaponHoloGeometry, type LabArm
} from '../models/weaponLab'
import { shelfContents, shelfParts, shelfRimParts } from '../models/disguiseShelf'
import { islandParts } from '../models/skyIslands'
import { Flyby } from './baseFlyby'

/**
 * ─── The Mobile Command Base ─────────────────────────────────────────────────
 *
 * The hub between missions (GDD 3.2): a floating sky-base. The mech stands
 * on the service pad in the middle of a paved hex deck; behind it, up a few
 * steps on the terrace, are its three stations: the Forge's furnace on the
 * left, the disguise shelf at the back (what the player owns on show), the
 * Armory's weapons lab on the right. The dropship hovers off the deck's
 * corner, floating islands stand in the haze, and every 10 to 20 seconds the
 * robo dog flies by in the sky behind. The stations' screens (Armory,
 * Chassis Bay, Forge) are DOM over this scene; the scene is what makes them
 * a place.
 *
 * The set is built in the camera's own frame (`models/baseDeck.ts`: the
 * camera looks from +z), turned to face the camera's mean bearing. The
 * static pieces are merged into one lit mesh, its outline and one glowing
 * mesh; what moves (the furnace's glow, embers, beacons, the lab's arm and
 * hologram, the shelf's holograms, the dog) is its own.
 *
 * The mech stands to one side of the picture, away from the panels: left in
 * landscape, high in portrait. That is done with the camera's view offset, so
 * the model stays at the origin and the framing follows the screen.
 */

/** The camera's mean bearing round the mech: the set faces it. */
const BEARING = 0.55
/** Embers off the furnace's stack. */
const EMBERS = 14
const EMBER_LIFE = 2.4
/** Where the dropship holds station (the set's frame). */
const SHIP_AT: V3 = [-3.5, 5.8, -26]

const _m = new Matrix4()
const _p = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()

export class CommandBase implements GameMode {
  scene = newScene()
  camera = new PerspectiveCamera(46, 1, 0.2, 900)
  private rig!: Rig
  private ship!: Dropship
  private sky!: Sky
  /** The set, in the camera's frame, lowered so the pad's top is at y = 0. */
  private set = new Group()
  private props: Prop[] = []
  private geos: BufferGeometry[] = []
  private mats: Array<MeshBasicMaterial | ShaderMaterial> = []
  private furnaceGlow!: MeshBasicMaterial
  private lampMat!: MeshBasicMaterial
  private embers!: InstancedMesh
  private arm!: LabArm
  private holo!: Mesh
  private holoMat!: ShaderMaterial
  private holoShapes = new Map<WeaponId, BufferGeometry>()
  private holoShown: WeaponId | null = null
  private screenMat!: ShaderMaterial
  private shelfGroup = new Group()
  private shelfHoloMat!: ShaderMaterial
  private shelfGeos: BufferGeometry[] = []
  private shelfKey = ''
  private shelfCheck = 0
  private flyby!: Flyby
  private pose: MechPose = restPose()
  private time = 0
  private centre = new Vector3(0, 0, 0)
  private w = 1
  private h = 1
  /** The weapon the mech holds up: the Armory sets it to the one being looked at. */
  weapon: WeaponId = 'sniper'
  /** 0 … 1 the mech shows the weapon off (a station is open). */
  present = 0
  /** A disguise being looked at in the Chassis Bay: it stands over the mech (#97); null for none. */
  disguise: DisguiseId | null = null
  private disguises = new Map<DisguiseId, Group>()
  private shownDisguise: DisguiseId | null = null

  static async create(slice: Slice = noSlice, onProgress: (p01: number) => void = () => {}): Promise<CommandBase> {
    const b = new CommandBase()
    b.sky = buildSky(b.scene, b.centre)
    b.set.rotation.y = BEARING
    b.set.position.y = -PAD_TOP
    b.scene.add(b.set)
    onProgress(0.15)
    await slice()

    // ── The deck and the stations' static parts, merged into one set ──
    const statics = deckParts()
    onProgress(0.25)
    await slice()
    const place = (k: keyof typeof STATIONS): { p: V3; r: V3 } => ({ p: STATIONS[k].at, r: [0, STATIONS[k].yaw, 0] })
    const furnace = place('furnace')
    const lab = place('lab')
    const shelf = place('shelf')
    addParts(statics, furnaceParts(), furnace.p, furnace.r)
    addParts(statics, labParts(), lab.p, lab.r)
    addParts(statics, shelfParts(), shelf.p, shelf.r)
    onProgress(0.35)
    await slice()
    b.addProp(assembleParts('base-set', statics, 0.03))
    onProgress(0.45)
    await slice()

    // ── What moves at the stations ──
    const station = (k: { p: V3; r: V3 }): Group => {
      const g = new Group()
      g.position.set(...k.p)
      g.rotation.y = k.r[1]
      b.set.add(g)
      return g
    }
    const furnaceAt = station(furnace)
    b.furnaceGlow = b.own(new MeshBasicMaterial({ vertexColors: true, toneMapped: false }))
    b.addProp(assembleParts('furnace-core', furnaceCoreParts(), 0, b.furnaceGlow), furnaceAt)
    b.embers = new InstancedMesh(b.geo(sph(0.035, 5, 4)), b.own(new MeshBasicMaterial({ color: '#ffb347', toneMapped: false })), EMBERS)
    b.embers.frustumCulled = false
    furnaceAt.add(b.embers)
    const labAt = station(lab)
    b.arm = buildLabArm()
    b.arm.rig.root.position.set(...LAB_ARM_AT)
    labAt.add(b.arm.rig.root)
    b.holoMat = b.own(makeHoloMaterial())
    const shape = b.geo(weaponHoloGeometry(b.weapon))
    b.holoShapes.set(b.weapon, shape)
    b.holoShown = b.weapon
    b.holo = new Mesh(shape, b.holoMat)
    b.holo.position.set(...LAB_HOLO_AT)
    b.holo.scale.setScalar(0.6)
    b.holo.renderOrder = 3
    labAt.add(b.holo)
    b.screenMat = b.own(makeHoloMaterial('#7ff4ff', 0.9, true))
    const screens = new Mesh(b.geo(labScreenGeometry()), b.screenMat)
    screens.renderOrder = 3
    labAt.add(screens)
    const shelfAt = station(shelf)
    shelfAt.add(b.shelfGroup)
    b.shelfHoloMat = b.own(makeHoloMaterial('#b9a6ff', 0.55))
    b.fillShelf()
    onProgress(0.6)
    await slice()

    // ── Beacons: the deck's landing lights and the islands' masts blink together ──
    b.lampMat = b.own(new MeshBasicMaterial({ vertexColors: true, toneMapped: false }))
    b.addProp(assembleParts('deck-lamps', deckLampParts(), 0, b.lampMat))
    const isl = islandParts(sceneQuality() === 'low')
    b.addProp(assembleParts('islands', isl.parts, 0.25))
    b.addProp(assembleParts('island-lamps', isl.lamps, 0, b.lampMat))
    onProgress(0.7)
    await slice()

    b.rig = buildMech()
    const shadow = makeBlobShadow(0.9)
    shadow.position.y = 0.02
    onProgress(0.85)
    await slice()
    b.ship = buildDropship()
    // Holding station high behind the stations, three-quarters on, nose to the right.
    b.ship.group.position.set(SHIP_AT[0], SHIP_AT[1], SHIP_AT[2])
    b.ship.group.rotation.y = 1.05
    b.set.add(b.ship.group)
    b.flyby = new Flyby(b.set)
    b.scene.add(b.rig.root, shadow)
    onProgress(1)
    b.frame(0)
    return b
  }

  /** Track a material this scene made (the shared ones are not ours to free). */
  private own<T extends MeshBasicMaterial | ShaderMaterial>(m: T): T {
    this.mats.push(m)
    return m
  }

  private geo<T extends BufferGeometry>(g: T): T {
    this.geos.push(g)
    return g
  }

  private addProp(p: Prop, parent: Group = this.set): void {
    this.props.push(p)
    parent.add(p.group)
  }

  /** Bake the shelf: what the player owns on its plinths, the rest as holograms. */
  private fillShelf(): void {
    const owned = new Set(profile.cosmetics.owned)
    this.shelfKey = [...owned].sort().join(',')
    for (const g of this.shelfGeos) g.dispose()
    this.shelfGeos = []
    this.shelfGroup.clear()
    const c = shelfContents(owned)
    const rims = shelfRimParts(owned)
    const glows = [...c.glow, ...rims.glow]
    if (c.lit.length) {
      const lit = merge(c.lit)
      const line = new Mesh(lit, outlineMat(0.012))
      line.renderOrder = -1
      this.shelfGroup.add(new Mesh(lit, toonVC()), line)
      this.shelfGeos.push(lit)
    }
    if (glows.length) {
      const g = merge(glows)
      this.shelfGroup.add(new Mesh(g, glowVC()))
      this.shelfGeos.push(g)
    }
    if (c.holo.length) {
      const g = merge(c.holo)
      const m = new Mesh(g, this.shelfHoloMat)
      m.renderOrder = 3
      this.shelfGroup.add(m)
      this.shelfGeos.push(g)
    }
    for (const g of [...c.lit, ...glows, ...c.holo]) g.dispose()
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
    // (Portrait sways less: its stations reach nearer the picture's sides.)
    const a = BEARING + Math.sin(this.time * 0.12) * (portrait ? 0.06 : 0.12)
    const dist = portrait ? 9.6 : 8.2
    this.camera.position.set(Math.sin(a) * dist, 2.5, Math.cos(a) * dist)
    this.camera.lookAt(0, 1.35, 0)
    // (Portrait a little wider than it was: the three stations behind the mech fit across it.)
    const fov = fovForAspect(this.w / Math.max(1, this.h)) * (portrait ? 0.7 : 0.78)
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

  /** The stations at work: the furnace breathes, embers rise, beacons blink, the lab's arm welds. */
  private animateSet(): void {
    const t = this.time
    this.furnaceGlow.color.setScalar(0.78 + 0.16 * Math.sin(t * 2.1) + 0.06 * Math.sin(t * 7.3))
    this.lampMat.color.setScalar((t % 1.6) < 0.25 ? 1 : 0.25)
    for (let i = 0; i < EMBERS; i++) {
      const k = ((t + (i * EMBER_LIFE) / EMBERS) % EMBER_LIFE) / EMBER_LIFE
      const a = i * 2.39996
      const r = 0.12 + k * 0.5
      _p.set(FURNACE_STACK_TOP[0] + Math.cos(a + k * 2) * r, FURNACE_STACK_TOP[1] + k * 2.6, FURNACE_STACK_TOP[2] + Math.sin(a + k * 2) * r)
      this.embers.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(1.2 * (1 - k))))
    }
    this.embers.instanceMatrix.needsUpdate = true
    this.arm.pose(t)
    // The weapon being looked at (or the one in hand) turns in the hologram.
    if (this.holoShown !== this.weapon) {
      this.holoShown = this.weapon
      let g = this.holoShapes.get(this.weapon)
      if (!g) { g = this.geo(weaponHoloGeometry(this.weapon)); this.holoShapes.set(this.weapon, g) }
      this.holo.geometry = g
    }
    this.holo.rotation.y = t * 0.6
    this.holo.position.y = LAB_HOLO_AT[1] + Math.sin(t * 1.4) * 0.03
    setHoloTime(this.holoMat, t)
    setHoloTime(this.screenMat, t)
    setHoloTime(this.shelfHoloMat, t)
    // A disguise bought while the base is up goes onto its plinth (checked once a second).
    if (t - this.shelfCheck > 1) {
      this.shelfCheck = t
      if ([...profile.cosmetics.owned].sort().join(',') !== this.shelfKey) this.fillShelf()
    }
    this.flyby.update(t)
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
    this.ship.group.position.y = SHIP_AT[1] + Math.sin(this.time * 0.8) * 0.12
    this.animateSet()
    // The disguise under the cursor, standing over the mech on the pad.
    if (this.disguise !== this.shownDisguise) {
      if (this.shownDisguise) this.disguises.get(this.shownDisguise)!.visible = false
      this.shownDisguise = this.disguise
      if (this.disguise) {
        let g = this.disguises.get(this.disguise)
        if (!g) { g = buildDisguise(this.disguise); this.disguises.set(this.disguise, g); this.scene.add(g) }
        g.visible = true
      }
    }
    this.rig.root.visible = !this.shownDisguise
    if (this.shownDisguise) this.disguises.get(this.shownDisguise)!.rotation.y = this.rig.root.rotation.y
    this.sky.update(this.camera.position, this.time)
    runHudTickers(dt)
    const r = getRenderer()
    r.info.reset()
    r.render(this.scene, this.camera)
  }

  dispose(): void {
    for (const g of this.disguises.values()) disposeDisguise(g)
    this.flyby.dispose()
    this.sky.dispose()
    this.ship.dispose()
    for (const p of this.props) p.dispose()
    for (const g of [...this.geos, ...this.shelfGeos]) g.dispose()
    for (const m of this.mats) m.dispose()
    this.embers.dispose()
    for (const rig of [this.rig, this.arm.rig]) {
      rig.mesh.geometry.dispose()
      if (rig.outline && rig.outline.geometry !== rig.mesh.geometry) rig.outline.geometry.dispose()
      rig.material.dispose()
      rig.glowMaterial.dispose()
    }
  }
}
