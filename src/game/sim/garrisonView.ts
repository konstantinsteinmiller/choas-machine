import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, DynamicDrawUsage,
  Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Sprite, SpriteMaterial, SRGBColorSpace, type Scene
} from 'three'
import { VOID, hasLineOfSight, heightAt, raycast, type Grid } from '../world/grid'
import { PAL } from '../models/palette'
import { Wreckage } from '../fx/wreckage'
import type { PostKind } from '../world/fortress'
import { dome, paint, rbox, merge, type Rig } from '../models/kit'
import {
  buildDrone, buildEnforcer, buildGoliath, buildGuard, buildSearchlight, poseSearchlight, type SearchlightPose, restGuardPose, poseDrone, poseEnforcer, poseGoliath, poseGuard,
  type DronePose, type EnforcerPose, type GoliathPose, type GuardPose, buildRoomba, poseRoomba, type RoombaPose
} from '../models/garrison'
import { makeBlobShadow } from '../fx/markers'
import { poseRagdoll } from '../models/ragdollPose'
import { DOG_STAND, HOUND_SCALE, buildRobodog, poseRobodog, restDogPose, type DogPose } from '../models/robodog'
import { angleDelta } from './player'
import { SPECS, SPOT_RADIUS, SUSPECT_AT, spotCentre, viewerOf, type Garrison, type Unit , isLight } from './garrison'

/**
 * ─── The garrison, drawn ─────────────────────────────────────────────────────
 *
 * One rig per defender, plus everything that makes stealth READABLE: the
 * vision cone on the ground in front of each guard (clipped by walls and
 * cover, so the player sees what hides them), the searchlight under each
 * drone, and the mark over a head that is getting curious ("?") or sure ("!").
 *
 * All the cones are ONE mesh with one draw call; its vertices are rewritten a
 * few units per frame.
 */

/** A cone is a polar grid draped on the ground: this many slices and rings. */
const CONE_SEGS = 12
const CONE_RINGS = 6
const CONE_VERTS = CONE_SEGS * CONE_RINGS * 6
/** A point on the ground counts as watched if the eye sees this far above it:
 *  under the top of cover, so the lee of a cover block is drawn dark. */
const CONE_PROBE_Y = 0.9
/** Neighbouring grid points further apart in height than this are a cliff:
 *  nothing is drawn across it. */
const CONE_CLIFF = 1.2
/** A light's pool: a polar grid draped on the ground and clipped by whatever
 *  stands between it and the lamp or the middle of the pool (#69). */
const POOL_SEGS = 20
const POOL_RINGS = 3
const POOL_VERTS = POOL_SEGS * POOL_RINGS * 6
const POOL_ALPHA = 0.24
const CALM = new Color('#e9fdff')
/** A tagged unit's diamond and round: the scope's own cyan. */
const TAG = new Color('#5fe9ff')
const WARY = new Color('#ffe14d')
/** Noticing, not yet looking: white (Odyssey's first band). */
const NOTICE = new Color('#ffffff')
const HOT = new Color('#ff3b5c')

interface UnitView {
  rig: Rig
  shadow: Mesh
  mark: Sprite | null
  /** Drones: the light on the ground and the beam down to it. */
  spot: Mesh | null
  beam: Mesh | null
  /** The pool's grid points, scratch: x, y, z, alpha. */
  pool: Float32Array | null
  /** Index of its cone in the shared mesh, or −1. */
  cone: number
  guard: GuardPose | null
  drone: DronePose | null
  enforcer: EnforcerPose | null
  goliath: GoliathPose | null
  /** The Scrap Hound's gallop. */
  dog: DogPose | null
  lamp: SearchlightPose | null
  /** Eased 0 … 1 pose values. */
  aim: number
  wary: number
  caution: number
  /** Humans: eased 0 … 1 while the mech has hold of it. */
  grip: number
  spin: number
  /** Drones: last frame's heading, and the bank it is easing into. */
  lastYaw: number
  bank: number
  /** The mark's pop when the state changes. */
  pop: number
  /** Tagged through the scope: a diamond over it (seen through walls) and its round on the ground. */
  tag: Sprite | null
  route: Line | null
  lastState: string
  /** Seconds left of the flash a hit gives it. */
  flash: number
  /** It burst: the rig is gone and its pieces lie where they fell. */
  wrecked: boolean
  /** A drone that fell whole has hit the ground (and shed a few parts). */
  landed: boolean
  roomba: RoombaPose | null
}

