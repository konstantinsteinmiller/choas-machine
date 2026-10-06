import type { Zone } from './hitscan'
import { makeRagdoll, ragdollAt, stepRagdoll, strike, type Ragdoll } from './ragdoll'
import { VOID, canStep, findPath, hasLineOfSight, heightAt, smoothPath, toCell, walkLine, type Grid } from '../world/grid'
import type { Fortress, PostKind, Waypoint } from '../world/fortress'
import { exposure, type Viewer, type Seen, fillRate, GRACE_S, CLOSE_M } from './perception'
import { makeAlert, raiseAlert, pressAlert, stepAlert, ENGAGED_PER_S, BEACON_CAP, ALERT_MAX, type Alert, type AlertCause } from './alert'
import { angleDelta } from './player'
import { hashSeed, mulberry32, type Rng } from '../world/rng'
import { guardGaitRate } from './gait'

/**
 * ─── The garrison ────────────────────────────────────────────────────────────
 *
 * Everyone who defends the base, as plain data and one step function. Pure:
 * no renderer, no DOM, so a test can run a whole infiltration in memory.
 *
 * A guard walks its route. When it half-sees the mech its detection meter
 * fills; past a threshold it is SUSPICIOUS and walks over to look, and when
 * the meter is full it has SPOTTED the mech: the base's alert jumps, and keeps
 * climbing for as long as that guard still has eyes on it. Break the line of
 * sight (or silence the witness) and it searches, then goes back to its
 * route. A body in view does the same as a glimpse, once per body.
 *
 * Drones do not look along a cone but down: a searchlight on the ground,
 * ahead of the drone, that the player can see and step round.
 *
 * Enforcers and the Goliath stand dormant here; the alarm wakes them
 * (`chaos.ts`).
 */

/** `dormant`: a machine powered down. `reserve`: not in the base yet. */
export type UnitState = 'patrol' | 'suspicious' | 'search' | 'combat' | 'dormant' | 'reserve' | 'dead'

interface Spec {
  /** Sight range (metres) and half-angle of the cone (radians). */
  range: number
  half: number
  /** Eye height above the feet. */
  eye: number
  /** Top of the silhouette above the feet. */
  height: number
  radius: number
  walk: number
  /** Speed when walking over to look, and when running to a fight. */
  look: number
  run: number
  hp: number
}

const HUMAN = { eye: 1.5, height: 1.72, radius: 0.35, walk: 1.5, look: 2.3, run: 3.9 }
export const SPECS: Readonly<Record<PostKind, Spec>> = {
  // A guard sees a 110° cone, some 22 m deep (plan G4).
  guard: { ...HUMAN, range: 22, half: 0.96, hp: 30 },
  // A sentry watches one way, far and narrow: the thing a sniper deals with first.
  sentry: { ...HUMAN, range: 30, half: 0.55, hp: 30 },
  // The Warden: armoured. A sniper headshot takes about a third of him.
  commander: { ...HUMAN, range: 20, half: 0.96, hp: 180 },
  drone: { eye: 0, height: 0.5, radius: 0.45, walk: 2.6, look: 1.2, run: 3.6, range: 0, half: 0, hp: 20 },
  // A lamp on a mast. The speeds are its BEAM's, across the ground.
  searchlight: { eye: 0, height: 0.6, radius: 0.5, walk: 3.4, look: 5, run: 8, range: 0, half: 0, hp: 20 },
  enforcer: { eye: 2.9, height: 3.3, radius: 0.95, walk: 2.0, look: 2.0, run: 2.6, range: 30, half: 1.0, hp: 600 },
  goliath: { eye: 2.6, height: 3.0, radius: 2.6, walk: 1.4, look: 1.4, run: 1.8, range: 40, half: 1.2, hp: 3000 },
  // The Scrap Hound: short sight, a wide cone, fast, fragile; its nose is the thing.
  hound: { eye: 0.8, height: 1.05, radius: 0.45, walk: 2.0, look: 3.6, run: 6.4, range: 15, half: 1.3, hp: 18 },
  // A Roomba (#72): knee-high, quick, sees low: walls and crates hide the mech well from it.
  roomba: { eye: 0.55, height: 0.7, radius: 0.6, walk: 2.2, look: 2.8, run: 5.2, range: 16, half: 1.15, hp: 24 }
}

/** A marksman's eyes reach this much further than a sentry's (#90). */
const MARKSMAN_SIGHT = 1.6

/** The drone's searchlight: this far ahead of it on the ground, this wide. */
export const SPOT_AHEAD = 3
export const SPOT_RADIUS = 4.5
/** Seconds a fully lit, standing mech has before a drone is sure of it. */
const SPOT_NOTICE_S = 0.9

/**
 * The meter (round 3, after Odyssey): white below SUSPECT_AT, yellow from
 * it (the unit goes to look) to 1, red at 1 (combat). See `perception.ts`.
 */
export const SUSPECT_AT = 0.5
/** A white meter drains this fast once the mech is out of sight (after a beat); a yellow one only back to the line. */
const DECAY_PER_S = 0.22
const DECAY_WARY_PER_S = 0.08
const DECAY_AFTER_S = 0.8
/** A unit already looking for something notices faster. */
const WARY_GAIN = 1.6

/** The Foreman is an Enforcer this much tougher. */
const FOREMAN_HP = 1.6

/** How far a body can be told for what it is, and how long a look takes. */
const BODY_RANGE = 18
/**
 * The missed check-in: this long after a defender goes down (plus up to
 * CHECKIN_JITTER_S, by its seed), its radio has been quiet too long and the
 * nearest walking patrol goes to see what became of it.
 */
export const CHECKIN_S = 28
export const CHECKIN_JITTER_S = 12
/**
 * The hide box. A box standing still is a box; nobody gives it a second look
 * from further than BOX_BUMP. A box that creeps is odd: a watcher sees a
 * little of it and can get as far as suspicious, never sure, until it walks
 * up close.
 */
export const BOX_BUMP = 2.4
/** Seconds a box must be seen creeping before a guard goes to poke it. */
export const POKE_AFTER_S = 0.7
const BOX_CREEP_SEEN = 0.35
const BOX_CREEP_CAP = 0.85
const BODY_NOTICE_S = 0.5
const BODY_HEIGHT = 0.45

/** What a second (third …) witness adds to the alert. */
const SECOND_WITNESS = 8

/** A drone that has lost the mech this long goes back to its sweep. */
const DRONE_LOST_S = 4

const TURN_RATE = 5.5
/** The Goliath's hull turns this slowly, its turret this fast (rad/s). */
export const GOLIATH_HULL_TURN = 0.55
export const GOLIATH_TURRET_TURN = 1.3
/** Seconds of full alert at which each reinforcement wave arrives, and its size. */
export const WAVE_AT_S: readonly number[] = [8, 24, 42]
export const WAVE_SIZE = 2
/** A machine takes this long to power up. */
export const WAKE_S = 1.6
const HUH_S = 0.9
const SCAN_S = 8
const SCAN_LURED_S = 6
const HUNT_SCAN_S = 5
/** Guards hunting the shared last known position re-route this often when it moves. */
const HUNT_REPATH_S = 1.5
/** A guard in a fight stops closing in once it is this near. */
const ENGAGE_DIST = 11

/**
 * How hard a threat level makes the garrison (plan 10.3): tougher, harder
 * hitting, quicker to notice. Level I is gentler than the baseline, for a
 * player's first night.
 */
export interface Threat {
  hp: number
  damage: number
  notice: number
  /** The threat level it is, I … V. */
  level: number
}
const THREATS: readonly Threat[] = [
  { hp: 1, damage: 0.75, notice: 0.8, level: 1 },
  { hp: 1, damage: 1, notice: 1, level: 2 },
  { hp: 1.15, damage: 1.1, notice: 1, level: 3 },
  { hp: 1.3, damage: 1.25, notice: 1.1, level: 4 },
  { hp: 1.6, damage: 1.5, notice: 1.25, level: 5 }
]
export const threatOf = (level: number): Threat => THREATS[Math.min(THREATS.length, Math.max(1, Math.round(level))) - 1]!

export interface Unit {
  id: number
  kind: PostKind
  x: number
  /** Feet (walkers) or body (drones). */
  y: number
  z: number
  px: number
  py: number
  pz: number
  /** Body heading; `look` is the head's turn on top of it. Sight follows both. */
  yaw: number
  pyaw: number
  look: number
  state: UnitState
  /** Seconds in the current state. */
  t: number
  /** Detection meter, 0 … 1. */
  detect: number
  /** It has the mech in view this step; for how long without a break; and how long since it last did. */
  sees: boolean
  seenFor: number
  unseenFor: number
  /** Where it last saw (or heard of) something worth a look. */
  seenX: number
  seenZ: number
  /** Walking over because of a decoy: not a worry for the base. */
  lured: boolean
  route: Waypoint[]
  /** Route stop it is heading for. */
  wp: number
  wait: number
  path: Array<{ x: number; z: number }>
  pathI: number
  /** Seconds until the next re-route while hunting. */
  repath: number
  bodyT: number
  hp: number
  /** Seconds since it died; the fall plays out over the first of them. */
  deadT: number
  /** 1 fell forward, −1 backward. */
  fallDir: number
  /** How long it stands over this suspicion before it moves: a double-take, or two seconds of wondering. */
  huh: number
  /** The noise it is wondering about (`wonderAt`), or 0. */
  noise: number
  /** Seized by the mech: it does nothing until it is let go or killed. */
  gripped: boolean
  /** Dead, and held up for this long before its fall may begin (the blade). */
  hold: number
  /**
   * In the mech's hands (a backstab, a drop from a rope): how it is held,
   * written by the mission each step for the view to pose. Null otherwise.
   */
  held: { grip: number; arch: number; limp: number; kneel: number } | null
  /** How it went down: the view plays this, and a wreck in pieces lies where it burst. */
  death: DeathKind
  /** The way the blow pushed it (a unit vector on the ground). */
  hitX: number
  hitZ: number
  /** A body, and somebody has already raised the alarm over it. */
  found: boolean
  /** It has shouted once already; the beacon it is running to (−1 none). */
  shouted: boolean
  /** Back on its round after a hunt: it looks wider and further for the rest of the raid. */
  wary: boolean
  /** It has been in a fight since it last walked its round: losing the mech, it hunts. */
  fought: boolean
  /** Seconds to the next search point. */
  hop: number
  runner: number
  /** A boss (`Post.boss`), and its health at full; the Warden's shield. */
  boss: 'warden' | 'foreman' | 'goliath' | null
  /** Only a blast hurts it (#146); a training target that never wakes. */
  armoured: boolean
  dummy: boolean
  maxHp: number
  shield: boolean
  /** When its missed check-in sends somebody to look (garrison time); and whether it has. */
  checkAt: number
  checked: boolean
  stride: number
  speed01: number
  homeX: number
  homeZ: number
  homeYaw: number
  altitude: number
  /** A searchlight: where its beam is on the ground right now. */
  spotX: number
  spotZ: number
  /** Its own phase for idle sweeps, so no two guards move in step. */
  seed: number
  /** Machines: 0 powered down … 1 awake. Always 1 for the living. */
  power: number
  /** Seconds until it may start its next burst (or shell). */
  fireT: number
  /** Seconds it has had the mech in its sights this time (suppressing fire first). */
  aimT: number
  /** Rounds left in the burst it is firing, and seconds to the next one. */
  burst: number
  burstT: number
  /** The Goliath: seconds until the shell it has called lands, and where. */
  shellT: number
  shellX: number
  shellZ: number
  /** The shell in the air was called onto a decoy (only that can bring it down on the tank itself, #72). */
  shellLure: boolean
  /** 0 … 1 kick of its last shot, for the pose. */
  recoil: number
  /** Tagged through the scope: its round is drawn and its mark shows through walls. */
  tagged: boolean
  /** A body tucked into a container: nobody will find it. */
  hidden: boolean
  /** The guard it chats with (−1 none), and whether they are talking right now. */
  partner: number
  chatting: boolean
  /** It saw a box move and is going over to poke it. */
  poke: boolean
  /** Seconds it has been looking at something out of place. */
  changeT: number
  /** The Engineer's role; the thing it is going to fix, and how long it has worked at it. */
  role: 'engineer' | 'grenadier' | 'marksman' | null
  /** A Roomba with the shotgun (#72). */
  shotgun: boolean
  /** A grenadier's wait to its next throw (#90). */
  grenadeT: number
  job: { kind: 'beacon' | 'light'; i: number } | null
  jobT: number
  /** The freshest scent it has followed (garrison time). */
  scentT: number
  /** A fallen person's ragdoll (#64), how it was killed, and whether the blow has pushed it yet. */
  rag: Ragdoll | null
  ragHow: KillHow
  /** Seconds it has left on fire (#148), 0 when it is not burning. */
  onFire: number
  ragStruck: boolean
  /** The body has hit the ground, and been heard doing it (#108). */
  thud: boolean
  /** Wears a helmet (R26): the first round to the head takes it off instead. */
  helmet: boolean
  /** Seconds it has looked at a box that keeps too still (a box checker). */
  boxLook: number
  /**
   * A still disguise it walked close to (#111): it goes up to it, stares at
   * it puzzled, backs off, raises its gun and fires one test round; nothing
   * moving, it shrugs and walks on. Null when it is not at it.
   */
  inspect: { phase: 'approach' | 'stare' | 'back' | 'shot'; t: number } | null
  /** Seconds before it gives a disguise another look. */
  inspectCool: number
  /** The Foreman: its servo jammed on its pad (slow to wake, slow to turn, soft at the joints). */
  jammed: boolean
  /** The Goliath: shells since it last cooled, and seconds of overheat left (its vents open). */
  shells: number
  overheat: number
  /** The Warden: past half health (shield dropped, blade drawn); the glint before a dash, the dash, its target and cooldown. */
  phase2: boolean
  glintT: number
  dashT: number
  dashX: number
  dashZ: number
  dashCool: number
  dashHit: boolean
  /** Focused (#68): seconds left of sharper eyes after a shot, an impact or a near miss nearby. */
  focusT: number
  /** Searching the ground round a body it found (or was called to) for a minute (#98). */
  bodySearch: boolean
  /** A machine that is sure of the mech: seconds into its uplink to the base (#73), 0 when none. */
  uplinkT: number
  /** A fighter with nothing in view: seconds since it last saw the mech (the Goliath's patience, #89). */
  lostT: number
}

