/**
 * ─── The Alert Level ─────────────────────────────────────────────────────────
 *
 * One meter for the whole base (GDD 2.2). It rises when the mech is seen, a
 * body is found, a shot misses within earshot, or a drone reports in; it
 * drains while the base is calm. When it fills, the base goes on full alert:
 * the mission has turned from infiltration into a fight, until the garrison
 * loses the mech or its ringing beacons are silenced and it stands down (#134).
 *
 * Pure. The HUD shows it as five segments.
 */

export type AlertCause = 'seen' | 'body' | 'miss' | 'drone' | 'loud'

/** How much each cause adds, out of 100. */
export const ALERT_GAIN: Readonly<Record<AlertCause, number>> = {
  /** A guard is sure of what it saw. */
  seen: 35,
  /** A body lying in plain sight. */
  body: 30,
  /** A round that hit the wall next to someone. */
  miss: 12,
  /** A drone's report. */
  drone: 25,
  /** A minigun or a rocket: nobody misses that. */
  loud: 100
}

export const ALERT_MAX = 100
export const ALERT_SEGMENTS = 5
/** The base must be quiet this long before the meter starts to drain. */
const DRAIN_AFTER_S = 6
const DRAIN_PER_S = 4

export interface Alert {
  level: number
  /** Full alert, until the garrison stands down (`garrison.ts`, #134). */
  chaos: boolean
  /** Seconds since the meter last rose. */
  quiet: number
}

export const makeAlert = (): Alert => ({ level: 0, chaos: false, quiet: 999 })

/**
 * With alarm beacons in the base (round 3, after Odyssey's braziers) nothing
 * but a lit beacon, or a noise nobody can miss, fills the last segment: the
 * meter stops just short.
 */
export const BEACON_CAP = ALERT_MAX * 0.9

/** Lit segments of the HUD's meter, 0 to 5. */
export const alertSegments = (a: Alert): number =>
  a.chaos ? ALERT_SEGMENTS : Math.min(ALERT_SEGMENTS - 1, Math.floor((a.level / ALERT_MAX) * ALERT_SEGMENTS))

/**
 * Raise the meter. Returns true when this is what tipped the base into full
 * alert (so the caller plays that moment once).
 */
export const raiseAlert = (a: Alert, cause: AlertCause, cap = ALERT_MAX): boolean => {
  if (a.chaos) return false
  a.level = Math.min(cause === 'loud' ? ALERT_MAX : cap, a.level + ALERT_GAIN[cause])
  a.quiet = 0
  if (a.level >= ALERT_MAX) {
    a.chaos = true
    return true
  }
  return false
}

/** While a guard that has made the mech keeps it in sight, the meter climbs
 *  this fast: a few seconds to silence the witness or break the line. */
export const ENGAGED_PER_S = 16

/** Raise the meter by an amount (a witness still watching). True when this
 *  tipped the base into full alert. */
export const pressAlert = (a: Alert, amount: number, cap = ALERT_MAX): boolean => {
  if (a.chaos) return false
  a.level = Math.min(cap, a.level + amount)
  a.quiet = 0
  if (a.level >= ALERT_MAX) {
    a.chaos = true
    return true
  }
  return false
}

/**
 * Let time pass. The meter drains only while nobody in the base is
 * suspicious: a guard walking over to look keeps it where it is.
 */
export const stepAlert = (a: Alert, dt: number, calm: boolean): void => {
  if (a.chaos) return
  a.quiet = calm ? a.quiet + dt : 0
  if (a.quiet > DRAIN_AFTER_S) a.level = Math.max(0, a.level - DRAIN_PER_S * dt)
}
