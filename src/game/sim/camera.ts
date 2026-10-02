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

/** Arm length and shoulder offset when walking. */
export const FOLLOW_DIST = 6.4
const FOLLOW_SHOULDER = 0.55
/** Over the shoulder, with the minigun or the launcher up. */
const SHOULDER_DIST = 2.5
const SHOULDER_SIDE = 0.85
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
}

export const makeCam = (yaw = 0): Cam => ({ yaw, pitch: -0.18, aim: 0, dist: FOLLOW_DIST })

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
  const a = cam.aim
  // The pivot: the mech's head, a little above its eyes when following.
  const px = fx
  const py = fy + eye + lerp(0.2, 0, a)
  const pz = fz
  const wantDist = lerp(FOLLOW_DIST, sniper ? 0 : SHOULDER_DIST, a)
  const side = lerp(FOLLOW_SHOULDER, sniper ? 0 : SHOULDER_SIDE, a)
  // The view's right.
  const rx = -Math.cos(cam.yaw)
  const rz = Math.sin(cam.yaw)

  // The arm, from the pivot back and to the side.
  let ax = -f.x * wantDist + rx * side
  let ay = -f.y * wantDist
  let az = -f.z * wantDist + rz * side
  const len = Math.hypot(ax, ay, az)
  let dist = len
  if (len > 1e-4) {
    ax /= len
    ay /= len
    az /= len
    const hit = raycast(g, px, py, pz, ax, ay, az, len + WALL_MARGIN)
    if (hit.hit) dist = Math.max(Math.min(MIN_DIST, len), hit.t - WALL_MARGIN)
  }
  // Pulled in at once (never see through a wall), let out gently.
  if (dist < cam.dist) cam.dist = dist
  else cam.dist += (dist - cam.dist) * Math.min(1, dt * 5)
  const d = Math.min(cam.dist, len)

  const x = px + ax * d
  const y = py + ay * d
  const z = pz + az * d
  return {
    x, y, z,
    tx: x + f.x * 30,
    ty: y + f.y * 30,
    tz: z + f.z * 30,
    // Both zooms are a fraction of the base view, which is wider on a
    // phone held upright: the same magnification either way round.
    fov: lerp(baseFov, (sniper ? scopeFov : SHOULDER_FOV) * (baseFov / REFERENCE_FOV), a),
    inside: sniper ? a : 0
  }
}