export interface Garrison {
  units: Unit[]
  alert: Alert
  time: number
  /** What happened since the mission last drained it (`drainEvents`). */
  events: GarrisonEvent[]
  /** Hit rolls; seeded per fortress, so a test replays the same fight. */
  rng: Rng
  /** Reinforcement waves sent so far, and seconds of full alert. */
  wave: number
  chaosT: number
  /** Decoys standing in the base (the mission's list): the Goliath shoots at
   *  the nearest one it can see in preference to the mech. */
  lures: ReadonlyArray<{ x: number; y: number; z: number }>
  threat: Threat
  /** Counts noises, so each has a token of its own (`wonderAt`). */
  noiseSeq: number
  /** Where the mech was last seen by anyone, and when (garrison time): the base shares it. */
  lkp: { x: number; y: number; z: number; t: number }
  /**
   * Where the last shots came from, roughly, and how many from about there
   * (#70): each one from the same spot narrows the guess, the third is exact.
   */
  shotSpot: { x: number; z: number; n: number; t: number }
  /** Bodies found this raid; at two the base is heightened (#98). */
  bodiesFound: number
  /** Heightened for the rest of the raid: everyone a little warier (#98, #89). */
  heightened: boolean
  /** Who may fire this moment (#92): the attention budget, re-dealt twice a second. */
  shooters: Set<number>
  tokenT: number
  /** The guard who shouted first in this fight: the front of the ring (#86, #92), −1 none. */
  leader: number
  /** The alarm beacons, the unit running to light one (−1 none), and the wait before another tries. */
  beacons: Beacon[]
  runner: number
  runnerWait: number
  /**
   * After a stand-down (#134): the base thinks the intruder is gone. While
   * this runs down, nobody runs to light a beacon unless somebody is fighting
   * the mech again.
   */
  calmT: number
  /** When the base last went to full alert: the cool-down counts from it or the last sighting, whichever is later. */
  chaosAt: number
  /** Things out of place a guard on its round will notice: a pile stripped, a light out. */
  changes: Change[]
  /** The mech's trail for the hounds' noses: where it walked, and when. */
  scent: Array<{ x: number; z: number; t: number }>
  scentT: number
  /** Jobs an Engineer has given up on (somewhere it cannot walk to). */
  unreachable: Set<string>
  /** The training ground: no alarm, no check-ins, no voices; a hit dummy stays a dummy. */
  drill: boolean
  /** What the mech can sabotage besides beacons: the Warden's generator, the Foreman's servo. */
  rigs: Rig[]
  /** The base has learned the box (R26): a box that sits too still in plain view gets a look, and a poke. */
  boxCheck: boolean
}

export interface Rig {
  kind: 'generator' | 'servo'
  x: number
  y: number
  z: number
  /** The servo's machine. */
  unit: number
  cut: boolean
}

/** Something out of place: a guard who sees it goes to look (yellow), but does not raise the base. */
export interface Change {
  x: number
  y: number
  z: number
  kind: 'pile' | 'light' | 'rope' | 'fire'
  found: boolean
}

/** How far a guard notices something out of place, and how long it must look. */
export const CHANGE_RANGE = 18
export const CHANGE_NOTICE_S = 1.2
/** A chatting pair sees this much of its usual range, over this much of its cone. */
export const CHAT_SIGHT = 0.55
export const CHAT_CONE = 0.7
/** The hound's nose: scent this fresh, this near, is followed; bodies and piles are smelt this far. */
export const SCENT_S = 25
export const SCENT_M = 4
export const SCENT_EVERY_S = 0.5
export const HOUND_NOSE = 10
/** A hound hears this much further than a guard. */
export const HOUND_EARS = 1.6
/** The Engineer: how long a repair takes, and how near it must stand. */
export const REPAIR_S = 4
export const REPAIR_REACH = 2.6
/** Crouched in a thicket, the mech is seen only nearer than this. */
export const BRUSH_SEEN_M = 2.6
/** The Warden's dash (R25): the glint before it, its speed and length, the blow, the wait between. */
export const GLINT_S = 0.7
export const DASH_SPEED = 10
export const DASH_S = 1.1
export const DASH_HIT_M = 1.7
export const DASH_DAMAGE = 28
export const DASH_EVERY_S = 4.5
/** A jammed Foreman wakes this much slower, and moves and turns at this share. */
export const JAM_WAKE = 2.5
export const JAM_SLOW = 0.4

/**
 * The disguise (#111): a still one is never seen for what it is; a defender
 * that comes within INSPECT_M (BOX_CHECK_M once the base has learned the box)
 * and sees it walks up to INSPECT_STAND, stares INSPECT_STARE_S puzzled, backs
 * off INSPECT_BACK m, fires one test round (INSPECT_DAMAGE) and walks on, not
 * looking again for INSPECT_COOL_S. A disguise that MOVES in sight of anyone
 * is an intruder at once.
 */
export const INSPECT_M = 4.5
export const INSPECT_STAND = 2.2
export const INSPECT_STARE_S = 5
const INSPECT_BACK = 1.6
const INSPECT_BACK_S = 1.1
export const INSPECT_DAMAGE = 12
const INSPECT_COOL_S = 30
/** A box checker looks this long at a still box this near before it pokes it. */
export const BOX_CHECK_M = 9
export const BOX_CHECK_S = 2.5

/**
 * A round to the head of a guard in a helmet: the helmet flies off, and the
 * round goes through all the same (#77: one headshot always drops a guard).
 * True if a helmet came off.
 */
export const helmetPops = (u: Unit, zone: Zone): boolean => {
  if (zone !== 'head' || !u.helmet) return false
  u.helmet = false
  return true
}

/** Cut a generator or jam a servo. True if it was one that still worked. */
export const cutRig = (gar: Garrison, i: number): boolean => {
  const r = gar.rigs[i]
  if (!r || r.cut) return false
  r.cut = true
  if (r.kind === 'generator') {
    // No power: the Warden's shield is just a plate of dead glass now.
    for (const u of gar.units) {
      if (u.boss !== 'warden' || !u.shield) continue
      u.shield = false
      gar.events.push({ type: 'shieldDown', id: u.id })
    }
  } else {
    const u = gar.units[r.unit]
    if (u) u.jammed = true
  }
  return true
}

/** A sentry calls the alarm this much further than a guard shouts. */
export const SENTRY_CALL = 2
/** Guards closing on the mech spread out this far either side (flanking in pairs). */
export const FLANK_M = 6

/** Something out of place for the guards to notice (the mission reports it). */
export const noteChange = (gar: Garrison, x: number, y: number, z: number, kind: Change['kind']): void => {
  gar.changes.push({ x, y, z, kind, found: false })
}

/**
 * The hound's nose. On the mech's trail it walks to the freshest scent near
 * it, and so along the trail toward the mech. A body or a stripped pile
 * within its nose it smells through anything, and barks the guards over.
 */
const sniff = (gar: Garrison, g: Grid, u: Unit, target: Target): void => {
  // A body, or something out of place: found, and barked about.
  for (const c of gar.units) {
    if (c.state !== 'dead' || c.found || c.hidden || isLight(c) || c.kind === 'hound' || c.deadT < c.hold + 0.6) continue
    if (Math.hypot(c.x - u.x, c.z - u.z) > HOUND_NOSE) continue
    c.found = true
    gar.events.push({ type: 'body', id: u.id, corpse: c.id })
    bark(gar, u, c.x, c.z)
    raise(gar, 'body', target)
    fillPost(gar, c)
    return
  }
  for (const c of gar.changes) {
    if (c.found || Math.hypot(c.x - u.x, c.z - u.z) > HOUND_NOSE) continue
    c.found = true
    gar.events.push({ type: 'change', id: u.id, kind: c.kind })
    bark(gar, u, c.x, c.z)
    return
  }
  // The trail: a scent fresher than any it has followed, near enough to smell.
  if (u.state === 'search' && u.t < 0.5) return
  let best: { x: number; z: number; t: number } | null = null
  for (const p of gar.scent) {
    if (gar.time - p.t > SCENT_S || p.t <= u.scentT) continue
    if (Math.hypot(p.x - u.x, p.z - u.z) > (best ? SCENT_M * 2.5 : SCENT_M)) continue
    if (!best || p.t > best.t) best = p
  }
  if (!best) return
  u.scentT = best.t
  u.detect = Math.max(u.detect, SUSPECT_AT + 0.02)
  suspect(gar, u, best.x, best.z, false)
  u.huh = 0.2
}

/** The hound barks: the guards round it go to where it is pointing. */
const bark = (gar: Garrison, u: Unit, x: number, z: number): void => {
  gar.events.push({ type: 'bark', id: u.id })
  u.detect = Math.max(u.detect, SUSPECT_AT + 0.05)
  suspect(gar, u, x, z, false)
  for (const o of gar.units) {
    if (o === u || !isAlive(o) || o.state === 'combat' || o.state === 'dormant' || isLight(o) || o.kind === 'goliath' || o.kind === 'hound') continue
    if (Math.hypot(o.x - u.x, o.z - u.z) > SHOUT_M) continue
    o.detect = Math.max(o.detect, SUSPECT_AT + 0.05)
    suspect(gar, o, x, z, false)
  }
}

/** The nearest thing an Engineer can fix: a beacon put out of action, a light shot out. */
const findJob = (gar: Garrison, u: Unit): Unit['job'] => {
  let best: Unit['job'] = null
  let bestD = Infinity
  gar.beacons.forEach((b, i) => {
    if (b.state !== 'sabotaged' || gar.unreachable.has(`b${i}`)) return
    const d = Math.hypot(b.x - u.x, b.z - u.z)
    if (d < bestD) { bestD = d; best = { kind: 'beacon', i } }
  })
  for (const o of gar.units) {
    if (o.kind !== 'searchlight' || o.state !== 'dead' || gar.unreachable.has(`l${o.id}`)) continue
    const d = Math.hypot(o.x - u.x, o.z - u.z)
    if (d < bestD) { bestD = d; best = { kind: 'light', i: o.id } }
  }
  return best
}

/** Walk to the job and work at it; done, the thing works again. */
const repair = (u: Unit, g: Grid, gar: Garrison, dt: number): void => {
  const j = u.job!
  const b = j.kind === 'beacon' ? gar.beacons[j.i] : undefined
  const l = j.kind === 'light' ? gar.units[j.i] : undefined
  const at = b ?? l
  // Somebody else fixed it, or it is gone.
  if (!at || (b && b.state !== 'sabotaged') || (l && l.state !== 'dead')) { u.job = null; u.jobT = 0; u.path = []; return }
  const d = Math.hypot(at.x - u.x, at.z - u.z)
  if (d > REPAIR_REACH) {
    if (u.path.length === 0 && !goTo(u, g, at.x, at.z)) {
      // It cannot walk there: some other job, or its round.
      gar.unreachable.add(j.kind === 'beacon' ? `b${j.i}` : `l${j.i}`)
      u.job = null
      return
    }
    if (follow(u, g, SPECS[u.kind].look, dt)) u.path = []
    return
  }
  u.path = []
  stand(u)
  turnToward(u, headingTo(u.x, u.z, at.x, at.z), dt)
  u.look = Math.sin(u.t * 6) * 0.15
  u.jobT += dt
  if (u.jobT < REPAIR_S) return
  u.jobT = 0
  u.job = null
  if (b) { b.state = 'ready'; b.lit = 0 }
  if (l) {
    l.state = 'patrol'
    l.hp = l.maxHp
    l.deadT = 0
    l.found = false
    l.t = 0
    gar.changes = gar.changes.filter(c => !(c.kind === 'light' && Math.hypot(c.x - spotCentre(l).x, c.z - spotCentre(l).z) < 6))
  }
  gar.events.push({ type: 'repair', id: u.id, kind: j.kind, i: j.i })
}

/**
 * A guard who stood a post was found dead: the nearest guard walking a round
 * takes the post over (nobody walks that round now).
 */
const fillPost = (gar: Garrison, c: Unit): void => {
  if (c.route.length > 1 || (c.kind !== 'guard' && c.kind !== 'sentry') || c.boss) return
  let best: Unit | null = null
  let bestD = Infinity
  for (const o of gar.units) {
    if (o.kind !== 'guard' || !isAlive(o) || o.route.length < 2 || o.partner >= 0 || o.role || o.state === 'combat') continue
    const d = Math.hypot(o.x - c.homeX, o.z - c.homeZ)
    if (d < bestD) { bestD = d; best = o }
  }
  if (!best) return
  best.route = []
  best.homeX = c.homeX
  best.homeZ = c.homeZ
  best.homeYaw = c.homeYaw
  best.path = []
}

/** Hold the scope on a unit: tag it. */
export const tagUnit = (gar: Garrison, id: number): boolean => {
  const u = gar.units[id]
  if (!u || u.tagged || !isAlive(u)) return false
  u.tagged = true
  return true
}

/** An alarm beacon: ready, being lit (0 … 1), lit, or put out of action by the mech. */
export interface Beacon {
  x: number
  y: number
  z: number
  state: 'ready' | 'lighting' | 'lit' | 'sabotaged'
  lit: number
}

/**
 * Losing them (round 3, after Odyssey; #134): guards that lost sight go to the
 * last known position the base shares, spread round it and search it for
 * this long, walking a new point every SEARCH_HOP_S, then go back to their
 * rounds warier (wider and further sight). With nobody having seen the mech
 * for CHAOS_COOL_S (and nothing it did heard: a kill, a shot, a blast keeps
 * the hunt hot), or with every ringing beacon silenced, a full alert stands
 * down: lit beacons go out, the meter falls back to ALERT_AFTER of full, and
 * the fighters search the last known position, cautious, for SEARCH_HOT_S
 * before they go back to their rounds. Nobody is told where the mech is now.
 */
export const SEARCH_HOT_S = 30
const SEARCH_HOP_S = 6
const SEARCH_SPREAD = 7
export const CHAOS_COOL_S = 20
/**
 * A machine that is sure of the mech uplinks to the base (#73): a ring fills
 * over it for UPLINK_S while it keeps the mech in view (it drains, twice as
 * fast, while it does not). Full, the base's alarm sounds without a beacon,
 * and the guards run to the beacons to bring the reinforcements.
 */
export const UPLINK_S = 3
/** The attention budget (#92): at most this many fire at once, by threat level (I … V). */
export const FIRE_TOKENS: readonly number[] = [2, 2, 3, 3, 4]
const TOKEN_EVERY_S = 0.5
/** The Goliath, out of sight of the mech this long, gives up the fight (#89). */
const GOLIATH_LOST_S = 8
/** And rolls this far at most to a spot with a clear line on where it was last reported (#71). */
const GOLIATH_ROLL_M = 12
/**
 * The Goliath shells nothing nearer than this (#72): a mech on a wall right
 * over it is out of its reach, so it rolls back until it has the room.
 */
export const GOLIATH_MIN_M = 10
const ALERT_AFTER = 0.6
/** On alert patrol, sight is this much wider and further. */
export const WARY_CONE = 1.25
export const WARY_RANGE = 1.15
/** In a fight, sight reaches this much further, and at least this far (#70: a sniper far off is still seen by those hunting it). */
export const COMBAT_RANGE = 2.5
export const COMBAT_SIGHT_M = 110
/**
 * Focus (#68): a shot heard, an impact this near or a round this near its
 * head puts a defender on edge for FOCUS_S: it looks toward where the shot
 * came from and sees FOCUS_RANGE times as far, over a wide cone.
 */
export const FOCUS_S = 20
export const FOCUS_RANGE = 3
const FOCUS_HALF = 1.31
export const IMPACT_M = 6
/** A defender that heard a round brings those this near it into the search (#110). */
export const SHOT_NOTIFY_M = 6
export const NEAR_MISS_M = 3
/**
 * Where a shot came from (#70): the guess is off by a share of the distance
 * (between SHOT_ERR_MIN and SHOT_ERR_MAX metres), halved by a second shot
 * from within SHOT_SPOT_M of the first, exact from the third.
 */
