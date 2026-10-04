import { raycast, type Grid } from '../world/grid'
import type { WeaponId } from '../data/ids'

/**
 * ─── The camera ──────────────────────────────────────────────────────────────
 *
 * Third person while the mech moves: behind and a little to the right of it,
 * on an arm that shortens when a wall is in the way. With a weapon up it
 * closes in: the sniper goes to the mech's own eye and narrows to the scope's
 * field of view (GDD: "scoping in shifts the game to first-person"); the
 * minigun and the launcher come in over the shoulder so the mech stays on
 * screen.
 *
 * Pure: angles and the grid in, a position and a direction out. The mission
 * copies the result onto the three.js camera.
 *
 * Headings are radians, 0 looking along +z, growing toward +x. Pitch is
 * positive looking up.
 */

/** Arm length and shoulder offset when walking. The mech sits low and to the
 *  left of the middle, so the middle of the view is the world, not its back. */
export const FOLLOW_DIST = 6.4
const FOLLOW_SHOULDER = 0.85
/** The pivot this far over the mech's eyes when following. */
const FOLLOW_LIFT = 0.45
/**
 * The arm pulled in closer than this by a wall: the mech would fill the view.
 * The camera cranes up and out over its shoulder instead, and the mech fades
 * (`CamPose.fade`), so the screen is never the inside of the mech's back.
 */
export const CLOSE_DIST = 2.4
const CRANE_UP = 1.3
const CRANE_SIDE = 0.45
/** The arm never points up more than this, though the view may: looking up
 *  from behind the mech must not swing the camera into the floor or its body. */
export const ARM_PITCH_MAX = 0.2
/**
 * Over the shoulder, with the minigun or the launcher up: the follow camera
 * slides this far forward ALONG THE VIEW, never across it, so whatever was
 * under the crosshair stays under it while the weapon comes up (#80: the arm
 * used to swing to a new pitch and drop the camera, and a drone overhead
 * jumped above the reticle).
 */
const SHOULDER_DIST = 3.1
const SHOULDER_FOV = 46
/** The base field of view the zoom values above are tuned at (16:9). */
const REFERENCE_FOV = 60
/** How far the camera keeps off a wall it is pushed against. */
const WALL_MARGIN = 0.3
const MIN_DIST = 0.55
export const PITCH_MIN = -1.2
export const PITCH_MAX = 1.05
/** Radians per pixel of look travel, before the player's own sensitivity. */
const LOOK_RATE = 0.0042
/** Radians per second for the turn keys. */
const KEY_TURN = 2.2

export interface Cam {
  yaw: number
  pitch: number
  /** 0 following … 1 weapon up, eased. */
  aim: number
  /** The arm's current length, eased out again after a wall pulled it in. */
  dist: number
  /** Seconds the arm waits, after being pulled in, before it lets out again (#112). */
  hold: number
  /** The crane over the shoulder, eased (0 … 1). */
  close: number
}

export const makeCam = (yaw = 0): Cam => ({ yaw, pitch: -0.18, aim: 0, dist: FOLLOW_DIST, hold: 0, close: 0 })

/**
 * The spring arm (#112). The arm is a thick probe, not a line: five rays (the
 * middle and four round it at ARM_PROBE), so its length does not flick in and
 * out as it slides along a wall's edge. A wall pulls it in at once; it waits
 * ARM_HOLD_S and lets out only for clearly more room (ARM_SLACK), gently;
 * the crane over the shoulder eases in and out instead of snapping.
 */
const ARM_PROBE = 0.32
const ARM_HOLD_S = 0.3
const ARM_SLACK = 0.25
const ARM_OUT_RATE = 3

/** The unit vector the camera looks along. */
export const camForward = (cam: Cam): { x: number; y: number; z: number } => {
  const c = Math.cos(cam.pitch)
  return { x: Math.sin(cam.yaw) * c, y: Math.sin(cam.pitch), z: Math.cos(cam.yaw) * c }
}

/**
 * Turn the camera by a look drag (pixels) and the turn keys.
 * `fov` scales the rate: through the scope the same finger travel turns the
 * view less, so the reticle is as steady as the picture is magnified.
 */
export const lookCam = (cam: Cam, dxPx: number, dyPx: number, turn: number, dt: number, sensitivity: number, fov: number, baseFov: number): void => {
  const zoom = Math.max(0.12, Math.tan((fov * Math.PI) / 360) / Math.tan((baseFov * Math.PI) / 360))
  // Dragging right looks right, which is toward −x from a +z heading.
  cam.yaw -= dxPx * LOOK_RATE * sensitivity * zoom + turn * KEY_TURN * dt * zoom
  cam.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, cam.pitch - dyPx * LOOK_RATE * sensitivity * zoom))
}

/** Ease the aim blend toward where the hands have it. */
export const stepCam = (cam: Cam, aiming: boolean, dt: number): void => {
  const target = aiming ? 1 : 0
  const rate = aiming ? 9 : 7
  cam.aim += (target - cam.aim) * Math.min(1, dt * rate)
  if (Math.abs(target - cam.aim) < 0.002) cam.aim = target
}

/** Turn the stick (x right, y forward) into a world direction for this view. */
export const stickToWorld = (cam: Cam, moveX: number, moveY: number): { x: number; z: number } => {
  const s = Math.sin(cam.yaw)
  const c = Math.cos(cam.yaw)
  // Forward is (s, c); the view's right is (−c, s).
  return { x: s * moveY - c * moveX, z: c * moveY + s * moveX }
}

