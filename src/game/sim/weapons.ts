import { WEAPON_IDS, type WeaponId } from '../data/ids'

/**
 * ─── The mech's three weapons ────────────────────────────────────────────────
 *
 * Triggers, magazines, heat and timers, and nothing else: this module says
 * WHEN a round leaves the barrel. Where it goes and what it hits is the
 * mission's business. Pure.
 *
 *  - Sniper rifle: silenced, one round per pull, a bolt to work between
 *    rounds, five in the magazine, reloaded from a reserve that runs out.
 *  - Minigun: has to spool up before the first round; fed from a belt that
 *    runs out, and it overheats and locks until it has cooled.
 *  - Rocket launcher: one in the tube, a slow reload, a few for the mission.
 * Round 4 (#76): ammunition is finite; pouches and crates in the fortress
 * top it up (`supplies.ts`).
 */

export const SNIPER_MAG = 5
/**
 * Rounds carried for the rifle besides the magazine, and the mini-gun's belt,
 * as the factory fits them. Round 5 (#143): a tight factory stock (10 rifle
 * rounds in all, 100 on the belt, 2 rockets); the rest is upgraded at the
 * Armory or picked up in the fortress.
 */
export const SNIPER_RESERVE = 5
export const MINIGUN_BELT = 100
export const SNIPER_BOLT_S = 0.85
export const SNIPER_RELOAD_S = 1.9
export const MINIGUN_SPOOL_S = 0.55
export const MINIGUN_RPS = 15
/** Seconds of continuous fire before the minigun overheats. */
export const MINIGUN_HEAT_S = 5
const MINIGUN_COOL_PER_S = 0.4
/** An overheated minigun fires again once it is this cool. */
const MINIGUN_RESUME_AT = 0.3
export const ROCKET_RELOAD_S = 2.1
export const ROCKETS_PER_MISSION = 2
export const SWITCH_S = 0.35

/** Spread of a round, as the radius of its cone in radians. */
export const SPREAD: Readonly<Record<WeaponId, number>> = { sniper: 0, minigun: 0.022, rocket: 0 }

export interface Arsenal {
  current: WeaponId
  /** Seconds left of drawing the current weapon; no shot until 0. */
  switching: number
  sniperMag: number
  /** Rifle rounds carried besides the magazine, and how many it can carry. */
  sniperReserve: number
  sniperReserveMax: number
  /** Rounds left on the mini-gun's belt, and a full belt. */
  minigunBelt: number
  minigunBeltMax: number
  /** Seconds left of working the bolt. */
  bolt: number
  /** Seconds left of the sniper's reload, 0 when not reloading. */
  reloading: number
  /** 0 still … 1 at speed. */
  spool: number
  /** 0 cold … 1 overheated. */
  heat: number
  overheated: boolean
  /** Fraction of a round owed, carried between steps. */
  owed: number
  rocketLoaded: boolean
  rocketReload: number
  rockets: number
  /** 0 … 1 kick of the last shot, for the pose and the camera. */
  recoil: number
  /** Minigun barrel angle, radians. */
  spin: number
  /** The minigun as fitted: seconds of fire to overheat, and cooling per second. */
  heatSeconds: number
  coolRate: number
}

export const makeArsenal = (
  rockets = ROCKETS_PER_MISSION, heatSeconds = MINIGUN_HEAT_S, coolRate = MINIGUN_COOL_PER_S, rifleReserve = SNIPER_RESERVE, belt = MINIGUN_BELT
): Arsenal => ({
  current: 'sniper', switching: 0, sniperMag: SNIPER_MAG, sniperReserve: rifleReserve, sniperReserveMax: rifleReserve,
  minigunBelt: belt, minigunBeltMax: belt, bolt: 0, reloading: 0, spool: 0, heat: 0, overheated: false,
  owed: 0, rocketLoaded: true, rocketReload: 0, rockets: Math.max(0, rockets - 1), recoil: 0, spin: 0, heatSeconds, coolRate
})

/** What the hands ask of the weapon this step. */
export interface Trigger {
  /** The weapon is held up (a touch held on the right, or the right button). */
  aimHeld: boolean
  /** The aim was let go this step: on touch, that is the shot. */
  aimReleased: boolean
  /** The left mouse button: went down this step, and is down. */
  firePressed: boolean
  fireHeld: boolean
  /** Touch fires on release and by holding; a mouse has a trigger of its own. */
  touch: boolean
  reload: boolean
  /** Draw this weapon, or the next one. */
  select: WeaponId | null
  cycle: boolean
  /** The weapon is up and on the line (#110): the mini-gun spins up regardless, but only fires on it. Unset means ready. */
  ready?: boolean
}

export const nextWeapon = (w: WeaponId): WeaponId => WEAPON_IDS[(WEAPON_IDS.indexOf(w) + 1) % WEAPON_IDS.length]!

/** Rounds in hand for the HUD: magazine, or rockets counting the one loaded. */
export const ammoOf = (a: Arsenal, w: WeaponId = a.current): number =>
  w === 'sniper' ? a.sniperMag : w === 'rocket' ? a.rockets + (a.rocketLoaded ? 1 : 0) : a.minigunBelt

/** What is carried besides what is loaded: the rifle's reserve, the belt; −1 where that means nothing. */
export const reserveOf = (a: Arsenal, w: WeaponId = a.current): number =>
  w === 'sniper' ? a.sniperReserve : w === 'minigun' ? a.minigunBelt : -1