const SHOT_ERR_SHARE = 0.22
const SHOT_ERR_MIN = 2
const SHOT_ERR_MAX = 22
const SHOT_SPOT_M = 15
const SHOT_SPOT_S = 60
/** A body found (#98): the finder calls this many guards from this near, and they search round it this long. */
export const BODY_CALL_M = 30
const BODY_CALL_N = 2
export const BODY_SEARCH_S = 60
const BODY_SPREAD = 10
/** Heightened (#98): two bodies found and everyone sees this much further. */
const HEIGHTENED_RANGE = 1.1
/** A hunter looks for a high point (the mech up a wall or a tower) from a spot that can see it, this far out. */
const VANTAGE_MIN_M = 7
const VANTAGE_MAX_M = 18

/** A sure guard shouts: everyone this near joins the fight. */
export const SHOUT_M = 16
/** A drone or a light that is sure calls the nearest guard within this. */
const PING_M = 40
/** Seconds at the beacon to light it; within this of it, it can be lit. */
export const BEACON_LIGHT_S = 2.5
const BEACON_REACH = 1.6
/** After a runner is stopped, this long before another tries. */
export const RUNNER_RETRY_S = 3.5

/** What the garrison is looking for: the mech. */
export interface Target {
  x: number
  /** Feet. */
  y: number
  z: number
  /** Top of its silhouette above its feet. */
  height: number
  crouched: boolean
  /** False while it cannot be seen at all (the drop-in, the extraction). */
  visible: boolean
  /** 0 standing still … 1 at a run: a moving mech is harder to hit. */
  moving?: number
  /** In shadow: harder to make out (`perception.ts` SHADOW_SLOW). */
  shadow?: boolean
  /** Under the hide box, standing still or creeping. */
  box?: 'still' | 'creep'
  /** Crouched in a thicket: not seen at all beyond BRUSH_SEEN_M. */
  brush?: boolean
}

/**
 * How a defender goes down.
 * People: `back`, `front`, `spin` (a burst turned it round), `thrown` (a blast).
 * Machines: `burst`, always (#139): it comes apart into the parts it was
 * built from (`fx/shatter.ts`), which stay where they fall. `slump` and
 * `crash` (a machine in one piece) are kept for old saves and replays.
 */
export type DeathKind = 'back' | 'front' | 'spin' | 'thrown' | 'burst' | 'slump' | 'crash'
/** What did it: a single round, a burst of them, an explosion, the blade. */
export type KillHow = 'shot' | 'spray' | 'blast' | 'blade'

export type GarrisonEvent =
  | { type: 'suspicious'; id: number }
  | { type: 'spotted'; id: number }
  | { type: 'calm'; id: number }
  | { type: 'body'; id: number; corpse: number }
  /** The finder of a body called `id` over to search with it (#98); the base is heightened for the raid. */
  | { type: 'called'; id: number; by: number }
  | { type: 'heightened' }
  /** A machine started its uplink to the base, lost the mech before it finished, or finished it (#73). */
  | { type: 'uplink'; id: number }
  | { type: 'uplinkLost'; id: number }
  | { type: 'uplinkDone'; id: number }
  /** A sure guard shouted; a drone called a guard; a guard runs for a beacon; a beacon was lit. */
  | { type: 'shout'; id: number }
  | { type: 'ping'; id: number; guard: number }
  | { type: 'runner'; id: number; beacon: number }
  | { type: 'alarm'; beacon: number }
  /** A full alert went cold: the base stands down (on its guard). */
  | { type: 'standDown' }
  /** The bosses: a shield gone, the Warden past half (and the glint before a dash), the Goliath overheating or hit by its own shell. */
  | { type: 'shieldDown'; id: number }
  | { type: 'phase'; id: number }
  | { type: 'glint'; id: number }
  | { type: 'overheat'; id: number }
  | { type: 'selfHit'; id: number; damage: number }
  /** A hound smelt something and barks the guards over; an Engineer fixed something. */
  | { type: 'bark'; id: number }
  | { type: 'repair'; id: number; kind: 'beacon' | 'light'; i: number }
  /** A guard saw a box move and goes to poke it; one noticed something out of place. */
  | { type: 'poke'; id: number }
  | { type: 'change'; id: number; kind: Change['kind'] }
  /** `id` noticed `corpse` missed its check-in and is going to look. */
  | { type: 'checkin'; id: number; corpse: number }
  | { type: 'kill'; id: number; death: DeathKind; burnt?: boolean }
  | { type: 'chaos' }
  /** A machine powers up. */
  | { type: 'wake'; id: number }
  /** A reinforcement wave came in: `n` guards. */
  | { type: 'wave'; n: number }
  /** A round fired at the mech: `damage` is 0 for a miss. */
  | { type: 'fire'; id: number; damage: number }
  /** The Goliath has called a shell onto a point; it lands in `dur` seconds. */
  | { type: 'telegraph'; id: number; x: number; z: number; radius: number; dur: number }
  /** The shell landed. `damage` is what the mech took from it. */
  | { type: 'shell'; id: number; x: number; y: number; z: number; damage: number }

const isHuman = (u: Unit): boolean => u.kind === 'guard' || u.kind === 'sentry' || u.kind === 'commander'
/** Sees by a light on the ground, not by eyes: a drone, a searchlight. */
export const isLight = (u: { kind: PostKind }): boolean => u.kind === 'drone' || u.kind === 'searchlight'
/** Still on its feet (or in the air) and part of the defence. */
export const isAlive = (u: Unit): boolean => u.state !== 'dead' && u.state !== 'reserve'
/** Has no idea: the state a blade needs. */
export const isUnaware = (u: Unit): boolean => u.state === 'patrol' || (u.state === 'suspicious' && u.lured)
/** Heading from a to b: 0 along +z, growing toward +x. */
export const headingTo = (ax: number, az: number, bx: number, bz: number): number => Math.atan2(bx - ax, bz - az)

export const makeGarrison = (f: Fortress, level = 2): Garrison => {
  const threat = threatOf(level)
  const units: Unit[] = f.posts.map((p, id) => {
    const ground = heightAt(f.grid, p.x, p.z)
    const y = p.kind === 'drone' || p.kind === 'searchlight' ? p.altitude : ground
    const spot = p.route[0] ?? { x: p.x + Math.sin(p.facing) * 6, z: p.z + Math.cos(p.facing) * 6 }
    const mech = p.kind === 'enforcer' || p.kind === 'goliath'
    return {
      id, kind: p.kind, x: p.x, y, z: p.z, px: p.x, py: y, pz: p.z,
      yaw: p.facing, pyaw: p.facing, look: 0,
      state: p.reserve ? 'reserve' : mech ? 'dormant' : 'patrol', t: 0, detect: 0, sees: false, seenX: p.x, seenZ: p.z, lured: false,
      route: p.route, wp: p.route.length > 1 ? 1 : 0, wait: p.route[0]?.wait ?? 0,
      path: [], pathI: 0, repath: 0, bodyT: 0, seenFor: 0, unseenFor: 9, shouted: false, runner: -1, wary: false, hop: 0, fought: false, checkAt: Infinity, checked: false, hp: p.hp ?? Math.round(SPECS[p.kind].hp * threat.hp * (p.boss === 'foreman' ? FOREMAN_HP : 1)), maxHp: p.hp ?? Math.round(SPECS[p.kind].hp * threat.hp * (p.boss === 'foreman' ? FOREMAN_HP : 1)), boss: p.boss ?? null, armoured: !!p.armoured, dummy: !!p.dummy, shield: !!p.shield, deadT: 0, fallDir: 1, huh: HUH_S, noise: 0, gripped: false, hold: 0, held: null, death: 'back', hitX: 0, hitZ: 0, found: false,
      stride: 0, speed01: 0, homeX: p.x, homeZ: p.z, homeYaw: p.facing, altitude: p.altitude,
      spotX: spot.x, spotZ: spot.z,
      seed: (id * 2.399) % (Math.PI * 2),
      power: mech && !p.dummy ? 0 : 1, aimT: 0, fireT: 0, burst: 0, burstT: 0, shellT: 0, shellX: 0, shellZ: 0, shellLure: false, recoil: 0,
      tagged: false, hidden: false, partner: p.partner ?? -1, chatting: false, poke: false, changeT: 0,
      role: p.role ?? null, shotgun: p.gun === 'shotgun', grenadeT: 0, job: null, jobT: 0, scentT: -1e9,
      rag: null, ragHow: 'shot', ragStruck: false, thud: false, onFire: 0,
      helmet: !!f.answers?.helmets && (p.kind === 'guard' || p.kind === 'sentry'), boxLook: 0, inspect: null, inspectCool: 0, focusT: 0, bodySearch: false, uplinkT: 0, lostT: 0,
      jammed: false, shells: 0, overheat: 0, phase2: false, glintT: 0, dashT: 0, dashX: 0, dashZ: 0, dashCool: 2, dashHit: false
    }
  })
  const beacons: Beacon[] = (f.beacons ?? []).map(b => ({ ...b, state: 'ready' as const, lit: 0 }))
  // The generators, and a servo on each Foreman's pad.
  const rigs: Rig[] = [
    ...(f.generators ?? []).map(gn => ({ kind: 'generator' as const, ...gn, unit: -1, cut: false })),
    ...units.filter(u => u.boss === 'foreman').map(u => ({ kind: 'servo' as const, x: u.x, y: u.y, z: u.z, unit: u.id, cut: false }))
  ]
  return { units, alert: makeAlert(), time: 0, events: [], rng: mulberry32(hashSeed(f.id)), wave: 0, chaosT: 0, lures: [], threat, noiseSeq: 0, beacons, runner: -1, runnerWait: 0, calmT: 0, chaosAt: -1e9, lkp: { x: 0, y: 0, z: 0, t: -1e9 }, shotSpot: { x: 0, z: 0, n: 0, t: -1e9 }, bodiesFound: 0, heightened: false, shooters: new Set(), tokenT: 0, leader: -1, changes: [], scent: [], scentT: 0, unreachable: new Set(), drill: false, rigs, boxCheck: !!f.answers?.boxCheck }
}

// ─── Getting about ───────────────────────────────────────────────────────────

const turnToward = (u: Unit, yaw: number, dt: number, rate = TURN_RATE): void => {
  const d = angleDelta(u.yaw, yaw)
  const step = rate * dt
  u.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step
}

/** Plan a walk to a point. False when there is no way there on foot. */
const goTo = (u: Unit, g: Grid, x: number, z: number): boolean => {
  u.path = []
  u.pathI = 0
  const cells = findPath(g, toCell(u.x), toCell(u.z), toCell(x), toCell(z))
  if (cells.length === 0) return false
  const pts = smoothPath(g, cells)
  // The unit stands somewhere in its cell, not at its middle: skip the walk
  // back to the middle when the next point is reachable from where it is.
  if (pts.length > 1 && walkLine(g, u.x, u.z, pts[1]!.x, pts[1]!.z)) pts.shift()
  // And end on the point itself, not on its cell's middle, when that works.
  const last = pts[pts.length - 1]!
  const before = pts.length > 1 ? pts[pts.length - 2]! : { x: u.x, z: u.z }
  if (walkLine(g, before.x, before.z, x, z)) { last.x = x; last.z = z }
  u.path = pts
  return true
}

/** Walk the planned path. True once there is nothing left of it. */
const follow = (u: Unit, g: Grid, speed: number, dt: number, turn = TURN_RATE): boolean => {
  const p = u.path[u.pathI]
  if (!p) { u.speed01 = 0; return true }
  const dx = p.x - u.x
  const dz = p.z - u.z
  const dist = Math.hypot(dx, dz)
  const step = speed * dt
  if (dist <= step) {
    u.x = p.x
    u.z = p.z
    u.pathI++
  } else {
    u.x += (dx / dist) * step
    u.z += (dz / dist) * step
    turnToward(u, Math.atan2(dx, dz), dt, turn)
  }
  const floor = heightAt(g, u.x, u.z)
  if (floor !== VOID) u.y += (floor - u.y) * Math.min(1, dt * 12)
  u.speed01 = Math.min(1, speed / SPECS[u.kind].run)
  // A person's stride lengthens with its pace, so its feet stay planted (#148).
  u.stride += step * (isHuman(u) ? guardGaitRate(u.speed01) : 3.4)
  return u.pathI >= u.path.length
}

const stand = (u: Unit): void => { u.speed01 = 0 }

const enter = (u: Unit, state: UnitState): void => {
  u.state = state
  u.t = 0
  // In a fight: afterwards it hunts. Back on its round, the fight is behind
  // it: it may shout (and hunt) again next time.
  if (state === 'combat') u.fought = true
  if (state === 'patrol') { u.shouted = false; u.fought = false }
}

// ─── Sight ───────────────────────────────────────────────────────────────────

/** Where a unit's eyes are and how far and wide they see right now (the drawn cone uses it too). */
export const viewerOf = (u: Unit, heightened = false): Viewer => {
  const s = SPECS[u.kind]
  const k = u.wary ? 1 : 0
  // Talking: it watches its partner, not the yard.
  const chat = u.chatting ? CHAT_SIGHT : 1
  let range = s.range * (1 + (WARY_RANGE - 1) * k) * chat * (heightened ? HEIGHTENED_RANGE : 1) * (u.role === 'marksman' ? MARKSMAN_SIGHT : 1)
  let half = s.half * (1 + (WARY_CONE - 1) * k) * (u.chatting ? CHAT_CONE : 1)
  // Focused (#68): three times as far, over a wide cone, toward the trouble.
  if (u.focusT > 0 && u.kind !== 'hound') {
    range *= FOCUS_RANGE
    half = Math.max(half, FOCUS_HALF)
  }
  // In a fight it keeps the mech in view a long way off (#59, #70).
  if (u.state === 'combat' && u.kind !== 'hound') range = Math.max(range * COMBAT_RANGE, COMBAT_SIGHT_M)
  return { x: u.x, y: u.y + s.eye, z: u.z, yaw: u.yaw + u.look, halfAngle: half, range }
}

/** Where a drone's searchlight falls. */
export const spotCentre = (u: Unit): { x: number; z: number } => (u.kind === 'searchlight'
  ? { x: u.spotX, z: u.spotZ }
  : { x: u.x + Math.sin(u.yaw) * SPOT_AHEAD, z: u.z + Math.cos(u.yaw) * SPOT_AHEAD })

/**
 * Move a light across the ground by `(dx, dz)`: a drone flies with its light,
 * a searchlight stays on its mast and swings.
 */
const moveSpot = (u: Unit, dx: number, dz: number): void => {
  if (u.kind === 'searchlight') {
    u.spotX += dx
    u.spotZ += dz
    u.yaw = headingTo(u.x, u.z, u.spotX, u.spotZ)
  } else {
    u.x += dx
    u.z += dz
  }
}

