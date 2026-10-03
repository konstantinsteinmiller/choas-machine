import {
  BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DoubleSide, DynamicDrawUsage,
  Group, Mesh, MeshBasicMaterial, Sprite, SpriteMaterial, SRGBColorSpace, type Scene
} from 'three'
import { VOID, hasLineOfSight, heightAt, type Grid } from '../world/grid'
import { PAL } from '../models/palette'
import { Wreckage } from '../fx/wreckage'
import type { PostKind } from '../world/fortress'
import type { Rig } from '../models/kit'
import {
  buildDrone, buildEnforcer, buildGoliath, buildGuard, buildSearchlight, poseSearchlight, type SearchlightPose, restGuardPose, poseDrone, poseEnforcer, poseGoliath, poseGuard,
  type DronePose, type EnforcerPose, type GoliathPose, type GuardPose
} from '../models/garrison'
import { makeBlobShadow } from '../fx/markers'
import { angleDelta } from './player'
import { SPECS, SPOT_RADIUS, SUSPECT_AT, spotCentre, type Garrison, type Unit , isLight } from './garrison'

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
const CALM = new Color('#e9fdff')
const WARY = new Color('#ffe14d')
const HOT = new Color('#ff3b5c')

interface UnitView {
  rig: Rig
  shadow: Mesh
  mark: Sprite | null
  /** Drones: the light on the ground and the beam down to it. */
  spot: Mesh | null
  beam: Mesh | null
  /** Index of its cone in the shared mesh, or −1. */
  cone: number
  guard: GuardPose | null
  drone: DronePose | null
  enforcer: EnforcerPose | null
  goliath: GoliathPose | null
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
  lastState: string
  /** Seconds left of the flash a hit gives it. */
  flash: number
  /** It burst: the rig is gone and its pieces lie where they fell. */
  wrecked: boolean
  /** A drone that fell whole has hit the ground (and shed a few parts). */
  landed: boolean
}

