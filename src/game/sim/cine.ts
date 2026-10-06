/**
 * ─── Camera moves ────────────────────────────────────────────────────────────
 *
 * The scripted shots: the drop-in, the extraction, the bullet's flight and
 * the slow orbit round a kill. Each is a pure function of its progress that
 * fills a camera pose; the mission decides which one is running. No renderer.
 */

export interface CinePose {
  x: number
  y: number
  z: number
  tx: number
  ty: number
  tz: number
  fov: number
}

export const makeCinePose = (): CinePose => ({ x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 1, fov: 60 })

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
export const smooth = (k: number): number => { const t = clamp01(k); return t * t * (3 - 2 * t) }

/** Blend two poses. */
export const blendPose = (out: CinePose, a: CinePose, b: CinePose, k: number): CinePose => {
  out.x = lerp(a.x, b.x, k)
  out.y = lerp(a.y, b.y, k)
  out.z = lerp(a.z, b.z, k)
  out.tx = lerp(a.tx, b.tx, k)
  out.ty = lerp(a.ty, b.ty, k)
  out.tz = lerp(a.tz, b.tz, k)
  out.fov = lerp(a.fov, b.fov, k)
  return out
}

// ─── The bullet ──────────────────────────────────────────────────────────────

/** How long the bullet's flight takes on screen, by its distance. */
export const bulletFlightS = (dist: number): number => Math.min(2.1, Math.max(1.1, dist / 36))

/**
 * Where the bullet is along its flight, 0 … 1 of the distance, for a progress
 * `k` in time: out of the barrel fast, a long hang in the middle, fast again
 * into the target.
 */
export const bulletAlong = (k: number): number => {
  const t = clamp01(k)
  // A cubic with a flat middle: 4(t − ½)³ + ½.
  const c = t - 0.5
  return 4 * c * c * c + 0.5
}

/**
 * The chase camera: just behind and beside the bullet, looking past it at
 * where it is going. It swings in behind as the bullet arrives. `wide` holds
 * further back at the end (a machine: its coming apart must fit the frame).
 */
export const bulletCam = (
  out: CinePose, k: number, ox: number, oy: number, oz: number, hx: number, hy: number, hz: number, baseFov: number, wide = false
): CinePose => {
  const len = Math.hypot(hx - ox, hy - oy, hz - oz) || 1
  const dx = (hx - ox) / len
  const dy = (hy - oy) / len
  const dz = (hz - oz) / len
  const a = bulletAlong(k)
  const bx = ox + dx * len * a
  const by = oy + dy * len * a
  const bz = oz + dz * len * a
  // The bullet's right, on the level.
  const flat = Math.hypot(dx, dz) || 1
  const rx = -dz / flat
  const rz = dx / flat
  const side = lerp(0.75, wide ? 0.9 : 0.2, smooth(k))
  const back = lerp(1.5, wide ? 4.6 : 2.3, smooth(k))
  out.x = bx - dx * back + rx * side
  out.y = by - dy * back + 0.22
  out.z = bz - dz * back + rz * side
  out.tx = hx
  out.ty = hy
  out.tz = hz
  out.fov = baseFov * lerp(0.7, wide ? 0.66 : 0.5, smooth(k))
  return out
}

/** The bullet itself at progress `k`. */
export const bulletAt = (
  k: number, ox: number, oy: number, oz: number, hx: number, hy: number, hz: number
): { x: number; y: number; z: number } => {
  const a = bulletAlong(k)
  return { x: lerp(ox, hx, a), y: lerp(oy, hy, a), z: lerp(oz, hz, a) }
}

// ─── A slow turn round something ─────────────────────────────────────────────

/** A low orbit round a point: `t` seconds in, starting at `startYaw`. */
export const orbitCam = (
  out: CinePose, t: number, cx: number, cy: number, cz: number, startYaw: number, radius: number, height: number, speed: number, fov: number
): CinePose => {
  const a = startYaw + t * speed
  out.x = cx + Math.sin(a) * radius
  out.y = cy + height
  out.z = cz + Math.cos(a) * radius
  out.tx = cx
  out.ty = cy
  out.tz = cz
  out.fov = fov
  return out
}

// ─── The drop-in ─────────────────────────────────────────────────────────────

/** Height the mech falls from, above its perch. */
export const DROP_HEIGHT = 16
/** Of the intro's length: the mech hangs until here, and has landed by here. */
export const DROP_FROM = 0.3
export const DROP_LANDED = 0.52

/** How high above the perch the mech is at progress `k` of the intro. */
export const dropHeight = (k: number): number => {
  if (k <= DROP_FROM) return DROP_HEIGHT
  if (k >= DROP_LANDED) return 0
  const t = (k - DROP_FROM) / (DROP_LANDED - DROP_FROM)
  // Falling: it gathers speed all the way down.
  return DROP_HEIGHT * (1 - t * t)
}

/**
 * The establishing shot: high and wide behind the perch, looking over it at
 * the base, drifting; then it comes down to the follow camera's place
 * (`follow`) once the mech has landed.
 */
/** The drop-in's wide shot stands this far from the perch, where there is room. */
export const INTRO_CAM_DIST = 19

export const introCam = (
  out: CinePose, k: number, px: number, py: number, pz: number, yaw: number, cx: number, cz: number, follow: CinePose,
  /** How high above the perch the mech is now (it rides in; by default it falls). */
  rise = dropHeight(k),
  /** How far out the wide shot stands, and how far it is turned from straight behind (#119: so nothing solid comes between). */
  dist = INTRO_CAM_DIST, turn = 0
): CinePose => {
  const drift = (k - 0.5) * 0.5
  const a = yaw + Math.PI + drift + turn
  // Wide: behind and above the perch.
  out.x = px + Math.sin(a) * dist
  out.y = py + 10 + rise * 0.25
  out.z = pz + Math.cos(a) * dist
  // It watches the mech come down, then looks past it into the base.
  const look = smooth((k - DROP_LANDED) / 0.2)
  out.tx = lerp(px, lerp(px, cx, 0.35), look)
  out.ty = lerp(py + 1.4 + rise, py + 1, look)
  out.tz = lerp(pz, lerp(pz, cz, 0.35), look)
  out.fov = follow.fov * 0.92
  const settle = smooth((k - 0.66) / 0.34)
  return settle > 0 ? blendPose(out, out, follow, settle) : out
}

// ─── The extraction ──────────────────────────────────────────────────────────

/** How far up the line has taken the mech at progress `k` of the outro. */
export const liftHeight = (k: number): number => {
  const t = clamp01((k - 0.3) / 0.7)
  return 22 * t * t
}

/** The outro's camera: it backs away and rises as the mech is taken up. */
export const outroCam = (
  out: CinePose, k: number, px: number, py: number, pz: number, yaw: number, fov: number,
  /** How high the mech has been taken (by default, up a line). */
  rise = liftHeight(k)
): CinePose => {
  const a = yaw + Math.PI * 0.8 + k * 0.9
  const r = lerp(7, 15, smooth(k))
  out.x = px + Math.sin(a) * r
  out.y = py + lerp(2.2, 7, smooth(k))
  out.z = pz + Math.cos(a) * r
  out.tx = px
  out.ty = py + 1.4 + rise * 0.8
  out.tz = pz
  out.fov = fov * 0.9
  return out
}