/** How much of something a unit can see: 0, 0.5 or 1. */
const sight = (u: Unit, g: Grid, t: Seen, gar: Garrison): number => {
  if (!isLight(u)) return exposure(g, viewerOf(u, gar.heightened), t)
  const c = spotCentre(u)
  if (Math.hypot(t.x - c.x, t.z - c.z) > SPOT_RADIUS) return 0
  // In the shadow of a wall or a crate that stands between the light pool
  // and the mech, it is not lit, whatever the lamp up above can see (#56).
  const floor = heightAt(g, c.x, c.z)
  if (floor > VOID && !hasLineOfSight(g, c.x, floor + 1.0, c.z, t.x, t.feetY + t.height * 0.5, t.z)) return 0
  let seen = 0
  if (hasLineOfSight(g, u.x, u.y - 0.2, u.z, t.x, t.feetY + t.height * 0.92, t.z)) seen += 0.5
  if (hasLineOfSight(g, u.x, u.y - 0.2, u.z, t.x, t.feetY + t.height * 0.5, t.z)) seen += 0.5
  return seen
}

/**
 * The missed check-in. A body nobody has found, whose radio has been quiet
 * long enough: the nearest walking patrol goes to where it lies, and the
 * body check does the rest when it gets there and sees it. Nobody left who
 * walks: nobody checks.
 */
const checkIns = (gar: Garrison): void => {
  if (gar.drill) return
  for (const c of gar.units) {
    if (c.state !== 'dead' || c.found || c.checked || gar.time < c.checkAt) continue
    c.checked = true
    let best: Unit | null = null
    let bestD = Infinity
    for (const u of gar.units) {
      if (!isAlive(u) || u.state !== 'patrol' || isLight(u) || u.kind === 'goliath' || u.gripped) continue
      const d = Math.hypot(u.x - c.x, u.z - c.z)
      if (d < bestD) { best = u; bestD = d }
    }
    if (!best) continue
    best.detect = Math.max(best.detect, SUSPECT_AT + 0.05)
    suspect(gar, best, c.x, c.z, false)
    gar.events.push({ type: 'checkin', id: best.id, corpse: c.id })
  }
}

// ─── One step ────────────────────────────────────────────────────────────────

/** The base goes to full alert: every defender still standing comes for the mech. */
const goChaos = (gar: Garrison, target: Target): void => {
  if (gar.drill) return
  gar.chaosAt = gar.time
  gar.events.push({ type: 'chaos' })
  // What the base knows: where the mech was last seen (or the noise), not
  // where it is now (#86). With nothing on record, where the noise was.
  if (gar.lkp.t < -1e8) {
    // Nothing on record: where the noise was is what the base knows.
    gar.lkp.x = target.x
    gar.lkp.y = target.y
    gar.lkp.z = target.z
    gar.lkp.t = gar.time
  }
  const x = gar.lkp.x
  const z = gar.lkp.z
  for (const u of gar.units) {
    if (!isAlive(u)) continue
    if (u.state === 'dormant') { wake(gar, u, x, z); continue }
    u.detect = 1
    u.lured = false
    u.seenX = x
    u.seenZ = z
    u.repath = 0
    u.focusT = Math.max(u.focusT, FOCUS_S)
    if (u.state !== 'combat') enter(u, 'combat')
  }
  // Somebody runs for a beacon: lit, it brings the reinforcements.
  gar.runnerWait = 0
}

/** Power a dormant machine up and point it at something. */
const wake = (gar: Garrison, u: Unit, x: number, z: number): void => {
  if (u.state !== 'dormant' || u.dummy) return
  u.detect = 1
  u.seenX = x
  u.seenZ = z
  u.fireT = 1
  enter(u, 'combat')
  gar.events.push({ type: 'wake', id: u.id })
}

/** Wake the dormant Enforcer nearest to a point (a drone's report does this). */
const wakeNearest = (gar: Garrison, x: number, z: number): void => {
  let best: Unit | null = null
  for (const u of gar.units) {
    if (u.state !== 'dormant' || u.kind !== 'enforcer') continue
    if (!best || Math.hypot(u.x - x, u.z - z) < Math.hypot(best.x - x, best.z - z)) best = u
  }
  if (best) wake(gar, best, x, z)
}

const raise = (gar: Garrison, cause: AlertCause, target: Target): void => {
  if (gar.drill) return
  if (raiseAlert(gar.alert, cause, alertCap(gar))) goChaos(gar, target)
}

/** With beacons in the base, only a lit one (or a loud noise) fills the meter. */
const alertCap = (gar: Garrison): number => (gar.beacons.length > 0 ? BEACON_CAP : ALERT_MAX)

/**
 * Searching after a fight: walk to a point near the last known position,
 * look about there, and every so often try another. Units spread by their
 * own seeds, so two searching guards do not stand on the same spot.
 */
const huntAround = (u: Unit, g: Grid, gar: Garrison, dt: number, body = false): void => {
  u.hop -= dt
  const cx = body ? u.seenX : gar.lkp.x
  const cz = body ? u.seenZ : gar.lkp.z
  if (u.hop <= 0 && (body || gar.lkp.t > -1e8)) {
    u.hop = SEARCH_HOP_S
    // Up a wall or a tower, where it cannot walk to: it looks for a spot on
    // the ground that can see up there (#70).
    if (!body && !vantage(u, g, gar)) {
      const a = (u.seed * 6.283 + gar.time * 0.37 + u.id * 1.7) % 6.283
      const r = SEARCH_SPREAD * (0.4 + 0.6 * ((u.seed * 7.3 + gar.time * 0.11) % 1))
      if (!goTo(u, g, cx + Math.sin(a) * r, cz + Math.cos(a) * r)) goTo(u, g, cx, cz)
    } else if (body) {
      const a = (u.seed * 6.283 + gar.time * 0.53 + u.id * 2.3) % 6.283
      const r = BODY_SPREAD * (0.5 + 0.8 * ((u.seed * 5.1 + gar.time * 0.17) % 1))
      if (!goTo(u, g, cx + Math.sin(a) * r, cz + Math.cos(a) * r)) goTo(u, g, cx, cz)
    }
  }
  if (u.path.length > 0) {
    if (follow(u, g, SPECS[u.kind].look, dt)) u.path = []
    u.look = Math.sin(u.t * 2.3 + u.seed) * 0.5
    return
  }
  stand(u)
  u.look = Math.sin(u.t * 1.9 + u.seed) * 1.1
  u.yaw += Math.sin(u.t * 0.8 + u.seed) * 0.6 * dt
}

/**
 * The last known position is up high (a wall top, a tower, the perch): walk
 * to a point on the ground that has it in view, if there is one within reach.
 * True if it set off for one.
 */
const vantage = (u: Unit, g: Grid, gar: Garrison): boolean => {
  const floor = heightAt(g, u.x, u.z)
  if (gar.lkp.t < -1e8 || gar.lkp.y - floor < 2.5) return false
  const eye = SPECS[u.kind].eye
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + u.seed
    const r = VANTAGE_MIN_M + ((k * 0.37 + u.seed) % 1) * (VANTAGE_MAX_M - VANTAGE_MIN_M)
    const x = gar.lkp.x + Math.sin(a) * r
    const z = gar.lkp.z + Math.cos(a) * r
    const y = heightAt(g, x, z)
    if (y === VOID || Math.abs(y - floor) > 1.2) continue
    if (!hasLineOfSight(g, x, y + eye, z, gar.lkp.x, gar.lkp.y + 1.5, gar.lkp.z)) continue
    if (goTo(u, g, x, z)) return true
  }
  return false
}

/** Machines uplink rather than shout (#73): drones, searchlights, Enforcers. */
const uplinks = (u: Unit): boolean => isLight(u) || u.kind === 'enforcer' || u.kind === 'roomba'

/**
 * The uplink (#73): it fills while the machine keeps the mech in view and
 * drains twice as fast while it does not (gone at 0: it lost it). Full, the
 * base's alarm sounds without a beacon: everyone hunts where the mech was
 * seen, the nearest Enforcer wakes, and guards run to the beacons, whose
 * lighting brings the reinforcements.
 */
const stepUplink = (u: Unit, gar: Garrison, g: Grid, target: Target, dt: number): void => {
  u.uplinkT += u.sees ? dt : -2 * dt
  if (u.uplinkT <= 0) { u.uplinkT = 0; gar.events.push({ type: 'uplinkLost', id: u.id }); return }
  if (u.uplinkT < UPLINK_S) return
  u.uplinkT = 0
  gar.events.push({ type: 'uplinkDone', id: u.id })
  if (gar.drill) return
  gar.lkp.x = target.x
  gar.lkp.y = target.y
  gar.lkp.z = target.z
  gar.lkp.t = gar.time
  wakeNearest(gar, target.x, target.z)
  gar.alert.level = ALERT_MAX
  gar.alert.chaos = true
  goChaos(gar, target)
  sendRunner(gar, g)
}

/**
 * Deal the attention budget (#92): of those in a fight with the mech in view,
 * the nearest may fire (a few more at higher threat levels; a hound bites
 * apart from them). Those already firing keep their turn while they still
 * qualify, so a burst is not cut off by a closer arrival.
 */
/** How many may fire at once at this threat level (#92). */
export const fireTokens = (gar: Garrison): number => FIRE_TOKENS[Math.min(FIRE_TOKENS.length, Math.max(1, Math.round(gar.threat.level))) - 1]!

const dealTokens = (gar: Garrison, target: Target): void => {
  const cap = fireTokens(gar)
  const ranged = gar.units
    .filter(u => isAlive(u) && u.state === 'combat' && u.sees && u.kind !== 'goliath' && u.kind !== 'hound' && !isLight(u))
    .map(u => ({ u, d: Math.hypot(u.x - target.x, u.z - target.z) - (gar.shooters.has(u.id) ? 8 : 0) }))
    .sort((a, b) => a.d - b.d)
  const next = new Set<number>()
  for (const { u } of ranged.slice(0, cap)) next.add(u.id)
  const bite = gar.units.find(u => isAlive(u) && u.state === 'combat' && u.kind === 'hound' && u.sees)
  if (bite) next.add(bite.id)
  gar.shooters = next
}

/**
 * Where on the ring round the mech a fighter goes (#92): the leader holds the
 * front, the others spread evenly round it, the far side included, at its
 * engaging distance. Fighters are counted in a fixed order so a slot does
 * not jump about.
 */
const ringSlot = (u: Unit, gar: Garrison, target: Target, radius: number): { x: number; z: number } => {
  const ring = gar.units.filter(o => isAlive(o) && o.state === 'combat' && !isLight(o) && o.kind !== 'goliath' && o.kind !== 'hound' && o.runner < 0)
  const lead = gar.units[gar.leader]
  const front = lead && isAlive(lead) ? headingTo(target.x, target.z, lead.x, lead.z) : headingTo(target.x, target.z, ring[0]?.x ?? u.x, ring[0]?.z ?? u.z)
  const order = ring.filter(o => o.id !== gar.leader)
  const k = u.id === gar.leader ? 0 : order.indexOf(u) + 1
  const n = Math.max(1, order.length + 1)
  const a = front + (k / n) * Math.PI * 2
  return { x: target.x + Math.sin(a) * radius, z: target.z + Math.cos(a) * radius }
}

/** A sure guard shouts: the guards near it join the fight at once. */
const shout = (gar: Garrison, u: Unit, target: Target): void => {
  if (u.shouted || gar.drill) return
  u.shouted = true
  gar.events.push({ type: 'shout', id: u.id })
  for (const o of gar.units) {
    if (o === u || !isAlive(o) || o.state === 'combat' || o.state === 'dormant' || o.gripped || isLight(o) || o.kind === 'goliath') continue
    if (Math.hypot(o.x - u.x, o.z - u.z) > SHOUT_M * (u.kind === 'sentry' ? SENTRY_CALL : 1)) continue
    o.shouted = true
    o.detect = 1
    o.seenX = target.x
    o.seenZ = target.z
    o.lured = false
    o.path = []
    o.repath = 0
    enter(o, 'combat')
  }
}


/** Send whoever is in the fight nearest a working beacon to light it. */
const sendRunner = (gar: Garrison, g: Grid): void => {
  if (gar.runner >= 0 || gar.runnerWait > 0 || gar.beacons.some(b => b.state === 'lit')) return
  let bestU: Unit | null = null
  let bestB = -1
  let bestD = Infinity
  for (const u of gar.units) {
    // In the fight, or hunting after one: somebody who knows the mech is in the base.
    const hot = u.state === 'combat' || (u.state !== 'patrol' && u.fought)
    if (!hot || !isAlive(u) || isLight(u) || u.gripped || u.kind === 'goliath' || u.kind === 'enforcer') continue
    for (let i = 0; i < gar.beacons.length; i++) {
      const b = gar.beacons[i]!
      if (b.state !== 'ready') continue
      // One fights, another runs: the one with the mech in its sights is the last choice.
      const d = Math.hypot(b.x - u.x, b.z - u.z) + Math.abs(b.y - u.y) * 3 + (u.sees ? 25 : 0)
      if (d < bestD) { bestD = d; bestU = u; bestB = i }
    }
  }
  if (!bestU) return
  const b = gar.beacons[bestB]!
  if (!goTo(bestU, g, b.x, b.z)) { gar.runnerWait = RUNNER_RETRY_S; return }
  if (bestU.state !== 'combat') enter(bestU, 'combat')
  bestU.runner = bestB
  gar.runner = bestU.id
  gar.events.push({ type: 'runner', id: bestU.id, beacon: bestB })
}

/** The runner is gone (dead, held, put off): the beacon goes back to ready, and another may try. */
const stopRunner = (gar: Garrison): void => {
  const r = gar.runner >= 0 ? gar.units[gar.runner] : undefined
  if (r) {
    const b = gar.beacons[r.runner]
    if (b && b.state === 'lighting') { b.state = 'ready'; b.lit = 0 }
    r.runner = -1
  }
  gar.runner = -1
  gar.runnerWait = RUNNER_RETRY_S
}

/** The runner runs to its beacon and lights it; lit, the whole base comes. */
const runToBeacon = (u: Unit, g: Grid, gar: Garrison, target: Target, dt: number): void => {
  const b = gar.beacons[u.runner]
  if (!b || b.state === 'sabotaged' || b.state === 'lit') { stopRunner(gar); gar.runnerWait = 0; return }
  const d = Math.hypot(b.x - u.x, b.z - u.z)
  if (d > BEACON_REACH) {
    if (u.path.length === 0 && !goTo(u, g, b.x, b.z)) { stopRunner(gar); return }
    follow(u, g, SPECS[u.kind].run, dt)
    u.look *= Math.max(0, 1 - dt * 6)
    return
  }
  stand(u)
  turnToward(u, headingTo(u.x, u.z, b.x, b.z), dt, 6)
  b.state = 'lighting'
  b.lit = Math.min(1, b.lit + dt / BEACON_LIGHT_S)
  if (b.lit < 1) return
  b.state = 'lit'
  u.runner = -1
  gar.runner = -1
  gar.alert.level = ALERT_MAX
  gar.alert.chaos = true
  gar.events.push({ type: 'alarm', beacon: gar.beacons.indexOf(b) })
  goChaos(gar, target)
}

/**
 * A guard hit by a round it lived through: those near it (not already in the
 * fight) go to look where the round came from (#60).
 */
export const searchForShooter = (gar: Garrison, id: number, fromX: number, fromZ: number): void => {
  const u = gar.units[id]
  if (!u || gar.drill) return
  for (const o of gar.units) {
    if (o === u || !isAlive(o) || o.state === 'combat' || o.state === 'dormant' || isLight(o) || o.kind === 'goliath') continue
    if (Math.hypot(o.x - u.x, o.z - u.z) > SHOUT_M) continue
    o.detect = Math.max(o.detect, SUSPECT_AT + 0.1)
    o.focusT = Math.max(o.focusT, FOCUS_S)
    suspect(gar, o, fromX, fromZ, false)
  }
}

