import {
  CanvasTexture, Color, ConeGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Sprite, SpriteMaterial, SRGBColorSpace, Vector3
} from 'three'
import { Particles } from './particles'
import { ShockRings } from './markers'
import type { WeaponId } from '../data/ids'
import type { PostKind } from '../world/fortress'
import type { Rig } from '../models/kit'
import { buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import { PAL } from '../models/palette'
import type { Rocket } from '../sim/rockets'
import type { Decoy } from '../sim/melee'

/**
 * ─── Combat effects ──────────────────────────────────────────────────────────
 *
 * Everything a weapon looks like when it goes off: muzzle flashes, tracers,
 * impacts, explosions, the rockets in flight and the decoys' holograms. All
 * the sparks are ONE pooled `Points` draw call; rings and rockets are pooled.
 */

const FLASH: Readonly<Record<WeaponId, string>> = { sniper: '#9ff3ff', minigun: '#ffd27a', rocket: '#ff9a5a' }
const TRACER: Readonly<Record<WeaponId, string>> = { sniper: '#7ff4ff', minigun: '#ffe9a8', rocket: '#ff9a5a' }
const FORWARD = new Vector3(0, 0, 1)
const _v = new Vector3()
const _q = new Quaternion()

interface Hologram { rig: Rig; pose: MechPose; used: boolean }

/**
 * The x-ray plate of a headshot (GDD 2.3), as a cartoon: a skull in cold
 * light with the round's crack through it. Drawn as shapes on a canvas.
 */
const xrayTexture = (): CanvasTexture => {
  const c = document.createElement('canvas')
  c.width = c.height = 160
  const g = c.getContext('2d')!
  const glow = g.createRadialGradient(80, 80, 10, 80, 80, 78)
  glow.addColorStop(0, 'rgba(20, 60, 110, 0.85)')
  glow.addColorStop(0.75, 'rgba(12, 20, 60, 0.7)')
  glow.addColorStop(1, 'rgba(12, 20, 60, 0)')
  g.fillStyle = glow
  g.beginPath()
  g.arc(80, 80, 78, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#c9f7ff'
  g.strokeStyle = '#c9f7ff'
  g.lineJoin = 'round'
  // The cranium and the jaw.
  g.beginPath()
  g.arc(80, 70, 38, Math.PI * 0.95, Math.PI * 2.05)
  g.lineTo(104, 104)
  g.lineTo(98, 122)
  g.lineTo(62, 122)
  g.lineTo(56, 104)
  g.closePath()
  g.fill()
  g.fillStyle = '#0c1440'
  // Eye sockets, nose, teeth.
  g.beginPath()
  g.ellipse(64, 74, 11, 13, -0.15, 0, Math.PI * 2)
  g.ellipse(96, 74, 11, 13, 0.15, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(80, 88)
  g.lineTo(74, 100)
  g.lineTo(86, 100)
  g.closePath()
  g.fill()
  for (let i = 0; i < 4; i++) g.fillRect(66 + i * 8, 108, 3, 14)
  // The crack the round leaves.
  g.strokeStyle = '#ff5fb0'
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(46, 36)
  g.lineTo(66, 50)
  g.lineTo(60, 62)
  g.lineTo(82, 72)
  g.stroke()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

export class CombatFx {
  readonly group = new Group()
  readonly particles = new Particles(1400)
  readonly rings = new ShockRings()
  private rocketGeo = new ConeGeometry(0.11, 0.7, 8)
  private rocketMat = new MeshBasicMaterial({ color: new Color('#fff1c9'), toneMapped: false })
  private rocketPool: Mesh[] = []
  private holograms: Hologram[] = []
  private time = 0
  private bullet: Mesh
  private xray: Sprite
  private xrayT = 0
  private xrayTex = xrayTexture()

  constructor() {
    this.rocketGeo.rotateX(Math.PI / 2)
    // The round the kill-cam follows: a rocket's cone, drawn small and hot.
    this.bullet = new Mesh(this.rocketGeo, new MeshBasicMaterial({ color: new Color('#bff9ff'), toneMapped: false }))
    this.bullet.scale.setScalar(0.3)
    this.bullet.visible = false
    this.xray = new Sprite(new SpriteMaterial({ map: this.xrayTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
    this.xray.renderOrder = 40
    this.xray.visible = false
    this.group.add(this.particles.points, this.rings.root, this.bullet, this.xray)
  }

  /** The flash at the barrel. */
  muzzle(x: number, y: number, z: number, dx: number, dy: number, dz: number, weapon: WeaponId): void {
    const c = FLASH[weapon]
    const p = this.particles
    if (weapon === 'sniper') {
      // Silenced: a small cold puff, not a fireball.
      p.flash(x, y, z, c, 0.35, 0.08)
      for (let k = 0; k < 4; k++) p.emit({ x, y, z, vx: dx * (6 + k * 3), vy: dy * (6 + k * 3) + 0.4, vz: dz * (6 + k * 3), color: '#d9fbff', size: 0.16, sizeEnd: 0.4, life: 0.22, drag: 6 })
      return
    }
    p.flash(x, y, z, '#ffffff', weapon === 'rocket' ? 1.3 : 0.55, 0.06)
    p.flash(x, y, z, c, weapon === 'rocket' ? 2.2 : 0.9, 0.1)
    const n = weapon === 'rocket' ? 14 : 3
    for (let k = 0; k < n; k++) {
      const s = 4 + Math.random() * 9
      p.emit({
        x, y, z,
        vx: dx * s + (Math.random() - 0.5) * 3, vy: dy * s + (Math.random() - 0.5) * 3, vz: dz * s + (Math.random() - 0.5) * 3,
        color: c, size: 0.22, sizeEnd: 0.03, life: 0.12 + Math.random() * 0.12, drag: 4
      })
    }
    if (weapon === 'rocket') {
      // Backblast.
      for (let k = 0; k < 10; k++) p.emit({ x, y, z, vx: -dx * (3 + Math.random() * 6), vy: 0.6, vz: -dz * (3 + Math.random() * 6), color: '#c9b8ff', size: 0.5, sizeEnd: 1.3, life: 0.4, drag: 3 })
    }
  }

  /** The line a round draws from the barrel to where it lands. */
  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, weapon: WeaponId): void {
    const len = Math.hypot(bx - ax, by - ay, bz - az)
    if (len < 0.5) return
    const dx = (bx - ax) / len
    const dy = (by - ay) / len
    const dz = (bz - az) / len
    const p = this.particles
    const c = TRACER[weapon]
    if (weapon === 'minigun') {
      // One hot dot flying the line.
      const speed = 220
      p.emit({ x: ax + dx, y: ay + dy, z: az + dz, vx: dx * speed, vy: dy * speed, vz: dz * speed, color: c, size: 0.2, sizeEnd: 0.14, life: Math.min(0.14, len / speed) })
      return
    }
    if (weapon === 'rocket') {
      const n = Math.min(30, Math.max(6, Math.floor(len / 1.4)))
      for (let k = 1; k <= n; k++) {
        const t = (k / n) * len
        p.emit({ x: ax + dx * t, y: ay + dy * t, z: az + dz * t, color: c, size: 0.12, sizeEnd: 0.02, life: 0.16 + (k / n) * 0.22 })
      }
      return
    }
    // The sniper's trail (#77): a bright line of light from the barrel to
    // where the round went, with a hot white core, that hangs and fades over
    // about 0.6 s, the far end last.
    const n = Math.min(70, Math.max(8, Math.floor(len / 0.9)))
    for (let k = 1; k <= n; k++) {
      const t = (k / n) * len
      const age = k / n
      p.emit({ x: ax + dx * t, y: ay + dy * t, z: az + dz * t, color: c, size: 0.2, sizeEnd: 0.03, life: 0.38 + age * 0.28 })
      if (k % 2 === 0) p.emit({ x: ax + dx * t, y: ay + dy * t, z: az + dz * t, color: '#ffffff', size: 0.07, sizeEnd: 0.01, life: 0.22 + age * 0.2 })
    }
  }

  /** A round arrives. `soft` for a body, otherwise plate or masonry. */
  impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, soft: boolean, weapon: WeaponId): void {
    const p = this.particles
    const big = weapon === 'sniper'
    if (soft) {
      // No gore: a burst of bright confetti.
      p.flash(x, y, z, '#ffffff', big ? 0.7 : 0.35, 0.08)
      for (let k = 0; k < (big ? 12 : 4); k++) {
        p.emit({
          x, y, z,
          vx: nx * 3 + (Math.random() - 0.5) * 6, vy: ny * 3 + Math.random() * 4, vz: nz * 3 + (Math.random() - 0.5) * 6,
          color: k % 2 ? PAL.glowPink : PAL.glowCyan, size: 0.16, sizeEnd: 0.03, life: 0.3 + Math.random() * 0.25, gravity: 9, drag: 1.5
        })
      }
      return
    }
    p.flash(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, '#fff3c4', big ? 0.6 : 0.3, 0.07)
    for (let k = 0; k < (big ? 9 : 3); k++) {
      const s = 2 + Math.random() * 6
      p.emit({
        x, y, z,
        vx: nx * s + (Math.random() - 0.5) * 4, vy: ny * s + Math.random() * 3, vz: nz * s + (Math.random() - 0.5) * 4,
        color: '#ffd88a', size: 0.12, sizeEnd: 0.02, life: 0.2 + Math.random() * 0.25, gravity: 12, drag: 1
      })
    }
    // A puff of dust off the surface.
    p.emit({ x: x + nx * 0.1, y: y + ny * 0.1, z: z + nz * 0.1, vx: nx * 1.2, vy: ny * 1.2 + 0.5, vz: nz * 1.2, color: '#8f84c9', size: 0.35, sizeEnd: 0.9, life: 0.35, drag: 3 })
  }

  /** A rocket goes off. */
  explosion(x: number, y: number, z: number, floorY: number): void {
    const p = this.particles
    p.flash(x, y, z, '#ffffff', 5.5, 0.1)
    p.flash(x, y, z, '#ffb061', 8, 0.22)
    p.flash(x, y, z, PAL.glowPink, 10, 0.34)
    for (let k = 0; k < 46; k++) {
      const a = Math.random() * Math.PI * 2
      const e = Math.random() * Math.PI * 0.5
      const s = 4 + Math.random() * 13
      p.emit({
        x, y, z,
        vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 2, vz: Math.sin(a) * Math.cos(e) * s,
        color: k % 3 === 0 ? '#ffffff' : k % 3 === 1 ? '#ffb061' : PAL.glowPink,
        size: 0.5 + Math.random() * 0.5, sizeEnd: 0.05, life: 0.45 + Math.random() * 0.5, gravity: 10, drag: 1.6
      })
    }
    // The fireball's body: big slow puffs that swell and fade.
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 1.6
      p.emit({
        x: x + Math.cos(a) * r, y: y + Math.random() * 1.2, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * 1.5, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * 1.5,
        color: k % 2 ? '#ff8a4a' : '#7c5cff', size: 1.6, sizeEnd: 3.6, life: 0.5 + Math.random() * 0.4, drag: 1.2
      })
    }
    this.rings.spawn(x, floorY + 0.08, z, 6.5, '#ffd27a', 0.5)
    this.rings.spawn(x, floorY + 0.1, z, 3.8, PAL.glowPink, 0.34)
  }

  /** Something of the garrison goes down. */
  kill(x: number, y: number, z: number, kind: PostKind): void {
    if (kind === 'drone' || kind === 'searchlight') this.particles.orbBurst(x, y, z, kind === 'drone' ? PAL.glowRed : '#e9fdff', 0.7)
    else if (kind === 'enforcer') this.particles.orbBurst(x, y + 1.8, z, PAL.glowYellow, 1.6)
    else if (kind === 'goliath') {
      this.explosion(x, y + 1.5, z, y)
      this.particles.orbBurst(x, y + 2, z, PAL.glowYellow, 2.6)
    } else {
      // A guard: a small pop of stars over the head, cartoon-style.
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        this.particles.emit({ x, y: y + 1.9, z, vx: Math.cos(a) * 1.6, vy: 1.4, vz: Math.sin(a) * 1.6, color: '#fff27a', size: 0.22, sizeEnd: 0.05, life: 0.6, gravity: 3, drag: 1.5 })
      }
    }
  }

  /** Put the kill-cam's bullet somewhere, pointing along its flight, with its wake. */
  showBullet(x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    this.bullet.visible = true
    this.bullet.position.set(x, y, z)
    this.bullet.quaternion.setFromUnitVectors(FORWARD, _v.set(dx, dy, dz))
    // The air it parts: a ring it leaves behind, and a thin hot line.
    // The camera rides a couple of metres behind: anything bigger than a
    // thumbnail here fills the screen.
    this.particles.emit({ x: x - dx * 0.25, y: y - dy * 0.25, z: z - dz * 0.25, color: '#7ff4ff', size: 0.035, sizeEnd: 0.12, life: 0.4 })
    this.particles.emit({ x: x + dx * 0.16, y: y + dy * 0.16, z: z + dz * 0.16, color: '#ffffff', size: 0.07, sizeEnd: 0.02, life: 0.08 })
  }

  hideBullet(): void {
    this.bullet.visible = false
  }

  /** The x-ray plate, over a head, for a moment. */
  showXray(x: number, y: number, z: number, size: number): void {
    this.xray.position.set(x, y, z)
    this.xray.scale.set(size, size, 1)
    this.xray.visible = true
    this.xrayT = 0.75
  }

  /** The blade's arc. */
  slash(x: number, y: number, z: number, yaw: number): void {
    const p = this.particles
    for (let k = 0; k < 14; k++) {
      const a = yaw - 1.1 + (k / 13) * 2.2
      p.emit({ x: x + Math.sin(a) * 0.9, y: y + 1.5 - k * 0.04, z: z + Math.cos(a) * 0.9, vx: Math.sin(a) * 2, vy: 0.2, vz: Math.cos(a) * 2, color: PAL.mechBlade, size: 0.34, sizeEnd: 0.05, life: 0.14 + k * 0.012 })
    }
    p.flash(x + Math.sin(yaw) * 0.9, y + 1.4, z + Math.cos(yaw) * 0.9, '#ffffff', 0.9, 0.08)
  }

  /** The blade's tip comes out of a body: a hot point and a spray along `yaw`. */
  stabThrough(x: number, y: number, z: number, yaw: number): void {
    const p = this.particles
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)
    p.flash(x + fx * 0.25, y, z + fz * 0.25, '#ffffff', 0.7, 0.1)
    for (let k = 0; k < 16; k++) {
      const a = (Math.random() - 0.5) * 1.3
      const e = (Math.random() - 0.3) * 0.9
      const sp = 2.5 + Math.random() * 4
      p.emit({
        x, y, z,
        vx: (fx * Math.cos(a) - fz * Math.sin(a)) * sp, vy: Math.sin(e) * sp, vz: (fz * Math.cos(a) + fx * Math.sin(a)) * sp,
        color: k % 3 === 0 ? '#ffffff' : PAL.mechBlade, size: 0.16, sizeEnd: 0.03, life: 0.25 + Math.random() * 0.3, gravity: 6, drag: 2
      })
    }
  }

  /** A decoy lights up, or goes out. */
  decoyPop(x: number, y: number, z: number): void {
    this.particles.riseRing(x, y + 0.1, z, PAL.glowCyan, 0.7, 18)
    this.rings.spawn(x, y + 0.08, z, 2.2, PAL.glowCyan, 0.45)
  }

  private hologram(i: number): Hologram {
    let h = this.holograms[i]
    if (!h) {
      const rig = buildMech()
      // The same mech, as light: see-through, tinted, no outline.
      rig.material.transparent = true
      rig.material.opacity = 0.5
      rig.material.depthWrite = false
      rig.material.color.set('#8ff6ff')
      rig.material.emissive.set('#2aa8c8')
      rig.glowMaterial.transparent = true
      rig.glowMaterial.opacity = 0.8
      if (rig.outline) rig.outline.visible = false
      rig.root.visible = false
      this.group.add(rig.root)
      h = { rig, pose: restPose(), used: false }
      this.holograms[i] = h
    }
    return h
  }

  /**
   * Draw this frame's rockets and decoys, and move every spark.
   * `alpha` is the interpolation between the last two simulation steps.
   */
  update(dt: number, alpha: number, rockets: readonly Rocket[], decoys: readonly Decoy[], viewportH: number, fov: number): void {
    this.time += dt
    const p = this.particles
    if (this.xrayT > 0) {
      this.xrayT -= dt
      const k = Math.max(0, this.xrayT / 0.75)
      // It snaps in, flickers like a fluoroscope, and fades.
      ;(this.xray.material as SpriteMaterial).opacity = Math.min(1, k * 3) * (0.8 + 0.2 * Math.sin(this.time * 60))
      if (this.xrayT <= 0) this.xray.visible = false
    }

    for (let i = 0; i < Math.max(rockets.length, this.rocketPool.length); i++) {
      const r = rockets[i]
      let m = this.rocketPool[i]
      if (!r) { if (m) m.visible = false; continue }
      if (!m) {
        m = new Mesh(this.rocketGeo, this.rocketMat)
        this.rocketPool[i] = m
        this.group.add(m)
      }
      const x = r.px + (r.x - r.px) * alpha
      const y = r.py + (r.y - r.py) * alpha
      const z = r.pz + (r.z - r.pz) * alpha
      m.visible = true
      m.position.set(x, y, z)
      _q.setFromUnitVectors(FORWARD, _v.set(r.dx, r.dy, r.dz))
      m.quaternion.copy(_q)
      // The exhaust: a hot core and a trail that swells into smoke.
      p.emit({ x: x - r.dx * 0.4, y: y - r.dy * 0.4, z: z - r.dz * 0.4, color: '#ffd27a', size: 0.5, sizeEnd: 0.1, life: 0.12 })
      p.emit({ x: x - r.dx * 0.7, y: y - r.dy * 0.7, z: z - r.dz * 0.7, vy: 0.4, color: '#b9a6ff', size: 0.3, sizeEnd: 1.1, life: 0.55, drag: 1 })
    }

    for (let i = 0; i < Math.max(decoys.length, this.holograms.length); i++) {
      const d = decoys[i]
      if (!d) { const h = this.holograms[i]; if (h) h.rig.root.visible = false; continue }
      const h = this.hologram(i)
      h.rig.root.visible = true
      h.rig.root.position.set(d.x, d.y, d.z)
      h.rig.root.rotation.y = d.yaw
      // It flickers like a bad signal, more as it runs out.
      const left = 1 - d.t / d.life
      const flick = Math.sin(this.time * 31) > 0.86 - (1 - left) * 0.5 ? 0.25 : 1
      h.rig.material.opacity = (0.32 + 0.2 * Math.sin(this.time * 6)) * flick * Math.min(1, d.t * 5) * Math.min(1, left * 6 + 0.2)
      h.pose.time = this.time
      // It waves: the thing a guard cannot ignore.
      h.pose.aim = 0
      h.pose.cable = 0.35 + 0.25 * Math.sin(this.time * 5)
      poseMech(h.rig, h.pose)
      if (Math.random() < dt * 5) p.emit({ x: d.x + (Math.random() - 0.5) * 0.9, y: d.y + Math.random() * 2.3, z: d.z + (Math.random() - 0.5) * 0.9, vy: 0.8, color: PAL.glowCyan, size: 0.12, sizeEnd: 0.02, life: 0.5 })
    }

    p.setScale(viewportH, fov)
    p.update(dt)
    this.rings.update(dt)
  }

  dispose(): void {
    this.particles.dispose()
    this.rocketGeo.dispose()
    this.rocketMat.dispose()
    ;(this.bullet.material as MeshBasicMaterial).dispose()
    this.xray.material.dispose()
    this.xrayTex.dispose()
    for (const h of this.holograms) {
      h.rig.mesh.geometry.dispose()
      h.rig.material.dispose()
      h.rig.glowMaterial.dispose()
    }
  }
}
