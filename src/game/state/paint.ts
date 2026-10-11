import { PAINT_SCRAP, FREE_PAINT, type PaintId } from '../models/paintIds'
import { profile, saveProfile } from './profile'

/**
 * ─── The mech's paint (#M3–#M6) ──────────────────────────────────────────────
 *
 * Owning, wearing and lending paint schemes. A locked scheme unlocks for good
 * with a rewarded video (where one can play) or scrap (always, and the only
 * way where none can); or a video lends it for the next mission (`trial`).
 * The paint videos are capped over a rolling day (`PAINT_VIDEOS_PER_DAY`),
 * counted in the save so a reload does not reset them.
 */

/** Paint videos (unlocks and trials together) in any 24 hours. */
export const PAINT_VIDEOS_PER_DAY = 5
export const PAINT_VIDEO_WINDOW_MS = 24 * 60 * 60 * 1000

export const ownsPaint = (id: PaintId): boolean => profile.paint.owned.includes(id)

/** Unlock a scheme for good and put it on: for scrap, or (`free`) after a rewarded video finished. */
export const unlockPaint = (id: PaintId, free = false): boolean => {
  if (ownsPaint(id)) return false
  if (!free) {
    if (profile.scrap < PAINT_SCRAP) return false
    profile.scrap -= PAINT_SCRAP
  }
  profile.paint.owned.push(id)
  profile.paint.equipped = id
  if (profile.paint.trial === id) profile.paint.trial = null
  saveProfile()
  return true
}

/** Put an owned scheme on (one tap in the Chassis Bay). */
export const equipPaint = (id: PaintId): boolean => {
  if (!ownsPaint(id) || profile.paint.equipped === id) return false
  profile.paint.equipped = id
  saveProfile()
  return true
}

/**
 * Lend a locked scheme for the next mission (after a finished video). One
 * view, one lend: it is taken when that mission starts and is gone after it.
 */
export const lendPaint = (id: PaintId): boolean => {
  if (ownsPaint(id)) return false
  profile.paint.trial = id
  saveProfile()
  return true
}

// ─── The day's paint videos ──────────────────────────────────────────────────

const recent = (now: number): number[] => profile.paint.videos.filter(t => t > now - PAINT_VIDEO_WINDOW_MS && t <= now)

/** Paint videos left in the rolling day. */
export const paintVideosLeft = (now = Date.now()): number => Math.max(0, PAINT_VIDEOS_PER_DAY - recent(now).length)

/** When the next paint video comes back (ms timestamp), or 0 while some are left. */
export const paintVideoBackAt = (now = Date.now()): number => {
  if (paintVideosLeft(now) > 0) return 0
  const r = recent(now).sort((a, b) => a - b)
  return r[r.length - PAINT_VIDEOS_PER_DAY]! + PAINT_VIDEO_WINDOW_MS
}

/** A paint video was watched to the end. */
export const logPaintVideo = (now = Date.now()): void => {
  profile.paint.videos = [...recent(now), now]
  saveProfile()
}

// ─── The lent scheme's mission ───────────────────────────────────────────────

/** The lend in use: the scheme and the missions count it started at (a mission banked ends it). */
let lent: { id: PaintId; at: number } | null = null

/**
 * A mission starts: a scheme lent for it is taken off the save (so the one
 * view lends it once) and worn for this mission, retries of it included.
 */
export const startPaintTrial = (): void => {
  const id = profile.paint.trial
  if (!id) return
  lent = { id, at: profile.missions }
  profile.paint.trial = null
  saveProfile()
}

/** Back in the base: the lent scheme goes back. */
export const endPaintTrial = (): void => { lent = null }

/** The scheme the mech wears on a mission: a lent one while its mission lasts, else the equipped one. */
export const missionPaint = (): PaintId => {
  if (lent && lent.at === profile.missions && !ownsPaint(lent.id)) return lent.id
  lent = null
  return ownsPaint(profile.paint.equipped) ? profile.paint.equipped : FREE_PAINT
}

/** Test seam. */
export const __resetPaintTrial = (): void => { lent = null }