/**
 * A body found (#98): the finder and the one or two guards nearest it (within
 * BODY_CALL_M) search the ground round it for a minute, sharp-eyed, then let
 * it go. The second body found this raid puts the base on edge for good.
 */
const bodyAlarm = (gar: Garrison, finder: Unit, corpse: Unit): void => {
  if (gar.drill) return
  finder.bodySearch = true
  finder.focusT = Math.max(finder.focusT, FOCUS_S)
  const near = gar.units
    .filter(o => o !== finder && isAlive(o) && isHuman(o) && o.state === 'patrol' && !o.gripped && Math.hypot(o.x - corpse.x, o.z - corpse.z) <= BODY_CALL_M)
    .sort((a, b) => Math.hypot(a.x - corpse.x, a.z - corpse.z) - Math.hypot(b.x - corpse.x, b.z - corpse.z))
    .slice(0, BODY_CALL_N)
  for (const o of near) {
    o.detect = Math.max(o.detect, SUSPECT_AT + 0.05)
    o.bodySearch = true
    o.focusT = Math.max(o.focusT, FOCUS_S)
    suspect(gar, o, corpse.x, corpse.z, false)
    gar.events.push({ type: 'called', id: o.id, by: finder.id })
  }
  gar.bodiesFound++
  if (gar.bodiesFound >= 2 && !gar.heightened) {
    gar.heightened = true
    gar.events.push({ type: 'heightened' })
  }
}

/**
 * Where the base thinks a shot came from (#70): the shooter's spot, off by
 * a share of how far the round flew, halved by a second shot from about the
 * same place and exact from the third. Moving on (SHOT_SPOT_M) starts the
 * count again. Rolls come from the garrison's own dice.
 */
export const estimateShot = (gar: Garrison, sx: number, sy: number, sz: number, hx: number, hz: number): { x: number; y: number; z: number } => {
  const s = gar.shotSpot
  if (Math.hypot(sx - s.x, sz - s.z) < SHOT_SPOT_M && gar.time - s.t < SHOT_SPOT_S) s.n++
  else { s.n = 1; s.x = sx; s.z = sz }
  s.t = gar.time
  const far = Math.hypot(sx - hx, sz - hz)
  const err = s.n >= 3 ? 0 : Math.min(SHOT_ERR_MAX, Math.max(SHOT_ERR_MIN, far * SHOT_ERR_SHARE)) / s.n
  const a = gar.rng() * Math.PI * 2
  const r = err * Math.sqrt(gar.rng())
  return { x: sx + Math.sin(a) * r, y: sy, z: sz + Math.cos(a) * r }
}

/**
 * A round went by (#68): everyone near where it landed (IMPACT_M), everyone
 * it passed close to (NEAR_MISS_M of its line) and everyone within `earshot`
 * of the shooter turns toward where it came from (the base's guess, `from`),
 * focused, and goes to look. Nobody fighting is distracted by it. Returns how
 * many it reached. `hit` is the unit the round struck (it has its own news).
 */
export const shotPassed = (
  gar: Garrison, target: Target, from: { x: number; y: number; z: number },
  ox: number, oy: number, oz: number, hx: number, hy: number, hz: number,
  impactM: number, earshot: number, hit = -1, cause: AlertCause | null = null
): number => {
  // (On the training drill too, #110: a round by a guard's head is always noticed; the drill only keeps the alarm off.)
  let n = 0
  const reached: Unit[] = []
  const lx = hx - ox
  const ly = hy - oy
  const lz = hz - oz
  const len2 = lx * lx + ly * ly + lz * lz || 1
  let fighters = false
  for (const u of gar.units) {
    if (u.id === hit || !isAlive(u) || u.state === 'dormant' || u.gripped) continue
    const eyeY = u.y + SPECS[u.kind].eye
    const k = Math.max(0, Math.min(1, ((u.x - ox) * lx + (eyeY - oy) * ly + (u.z - oz) * lz) / len2))
    const line = Math.hypot(ox + lx * k - u.x, oy + ly * k - eyeY, oz + lz * k - u.z)
    const impact = Math.hypot(hx - u.x, hz - u.z)
    const heard = Math.hypot(ox - u.x, oz - u.z) <= earshot
    if (line > NEAR_MISS_M && impact > impactM && !heard) continue
    // A fighter that notices it keeps the hunt hot (#134); nothing distracts it.
    if (u.state === 'combat') { fighters = true; continue }
    if (u.kind === 'goliath') continue
    u.focusT = Math.max(u.focusT, FOCUS_S)
    u.detect = Math.max(u.detect, SUSPECT_AT + 0.05)
    u.lured = false
    suspect(gar, u, from.x, from.z, false)
    reached.push(u)
    n++
  }
  // Whoever heard it brings the ones right beside it along, guards and machines (#110).
  for (const r of reached) {
    for (const o of gar.units) {
      if (o === r || o.id === hit || reached.includes(o) || !isAlive(o) || o.state === 'combat' || o.state === 'dormant' || o.gripped || isLight(o) || o.kind === 'goliath') continue
      if (Math.hypot(o.x - r.x, o.z - r.z) > SHOT_NOTIFY_M) continue
      o.focusT = Math.max(o.focusT, FOCUS_S)
      o.detect = Math.max(o.detect, SUSPECT_AT + 0.05)
      suspect(gar, o, from.x, from.z, false)
      n++
    }
  }
  if (n > 0) {
    gar.lkp.x = from.x
    gar.lkp.y = from.y
    gar.lkp.z = from.z
    gar.lkp.t = gar.time
    if (cause) raise(gar, cause, target)
  } else if (fighters) stirHunt(gar, from.x, from.z, from.y)
  return n
}

/**
 * The full alert stands down (#89, #134): the base thinks the intruder is
 * gone. Lit beacons go out, the meter falls back to ALERT_AFTER of full, no
 * more waves come. Every fighter searches round the last known position,
 * cautious, for SEARCH_HOT_S, then goes back to its round warier; seeing the
 * mech again starts it all over. The base stays on edge for the raid.
 */
const standDown = (gar: Garrison): void => {
  gar.alert.chaos = false
  gar.alert.level = ALERT_MAX * ALERT_AFTER
  gar.alert.quiet = 0
  for (const b of gar.beacons) if (b.state === 'lit') { b.state = 'ready'; b.lit = 0 }
  for (const o of gar.units) {
    if (!isAlive(o) || o.state !== 'combat') continue
    o.detect = Math.min(o.detect, SUSPECT_AT * 0.5)
    o.uplinkT = 0
    o.path = []
    o.hop = 0
    o.lured = false
    o.wary = true
    if (gar.lkp.t > -1e8) { o.seenX = gar.lkp.x; o.seenZ = gar.lkp.z }
    enter(o, 'search')
  }
  if (gar.runner >= 0) stopRunner(gar)
  gar.runnerWait = 0
  gar.calmT = SEARCH_HOT_S
  gar.leader = -1
  gar.heightened = true
  gar.events.push({ type: 'standDown' })
}

/**
 * The mech put a beacon out of action (#134: a ringing one too, which it
 * silences). True if it did anything. With the last ringing beacon silenced
 * the full alert stands down.
 */
export const sabotageBeacon = (gar: Garrison, i: number): boolean => {
  const b = gar.beacons[i]
  if (!b || b.state === 'sabotaged') return false
  const ringing = b.state === 'lit'
  const running = gar.runner >= 0 && gar.units[gar.runner]?.runner === i
  b.state = 'sabotaged'
  b.lit = 0
  if (running) { stopRunner(gar); gar.runnerWait = 0 }
  if (ringing && gar.alert.chaos && !gar.beacons.some(o => o.state === 'lit')) standDown(gar)
  return true
}

/**
 * The base hears something of the mech during a full alert (#134): a kill,
 * a shot, a blast. The hunt stays hot and goes there; it is not told where
 * the mech is, only where the noise was.
 */
const stirHunt = (gar: Garrison, x: number, z: number, y = gar.lkp.y): void => {
  if (!gar.alert.chaos || gar.drill) return
  gar.lkp.x = x
  gar.lkp.y = y
  gar.lkp.z = z
  gar.lkp.t = gar.time
}

const suspect = (gar: Garrison, u: Unit, x: number, z: number, lured: boolean): void => {
  u.seenX = x
  u.seenZ = z
  if (u.state === 'suspicious' && u.lured === lured) return
  u.lured = lured
  u.huh = HUH_S
  u.noise = 0
  enter(u, 'suspicious')
  u.path = []
  gar.events.push({ type: 'suspicious', id: u.id })
}

const patrol = (u: Unit, g: Grid, time: number, dt: number): void => {
  if (u.route.length < 2) {
    // A post with nowhere to go: watch, with a slow sweep of the head.
    const away = Math.hypot(u.homeX - u.x, u.homeZ - u.z)
    if (away > 0.3 && !isLight(u)) {
      if (u.path.length === 0 && !goTo(u, g, u.homeX, u.homeZ)) { u.homeX = u.x; u.homeZ = u.z }
      follow(u, g, SPECS[u.kind].walk, dt)
      u.look *= Math.max(0, 1 - dt * 4)
      return
    }
    stand(u)
    turnToward(u, u.homeYaw, dt, 2.5)
    u.look = Math.sin(time * 0.45 + u.seed) * (u.chatting ? 0.12 : 0.45)
    return
  }
  if (u.wait > 0) {
    u.wait -= dt
    stand(u)
    const stop = u.route[(u.wp + u.route.length - 1) % u.route.length]!
    if (stop.look !== undefined) turnToward(u, stop.look, dt, 2.5)
    u.look = Math.sin(time * 0.7 + u.seed) * (u.chatting ? 0.12 : 0.6)
    return
  }
  u.look *= Math.max(0, 1 - dt * 4)
  const stop = u.route[u.wp]!
  if (u.kind === 'searchlight') {
    // The beam crosses the ground from one point of its sweep to the next.
    const dx = stop.x - u.spotX
    const dz = stop.z - u.spotZ
    const dist = Math.hypot(dx, dz)
    const step = SPECS.searchlight.walk * dt
    if (dist <= step) {
      u.spotX = stop.x
      u.spotZ = stop.z
      u.wait = stop.wait
      u.wp = (u.wp + 1) % u.route.length
    } else {
      moveSpot(u, (dx / dist) * step, (dz / dist) * step)
    }
    u.yaw = headingTo(u.x, u.z, u.spotX, u.spotZ)
    u.speed01 = 0
    return
  }
  if (u.kind === 'drone') {
    // Drones fly straight from stop to stop.
    const dx = stop.x - u.x
    const dz = stop.z - u.z
    const dist = Math.hypot(dx, dz)
    const step = SPECS.drone.walk * dt
    turnToward(u, Math.atan2(dx, dz), dt, 1.8)
    if (dist <= step) {
      u.x = stop.x
      u.z = stop.z
      u.wait = stop.wait
      u.wp = (u.wp + 1) % u.route.length
    } else {
      u.x += (dx / dist) * step
      u.z += (dz / dist) * step
    }
    u.y += (u.altitude - u.y) * Math.min(1, dt * 2)
    u.speed01 = 0.6
    return
  }
  if (u.path.length === 0 && !goTo(u, g, stop.x, stop.z)) {
    // No way to the next stop from here (it was led off its loop): skip it.
    u.wp = (u.wp + 1) % u.route.length
    return
  }
  if (follow(u, g, SPECS[u.kind].walk, dt)) {
    u.path = []
    u.wait = stop.wait
    u.wp = (u.wp + 1) % u.route.length
  }
}

/** Walk over to where something was seen, look about, give up. */
const investigate = (u: Unit, g: Grid, dt: number): void => {
  const face = headingTo(u.x, u.z, u.seenX, u.seenZ)
  if (u.state === 'suspicious') {
    if (u.t < u.huh) {
      stand(u)
      if (u.noise) {
        // Wondering: it heard something and does not know where. It looks
        // about where it stands; only afterwards does it go and see.
        u.look = Math.sin(u.t * 3.3 + u.seed) * 1.0
        if (!isLight(u)) u.yaw += Math.sin(u.t * 2.1 + u.seed) * 0.9 * dt
      } else {
        // The double-take: stop and turn to it before taking a step.
        turnToward(u, face, dt)
        u.look *= Math.max(0, 1 - dt * 6)
      }
      return
    }
    if (isLight(u)) {
      // A light swings onto the spot and holds there.
      const c = spotCentre(u)
      const dx = u.seenX - c.x
      const dz = u.seenZ - c.z
      const dist = Math.hypot(dx, dz)
      if (dist > 0.4) {
        const step = Math.min(dist, SPECS[u.kind].look * dt)
        moveSpot(u, (dx / dist) * step, (dz / dist) * step)
      }
      if (u.kind === 'drone') turnToward(u, face, dt, 2)
      if (u.t > u.huh + (u.lured ? SCAN_LURED_S : SCAN_S)) enter(u, 'search')
      return
    }
    if (u.path.length === 0) {
      const near = Math.hypot(u.seenX - u.x, u.seenZ - u.z) < 1.2
      if (near || !goTo(u, g, u.seenX, u.seenZ)) {
        // Already there, or it cannot be walked to (the mech is up a tower):
        // look from here.
        enter(u, 'search')
        return
      }
    }
    if (follow(u, g, SPECS[u.kind].look, dt)) {
      u.path = []
      enter(u, 'search')
    }
    return
  }
  // search: stand and sweep.
  stand(u)
  u.look = Math.sin(u.t * 1.9 + u.seed) * 1.1
  if (!isLight(u)) u.yaw += Math.sin(u.t * 0.8) * 0.5 * dt
  // A searchlight hunts in a small circle round where it last had something.
  if (u.kind === 'searchlight') {
    const tx = u.seenX + Math.cos(u.t * 1.4) * 3
    const tz = u.seenZ + Math.sin(u.t * 1.4) * 3
    const dx = tx - u.spotX
    const dz = tz - u.spotZ
    const d = Math.hypot(dx, dz)
    if (d > 0.05) { const st = Math.min(d, SPECS.searchlight.look * dt); moveSpot(u, (dx / d) * st, (dz / d) * st) }
  }
}

/** What the Goliath shoots at: the nearest decoy it can see, else the mech. */
export const goliathAim = (u: Unit, gar: Garrison, g: Grid, target: Target): { x: number; z: number; lure: boolean } | null => {
  const eye = u.y + SPECS.goliath.eye
  let best: { x: number; z: number; lure: boolean } | null = null
  let bestD = Infinity
  for (const d of gar.lures) {
    const dist = Math.hypot(d.x - u.x, d.z - u.z)
    if (dist < bestD && dist <= SPECS.goliath.range && hasLineOfSight(g, u.x, eye, u.z, d.x, d.y + 1.2, d.z)) {
      best = { x: d.x, z: d.z, lure: true }
      bestD = dist
    }
  }
  if (best) return best
  return u.sees ? { x: target.x, z: target.z, lure: false } : null
}