/**
 * How far through a reload the weapon in hand is, 0 … 1, or 0 when it is not
 * reloading (#84: the HUD draws it as a ring and a bar, the mech as a pose).
 */
export const reloadProgress = (a: Arsenal): number => {
  if (a.current === 'sniper') return a.reloading > 0 ? 1 - a.reloading / SNIPER_RELOAD_S : 0
  if (a.current === 'rocket') return !a.rocketLoaded && a.rocketReload > 0 ? 1 - a.rocketReload / ROCKET_RELOAD_S : 0
  return 0
}

/** Can the weapon in hand fire at all (now or after its timers)? */
export const isDry = (a: Arsenal, w: WeaponId = a.current): boolean =>
  w === 'rocket' ? !a.rocketLoaded && a.rockets === 0 && a.rocketReload <= 0
    : w === 'sniper' ? a.sniperMag === 0 && a.sniperReserve === 0 && a.reloading <= 0
      : a.minigunBelt <= 0

/**
 * Running low (#145, the limits of #126's spoken warning): the rifle with 3
 * rounds or fewer in all, the launcher with its last rocket, the belt at a
 * fifth. Low is not dry: the HUD shows the two apart.
 */
export const isLow = (a: Arsenal, w: WeaponId = a.current): boolean =>
  w === 'sniper' ? a.sniperMag + a.sniperReserve <= 3
    : w === 'rocket' ? a.rockets + (a.rocketLoaded ? 1 : 0) <= 1
      : a.minigunBelt <= a.minigunBeltMax * 0.2

const draw = (a: Arsenal, w: WeaponId): void => {
  if (w === a.current) return
  a.current = w
  a.switching = SWITCH_S
  a.owed = 0
  // A reload does not carry on in the holster.
  if (a.reloading > 0) a.reloading = SNIPER_RELOAD_S
}

/**
 * Advance the weapons by one step. Returns how many rounds leave the barrel
 * of the current weapon in it (0 almost always, 1 when it fires).
 */
export const stepArsenal = (a: Arsenal, t: Trigger, dt: number): number => {
  if (t.select) draw(a, t.select)
  else if (t.cycle) draw(a, nextWeapon(a.current))

  a.recoil = Math.max(0, a.recoil - dt * 5)
  a.bolt = Math.max(0, a.bolt - dt)
  const drawn = a.switching <= 0
  a.switching = Math.max(0, a.switching - dt)

  // The sniper's magazine: reload from the reserve when asked, or when it
  // runs dry; with nothing in reserve there is nothing to reload.
  if (a.reloading > 0) {
    if (a.current === 'sniper') {
      a.reloading -= dt
      if (a.reloading <= 0) {
        a.reloading = 0
        const n = Math.min(SNIPER_MAG - a.sniperMag, a.sniperReserve)
        a.sniperMag += n
        a.sniperReserve -= n
      }
    }
  } else if (a.current === 'sniper' && a.sniperReserve > 0 && (a.sniperMag === 0 || (t.reload && a.sniperMag < SNIPER_MAG))) {
    a.reloading = SNIPER_RELOAD_S
  }

  // The launcher reloads itself whatever is in hand: it is a tube on the arm.
  if (!a.rocketLoaded && a.rockets > 0) {
    if (a.rocketReload <= 0) a.rocketReload = ROCKET_RELOAD_S
    a.rocketReload -= dt
    if (a.rocketReload <= 0) { a.rocketReload = 0; a.rocketLoaded = true; a.rockets-- }
  }

  // The minigun: spool, heat.
  // The Shoot button (fireHeld) works on touch too, beside the hold-and-release aim.
  const hold = a.current === 'minigun' && drawn && (t.fireHeld || t.aimHeld)
  a.spool = Math.min(1, Math.max(0, a.spool + (hold ? dt / MINIGUN_SPOOL_S : -dt / 0.8)))
  a.spin += a.spool * 34 * dt
  const firing = a.current === 'minigun' && drawn && a.spool >= 1 && !a.overheated && a.minigunBelt > 0 && (t.fireHeld || (t.touch && t.aimHeld)) && t.ready !== false
  if (firing) {
    a.heat = Math.min(1, a.heat + dt / a.heatSeconds)
    if (a.heat >= 1) a.overheated = true
  } else {
    a.heat = Math.max(0, a.heat - a.coolRate * dt)
    if (a.overheated && a.heat <= MINIGUN_RESUME_AT) a.overheated = false
  }

  if (!drawn) return 0
  const pull = t.firePressed || (t.touch && t.aimReleased)
  switch (a.current) {
    case 'sniper':
      if (!pull || a.sniperMag <= 0 || a.bolt > 0 || a.reloading > 0) return 0
      a.sniperMag--
      a.bolt = SNIPER_BOLT_S
      a.recoil = 1
      return 1
    case 'rocket':
      if (!pull || !a.rocketLoaded) return 0
      a.rocketLoaded = false
      a.recoil = 1
      return 1
    case 'minigun': {
      if (!firing) { a.owed = 0; return 0 }
      a.owed += MINIGUN_RPS * dt
      const n = Math.min(a.minigunBelt, Math.floor(a.owed))
      a.owed -= Math.floor(a.owed)
      a.minigunBelt -= n
      if (n > 0) a.recoil = Math.min(1, a.recoil + 0.5)
      return n
    }
  }
}
