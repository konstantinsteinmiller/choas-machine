import { app } from './engine/app'
import { input } from './engine/inputState'
import { flow } from './flow'
import { addHudTicker, hud } from './state/hud'
import { angleDelta } from './sim/player'
import { cellKind, CellKind, heightAt, toCell, VOID, walkLine } from './world/grid'
import { textureReference } from './world/textures'
import { castShot, makeShotHit } from './sim/hitscan'
import { isLight } from './sim/garrison'
import type { Mission } from './sim/mission'

/**
 * ─── The preview seam ────────────────────────────────────────────────────────
 *
 * `window.__preview`: the handle the preview-video recorder
 * (`tools/preview-video/scenarios/_drive.mjs`) stages and drives the game
 * with. DEV ONLY, and only under `?preview=1`: a player's build has no such
 * door.
 *
 * It does what a player's hands would do (it writes the same input record the
 * touch and mouse handlers write) and what a director would (put the mech
 * somewhere, turn the camera onto a defender over half a second). It decides
 * no outcome: a round still goes through the real hit-scan, a guard still
 * notices through its real cone.
 */

const mission = (): Mission | null => {
  const m = app.mode as unknown as Mission | null
  return m && 'garrison' in (m as object) ? m : null
}

/**
 * Would a round get from a to b? Asked of the SHOT's own ray-cast, which
 * knows the walls a round stops at; the grid's line-of-sight is the guards'
 * and sees over things a round does not.
 */