/** The "?" and the "!", drawn as shapes: no font, so no wait for one. */
/** A small canvas sprite: a diamond (a tagged unit) or three dots (a pair talking). */
const glyphTexture = (kind: 'tag' | 'chat'): CanvasTexture => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.lineJoin = 'round'
  g.lineCap = 'round'
  const draw = (): void => {
    if (kind === 'tag') {
      g.beginPath()
      g.moveTo(64, 30); g.lineTo(92, 64); g.lineTo(64, 98); g.lineTo(36, 64); g.closePath()
      g.stroke()
    } else {
      for (const x of [38, 64, 90]) { g.beginPath(); g.arc(x, 70, 2, 0, Math.PI * 2); g.stroke() }
    }
  }
  g.strokeStyle = '#150c2b'
  g.lineWidth = kind === 'tag' ? 24 : 30
  draw()
  g.strokeStyle = '#ffffff'
  g.lineWidth = kind === 'tag' ? 12 : 18
  draw()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

const markTexture = (bang: boolean, siren = false): CanvasTexture => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const draw = (): void => {
    if (siren) {
      // A siren lamp with three rays: this one is running to raise the alarm.
      g.beginPath()
      g.arc(64, 78, 22, Math.PI, 0)
      g.lineTo(86, 92)
      g.lineTo(42, 92)
      g.closePath()
      g.stroke()
      for (const [x1, y1, x2, y2] of [[64, 30, 64, 44], [30, 46, 40, 56], [98, 46, 88, 56]]) {
        g.beginPath(); g.moveTo(x1!, y1!); g.lineTo(x2!, y2!); g.stroke()
      }
      return
    }
    if (bang) {
      g.beginPath()
      g.moveTo(64, 26)
      g.lineTo(64, 70)
      g.stroke()
    } else {
      g.beginPath()
      g.arc(64, 46, 20, Math.PI * 1.05, Math.PI * 2.45)
      g.lineTo(64, 76)
      g.stroke()
    }
    g.beginPath()
    g.arc(64, 100, 1, 0, Math.PI * 2)
    g.stroke()
  }
  g.strokeStyle = '#150c2b'
  g.lineWidth = 30
  draw()
  g.strokeStyle = '#ffffff'
  g.lineWidth = 17
  draw()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/**
 * What each machine comes apart into. `half` is the body the pieces start
 * in (metres either side of its middle), `lift` how far up that middle is.
 */
const WRECKS: Partial<Record<PostKind, {
  count: number; size: [number, number]; half: [number, number, number]; lift: number; force: number; colors: readonly string[]
}>> = {
  searchlight: { count: 7, size: [0.1, 0.26], half: [0.3, 0.25, 0.3], lift: -0.1, force: 5.6, colors: [PAL.steel, PAL.steelDeep, PAL.steelDark, PAL.glowWhite] },
  drone: { count: 9, size: [0.1, 0.24], half: [0.3, 0.15, 0.3], lift: 0, force: 6.3, colors: [PAL.steel, PAL.steelDeep, PAL.steelDark, PAL.glowRed] },
  enforcer: { count: 26, size: [0.22, 0.62], half: [0.8, 1.4, 0.6], lift: 0.4, force: 9, colors: [PAL.steel, PAL.steel, PAL.steelDeep, PAL.steelDeep, PAL.steelDark, PAL.steelDark, PAL.glowYellow] },
  // A person blown apart in a kill-cam (#64): cloth, skin, boots and the helmet.
  guard: { count: 16, size: [0.1, 0.28], half: [0.25, 0.8, 0.2], lift: 0.9, force: 7, colors: [PAL.uniform, PAL.uniformDeep, PAL.skin, PAL.boot, PAL.helmet, PAL.uniform] },
  sentry: { count: 16, size: [0.1, 0.28], half: [0.25, 0.8, 0.2], lift: 0.9, force: 7, colors: [PAL.uniform, PAL.uniformDeep, PAL.skin, PAL.boot, PAL.helmet, PAL.uniform] },
  hound: { count: 10, size: [0.1, 0.26], half: [0.3, 0.3, 0.6], lift: 0.5, force: 6.3, colors: [PAL.steel, PAL.steelDeep, PAL.steelDark, PAL.glowRed] },
  roomba: { count: 10, size: [0.1, 0.26], half: [0.5, 0.2, 0.5], lift: 0.25, force: 6, colors: [PAL.steel, PAL.steelDeep, PAL.steelDark, PAL.hazard, PAL.glowRed] },
  goliath: { count: 54, size: [0.35, 1.1], half: [1.9, 1.1, 2.9], lift: 0.5, force: 12, colors: [PAL.steel, PAL.steel, PAL.steelDeep, PAL.steelDeep, PAL.steelDark, PAL.steelDark, PAL.steelDark, PAL.hazard] }
}

export class GarrisonView {
  readonly group = new Group()
  private views: UnitView[] = []
  private cones: Mesh
  private conePos: Float32Array
  private coneCol: Float32Array
  private coneCount = 0
  private cursor = 0
  private flashColor = new Color()
  /** Scratch for one cone's grid points: x, y, z, alpha. */
  private gx = new Float32Array((CONE_SEGS + 1) * (CONE_RINGS + 1) * 4)
  private textures: CanvasTexture[]
  private frame = 0
  /** The helmet the base issues after too many headshots: a steel dome and a brow plate. */
  private helmetGeo = merge([
    paint(dome(0.275, Math.PI * 0.55, 10, 6).translate(0, 0.23, 0), PAL.steel),
    paint(rbox(0.42, 0.06, 0.1, 0.5, 6, 4).translate(0, 0.25, 0.21), PAL.steelDeep)
  ])
  /** Every machine taken apart in this mission, in one mesh. */
  readonly wreckage: Wreckage
  private beamGeo = new CylinderGeometry(0.03, 1, 1, 16, 1, true)