/** The "?" and the "!", drawn as shapes: no font, so no wait for one. */
const markTexture = (bang: boolean): CanvasTexture => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const draw = (): void => {
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
  searchlight: { count: 7, size: [0.1, 0.26], half: [0.3, 0.25, 0.3], lift: -0.1, force: 4, colors: [PAL.steel, PAL.steelDeep, PAL.steelDark, PAL.glowWhite] },
  drone: { count: 9, size: [0.1, 0.24], half: [0.3, 0.15, 0.3], lift: 0, force: 4.5, colors: [PAL.steel, PAL.steelDeep, PAL.steelDark, PAL.glowRed] },
  enforcer: { count: 26, size: [0.22, 0.62], half: [0.8, 1.4, 0.6], lift: 0.4, force: 6.5, colors: [PAL.steel, PAL.steel, PAL.steelDeep, PAL.steelDeep, PAL.steelDark, PAL.steelDark, PAL.glowYellow] },
  goliath: { count: 54, size: [0.35, 1.1], half: [1.9, 1.1, 2.9], lift: 0.5, force: 9, colors: [PAL.steel, PAL.steel, PAL.steelDeep, PAL.steelDeep, PAL.steelDark, PAL.steelDark, PAL.steelDark, PAL.hazard] }
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
  private spotGeo = new CircleGeometry(1, 28)
  /** Every machine taken apart in this mission, in one mesh. */
  readonly wreckage: Wreckage
  private beamGeo = new CylinderGeometry(0.03, 1, 1, 16, 1, true)

  constructor(private gar: Garrison, private grid: Grid) {
    this.wreckage = new Wreckage(grid)
    this.group.add(this.wreckage.mesh)
    const q = markTexture(false)
    const bang = markTexture(true)
    this.textures = [q, bang]
    this.beamGeo.translate(0, -0.5, 0)

    for (const u of gar.units) {
      const human = u.kind === 'guard' || u.kind === 'sentry' || u.kind === 'commander'
      const rig = u.kind === 'drone' ? buildDrone()
        : u.kind === 'searchlight' ? buildSearchlight()
        : u.kind === 'enforcer' ? buildEnforcer(u.boss === 'foreman')
          : u.kind === 'goliath' ? buildGoliath()
            : buildGuard(u.kind === 'commander', u.shield)
      const shadow = makeBlobShadow(SPECS[u.kind].radius * 1.5)
      let mark: Sprite | null = null
      if (human || isLight(u)) {
        mark = new Sprite(new SpriteMaterial({ map: q, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
        mark.renderOrder = 30
        mark.visible = false
      }
      let spot: Mesh | null = null
      let beam: Mesh | null = null
      if (isLight(u)) {
        spot = new Mesh(this.spotGeo, new MeshBasicMaterial({
          color: CALM.clone(), transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        }))
        spot.rotation.x = -Math.PI / 2
        spot.scale.setScalar(SPOT_RADIUS)
        spot.renderOrder = 2
        beam = new Mesh(this.beamGeo, new MeshBasicMaterial({
          // A searchlight's beam is the brighter one: it is how you read where it is looking.
          color: CALM.clone(), transparent: true, opacity: u.kind === 'searchlight' ? 0.12 : 0.07, depthWrite: false, toneMapped: false
        }))
        beam.renderOrder = 3
      }
      const v: UnitView = {
        rig, shadow, mark, spot, beam,
        cone: human ? this.coneCount++ : -1,
        guard: human ? { ...restGuardPose(), seed: (u.seed * 0.618) % 1, proud: u.kind === 'commander' } : null,
        drone: u.kind === 'drone' ? { time: 0, spin: 0, pitch: 0, roll: 0, eyeYaw: 0, eyePitch: 0.5, alarm: 0, deadT: 0, landed: false } : null,
        enforcer: u.kind === 'enforcer' ? { time: 0, stride: 0, speed: 0, power: 0, aimYaw: 0, aimPitch: 0, recoilL: 0, recoilR: 0, deadT: 0 } : null,
        lamp: u.kind === 'searchlight' ? { time: 0, yaw: 0, pitch: 0.6, alarm: 0 } : null,
        goliath: u.kind === 'goliath' ? { time: 0, turretYaw: 0, barrelPitch: 0, recoil: 0, rumble: 0, dead: 0 } : null,
        aim: 0, wary: 0, caution: 0, grip: 0, spin: 0, lastYaw: u.yaw, bank: 0, pop: 0, lastState: u.state, flash: 0, wrecked: false, landed: false
      }
      this.views.push(v)
      this.group.add(rig.root, shadow)
      if (mark) this.group.add(mark)
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
    const g = this.grid
    const yaw = u.yaw + u.look
    const tint = u.state === 'patrol' && u.detect < SUSPECT_AT * 0.5 ? CALM : WARY
    const eyeY = u.y + spec.eye
    const W = CONE_SEGS + 1
    const H = CONE_RINGS + 1
    // The grid's points: position and how strongly each is lit.
    for (let s = 0; s < W; s++) {
      const a = yaw - spec.half + (2 * spec.half * s) / CONE_SEGS
      const dx = Math.sin(a)
      const dz = Math.cos(a)
      for (let r = 0; r < H; r++) {
        const k = r / CONE_RINGS
        const o = (s * H + r) * 4
        const x = u.x + dx * spec.range * k
        const z = u.z + dz * spec.range * k
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
   * Draw this frame: `alpha` between the last two steps, `dt` of real time,
   * the camera's position for the marks' size.
   */
  update(alpha: number, dt: number, time: number, camX: number, camY: number, camZ: number): void {
    const units = this.gar.units
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
      const here = u.state !== 'reserve' && !v.wrecked
      v.rig.root.visible = here
      v.shadow.visible = here
      if (!here) { if (v.mark) v.mark.visible = false; continue }
      const x = u.px + (u.x - u.px) * alpha
      const y = u.py + (u.y - u.py) * alpha
      const z = u.pz + (u.z - u.pz) * alpha
      const yaw = u.pyaw + angleDelta(u.pyaw, u.yaw) * alpha
      v.rig.root.position.set(x, y, z)
      v.rig.root.rotation.y = yaw
      const hot = u.state === 'combat'
      const wary = u.state === 'suspicious' || u.state === 'search'
      v.aim += ((hot ? 1 : 0) - v.aim) * ease
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
        poseGuard(v.rig, s)
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
          v.spot.position.set(cx, gy + 0.08, cz)
          const tint = hot ? HOT : u.detect > 0.05 || wary ? WARY : CALM
          ;(v.spot.material as MeshBasicMaterial).color.lerp(tint, ease)
          ;(v.beam.material as MeshBasicMaterial).color.lerp(tint, ease)
          // The beam: from the drone's eye down to the light, as a cone.
          v.beam.position.set(x, y - 0.1, z)
          const dx = cx - x
          const dy = gy - (y - 0.1)
          const dz = cz - z
          const len = Math.hypot(dx, dy, dz)
          v.beam.scale.set(SPOT_RADIUS, len, SPOT_RADIUS)
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
        const show = !dead && (hot || wary || u.detect > 0.06)
        v.mark.visible = show
        if (show) {
          const bang = hot
          m.map = this.textures[bang ? 1 : 0]!
          m.color.copy(bang ? HOT : WARY)
          m.opacity = bang || wary ? 1 : Math.min(1, 0.25 + u.detect / SUSPECT_AT)
          const top = isLight(u) ? 0.8 : SPECS[u.kind].height + 0.55
          v.mark.position.set(x, y + top, z)
          // Keep it readable from sniping range: grow with distance.
          const d = Math.hypot(camX - x, camY - y, camZ - z)
          const size = Math.min(Math.max(0.34, d * 0.055), 4) * (1 + v.pop * 0.6) * (bang || wary ? 1 : 0.55 + 0.45 * Math.min(1, u.detect / SUSPECT_AT))
          v.mark.scale.set(size, size, 1)
        }
      }
    }
  }

  dispose(): void {
    for (const v of this.views) {
      v.rig.mesh.geometry.dispose()
      v.rig.outline?.geometry.dispose()
      v.rig.material.dispose()
      v.rig.glowMaterial.dispose()
      if (v.mark) v.mark.material.dispose()
      if (v.spot) (v.spot.material as MeshBasicMaterial).dispose()
      if (v.beam) (v.beam.material as MeshBasicMaterial).dispose()
    }
    this.wreckage.dispose()
    for (const t of this.textures) t.dispose()
    this.spotGeo.dispose()
    this.beamGeo.dispose()
    this.cones.geometry.dispose()
    ;(this.cones.material as MeshBasicMaterial).dispose()
  }
}