/** The turret swings onto its aim, faster than the hull can follow. */
const aimTurret = (u: Unit, gar: Garrison, g: Grid, target: Target, dt: number): void => {
  const aim = goliathAim(u, gar, g, target)
  // With nothing in view it swings to where the mech was last reported, so
  // the turret (and its sight) gets there well before the hull does.
  const want = aim
    ? angleDelta(u.yaw, headingTo(u.x, u.z, aim.x, aim.z))
    : gar.alert.chaos ? angleDelta(u.yaw, headingTo(u.x, u.z, u.seenX, u.seenZ)) : 0
  const d = angleDelta(u.look, want)
  const step = GOLIATH_TURRET_TURN * dt
  u.look += Math.abs(d) <= step ? d : Math.sign(d) * step
}

const fight = (u: Unit, g: Grid, gar: Garrison, target: Target, dt: number): void => {
  const spec = SPECS[u.kind]
  if (u.kind !== 'goliath') u.look *= Math.max(0, 1 - dt * 8)
  const dist = Math.hypot(u.seenX - u.x, u.seenZ - u.z)
  if (isLight(u)) {
    // Keep the light on the mech.
    const c = spotCentre(u)
    const dx = u.seenX - c.x
    const dz = u.seenZ - c.z
    const d = Math.hypot(dx, dz)
    if (d > 0.3) {
      const step = Math.min(d, spec.run * dt)
      moveSpot(u, (dx / d) * step, (dz / d) * step)
    }
    if (u.kind === 'drone') turnToward(u, headingTo(u.x, u.z, u.seenX, u.seenZ), dt, 3)
    u.speed01 = 1
    // Lost it: the light swings onto where the base last had the mech and
    // searches there, alarm or not (it used to hold the fight forever, #89).
    if (u.sees) u.repath = 0
    else if ((u.repath += dt) > DRONE_LOST_S) {
      u.repath = 0
      if (gar.lkp.t > -1e8) { u.seenX = gar.lkp.x; u.seenZ = gar.lkp.z }
      enter(u, 'search')
    }
    return
  }
  // Machines are slow to turn: that is how they are flanked. A jammed one slower still.
  const turn = (u.kind === 'goliath' ? GOLIATH_HULL_TURN : u.kind === 'enforcer' ? 2.2 : 8) * (u.jammed ? JAM_SLOW : 1)
  // The Warden past half health: the shield dropped, the blade out, the dash.
  if (u.boss === 'warden') {
    if (!u.phase2 && u.hp <= u.maxHp / 2) {
      u.phase2 = true
      if (u.shield) { u.shield = false; gar.events.push({ type: 'shieldDown', id: u.id }) }
      gar.events.push({ type: 'phase', id: u.id })
    }
    if (u.phase2 && wardenDash(u, g, gar, target, dt)) return
  }
  const engage = u.kind === 'goliath' ? 30 : u.kind === 'enforcer' ? 14 : u.kind === 'hound' ? 1.3
    : u.kind === 'roomba' ? (u.shotgun ? 5 : 10) : u.role === 'marksman' ? 1e9 : ENGAGE_DIST
  if (u.kind === 'goliath' && u.overheat > 0) {
    // Overheating: the guns are quiet and the hull swings its open vents
    // round toward the mech (it cannot help it: that is where the air is).
    u.overheat = Math.max(0, u.overheat - dt)
    stand(u)
    turnToward(u, headingTo(u.x, u.z, target.x, target.z) + Math.PI, dt, turn * 2.5)
    return
  }
  if (u.kind === 'goliath') {
    // The tank keeps to open ground (it is wider than a gate): it turns its
    // hull toward where the mech is or was last reported, rolls a little
    // way to a spot that has a clear line on it (#71), and in the end gives
    // the fight up (#89).
    aimTurret(u, gar, g, target, dt)
    if (!u.sees && gar.lkp.t > -1e8) {
      u.seenX = gar.lkp.x
      u.seenZ = gar.lkp.z
    }
    u.lostT = u.sees ? 0 : u.lostT + dt
    if (u.lostT > GOLIATH_LOST_S) { u.lostT = 0; u.path = []; enter(u, 'search'); return }
    // Too close to shell (a mech on the wall over it): back off to where it has room.
    const close = u.sees && Math.hypot(target.x - u.x, target.z - u.z) < GOLIATH_MIN_M
    if (((!u.sees && u.lostT > 1.5) || close) && u.path.length === 0 && (u.repath -= dt) <= 0) {
      u.repath = 2
      const spot = tankSpot(u, g, gar, close ? target : null)
      if (spot) u.path = [spot]
    }
    if (u.path.length > 0) {
      if (follow(u, g, SPECS.goliath.walk, dt, turn)) u.path = []
      return
    }
    stand(u)
    turnToward(u, headingTo(u.x, u.z, u.sees ? target.x : u.seenX, u.sees ? target.z : u.seenZ), dt, turn)
    return
  }
  if (u.sees) {
    turnToward(u, headingTo(u.x, u.z, target.x, target.z), dt, turn)
    if (dist > engage) {
      if (u.path.length === 0 || (u.repath -= dt) <= 0) {
        u.repath = HUNT_REPATH_S
        // Not in a line: round the mech from every side, the leader in front (#92).
        const s = u.kind === 'hound' ? target : ringSlot(u, gar, target, engage)
        if (!goTo(u, g, s.x, s.z)) goTo(u, g, target.x, target.z)
      }
      follow(u, g, spec.run * (u.jammed ? JAM_SLOW : 1), dt, turn)
    } else {
      u.path = []
      stand(u)
    }
    return
  }
  // Lost it: run to where the base last saw it (what anyone saw, shouted
  // round). Nobody knows where it is now; at the spot, they search.
  if ((u.repath -= dt) <= 0 && gar.lkp.t > -1e8 && (u.seenX !== gar.lkp.x || u.seenZ !== gar.lkp.z)) {
    u.repath = HUNT_REPATH_S
    u.seenX = gar.lkp.x
    u.seenZ = gar.lkp.z
    u.path = []
  }
  if (u.path.length === 0) {
    if (dist < 1.5 || !goTo(u, g, u.seenX, u.seenZ)) {
      enter(u, 'search')
      u.hop = 0
      return
    }
  }
  if (follow(u, g, spec.run, dt, turn)) u.path = []
}

/**
 * A spot within GOLIATH_ROLL_M the tank can roll to in a straight line over
 * open, level ground (its whole width clear), with a clear line from its
 * turret onto where the mech was last reported; null if there is none.
 */
const tankSpot = (u: Unit, g: Grid, gar: Garrison, mech: Target | null = null): { x: number; z: number } | null => {
  const ax = mech ? mech.x : gar.lkp.x
  const ay = mech ? mech.y : gar.lkp.y
  const az = mech ? mech.z : gar.lkp.z
  const eye = SPECS.goliath.eye
  const r = SPECS.goliath.radius
  const clearAt = (x: number, z: number): boolean => {
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      const h = heightAt(g, x + ox, z + oz)
      if (h === VOID || Math.abs(h - u.y) > 0.3) return false
    }
    return true
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + u.seed
    const d = GOLIATH_ROLL_M * (0.4 + 0.6 * ((k * 0.61) % 1))
    const x = u.x + Math.sin(a) * d
    const z = u.z + Math.cos(a) * d
    if (Math.hypot(ax - x, az - z) < GOLIATH_MIN_M) continue
    if (!hasLineOfSight(g, x, u.y + eye, z, ax, ay + 1.2, az)) continue
    let ok = true
    for (let s = 1; s <= Math.ceil(d); s++) {
      const t = s / Math.ceil(d)
      if (!clearAt(u.x + (x - u.x) * t, u.z + (z - u.z) * t)) { ok = false; break }
    }
    if (ok) return { x, z }
  }
  return null
}

/**
 * The Warden's dash: a glint (stand, face the mech), then a run at where the
 * mech stood, the blade out; one blow if it passes close. True while it is
 * busy with it (the rest of its fight waits).
 */
const wardenDash = (u: Unit, g: Grid, gar: Garrison, target: Target, dt: number): boolean => {
  if (u.dashT > 0) {
    u.dashT -= dt
    const dx = u.dashX - u.x
    const dz = u.dashZ - u.z
    const d = Math.hypot(dx, dz)
    const step = Math.min(d, DASH_SPEED * dt)
    if (d > 0.05) {
      const nx = u.x + (dx / d) * step
      const nz = u.z + (dz / d) * step
      const floor = heightAt(g, nx, nz)
      if (floor > VOID && Math.abs(floor - u.y) < 0.6) { u.x = nx; u.z = nz }
      else u.dashT = 0
    }
    u.speed01 = 1
    if (!u.dashHit && Math.hypot(target.x - u.x, target.z - u.z) < DASH_HIT_M && target.visible) {
      u.dashHit = true
      gar.events.push({ type: 'fire', id: u.id, damage: Math.round(DASH_DAMAGE * gar.threat.damage) })
    }
    if (u.dashT <= 0) u.dashCool = DASH_EVERY_S
    return true
  }
  if (u.glintT > 0) {
    u.glintT -= dt
    stand(u)
    turnToward(u, headingTo(u.x, u.z, target.x, target.z), dt, 10)
    if (u.glintT <= 0) {
      u.dashT = DASH_S
      u.dashX = target.x
      u.dashZ = target.z
      u.dashHit = false
    }
    return true
  }
  u.dashCool -= dt
  if (u.dashCool <= 0 && u.sees && Math.hypot(target.x - u.x, target.z - u.z) < DASH_SPEED * DASH_S * 1.3) {
    u.glintT = GLINT_S
    gar.events.push({ type: 'glint', id: u.id })
    return true
  }
  return false
}

/**
 * Advance the whole garrison by one step. What happened is queued on
 * `gar.events` for the mission to turn into sound, markers and score.
 */
/** The fallen go on falling: a ragdoll settles, a drone drops out of the sky. */
const stepDead = (u: Unit, g: Grid, dt: number): void => {
  u.deadT += dt
  // A ragdoll: pushed once by the killing blow, then left to fall and settle.
  // The body is wherever its pelvis lies (for whoever finds it, or drags it).
  if (u.rag && u.deadT >= u.hold && !u.hidden) {
    if (!u.ragStruck) {
      u.ragStruck = true
      strike(u.rag, u.ragHow, u.hitX, u.hitZ, u.seed + u.id * 0.37, dt)
    }
    stepRagdoll(u.rag, g, dt)
    const at = ragdollAt(u.rag, g)
    u.x = at.x
    u.z = at.z
    u.y = at.y
  }
  if (u.kind === 'drone') {
    const floor = heightAt(g, u.x, u.z)
    u.y = Math.max((floor === VOID ? 0 : floor) + 0.2, u.y - (4 + u.deadT * 14) * dt)
  }
}

/**
 * A kill-cam (#91): the whole base holds still, nobody thinks, walks or
 * shoots; only the fallen go on falling. The base's own clock stops too.
 */
export const stepFallen = (gar: Garrison, g: Grid, dt: number): void => {
  for (const u of gar.units) {
    u.px = u.x
    u.py = u.y
    u.pz = u.z
    u.pyaw = u.yaw
    if (u.state === 'dead') stepDead(u, g, dt)
  }
}