export interface CamPose {
  x: number
  y: number
  z: number
  /** The point the camera looks at. */
  tx: number
  ty: number
  tz: number
  fov: number
  /** 0 the mech is on screen … 1 the camera is in its head (hide the rig). */
  inside: number
  /** 0 … 1 how far to fade the mech out: the camera is pressed close to it. */
  fade: number
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/**
 * Where the camera is this frame.
 * @param fx,fy,fz  the mech's feet (interpolated)
 * @param eye       its eye height above them
 * @param baseFov   the walking field of view for this aspect
 * @param scopeFov  the sniper scope's field of view
 */
export const placeCam = (
  cam: Cam, g: Grid, fx: number, fy: number, fz: number, eye: number,
  weapon: WeaponId, baseFov: number, scopeFov: number, dt: number
): CamPose => {
  const f = camForward(cam)
  const sniper = weapon === 'sniper'
  // The loud weapons keep the follow arm and push along the view afterwards.
  const a = sniper ? cam.aim : 0
  // The pivot: the mech's head, a little above its eyes when following.
  const px = fx
  const py = fy + eye + lerp(FOLLOW_LIFT, 0, a)
  // The arm's own direction: the view's, but never tipped far up.
  const armPitch = Math.min(cam.pitch, lerp(ARM_PITCH_MAX, PITCH_MAX, a))
  const ac = Math.cos(armPitch)
  const af = { x: Math.sin(cam.yaw) * ac, y: Math.sin(armPitch), z: Math.cos(cam.yaw) * ac }
  const pz = fz
  const wantDist = lerp(FOLLOW_DIST, 0, a)
  const side = lerp(FOLLOW_SHOULDER, 0, a)
  // The view's right.
  const rx = -Math.cos(cam.yaw)
  const rz = Math.sin(cam.yaw)

  // The arm, from the pivot back and to the side.
  let ax = -af.x * wantDist + rx * side
  let ay = -af.y * wantDist
  let az = -af.z * wantDist + rz * side
  const len = Math.hypot(ax, ay, az)
  let dist = len
  if (len > 1e-4) {
    ax /= len
    ay /= len
    az /= len
    // Two directions square to the arm, for the probe's ring.
    let ux = -az
    let uz = ax
    const ul = Math.hypot(ux, uz) || 1
    ux /= ul
    uz /= ul
    const vx = ay * uz
    const vy = az * ux - ax * uz
    const vz = -ay * ux
    let best = len + WALL_MARGIN
    for (const [s, t] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ox = px + (ux * s + vx * t) * ARM_PROBE
      const oy = py + vy * t * ARM_PROBE
      const oz = pz + (uz * s + vz * t) * ARM_PROBE
      const hit = raycast(g, ox, oy, oz, ax, ay, az, len + WALL_MARGIN)
      if (hit.hit) best = Math.min(best, hit.t)
    }
    if (best < len + WALL_MARGIN) dist = Math.max(Math.min(MIN_DIST, len), best - WALL_MARGIN)
  }
  // Pulled in at once (never see through a wall); held a moment, then let
  // out gently, and only when there is clearly more room.
  if (dist < cam.dist) { cam.dist = dist; cam.hold = ARM_HOLD_S }
  else if (cam.hold > 0) cam.hold -= dt
  else if (dist > cam.dist + ARM_SLACK || dist >= len - 1e-3) cam.dist += (dist - cam.dist) * Math.min(1, dt * ARM_OUT_RATE)
  const d = Math.min(cam.dist, len)

  let x = px + ax * d
  let y = py + ay * d
  let z = pz + az * d
  // Pressed close to the mech by a wall: crane up and out over its shoulder,
  // as far as the space above allows, and say how far to fade it.
  const wantClose = wantDist > CLOSE_DIST ? Math.min(1, Math.max(0, (CLOSE_DIST - d) / (CLOSE_DIST - MIN_DIST))) * (1 - cam.aim) : 0
  cam.close += (wantClose - cam.close) * Math.min(1, dt * (wantClose > cam.close ? 10 : 4))
  const close = cam.close < 0.01 ? 0 : cam.close
  if (close > 0) {
    const up = raycast(g, x, y, z, 0, 1, 0, CRANE_UP + WALL_MARGIN)
    const rise = (up.hit ? Math.max(0, up.t - WALL_MARGIN) : CRANE_UP) * close
    const out = raycast(g, x, y + rise, z, rx, 0, rz, CRANE_SIDE + WALL_MARGIN)
    const step = (out.hit ? Math.max(0, out.t - WALL_MARGIN) : CRANE_SIDE) * close
    x += rx * step
    y += rise
    z += rz * step
  }
  if (!sniper && cam.aim > 0) {
    // Slide in along the view until the mech's head is SHOULDER_DIST ahead
    // (less if a wall already pulled the arm in), short of whatever is ahead.
    const back = (px - x) * f.x + (py - y) * f.y + (pz - z) * f.z
    let push = Math.max(0, back - SHOULDER_DIST) * cam.aim
    const ahead = raycast(g, x, y, z, f.x, f.y, f.z, push + WALL_MARGIN)
    if (ahead.hit) push = Math.max(0, ahead.t - WALL_MARGIN)
    x += f.x * push
    y += f.y * push
    z += f.z * push
  }
  return {
    x, y, z,
    tx: x + f.x * 30,
    ty: y + f.y * 30,
    tz: z + f.z * 30,
    // Both zooms are a fraction of the base view, which is wider on a
    // phone held upright: the same magnification either way round.
    fov: lerp(baseFov, (sniper ? scopeFov : SHOULDER_FOV) * (baseFov / REFERENCE_FOV), cam.aim),
    inside: sniper ? a : 0,
    fade: close
  }
}