const scratchHit = makeShotHit()
const clearShot = (m: Mission, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean => {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len = Math.hypot(dx, dy, dz)
  if (len < 0.01) return true
  const h = castShot(m.fortress.grid, NO_UNITS, ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, scratchHit)
  return h.kind === 'none'
}
const NO_UNITS: Mission['garrison']['units'] = []

/** A director's camera: where it stands and what it looks at (cover plates). */
let shot: { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number } | null = null
/** Defenders held where a plate wants them. */
const pins = new Map<number, { x: number; z: number; yaw: number }>()

/** A camera move in progress: eased, on the clip's own clock. */
let move: { fromYaw: number; fromPitch: number; toYaw: number; toPitch: number; t: number; dur: number; track: number } | null = null

const install = (): void => {
  // Runs after the mission has placed its own camera and before the frame is
  // drawn, so a director's camera simply replaces it.
  addHudTicker(() => {
    const m = mission()
    if (!m) return
    for (const [id, p] of pins) {
      const u = m.garrison.units[id]
      if (!u) continue
      u.x = u.px = p.x
      u.z = u.pz = p.z
      // A drone or a lamp is held where it flies, not set down on the floor.
      u.y = u.py = isLight(u) ? u.altitude : heightAt(m.fortress.grid, p.x, p.z)
      u.yaw = p.yaw
    }
    if (!shot) return
    m.camera.position.set(shot.px, shot.py, shot.pz)
    m.camera.lookAt(shot.lx, shot.ly, shot.lz)
    if (m.camera.fov !== shot.fov) { m.camera.fov = shot.fov; m.camera.updateProjectionMatrix() }
  })
  addHudTicker((dt) => {
    const m = mission()
    if (!m || !move) return
    move.t += dt
    if (move.track >= 0) {
      // Onto a defender's head, along the line the RETICLE looks down: from
      // the camera, which sits off the mech's shoulder.
      const u = m.garrison.units[move.track]
      if (u) {
        const c = m.camera.position
        const dx = u.x - c.x
        const dz = u.z - c.z
        move.toYaw = Math.atan2(dx, dz)
        move.toPitch = Math.atan2(u.y + 1.54 - c.y, Math.hypot(dx, dz))
      }
    }
    const k = Math.min(1, move.t / move.dur)
    const e = k * k * (3 - 2 * k)
    m.cam.yaw = move.fromYaw + angleDelta(move.fromYaw, move.toYaw) * e
    m.cam.pitch = move.fromPitch + (move.toPitch - move.fromPitch) * e
    if (k >= 1) move = null
  })

  const turnTo = (yaw: number, pitch: number, ms: number, track = -1): void => {
    const m = mission()
    if (!m) return
    if (ms <= 1) { m.cam.yaw = yaw; m.cam.pitch = pitch; move = null; return }
    move = { fromYaw: m.cam.yaw, fromPitch: m.cam.pitch, toYaw: yaw, toPitch: pitch, t: 0, dur: ms / 1000, track }
  }

  const put = (x: number, z: number, yaw: number, pitch: number, crouched: boolean): void => {
    const m = mission()
    if (!m) return
    const p = m.player
    const y = heightAt(m.fortress.grid, x, z)
    p.x = p.px = x
    p.z = p.pz = z
    p.y = p.py = y
    p.vx = p.vz = p.vy = 0
    p.mode = 'ground'
    p.yaw = p.pyaw = yaw
    p.crouched = crouched
    p.crouch = crouched ? 1 : 0
    m.cam.yaw = yaw
    m.cam.pitch = pitch
    move = null
  }

  const api = {
    /** The mission is in the player's hands. */
    ready: (): boolean => hud.phase === 'play' && !flow.curtain && !flow.loading && !!mission(),
    /** Skip the drop-in. The level comes from the URL (`?level=`). */
    begin: (): void => {
      // The mouse's rules: a trigger of its own, no stick drawn.
      input.device = 'mouse'
      const wait = (): void => {
        const m = mission()
        if (m && hud.phase === 'intro' && !flow.curtain) m.endIntro()
        if (hud.phase !== 'play') setTimeout(wait, 50)
      }
      wait()
    },
    /** Hold the whole game still, or let it go. */
    freeze: (on: boolean): void => app.setWanted(!on),

    place: put,
    /** Stand `back` metres behind a defender, facing its back. */
    behind: (id: number, back: number): void => {
      const u = mission()?.garrison.units[id]
      if (u) put(u.x - Math.sin(u.yaw) * back, u.z - Math.cos(u.yaw) * back, u.yaw, -0.18, true)
    },
    /** Stand `ahead` metres in front of a defender, facing it. */
    inFrontOf: (id: number, ahead: number): void => {
      const u = mission()?.garrison.units[id]
      if (u) put(u.x + Math.sin(u.yaw) * ahead, u.z + Math.cos(u.yaw) * ahead, u.yaw + Math.PI, -0.05, false)
    },
    /** Stand `dist` metres from the way out, on a straight walk to it, facing it. */
    nearExit: (dist: number): boolean => {
      const m = mission()
      if (!m) return false
      const g = m.fortress.grid
      const e = m.fortress.extract
      for (let a = 0; a < 32; a++) {
        const ang = (a / 32) * Math.PI * 2
        const x = e.x + Math.sin(ang) * dist
        const z = e.z + Math.cos(ang) * dist
        if (heightAt(g, x, z) <= VOID + 1 || !walkLine(g, x, z, e.x, e.z)) continue
        put(x, z, Math.atan2(e.x - x, e.z - z), -0.1, false)
        return true
      }
      return false
    },
    /**
     * Stand at the pile of salvage nearest to the mech that lies on open
     * ground, a step away and facing it, with the camera behind and above.
     * False if there is none left.
     */
    atPile: (): boolean => {
      const m = mission()
      if (!m) return false
      const p = m.piles.filter(q => !q.taken && !q.big)
        .sort((a, b) => Math.hypot(a.x - m.player.x, a.z - m.player.z) - Math.hypot(b.x - m.player.x, b.z - m.player.z))[0]
      if (!p) return false
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2
        const x = p.x + Math.sin(ang) * 1.2
        const z = p.z + Math.cos(ang) * 1.2
        if (Math.abs(heightAt(m.fortress.grid, x, z) - p.y) > 0.2) continue
        put(x, z, Math.atan2(p.x - x, p.z - z), -0.32, false)
        return true
      }
      return false
    },
    /** Strip the salvage the raid still needs, where it lies (opens the way out). */
    takeSalvage: (): void => { mission()?.cheatSalvage() },
    /** The nearest defender the mech can see (-1 if none). */
    nearest: (): number => {
      const m = mission()
      if (!m) return -1
      const p = m.player
      const eye = p.y + 2.25 + (1.4 - 2.25) * p.crouch
      let best = -1
      let bestD = 70
      for (const u of m.garrison.units) {
        if (u.state === 'dead' || u.state === 'reserve') continue
        // A drone overhead is the last choice: aiming at one fills the frame with sky.
        const d = Math.hypot(u.x - p.x, u.z - p.z) + (u.kind === 'drone' ? 45 : 0)
        if (d >= bestD || !clearShot(m, p.x, eye, p.z, u.x, u.y + 1.2, u.z)) continue
        best = u.id
        bestD = d
      }
      return best
    },
    /** What the reticle is on right now, and where everybody is (for a log line). */
    aimReport: (id: number): string => {
      const m = mission()
      const u = m?.garrison.units[id]
      if (!m || !u) return 'no unit'
      const c = m.camera.position
      const cp = Math.cos(m.cam.pitch)
      const h = castShot(m.fortress.grid, m.garrison.units, c.x, c.y, c.z, Math.sin(m.cam.yaw) * cp, Math.sin(m.cam.pitch), Math.cos(m.cam.yaw) * cp, 200, makeShotHit())
      const r = (v: number): string => v.toFixed(1)
      return `mech ${r(m.player.x)},${r(m.player.y)},${r(m.player.z)} cam ${r(c.x)},${r(c.y)},${r(c.z)} pitch ${m.cam.pitch.toFixed(3)} · ${u.kind} ${r(u.x)},${r(u.y)},${r(u.z)} ${u.state} · reticle on ${h.kind}${h.kind === 'unit' ? ` #${h.unit} ${h.zone}` : ''} at ${r(h.x)},${r(h.y)},${r(h.z)} · weapon ${hud.weapon} scoped ${hud.scoped}`
    },
    /** A director's camera (null gives the game's own back). */
    shot: (s: typeof shot): void => { shot = s },
    /** Hold a defender somewhere, facing `yaw`, until `unpin`. */
    pin: (id: number, x: number, z: number, yaw: number): void => { pins.set(id, { x, z, yaw }) },
    unpin: (): void => pins.clear(),
    /** Ground height somewhere. */
    ground: (x: number, z: number): number => { const m = mission(); return m ? heightAt(m.fortress.grid, x, z) : 0 },
    /** The nth living defender of a kind. */
    unit: (kind: string, n: number): { id: number; x: number; y: number; z: number; yaw: number; state: string } | null => {
      const list = (mission()?.garrison.units ?? []).filter(u => u.kind === kind && u.state !== 'dead' && u.state !== 'reserve')
      const u = list[n] ?? list[0]
      return u ? { id: u.id, x: u.x, y: u.y, z: u.z, yaw: u.yaw, state: u.state } : null
    },

    /** Swing the camera onto a defender's head over `ms`. */
    aimAt: (id: number, ms: number): void => {
      const m = mission()
      const u = m?.garrison.units[id]
      if (!m || !u) return
      const p = m.player
      const eye = p.y + 2.25 + (1.4 - 2.25) * p.crouch
      const dx = u.x - p.x
      const dz = u.z - p.z
      turnTo(Math.atan2(dx, dz), Math.atan2(u.y + 1.54 - eye, Math.hypot(dx, dz)), ms, id)
    },
    pan: (yaw: number, pitch: number, ms: number): void => turnTo(yaw, pitch, ms),
    /**
     * Stand somewhere with a clear line to a defender's head, as near to
     * `want` metres away as the fortress allows, facing it. False if nowhere
     * within `want` ± 60 % has one.
     */
    vantage: (id: number, want: number, crouched: boolean): boolean => {
      const m = mission()
      const u = m?.garrison.units[id]
      if (!m || !u) return false
      const g = m.fortress.grid
      let best: { x: number; z: number; score: number } | null = null
      for (let ring = 0.4; ring <= 1.6; ring += 0.1) {
        for (let a = 0; a < 48; a++) {
          const ang = (a / 48) * Math.PI * 2
          const x = u.x + Math.sin(ang) * want * ring
          const z = u.z + Math.cos(ang) * want * ring
          const cx = toCell(x)
          const cz = toCell(z)
          const kind = cellKind(g, cx, cz)
          if (kind === CellKind.Cover || kind === CellKind.Block) continue
          const y = heightAt(g, x, z)
          if (y <= VOID + 1) continue
          const eye = y + (crouched ? 1.4 : 2.25)
          // The round leaves the BARREL, at the mech's right shoulder, and the
          // target is walking: both lines must be clear to where its head is
          // now and to where it will be in a second or two.
          const yaw = Math.atan2(u.x - x, u.z - z)
          const bx = x - Math.cos(yaw) * 0.42 + Math.sin(yaw) * 0.5
          const bz = z + Math.sin(yaw) * 0.42 + Math.cos(yaw) * 0.5
          let clear = true
          for (const ahead of [0, 1.5, 3, -1.5]) {
            const hx = u.x + Math.sin(u.yaw) * ahead
            const hz = u.z + Math.cos(u.yaw) * ahead
            const hy = heightAt(g, hx, hz) + 1.54
            if (Math.abs(hy - 1.54 - u.y) > 0.6) continue
            // With room to spare: a line that only just grazes a wall top is
            // clear in the arithmetic and a hit on the wall in the shot. So the
            // target must be visible from the knees up, from a little lower.
            if (!clearShot(m, x, eye, z, hx, hy, hz) || !clearShot(m, bx, eye - 0.28, bz, hx, hy, hz)
              || !clearShot(m, x, eye - 0.5, z, hx, hy - 1.0, hz)) { clear = false; break }
          }
          if (!clear) continue
          // Prefer the asked distance, and a spot in front of the target.
          const facing = Math.cos(ang - u.yaw)
          // Level with the target or above it beats looking up at it.
          const below = Math.max(0, u.y - y)
          const score = Math.abs(ring - 1) * 2 - facing * 0.5 + below * 0.25
          if (!best || score < best.score) best = { x, z, score }
        }
      }
      if (!best) return false
      const yaw = Math.atan2(u.x - best.x, u.z - best.z)
      put(best.x, best.z, yaw, 0, crouched)
      return true
    },
    /** Knock the camera off its aim by a little (an opening frame in motion). */
    nudge: (yaw: number, pitch: number): void => {
      const m = mission()
      if (m) { m.cam.yaw += yaw; m.cam.pitch += pitch }
    },

    // ── The hands ──
    aim: (on: boolean): void => { input.aimHeld = on; if (on) input.aimPressed = true },
    fire: (): void => { input.firePressed = true },
    trigger: (on: boolean): void => { input.fireHeld = on; if (on) input.firePressed = true },
    act: (): void => { input.actQueued = true },
    decoy: (): void => { input.decoyQueued = true },
    weapon: (n: 1 | 2 | 3): void => { input.weaponQueued = n },
    move: (x: number, y: number): void => { input.moveX = x; input.moveY = y },
    crouch: (): void => { input.crouchQueued = true },

    /** The next kill gets the kill-cam, whatever the dice say. */
    forceKillcam: (): void => { const m = mission(); if (m) m.forceKillcam = true },
    /** Leave the mech this share of its armor (a fail clip's short fuse). */
    fragile: (share: number): void => { const m = mission(); if (m) m.armor.hp = Math.max(1, m.armor.max * share) },

    /** The procedural drawing of a detail map (the art pipeline's reference). */
    textureReference,

    /** What is going on, for the recorder's log and its waits. */
    state: () => {
      const m = mission()
      return {
        phase: hud.phase, alert: hud.alert, chaos: hud.chaos, cine: hud.cine, objective: hud.objective, strike: hud.strike,
        weapon: hud.weapon, scoped: hud.scoped, busy: m?.busy ?? false,
        kills: m?.stats.kills ?? 0, headshots: m?.stats.headshots ?? 0, bladeKills: m?.stats.bladeKills ?? 0, salvage: m?.stats.piles ?? 0,
        armor: m ? Math.round(m.armor.hp) : 0, yaw: m?.cam.yaw ?? 0, x: m?.player.x ?? 0, y: m?.player.y ?? 0, z: m?.player.z ?? 0
      }
    }
  }
  ;(window as unknown as { __preview: typeof api }).__preview = api
}

/** Publish the seam, on a dev server asked for it. A no-op everywhere else. */
export const installPreview = (): void => {
  if (!import.meta.env.DEV) return
  try {
    if (new URLSearchParams(window.location.search).get('preview') !== '1') return
  } catch { return }
  install()
}