export const stepGarrison = (gar: Garrison, g: Grid, target: Target, dt: number): void => {
  gar.time += dt
  checkIns(gar)
  // Nobody left to raise it: every defender is down (searchlights are no
  // one), so the alarm is over at once and completely (jam build): the meter
  // empties, the beacons go out, no more waves come.
  if ((gar.alert.chaos || gar.alert.level > 0) && !gar.units.some(o => isAlive(o) && o.kind !== 'searchlight')) {
    gar.alert.chaos = false
    gar.alert.level = 0
    gar.alert.quiet = 0
    for (const b of gar.beacons) if (b.state === 'lit') { b.state = 'ready'; b.lit = 0 }
    if (gar.runner >= 0) stopRunner(gar)
    gar.leader = -1
    gar.events.push({ type: 'standDown' })
  }
  // A full alert that has gone cold stands down, whatever is still alive
  // (#89, #134): nobody has seen or heard the mech for CHAOS_COOL_S.
  if (gar.alert.chaos && gar.time - Math.max(gar.lkp.t, gar.chaosAt) > CHAOS_COOL_S && !gar.units.some(o => o.state === 'combat' && isAlive(o) && o.sees)) standDown(gar)
  if (gar.calmT > 0) gar.calmT -= dt
  // The attention budget (#92): who may fire, re-dealt twice a second.
  if ((gar.tokenT -= dt) <= 0) {
    gar.tokenT = TOKEN_EVERY_S
    dealTokens(gar, target)
  }
  if (gar.runnerWait > 0) gar.runnerWait -= dt
  // A search after a fight sends a runner too, but not while the base thinks the intruder gone (#134).
  if (gar.beacons.length > 0 && gar.runner < 0 && gar.runnerWait <= 0 && gar.units.some(o => isAlive(o) && (o.state === 'combat' || (gar.calmT <= 0 && o.state !== 'patrol' && o.fought)) && !isLight(o))) sendRunner(gar, g)
  const seen: Seen = { x: target.x, feetY: target.y, z: target.z, height: target.height }
  // The mech's trail, for the hounds.
  if (target.visible && (gar.scentT -= dt) <= 0) {
    gar.scentT = SCENT_EVERY_S
    const last = gar.scent[gar.scent.length - 1]
    if (!last || Math.hypot(last.x - target.x, last.z - target.z) > 0.8) {
      gar.scent.push({ x: target.x, z: target.z, t: gar.time })
      if (gar.scent.length > 80) gar.scent.shift()
    }
  }
  // Who is talking: a pair both on their round, standing, side by side.
  for (const u of gar.units) {
    const o = u.partner >= 0 ? gar.units[u.partner] : undefined
    u.chatting = !!o && u.state === 'patrol' && o.state === 'patrol' && !u.gripped && !o.gripped
      && u.speed01 < 0.05 && o.speed01 < 0.05 && Math.hypot(o.x - u.x, o.z - u.z) < 3.2
  }
  let calm = true
  let watched = false

  for (const u of gar.units) {
    u.px = u.x
    u.py = u.y
    u.pz = u.z
    u.pyaw = u.yaw
    u.t += dt
    if (u.focusT > 0) u.focusT = Math.max(0, u.focusT - dt)
    if (u.state === 'dead') {
      stepDead(u, g, dt)
      // The body hits the ground: a thud and a clatter whoever is near hears (#108).
      // (A light coming down is noticed as a light gone out instead.)
      if (!u.thud && !u.hidden && !isLight(u) && u.deadT >= u.hold + BODY_THUD_S) { u.thud = true; bodyThud(gar, u) }
      continue
    }
    if (u.state === 'dormant' || u.state === 'reserve') continue
    // In the mech's grip: no eyes, no feet, no voice.
    if (u.gripped) { u.speed01 = 0; u.sees = false; continue }
    // On fire (#148): it runs blind, beating at itself, and drops when the fire has it.
    if (u.onFire > 0) { stepOnFire(gar, u, g, dt); calm = false; continue }
    if (u.power < 1) {
      // Powering up: it stands and whirs, and does nothing else yet.
      u.power = Math.min(1, u.power + dt / (WAKE_S * (u.jammed ? JAM_WAKE : 1)))
      calm = false
      continue
    }

    // ── What it sees of the mech ──
    let exposed = target.visible ? sight(u, g, seen, gar) : 0
    if (u.inspectCool > 0) u.inspectCool -= dt
    // In a thicket, crouched: nobody sees it but from right on top of it (Odyssey's bushes).
    if (target.brush && Math.hypot(target.x - u.x, target.z - u.z) > BRUSH_SEEN_M) exposed = 0
    // The disguise (#111). Moving, it is an intruder for anyone who sees it.
    if (target.box === 'creep' && exposed > 0) {
      u.detect = 1
      u.seenX = target.x
      u.seenZ = target.z
    }
    // Still, it is a toaster (or a crate…): never noticed for what it is, but
    // walked close to, it gets a puzzled look and a test round.
    if (target.box === 'still') {
      const near = Math.hypot(target.x - u.x, target.z - u.z)
      const reach = gar.boxCheck ? BOX_CHECK_M : INSPECT_M
      if (exposed > 0 && near < reach && !u.inspect && u.inspectCool <= 0 && u.state !== 'combat' && !isLight(u) && !!gunOfKind(u)) {
        u.inspect = { phase: 'approach', t: 0 }
        u.path = []
        gar.events.push({ type: 'poke', id: u.id })
      }
      exposed = 0
    }
    u.sees = exposed > 0
    // ── At a disguise: the puzzled look, the step back, the test round ──
    if (u.inspect) {
      if (stepInspect(u, gar, g, target, dt)) continue
    }
    if (u.sees) {
      u.seenFor += dt
      u.unseenFor = 0
      const dist = Math.hypot(target.x - u.x, target.z - u.z)
      const yellow = u.detect >= SUSPECT_AT
      const band = yellow ? 1 - SUSPECT_AT : SUSPECT_AT
      let rate: number
      if (isLight(u)) {
        rate = (band * exposed * (target.crouched ? 0.7 : 1)) / (SPOT_NOTICE_S * (yellow ? 0.8 : 1.2))
      } else {
        const v = viewerOf(u, gar.heightened)
        const off = Math.abs(angleDelta(v.yaw, headingTo(u.x, u.z, target.x, target.z))) / Math.max(0.01, v.halfAngle)
        rate = fillRate({ dist, range: SPECS[u.kind].range, exposed, crouched: target.crouched, off, shadow: !!target.shadow, yellow }, band)
      }
      // A glance is forgiven: the first moment of sight adds nothing to a
      // unit at ease, unless the mech is right in front of it.
      const grace = u.state === 'patrol' && u.seenFor < GRACE_S && dist > CLOSE_M
      // Sharper senses once it has been looking: a fresh white fill is quicker.
      // The yellow band is not: the player gets a fair moment to duck out.
      const wary = !yellow && (u.state === 'suspicious' || u.state === 'search') ? WARY_GAIN : 1
      if (!grace) u.detect = Math.min(1, u.detect + rate * wary * gar.threat.notice * dt)
      u.seenX = target.x
      u.seenZ = target.z
      gar.lkp.x = target.x
      gar.lkp.y = target.y
      gar.lkp.z = target.z
      gar.lkp.t = gar.time
    } else {
      u.seenFor = 0
      u.unseenFor += dt
      if (u.state !== 'combat' && u.unseenFor > DECAY_AFTER_S) {
        // White drains away; yellow sinks only to the line while it looks.
        const floor = u.state === 'patrol' ? 0 : Math.min(u.detect, SUSPECT_AT)
        u.detect = Math.max(floor, u.detect - (u.state === 'patrol' ? DECAY_PER_S : DECAY_WARY_PER_S) * dt)
      }
    }

    // ── What it makes of it ──
    if (u.state !== 'combat' && u.detect >= 1) {
      enter(u, 'combat')
      u.lured = false
      u.path = []
      u.repath = 0
      gar.events.push({ type: 'spotted', id: u.id })
      // The first to be sure raises the alarm; one more pair of eyes on a
      // mech the base already knows about adds little.
      const known = gar.units.some(o => o !== u && o.state === 'combat')
      // A hound barks: the guards round it come, beacons or not.
      if (u.kind === 'hound') shout(gar, u, target)
      if (uplinks(u)) {
        // A machine has no voice: it uplinks to the base (#73). The ring
        // fills while it keeps the mech in view; it is the player's moment.
        u.uplinkT = 0.0001
        gar.events.push({ type: 'uplink', id: u.id })
      } else if (gar.beacons.length === 0) {
        if (!known) raise(gar, 'seen', target)
        else if (pressAlert(gar.alert, SECOND_WITNESS)) goChaos(gar, target)
      } else {
        // Odyssey's fort: the sure one shouts, and somebody runs to light a
        // beacon. Until one is lit the fight stays where it is.
        if (!known) raise(gar, 'seen', target)
        shout(gar, u, target)
        sendRunner(gar, g)
      }
      if (gar.leader < 0 && isHuman(u)) gar.leader = u.id
    } else if (u.state === 'patrol' && u.detect >= SUSPECT_AT) {
      suspect(gar, u, u.seenX, u.seenZ, false)
    } else if (u.state === 'suspicious' && u.lured && u.detect >= SUSPECT_AT) {
      // What it walked over to look at turns out to be worth a real look.
      u.lured = false
    }


    // ── The hound's nose ──
    if (u.kind === 'hound' && u.state !== 'combat') sniff(gar, g, u, target)

    // ── The Engineer's round: whatever was broken ──
    if (u.role === 'engineer' && u.state === 'patrol' && !u.job) u.job = findJob(gar, u)
    if (u.job && u.state !== 'patrol') u.job = null

    // ── Things out of place ──
    if (u.state === 'patrol' && !isLight(u) && gar.changes.length > 0) {
      let looking = false
      for (const c of gar.changes) {
        if (c.found || Math.hypot(c.x - u.x, c.z - u.z) > CHANGE_RANGE) continue
        if (sight(u, g, { x: c.x, feetY: c.y, z: c.z, height: 0.8 }, gar) <= 0) continue
        looking = true
        u.changeT += dt
        if (u.changeT >= CHANGE_NOTICE_S) {
          c.found = true
          u.changeT = 0
          u.detect = Math.max(u.detect, SUSPECT_AT + 0.05)
          gar.events.push({ type: 'change', id: u.id, kind: c.kind })
          suspect(gar, u, c.x, c.z, false)
        }
        break
      }
      if (!looking) u.changeT = 0
    }

    // ── Bodies ──
    if (u.state !== 'combat') {
      let looking = false
      for (const c of gar.units) {
        // A wreck counts once it is on the ground (a drone takes a second to fall).
        // A body tucked into a container is not there to find.
        if (c.state !== 'dead' || c.found || c.hidden || isLight(c) || c.deadT < c.hold + 0.6) continue
        if (Math.hypot(c.x - u.x, c.z - u.z) > BODY_RANGE) continue
        if (sight(u, g, { x: c.x, feetY: c.y, z: c.z, height: BODY_HEIGHT }, gar) <= 0) continue
        looking = true
        u.bodyT += dt
        if (u.bodyT >= BODY_NOTICE_S) {
          c.found = true
          u.bodyT = 0
          u.detect = Math.max(u.detect, 0.6)
          gar.events.push({ type: 'body', id: u.id, corpse: c.id })
          suspect(gar, u, c.x, c.z, false)
          bodyAlarm(gar, u, c)
          raise(gar, 'body', target)
          fillPost(gar, c)
        }
        break
      }
      if (!looking) u.bodyT = 0
    }

    // ── What it does ──
    switch (u.state as UnitState) {
      case 'patrol':
        if (u.job) repair(u, g, gar, dt)
        else patrol(u, g, gar.time, dt)
        break
      case 'suspicious':
        investigate(u, g, dt)
        break
      case 'search': {
        if (u.kind === 'goliath') {
          stand(u)
          u.look = Math.sin(u.t * 0.6 + u.seed) * 1.2
          if (u.t > SEARCH_HOT_S && !u.sees) { u.wary = true; enter(u, 'patrol'); gar.events.push({ type: 'calm', id: u.id }) }
          break
        }
        // After a fight: a proper hunt round the last known position. Round
        // a body: a minute's search of the ground about it (#98).
        const hunt = u.fought && !u.lured && !isLight(u)
        const body = u.bodySearch && !hunt && !isLight(u)
        if (hunt) huntAround(u, g, gar, dt)
        else if (body) huntAround(u, g, gar, dt, true)
        else investigate(u, g, dt)
        const limit = u.lured ? SCAN_LURED_S : hunt ? SEARCH_HOT_S : body ? BODY_SEARCH_S : gar.alert.level > 0 ? HUNT_SCAN_S : SCAN_S
        if (body && u.focusT < 1) u.focusT = 1
        if (u.t > limit && !u.sees) {
          u.lured = false
          u.bodySearch = false
          u.detect = Math.min(u.detect, SUSPECT_AT * 0.5)
          u.path = []
          // A hunt that found nothing leaves it on its guard; so does a heightened base.
          if (hunt || gar.heightened) u.wary = true
          enter(u, 'patrol')
          gar.events.push({ type: 'calm', id: u.id })
        }
        break
      }
      case 'combat':
        if (u.runner >= 0) { runToBeacon(u, g, gar, target, dt); break }
        if (u.uplinkT > 0) stepUplink(u, gar, g, target, dt)
        fight(u, g, gar, target, dt)
        if (u.sees) watched = true
        // Out of sight long enough, and not in full alert: it lets go.
        if (!u.sees && !gar.alert.chaos) u.detect = Math.max(0.5, u.detect - 0.12 * dt)
        break
    }
    if (u.state === 'combat' || u.state === 'search' || (u.state === 'suspicious' && !u.lured)) calm = false
  }

  // Full alert: reinforcements come in through the gates, in waves.
  // With beacons, only a lit one brings them (#73, #86): the alarm alone is the base's own.
  if (gar.alert.chaos && (gar.beacons.length === 0 || gar.beacons.some(b => b.state === 'lit'))) {
    gar.chaosT += dt
    if (gar.wave < WAVE_AT_S.length && gar.chaosT >= WAVE_AT_S[gar.wave]!) {
      gar.wave++
      let n = 0
      for (const u of gar.units) {
        if (u.state !== 'reserve' || n >= WAVE_SIZE) continue
        n++
        u.detect = 1
        // They are told where the mech was last seen, not where it is (#86).
        u.seenX = gar.lkp.t > -1e8 ? gar.lkp.x : target.x
        u.seenZ = gar.lkp.t > -1e8 ? gar.lkp.z : target.z
        u.fireT = 1.2
        enter(u, 'combat')
      }
      if (n > 0) gar.events.push({ type: 'wave', n })
    }
  }

  // However many are watching, the meter climbs at one rate: being seen by
  // two guards is not twice as bad, it is two witnesses to silence.
  if (watched && pressAlert(gar.alert, ENGAGED_PER_S * dt, alertCap(gar))) goChaos(gar, target)
  stepAlert(gar.alert, dt, calm)
  separate(gar, g)
}

/** Bodies keep this much air between them (m), on top of their radii. */
const SEPARATE_GAP = 0.12

/**
 * Nobody walks through anybody (#131): two walking units closer than their
 * radii allow are pushed apart, half each (all of it onto the one that can
 * move when the other is a boss or a Goliath), never into a wall or off a
 * ledge. Lights, drones, the dead and whoever is in the mech's grip are left alone.
 */
export const separate = (gar: Garrison, g: Grid): void => {
  const us = gar.units
  for (let i = 0; i < us.length; i++) {
    const a = us[i]!
    if (!walker(a)) continue
    for (let j = i + 1; j < us.length; j++) {
      const b = us[j]!
      if (!walker(b) || Math.abs(a.y - b.y) > 1.2) continue
      const dx = b.x - a.x
      const dz = b.z - a.z
      const min = SPECS[a.kind].radius + SPECS[b.kind].radius + SEPARATE_GAP
      const d2 = dx * dx + dz * dz
      if (d2 >= min * min) continue
      const d = Math.sqrt(d2)
      // Exactly on top of each other: part along a fixed direction of their own.
      const nx = d > 1e-4 ? dx / d : Math.cos(a.id * 2.39)
      const nz = d > 1e-4 ? dz / d : Math.sin(a.id * 2.39)
      const push = min - d
      const heavyA = a.kind === 'goliath' || !!a.boss
      const heavyB = b.kind === 'goliath' || !!b.boss
      const sa = heavyA && !heavyB ? 0 : heavyB && !heavyA ? 1 : 0.5
      nudge(a, g, -nx * push * sa, -nz * push * sa)
      nudge(b, g, nx * push * (1 - sa), nz * push * (1 - sa))
    }
  }
}

const walker = (u: Unit): boolean =>
  isAlive(u) && !isLight(u) && !u.gripped && u.state !== 'dormant' && !u.hidden

/** Move a unit a little, only onto floor it could step to. */
const nudge = (u: Unit, g: Grid, dx: number, dz: number): void => {
  if (dx === 0 && dz === 0) return
  const nx = u.x + dx
  const nz = u.z + dz
  const floor = heightAt(g, nx, nz)
  if (floor === VOID || !canStep(u.y, floor)) return
  u.x = nx
  u.z = nz
}

/** Take the queued events (the queue is emptied). */
export const drainEvents = (gar: Garrison): GarrisonEvent[] => gar.events.splice(0, gar.events.length)

// ─── What the mech does to the garrison ──────────────────────────────────────

/**
 * Take a unit out. `fromX/fromZ` is where the blow came from, which decides
 * the way it falls.
 */
export const killUnit = (gar: Garrison, id: number, fromX: number, fromZ: number, how: KillHow = 'shot'): void => {
  const dying = gar.units[id]
  if (dying && isLight(dying) && isAlive(dying)) {
    // A light out: the guards on their round will notice the dark.
    const c = spotCentre(dying)
    noteChange(gar, c.x, dying.kind === 'drone' ? 0 : dying.y - 6, c.z, 'light')
  }
  const u = gar.units[id]
  if (!u || !isAlive(u)) return
  const toSource = angleDelta(u.yaw, headingTo(u.x, u.z, fromX, fromZ))
  // Hit from the front it goes over backward; from behind, onto its face.
  u.fallDir = Math.abs(toSource) < Math.PI / 2 ? -1 : 1
  const away = Math.hypot(u.x - fromX, u.z - fromZ) || 1
  u.hitX = (u.x - fromX) / away
  u.hitZ = (u.z - fromZ) / away
  if (isHuman(u)) {
    u.death = how === 'blast' ? 'thrown' : how === 'spray' ? 'spin' : how === 'blade' ? 'front' : u.fallDir < 0 ? 'back' : 'front'
    // A blast throws it away from the blast, whichever way it was facing.
    if (how === 'blast') u.fallDir = -1
    // It falls as a ragdoll (#64), pushed by what killed it (the blade's push
    // waits until the mech lets go: `u.hold`).
    u.rag = makeRagdoll(u.x, u.y, u.z, u.yaw)
    u.ragHow = how
    u.ragStruck = false
  } else {
    // A destroyed machine comes apart into its own parts, whatever destroyed it.
    u.death = 'burst'
  }
  u.hp = 0
  u.state = 'dead'
  u.gripped = false
  u.hold = 0
  u.t = 0
  u.deadT = 0
  u.sees = false
  u.detect = 0
  u.speed01 = 0
  u.path = []
  // Wreckage is evidence like a body is: a patrol that sees a drone in
  // pieces on the ground knows somebody is in the base.
  u.found = u.kind === 'searchlight'
  if (gar.runner === u.id) stopRunner(gar)
  // Its radio goes quiet; in a while somebody notices.
  u.checkAt = gar.time + CHECKIN_S + u.seed * CHECKIN_JITTER_S
  u.checked = u.kind === 'searchlight'
  gar.events.push({ type: 'kill', id, death: u.death })
  // In a full alert a man down is called in at once: the hunt goes there.
  stirHunt(gar, u.x, u.z, u.y)
  // A light that goes out is noticed: whoever is near wonders why.
  if (u.kind === 'searchlight') wonderAt(gar, u.x, u.z, 14)
}