  constructor(private gar: Garrison, private grid: Grid) {
    this.wreckage = new Wreckage(grid)
    this.group.add(this.wreckage.mesh)
    const q = markTexture(false)
    const bang = markTexture(true)
    const siren = markTexture(false, true)
    this.textures = [q, bang, siren, glyphTexture('tag'), glyphTexture('chat')]
    this.beamGeo.translate(0, -0.5, 0)

    for (const u of gar.units) {
      const human = u.kind === 'guard' || u.kind === 'sentry' || u.kind === 'commander'
      const rig = u.kind === 'drone' ? buildDrone()
        : u.kind === 'hound' ? buildRobodog(true)
        : u.kind === 'roomba' ? buildRoomba(u.shotgun)
        : u.kind === 'searchlight' ? buildSearchlight()
        : u.kind === 'enforcer' ? buildEnforcer(u.boss === 'foreman')
          : u.kind === 'goliath' ? buildGoliath()
            : buildGuard(u.kind === 'commander', u.shield, u.role === 'engineer', u.role === 'grenadier' || u.role === 'marksman' ? u.role : null)
      const shadow = makeBlobShadow(SPECS[u.kind].radius * 1.5)
      let mark: Sprite | null = null
      if (human || isLight(u) || u.kind === 'hound' || u.kind === 'roomba') {
        mark = new Sprite(new SpriteMaterial({ map: q, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
        mark.renderOrder = 30
        mark.visible = false
      }
      let spot: Mesh | null = null
      let beam: Mesh | null = null
      if (isLight(u)) {
        const geo = new BufferGeometry()
        const pos = new BufferAttribute(new Float32Array(POOL_VERTS * 3), 3)
        const col = new BufferAttribute(new Float32Array(POOL_VERTS * 4), 4)
        pos.setUsage(DynamicDrawUsage)
        col.setUsage(DynamicDrawUsage)
        geo.setAttribute('position', pos)
        geo.setAttribute('color', col)
        spot = new Mesh(geo, new MeshBasicMaterial({
          color: CALM.clone(), vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        }))
        spot.frustumCulled = false
        spot.renderOrder = 2
        beam = new Mesh(this.beamGeo, new MeshBasicMaterial({
          // A searchlight's beam is the brighter one: it is how you read where it is looking.
          color: CALM.clone(), transparent: true, opacity: u.kind === 'searchlight' ? 0.12 : 0.07, depthWrite: false, toneMapped: false
        }))
        beam.renderOrder = 3
      }
      const v: UnitView = {
        rig, shadow, mark, spot, beam, pool: spot ? new Float32Array((POOL_SEGS + 1) * (POOL_RINGS + 1) * 4) : null,
        cone: human || u.kind === 'hound' || u.kind === 'roomba' ? this.coneCount++ : -1,
        guard: human ? { ...restGuardPose(), seed: (u.seed * 0.618) % 1, proud: u.kind === 'commander' } : null,
        drone: u.kind === 'drone' ? { time: 0, spin: 0, pitch: 0, roll: 0, eyeYaw: 0, eyePitch: 0.5, alarm: 0, deadT: 0, landed: false } : null,
        enforcer: u.kind === 'enforcer' ? { time: 0, stride: 0, speed: 0, power: 0, aimYaw: 0, aimPitch: 0, recoilL: 0, recoilR: 0, deadT: 0 } : null,
        lamp: u.kind === 'searchlight' ? { time: 0, yaw: 0, pitch: 0.6, alarm: 0 } : null,
        goliath: u.kind === 'goliath' ? { time: 0, turretYaw: 0, barrelPitch: 0, recoil: 0, rumble: 0, dead: 0 } : null,
        dog: u.kind === 'hound' ? restDogPose() : null,
        roomba: u.kind === 'roomba' ? { time: 0, alarm: 0, recoil: 0, aimYaw: 0, speed: 0 } : null,
        aim: 0, wary: 0, caution: 0, grip: 0, spin: 0, lastYaw: u.yaw, bank: 0, pop: 0, lastState: u.state, flash: 0, wrecked: false, landed: false,
        tag: null, route: null
      }
      this.views.push(v)
      this.group.add(rig.root, shadow)
      if (mark) this.group.add(mark)
      // A helmet (R26): a steel cap on the head bone, over the guard's own.
      if (u.helmet && rig.bones.head) {
        const cap = new Mesh(this.helmetGeo, rig.material)
        cap.name = 'helmet'
        rig.bones.head.add(cap)
      }
      if (spot) this.group.add(spot)
      if (beam) this.group.add(beam)
    }

    // The cones: a fan of triangles per guard, in one buffer.
    const n = Math.max(1, this.coneCount) * CONE_VERTS
    this.conePos = new Float32Array(n * 3)
    this.coneCol = new Float32Array(n * 4)
    const geo = new BufferGeometry()
    const pos = new BufferAttribute(this.conePos, 3)
    const col = new BufferAttribute(this.coneCol, 4)
    pos.setUsage(DynamicDrawUsage)
    col.setUsage(DynamicDrawUsage)
    geo.setAttribute('position', pos)
    geo.setAttribute('color', col)
    this.cones = new Mesh(geo, new MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    }))
    this.cones.frustumCulled = false
    this.cones.renderOrder = 2
    this.group.add(this.cones)
    for (let i = 0; i < gar.units.length; i++) this.writeCone(i)
  }

  addTo(scene: Scene): void {
    scene.add(this.group)
  }

  /**
   * A machine comes apart: its rig is taken away and rounded cubes in its own
   * colours fly from where it stood. They stay where they land.
   */
  burst(id: number): void {
    const u = this.gar.units[id]
    const v = this.views[id]
    if (!u || !v || v.wrecked) return
    v.wrecked = true
    const spec = WRECKS[u.kind]
    if (!spec) return
    this.wreckage.burst({
      x: u.x, y: u.y + spec.lift, z: u.z,
      hx: spec.half[0], hy: spec.half[1], hz: spec.half[2],
      count: spec.count, size: spec.size, colors: spec.colors, force: spec.force,
      dirX: u.hitX, dirZ: u.hitZ
    })
  }

  /** A round took a guard's helmet off: the cap goes, in a few pieces. */
  popHelmet(id: number, dirX: number, dirZ: number): void {
    const v = this.views[id]
    const u = this.gar.units[id]
    const cap = v?.rig.bones.head?.getObjectByName('helmet')
    if (!v || !u || !cap) return
    cap.removeFromParent()
    this.wreckage.burst({ x: u.x, y: u.y + 1.8, z: u.z, hx: 0.15, hy: 0.1, hz: 0.15, count: 3, size: [0.1, 0.18], colors: [PAL.steel, PAL.steelDeep], force: 3.5, dirX: -dirX, dirZ: -dirZ })
  }

  /** Light a defender up for a moment (a hit, the x-ray of a kill-cam). */
  flash(id: number, hex: string, seconds = 0.5): void {
    const v = this.views[id]
    if (!v) return
    v.flash = seconds
    this.flashColor.set(hex)
    v.rig.material.emissive.copy(this.flashColor)
  }

  /**
   * Rewrite one guard's cone: where it looks and as far as it sees, lying on
   * the ground, dark wherever a wall or cover is in the way.
   */
  private writeCone(i: number): void {
    const u = this.gar.units[i]!
    const v = this.views[i]!
    if (v.cone < 0) return
    const base = v.cone * CONE_VERTS
    const p = this.conePos
    const c = this.coneCol
    if (u.state === 'dead' || u.state === 'combat' || u.state === 'reserve') {
      // Nothing to read once it is down, or once it is shooting at you.
      for (let k = 0; k < CONE_VERTS; k++) c[(base + k) * 4 + 3] = 0
      return
    }
    const spec = SPECS[u.kind]
    // As wide and as far as it sees right now: wary, chatting, focused (#69).
    const view = viewerOf(u, this.gar.heightened)
    const g = this.grid
    const yaw = u.yaw + u.look
    const tint = u.state === 'patrol' && u.detect < SUSPECT_AT * 0.5 ? CALM : WARY
    const eyeY = u.y + spec.eye
    const W = CONE_SEGS + 1
    const H = CONE_RINGS + 1
    // The grid's points: position and how strongly each is lit.
    for (let s = 0; s < W; s++) {
      const a = yaw - view.halfAngle + (2 * view.halfAngle * s) / CONE_SEGS
      const dx = Math.sin(a)
      const dz = Math.cos(a)
      for (let r = 0; r < H; r++) {
        const k = r / CONE_RINGS
        const o = (s * H + r) * 4
        const x = u.x + dx * view.range * k
        const z = u.z + dz * view.range * k
        const floor = r === 0 ? u.y : heightAt(g, x, z)
        const y = floor === VOID ? u.y : floor
        this.gx[o] = x
        this.gx[o + 1] = y + 0.07
        this.gx[o + 2] = z
        const lit = floor !== VOID && (r === 0 || hasLineOfSight(g, u.x, eyeY, u.z, x, y + CONE_PROBE_Y, z))
        // Strong near the guard, fading out toward the edge of its sight.
        this.gx[o + 3] = lit ? 0.4 * (1 - k) * (1 - k) + 0.08 : 0
      }
    }
    let w = base
    const put = (o: number, alpha: number): void => {
      p[w * 3] = this.gx[o]!
      p[w * 3 + 1] = this.gx[o + 1]!
      p[w * 3 + 2] = this.gx[o + 2]!
      c[w * 4] = tint.r
      c[w * 4 + 1] = tint.g
      c[w * 4 + 2] = tint.b
      c[w * 4 + 3] = alpha
      w++
    }
    for (let s = 0; s < CONE_SEGS; s++) {
      for (let r = 0; r < CONE_RINGS; r++) {
        const a = (s * H + r) * 4
        const b = (s * H + r + 1) * 4
        const d = ((s + 1) * H + r) * 4
        const e = ((s + 1) * H + r + 1) * 4
        const ys = [this.gx[a + 1]!, this.gx[b + 1]!, this.gx[d + 1]!, this.gx[e + 1]!]
        const flat = Math.max(...ys) - Math.min(...ys) < CONE_CLIFF
        const k = flat ? 1 : 0
        put(a, this.gx[a + 3]! * k); put(b, this.gx[b + 3]! * k); put(e, this.gx[e + 3]! * k)
        put(a, this.gx[a + 3]! * k); put(e, this.gx[e + 3]! * k); put(d, this.gx[d + 3]! * k)
      }
    }
  }

  /**
   * Rewrite one light's pool round (cx, cz): draped on the ground, and dark
   * wherever a wall or a crate stands between the point and the lamp, or the
   * point and the middle of the pool (the same test the simulation uses for
   * being lit, so what is drawn lit IS lit, #69).
   */
  private writePool(v: UnitView, lx: number, ly: number, lz: number, cx: number, cz: number): void {
    const g = this.grid
    const gp = v.pool!
    const mid = heightAt(g, cx, cz)
    const midY = mid === VOID ? 0 : mid
    const H = POOL_RINGS + 1
    for (let s = 0; s <= POOL_SEGS; s++) {
      const a = (s / POOL_SEGS) * Math.PI * 2
      const dx = Math.sin(a)
      const dz = Math.cos(a)
      for (let r = 0; r < H; r++) {
        const k = r / POOL_RINGS
        const o = (s * H + r) * 4
        const x = cx + dx * SPOT_RADIUS * k
        const z = cz + dz * SPOT_RADIUS * k
        const floor = r === 0 ? midY : heightAt(g, x, z)
        const y = floor === VOID ? midY : floor
        gp[o] = x
        gp[o + 1] = y + 0.08
        gp[o + 2] = z
        const lit = floor !== VOID && (r === 0 || (hasLineOfSight(g, cx, midY + 1.0, cz, x, y + 0.3, z) && hasLineOfSight(g, lx, ly, lz, x, y + 0.3, z)))
        gp[o + 3] = lit ? POOL_ALPHA * (1 - 0.45 * k) : 0
      }
    }
    const geo = v.spot!.geometry
    const p = geo.attributes.position!.array as Float32Array
    const c = geo.attributes.color!.array as Float32Array
    let w = 0
    const put = (o: number, alpha: number): void => {
      p[w * 3] = gp[o]!
      p[w * 3 + 1] = gp[o + 1]!
      p[w * 3 + 2] = gp[o + 2]!
      c[w * 4] = 1
      c[w * 4 + 1] = 1
      c[w * 4 + 2] = 1
      c[w * 4 + 3] = alpha
      w++
    }
    for (let s = 0; s < POOL_SEGS; s++) {
      for (let r = 0; r < POOL_RINGS; r++) {
        const a = (s * H + r) * 4
        const b = (s * H + r + 1) * 4
        const d = ((s + 1) * H + r) * 4
        const e = ((s + 1) * H + r + 1) * 4
        const ys = [gp[a + 1]!, gp[b + 1]!, gp[d + 1]!, gp[e + 1]!]
        const k = Math.max(...ys) - Math.min(...ys) < CONE_CLIFF ? 1 : 0
        put(a, gp[a + 3]! * k); put(b, gp[b + 3]! * k); put(e, gp[e + 3]! * k)
        put(a, gp[a + 3]! * k); put(e, gp[e + 3]! * k); put(d, gp[d + 3]! * k)
      }
    }
    geo.attributes.position!.needsUpdate = true
    geo.attributes.color!.needsUpdate = true
  }

  /**
   * Draw this frame: `alpha` between the last two steps, `dt` of real time,
   * the camera's position for the marks' size.
   */
  update(alpha: number, dt: number, time: number, camX: number, camY: number, camZ: number): void {
    const units = this.gar.units
    this.frame++
    // A few cones per frame is plenty: a guard turns slowly.
    const budget = Math.min(units.length, 3)
    for (let k = 0; k < budget; k++) {
      this.cursor = (this.cursor + 1) % units.length
      this.writeCone(this.cursor)
    }
    this.cones.geometry.attributes.position!.needsUpdate = true
    this.cones.geometry.attributes.color!.needsUpdate = true
    const ease = Math.min(1, dt * 8)
    this.wreckage.update(dt)

    for (let i = 0; i < units.length; i++) {
      const u = units[i]!
      const v = this.views[i]!
      // Not in the base yet: nothing of it is drawn.
      // A light the Engineer has fixed is whole again.
      if (v.wrecked && u.state !== 'dead') v.wrecked = false
      const here = u.state !== 'reserve' && !v.wrecked && !u.hidden
      v.rig.root.visible = here
      v.shadow.visible = here
      if (!here) {
        if (v.mark) v.mark.visible = false
        if (v.tag) v.tag.visible = false
        if (v.route) v.route.visible = false
        // A light shot to pieces takes its beam and its pool with it (#61).
        if (v.spot) v.spot.visible = false
        if (v.beam) v.beam.visible = false
        continue
      }
      const x = u.px + (u.x - u.px) * alpha
      const y = u.py + (u.y - u.py) * alpha
      const z = u.pz + (u.z - u.pz) * alpha
      const yaw = u.pyaw + angleDelta(u.pyaw, u.yaw) * alpha
      v.rig.root.position.set(x, y, z)
      v.rig.root.rotation.y = yaw
      const hot = u.state === 'combat'
      const wary = u.state === 'suspicious' || u.state === 'search'
      // At a disguise (#111): puzzled while it stares, the gun up as it backs off to test it.
      const testing = u.inspect?.phase === 'back' || u.inspect?.phase === 'shot'
      const puzzled = !!u.inspect && !testing
      v.aim += ((hot || testing ? 1 : 0) - v.aim) * ease
      v.wary += ((wary ? 1 : 0) - v.wary) * ease
      v.caution += ((wary ? 1 : 0) - v.caution) * Math.min(1, dt * 4)
      if (u.state !== v.lastState) {
        v.lastState = u.state
        v.pop = 1
      }
      v.pop = Math.max(0, v.pop - dt * 3.5)
      if (v.flash > 0) {
        v.flash -= dt
        // The glow dies away rather than switching off.
        v.rig.material.emissive.multiplyScalar(Math.max(0, 1 - dt * 5))
        if (v.flash <= 0) v.rig.material.emissive.setScalar(0)
      }
      const dead = u.state === 'dead'

      // A guard's shield knocked away (#90): it is gone from its arm.
      const sb = v.rig.bones.shield
      if (sb && !u.shield && sb.scale.x > 0.01) sb.scale.setScalar(0.001)
      if (v.guard) {
        const s = v.guard
        s.time = time + u.seed
        s.stride = u.stride
        s.speed = u.speed01
        s.aim = Math.max(v.aim, u.recoil > 0 ? 1 : 0)
        s.wary = u.state === 'search' ? v.wary : 0
        s.caution = v.caution
        // The mark's pop is the moment it noticed: the body jumps with it.
        s.startle = wary || hot ? v.pop : 0
        s.recoil = Math.min(1, u.recoil * 4)
        s.lookYaw = u.look
        // On the blade it is dead in the simulation and not yet falling.
        const held = dead && u.deadT < u.hold
        v.grip += ((u.gripped || held ? 1 : 0) - v.grip) * Math.min(1, dt * 16)
        s.gripped = dead && !held ? 1 : v.grip
        s.impaled = dead ? Math.min(1, u.deadT / 0.07) : 0
        s.limp = dead ? Math.min(1, Math.max(0, (u.deadT - 0.25) / Math.max(0.2, u.hold - 0.3))) : 0
        if (dead && u.hold <= 0) { s.gripped = 0; s.impaled = 0; s.limp = 0 }
        s.deadT = dead && !held ? Math.max(1e-3, u.deadT - u.hold) : 0
        s.death = u.death === 'front' || u.death === 'spin' || u.death === 'thrown' ? u.death : 'back'
        // Fallen and let go: the ragdoll has the body now (#64).
        if (u.rag && dead && u.deadT >= u.hold) {
          poseRagdoll(v.rig, u.rag.p, u.rag.q, alpha)
          v.rig.root.scale.setScalar(1)
        } else poseGuard(v.rig, s)
      } else if (v.drone) {
        const s = v.drone
        // The rotors race when it is alarmed.
        if (!dead) v.spin += dt * (38 + 30 * v.caution)
        s.time = time + u.seed
        s.spin = v.spin
        // It banks into its turns like anything that flies.
        const turn = angleDelta(v.lastYaw, yaw) / Math.max(dt, 1e-3)
        v.lastYaw = yaw
        v.bank += (Math.max(-0.5, Math.min(0.5, -turn * 0.25)) - v.bank) * Math.min(1, dt * 4)
        s.pitch = 0.12 * u.speed01
        s.roll = v.bank + Math.sin(time * 0.9 + u.seed) * 0.05
        // The eye looks down the beam: three metres ahead, from its height.
        s.eyePitch = Math.atan2(Math.max(0.5, y - heightAt(this.grid, x, z)), 3) * 0.75
        s.alarm = dead ? 0 : Math.max(v.caution, hot ? 1 : 0)
        s.deadT = dead ? Math.max(1e-3, u.deadT) : 0
        if (dead && !v.landed && y <= heightAt(this.grid, x, z) + 0.25) {
          // It hits the ground whole, and a few parts of it do not stay on.
          v.landed = true
          this.wreckage.burst({ x, y: y + 0.1, z, hx: 0.3, hy: 0.1, hz: 0.3, count: 5, size: [0.1, 0.2], colors: WRECKS.drone!.colors, force: 3.2, dirX: 0, dirZ: 0 })
        }
        s.landed = v.landed
        if (dead && !v.landed) v.spin += dt * 20
        poseDrone(v.rig, s)
      } else if (v.lamp) {
        const s = v.lamp
        const c = spotCentre(u)
        const gy = heightAt(this.grid, c.x, c.z)
        s.time = time + u.seed
        // The root turns with the unit's yaw (toward its light): the lamp only tips.
        s.yaw = 0
        s.pitch = Math.atan2(y - (gy === VOID ? 0 : gy), Math.max(0.5, Math.hypot(c.x - x, c.z - z)))
        s.alarm = Math.max(v.caution, hot ? 1 : 0)
        poseSearchlight(v.rig, s)
      } else if (v.enforcer) {
        const s = v.enforcer
        s.time = time
        s.stride = u.stride * 0.55
        s.speed = u.speed01
        s.power = u.power
        s.aimPitch = hot ? -0.06 : 0
        // The two guns take turns: the kick alternates with the rounds left.
        s.recoilL = u.burst % 2 === 0 ? u.recoil : 0
        s.recoilR = u.burst % 2 === 1 ? u.recoil : 0
        s.deadT = dead ? Math.max(1e-3, u.deadT) : 0
        poseEnforcer(v.rig, s)
      } else if (v.dog) {
        const s = v.dog
        s.time = time + u.seed
        s.stride = u.stride * 1.6
        s.run = Math.min(1, u.speed01)
        v.rig.root.scale.setScalar(HOUND_SCALE)
        // The rig's origin is its back: lift it to standing height.
        v.rig.root.position.y = y + DOG_STAND * HOUND_SCALE
        poseRobodog(v.rig, s)
      } else if (v.roomba) {
        const s = v.roomba
        s.time = time + u.seed
        s.speed = u.speed01
        s.alarm = Math.max(v.caution, hot ? 1 : 0)
        s.recoil = Math.min(1, u.recoil * 4)
        s.aimYaw += (u.look - s.aimYaw) * Math.min(1, dt * 8)
        poseRoomba(v.rig, s)
      } else if (v.goliath) {
        const s = v.goliath
        s.time = time
        s.turretYaw = u.look
        s.recoil = u.recoil
        // The engine shudders while it drives, and harder while a shell is on its way.
        s.rumble = u.power * Math.max(u.speed01, u.shellT > 0 ? 1 : 0.25)
        s.dead = dead ? Math.min(1, u.deadT / 1.2) : 0
        poseGoliath(v.rig, s)
      }

      // The shadow, on whatever is under it.
      const floor = heightAt(this.grid, x, z)
      v.shadow.visible = floor !== VOID && u.kind !== 'searchlight'
      v.shadow.position.set(x, floor + 0.03, z)

      // The searchlight.
      if (v.spot && v.beam) {
        const on = !dead
        v.spot.visible = on
        v.beam.visible = on
        if (on) {
          const c = spotCentre(u)
          const cx = c.x + (x - u.x)
          const cz = c.z + (z - u.z)
          const g = heightAt(this.grid, cx, cz)
          const gy = g === VOID ? 0 : g
          // Lights move: every other frame is plenty for the clipped pool.
          if ((this.frame + u.id) % 2 === 0 || !v.spot.userData.drawn) {
            this.writePool(v, x, y - 0.2, z, cx, cz)
            v.spot.userData.drawn = true
          }
          const tint = hot ? HOT : u.detect > 0.05 || wary ? WARY : CALM
          ;(v.spot.material as MeshBasicMaterial).color.lerp(tint, ease)
          ;(v.beam.material as MeshBasicMaterial).color.lerp(tint, ease)
          // The beam: from the drone's eye down to the light, as a cone.
          v.beam.position.set(x, y - 0.1, z)
          const dx = cx - x
          const dy = gy - (y - 0.1)
          const dz = cz - z
          let len = Math.hypot(dx, dy, dz)
          // A beam stops at whatever it meets on the way down (#69).
          const block = len > 0.5 ? raycast(this.grid, x, y - 0.1, z, dx / len, dy / len, dz / len, len - 0.3) : null
          const cut = block?.hit ? block.t / len : 1
          len *= cut
          v.beam.scale.set(SPOT_RADIUS * cut, len, SPOT_RADIUS * cut)
          v.beam.rotation.set(0, 0, 0)
          // Tip the cylinder's −y axis along the beam.
          v.beam.rotation.order = 'YXZ'
          v.beam.rotation.y = Math.atan2(dx, dz)
          v.beam.rotation.x = -Math.atan2(Math.hypot(dx, dz), -dy)
        }
      }

      // The mark over its head.
      if (v.mark) {
        const m = v.mark.material as SpriteMaterial
        const show = !dead && (hot || wary || puzzled || testing || u.detect > 0.06)
        const chat = !dead && !show && u.chatting
        v.mark.visible = show || chat
        if (chat) {
          m.map = this.textures[4]!
          m.color.copy(NOTICE)
          m.opacity = 0.85
          const top = SPECS[u.kind].height + 0.45
          v.mark.position.set(x, y + top, z)
          const d = Math.hypot(camX - x, camY - y, camZ - z)
          const size = Math.min(Math.max(0.3, d * 0.04), 2.4)
          v.mark.scale.set(size, size, 1)
        }
        if (show) {
          const bang = hot
          const running = u.runner >= 0
          m.map = this.textures[running ? 2 : bang ? 1 : 0]!
          m.color.copy(bang ? HOT : wary || testing ? WARY : NOTICE)
          m.opacity = bang || wary || puzzled || testing ? 1 : Math.min(1, 0.3 + 0.7 * (u.detect / SUSPECT_AT))
          const top = isLight(u) ? 0.8 : SPECS[u.kind].height + 0.55
          v.mark.position.set(x, y + top, z)
          // Keep it readable from sniping range: grow with distance.
          const d = Math.hypot(camX - x, camY - y, camZ - z)
          // Puzzled: the "?" rocks from side to side.
          const size = Math.min(Math.max(0.34, d * 0.055), 4) * (1 + v.pop * 0.6) * (bang || wary || puzzled || testing ? 1 : 0.55 + 0.45 * Math.min(1, u.detect / SUSPECT_AT))
          v.mark.scale.set(size, size, 1)
          m.rotation = puzzled ? Math.sin(time * 4) * 0.35 : 0
        }
      }

      // Tagged: a diamond over it that shows through walls, and its round.
      if (u.tagged && !v.tag) this.addTag(i)
      if (v.tag) {
        v.tag.visible = !dead
        const top = isLight(u) ? 1.3 : SPECS[u.kind].height + 1.15
        v.tag.position.set(x, y + top, z)
        const d = Math.hypot(camX - x, camY - y, camZ - z)
        const size = Math.min(Math.max(0.3, d * 0.04), 3) * (0.9 + 0.1 * Math.sin(time * 4 + i))
        v.tag.scale.set(size, size, 1)
      }
      if (v.route) v.route.visible = !dead && u.state === 'patrol'
    }
  }

  /** Mark a unit as tagged: the diamond, and its round drawn as a faint line. */
  private addTag(i: number): void {
    const u = this.gar.units[i]!
    const v = this.views[i]!
    const tag = new Sprite(new SpriteMaterial({ map: this.textures[3]!, color: TAG.clone(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
    tag.renderOrder = 31
    v.tag = tag
    this.group.add(tag)
    const pts = u.route.length > 1 ? u.route : []
    if (pts.length > 1) {
      const pos = new Float32Array((pts.length + 1) * 3)
      pts.forEach((p, k) => {
        const h = heightAt(this.grid, p.x, p.z)
        pos.set([p.x, (h === VOID ? u.y : isLight(u) ? h : h) + 0.25, p.z], k * 3)
      })
      pos.set(pos.subarray(0, 3), pts.length * 3)
      const geo = new BufferGeometry()
      geo.setAttribute('position', new BufferAttribute(pos, 3))
      const line = new Line(geo, new LineBasicMaterial({ color: TAG.clone(), transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false }))
      line.renderOrder = 29
      line.frustumCulled = false
      v.route = line
      this.group.add(line)
    }
  }

  dispose(): void {
    for (const v of this.views) {
      v.rig.mesh.geometry.dispose()
      v.rig.outline?.geometry.dispose()
      v.rig.material.dispose()
      v.rig.glowMaterial.dispose()
      if (v.mark) v.mark.material.dispose()
      if (v.tag) v.tag.material.dispose()
      if (v.route) { v.route.geometry.dispose(); (v.route.material as LineBasicMaterial).dispose() }
      if (v.spot) { v.spot.geometry.dispose(); (v.spot.material as MeshBasicMaterial).dispose() }
      if (v.beam) (v.beam.material as MeshBasicMaterial).dispose()
    }
    this.wreckage.dispose()
    for (const t of this.textures) t.dispose()
    this.helmetGeo.dispose()
    this.beamGeo.dispose()
    this.cones.geometry.dispose()
    ;(this.cones.material as MeshBasicMaterial).dispose()
  }
}