/**
 * A defender was hit and lived, or stood next to something that did not:
 * it knows it is under attack and from where.
 */
export const alarmUnit = (gar: Garrison, id: number, fromX: number, fromZ: number): void => {
  const u = gar.units[id]
  if (!u || !isAlive(u) || u.state === 'combat' || gar.drill) return
  // A machine that is hit wakes up.
  if (u.state === 'dormant') { wake(gar, u, fromX, fromZ); return }
  u.detect = 1
  u.seenX = fromX
  u.seenZ = fromZ
  u.lured = false
  u.path = []
  u.repath = 0
  u.focusT = Math.max(u.focusT, FOCUS_S)
  enter(u, 'combat')
  gar.events.push({ type: 'spotted', id })
  // The base has somewhere to look now: a stale sighting must not win (#70).
  gar.lkp.x = fromX
  gar.lkp.z = fromZ
  gar.lkp.t = gar.time
  const target: Target = { x: fromX, y: 0, z: fromZ, height: 0, crouched: false, visible: false }
  raise(gar, 'seen', target)
}

/**
 * A drone hit and still flying. The first time, it does not know what hit it:
 * it turns suspicious and goes to look where the round came from (no alarm).
 * Hit again while it is already wary, it knows, and calls it in.
 */
export const startleUnit = (gar: Garrison, id: number, fromX: number, fromZ: number): void => {
  const u = gar.units[id]
  if (!u || !isAlive(u)) return
  if (u.state !== 'patrol') { alarmUnit(gar, id, fromX, fromZ); return }
  u.detect = Math.max(u.detect, SUSPECT_AT + 0.15)
  suspect(gar, u, fromX, fromZ, false)
}

/** How long a person burns before it drops (#148). */
export const ON_FIRE_S = 3.2

/**
 * The flamethrower on a living person (#148): it catches fire, drops whatever
 * it held (a riot shield too), and runs from the flame screaming; those near
 * it come running. A boss does not catch. True if it caught.
 */
export const igniteUnit = (gar: Garrison, id: number, fromX: number, fromZ: number): boolean => {
  const u = gar.units[id]
  if (!u || !isAlive(u) || !isHuman(u) || u.boss || u.onFire > 0 || u.gripped) return false
  u.onFire = ON_FIRE_S
  u.yaw = u.pyaw = Math.atan2(u.x - fromX, u.z - fromZ)
  u.look = 0
  u.inspect = null
  u.path = []
  if (u.shield) { u.shield = false; gar.events.push({ type: 'shieldDown', id: u.id }) }
  for (const o of gar.units) {
    if (o === u || !isAlive(o) || o.state === 'dormant' || Math.hypot(o.x - u.x, o.z - u.z) > BURN_SCREAM_M) continue
    alarmUnit(gar, o.id, u.x, u.z)
  }
  return true
}
/** How far a burning man's screams carry. */
const BURN_SCREAM_M = 16

const stepOnFire = (gar: Garrison, u: Unit, g: Grid, dt: number): void => {
  u.onFire -= dt
  u.sees = false
  u.recoil = 0
  if (u.onFire <= 0) {
    u.onFire = 0
    killUnit(gar, u.id, u.x - Math.sin(u.yaw), u.z - Math.cos(u.yaw), 'blade')
    const ev = gar.events[gar.events.length - 1]
    if (ev && ev.type === 'kill' && ev.id === u.id) ev.burnt = true
    return
  }
  // Blind, at a stumbling run, veering; a wall or a drop turns it about.
  const speed = SPECS[u.kind].run * 0.8
  u.yaw += Math.sin(u.onFire * 4.3 + u.seed * 7) * dt * 2.6
  const nx = u.x + Math.sin(u.yaw) * speed * dt
  const nz = u.z + Math.cos(u.yaw) * speed * dt
  const from = heightAt(g, u.x, u.z)
  const to = heightAt(g, nx, nz)
  if (to !== VOID && from !== VOID && canStep(from, to)) {
    u.x = nx
    u.z = nz
    u.y += (to - u.y) * Math.min(1, dt * 12)
  } else u.yaw += Math.PI * 0.7
  u.speed01 = 0.8
  u.stride += speed * dt * guardGaitRate(0.8)
}

/** Hurt a unit; kills it when its health runs out. True if it died. */
export const damageUnit = (gar: Garrison, id: number, amount: number, fromX: number, fromZ: number, how: KillHow = 'shot'): boolean => {
  const u = gar.units[id]
  if (!u || !isAlive(u)) return false
  u.hp -= amount
  if (u.hp > 0) return false
  killUnit(gar, id, fromX, fromZ, how)
  return true
}

/**
 * Something was heard at a point: a round hitting a wall, a rocket. Raises
 * the alert by `cause` (once, if anyone is in earshot) and sends everyone in
 * earshot to look. Returns true if that tipped the base into full alert.
 */
export const noiseAt = (gar: Garrison, target: Target, x: number, z: number, radius: number, cause: AlertCause): boolean => {
  let heard = false
  for (const u of gar.units) {
    if (!isAlive(u) || u.state === 'dormant') continue
    if (Math.hypot(u.x - x, u.z - z) > radius) continue
    // A fighter that hears it sends the hunt there (#134).
    if (u.state === 'combat') { stirHunt(gar, x, z); continue }
    heard = true
    u.detect = Math.max(u.detect, SUSPECT_AT + 0.05)
    suspect(gar, u, x, z, false)
  }
  // In a full alert whoever hears it sends the hunt there (#134).
  if (heard) stirHunt(gar, x, z)
  if (!heard && cause !== 'loud') return false
  const was = gar.alert.chaos
  raise(gar, cause, target)
  return !was && gar.alert.chaos
}

/**
 * A small sound at a point: running feet, a hook biting into a wall. Everyone
 * in earshot who is not already busy goes to look. Nobody raises the alarm
 * over a noise: the base's meter only moves for what somebody SAW. Returns
 * how many heard it.
 */
export const hearAt = (gar: Garrison, x: number, z: number, radius: number): number => {
  let n = 0
  for (const u of gar.units) {
    if (!isAlive(u) || u.state !== 'patrol' || isLight(u) || u.kind === 'goliath') continue
    if (Math.hypot(u.x - x, u.z - z) > radius * (u.kind === 'hound' ? HOUND_EARS : 1)) continue
    suspect(gar, u, x, z, false)
    n++
  }
  return n
}

/** A body is down this long after the blow; it is heard this far (#108). */
export const BODY_THUD_S = 0.6
export const BODY_THUD_M = 8

/**
 * A body falling (#108): every defender in earshot that is not already
 * fighting turns to where it fell, its attention up, and comes to look (a
 * person and a machine alike). On the training ground's drill they only turn
 * their heads to it: a lesson is not sent back to its door for a thud.
 */
const bodyThud = (gar: Garrison, d: Unit): void => {
  for (const u of gar.units) {
    if (u === d || !isAlive(u) || u.state === 'combat' || u.state === 'dormant' || u.gripped || isLight(u) || u.kind === 'goliath') continue
    if (Math.hypot(u.x - d.x, u.z - d.z) > BODY_THUD_M * (u.kind === 'hound' ? HOUND_EARS : 1)) continue
    if (gar.drill) { u.look = angleDelta(u.yaw, headingTo(u.x, u.z, d.x, d.z)); continue }
    u.focusT = Math.max(u.focusT, FOCUS_S)
    u.detect = Math.max(u.detect, SUSPECT_AT + 0.05)
    suspect(gar, u, d.x, d.z, false)
  }
}

/** Whether a defender has a gun to test a disguise with (#111): people and the gun-carrying machines. */
const gunOfKind = (u: Unit): boolean =>
  u.kind === 'guard' || u.kind === 'sentry' || u.kind === 'commander' || u.kind === 'roomba' || u.kind === 'enforcer'

/**
 * One step at a disguise (#111). True while it is busy there (its round
 * waits). It walks up to it, stares, backs off with its gun up, fires once,
 * and goes back to its round. The disguise gone (the mech stood up) or a
 * fight on, it lets it be.
 */
const stepInspect = (u: Unit, gar: Garrison, g: Grid, target: Target, dt: number): boolean => {
  const ins = u.inspect!
  if (!target.box || u.state === 'combat' || u.detect >= 1) { u.inspect = null; return false }
  ins.t += dt
  const spec = SPECS[u.kind]
  const toward = headingTo(u.x, u.z, target.x, target.z)
  const d = Math.hypot(target.x - u.x, target.z - u.z)
  u.seenX = target.x
  u.seenZ = target.z
  if (ins.phase === 'approach') {
    if (d <= INSPECT_STAND + 0.3 || ins.t > 5) { ins.phase = 'stare'; ins.t = 0; u.path = []; stand(u); return true }
    const sx = target.x - Math.sin(toward) * INSPECT_STAND
    const sz = target.z - Math.cos(toward) * INSPECT_STAND
    if (u.path.length === 0 && !goTo(u, g, sx, sz)) { ins.phase = 'stare'; ins.t = 0; return true }
    follow(u, g, spec.walk, dt)
    return true
  }
  // Facing it the whole time; the head tilts this way and that (the view reads it as puzzled).
  stand(u)
  turnToward(u, toward, dt)
  if (ins.phase === 'stare') {
    u.look = Math.sin(ins.t * 1.7) * 0.35
    u.detect = Math.max(u.detect, SUSPECT_AT * 0.6)
    if (ins.t >= INSPECT_STARE_S) { ins.phase = 'back'; ins.t = 0 }
    return true
  }
  if (ins.phase === 'back') {
    // A few steps backwards, the gun coming up.
    u.look = 0
    const step = (INSPECT_BACK / INSPECT_BACK_S) * dt
    const nx = u.x - Math.sin(toward) * step
    const nz = u.z - Math.cos(toward) * step
    if (canStep(u.y, heightAt(g, nx, nz))) { u.x = nx; u.z = nz }
    if (ins.t >= INSPECT_BACK_S) { ins.phase = 'shot'; ins.t = 0 }
    return true
  }
  // The test round: one, at the thing. Then it walks on, if nothing happened.
  if (ins.t >= 0.35 && ins.t - dt < 0.35) {
    u.recoil = 1
    const hits = hasLineOfSight(g, u.x, u.y + spec.eye, u.z, target.x, target.y + 0.8, target.z)
    gar.events.push({ type: 'fire', id: u.id, damage: hits ? Math.max(1, Math.round(INSPECT_DAMAGE * gar.threat.damage)) : 0 })
  }
  if (ins.t >= 1.2) {
    u.inspect = null
    u.inspectCool = INSPECT_COOL_S
    u.detect = Math.min(u.detect, SUSPECT_AT * 0.4)
    u.path = []
    return false
  }
  return true
}

/** A walking step is heard this near (#116); each heard step adds STEP_NOTICE to a listener's attention. */
export const WALK_EARSHOT = 4.5
const STEP_NOTICE = 0.14

/**
 * A footstep (#116): walking (not crouched) is heard close by. Each step
 * raises a listener's attention a little and turns its head toward it; a few
 * in a row and it is suspicious and comes to look. Crouched steps are silent.
 */
export const stepHeard = (gar: Garrison, x: number, z: number, radius = WALK_EARSHOT): number => {
  let n = 0
  for (const u of gar.units) {
    if (!isAlive(u) || u.state === 'combat' || u.state === 'dormant' || u.gripped || isLight(u) || u.kind === 'goliath') continue
    if (Math.hypot(u.x - x, u.z - z) > radius * (u.kind === 'hound' ? HOUND_EARS : 1)) continue
    u.detect = Math.min(SUSPECT_AT + 0.05, u.detect + STEP_NOTICE)
    u.look = angleDelta(u.yaw, headingTo(u.x, u.z, x, z)) * 0.6
    if (u.detect >= SUSPECT_AT && u.state === 'patrol') suspect(gar, u, x, z, false)
    n++
  }
  return n
}

/** How long a listener wonders about a noise before it goes to look. */
export const WONDER_S = 2

/**
 * A noise nobody can place: a hook biting into the top of a wall. Everyone in
 * earshot who is on patrol stops and WONDERS for `WONDER_S` (looking about
 * where they stand) before walking over to the spot. Returns a token for the
 * noise and how many heard it; `voidNoise` with that token, inside the two
 * seconds, takes the cause away and they shrug it off.
 */
export const wonderAt = (gar: Garrison, x: number, z: number, radius: number): { token: number; heard: number } => {
  const token = ++gar.noiseSeq
  let heard = 0
  for (const u of gar.units) {
    if (!isAlive(u) || u.state !== 'patrol' || u.kind === 'goliath' || u.kind === 'searchlight' || u.gripped) continue
    if (Math.hypot(u.x - x, u.z - z) > radius) continue
    suspect(gar, u, x, z, false)
    u.huh = WONDER_S
    u.noise = token
    heard++
  }
  return { token, heard }
}

/** The cause of a noise is gone: whoever is still wondering about it lets it go. */
export const voidNoise = (gar: Garrison, token: number): number => {
  let n = 0
  if (!token) return 0
  for (const u of gar.units) {
    if (u.noise !== token || u.state !== 'suspicious' || u.t >= u.huh) continue
    u.noise = 0
    u.huh = HUH_S
    u.detect = Math.min(u.detect, 0.2)
    u.path = []
    enter(u, 'patrol')
    gar.events.push({ type: 'calm', id: u.id })
    n++
  }
  return n
}

/**
 * A decoy lights up at a point: every human in range who can see it walks
 * over to look, without the base thinking anything of it.
 */
export const lureTo = (gar: Garrison, g: Grid, x: number, y: number, z: number, radius: number): number => {
  let n = 0
  for (const u of gar.units) {
    if (!isAlive(u) || !isHuman(u) || u.state === 'combat') continue
    if (u.state === 'suspicious' && !u.lured) continue
    if (Math.hypot(u.x - x, u.z - z) > radius) continue
    if (!hasLineOfSight(g, u.x, u.y + SPECS[u.kind].eye, u.z, x, y + 1.2, z)) continue
    suspect(gar, u, x, z, true)
    n++
  }
  return n
}

/** How many of the garrison are still up (dormant machines included). */
export const livingCount = (gar: Garrison): number => gar.units.reduce((n, u) => n + (isAlive(u) ? 1 : 0), 0)
