import { VOID, findPath, hasLineOfSight, heightAt, smoothPath, toCell, walkLine, type Grid } from '../world/grid'
import type { Fortress, PostKind, Waypoint } from '../world/fortress'
import { exposure, type Viewer, type Seen, fillRate, GRACE_S, CLOSE_M } from './perception'
import { makeAlert, raiseAlert, pressAlert, stepAlert, ENGAGED_PER_S, BEACON_CAP, ALERT_MAX, type Alert, type AlertCause } from './alert'
import { angleDelta } from './player'
import { hashSeed, mulberry32, type Rng } from '../world/rng'

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
  hound: { eye: 0.8, height: 1.05, radius: 0.45, walk: 2.0, look: 3.6, run: 6.4, range: 15, half: 1.3, hp: 18 }
}

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
}
const THREATS: readonly Threat[] = [
  { hp: 1, damage: 0.75, notice: 0.8 },
  { hp: 1, damage: 1, notice: 1 },
  { hp: 1.15, damage: 1.1, notice: 1 },
  { hp: 1.3, damage: 1.25, notice: 1.1 },
  { hp: 1.6, damage: 1.5, notice: 1.25 }
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
  role: 'engineer' | null
  job: { kind: 'beacon' | 'light'; i: number } | null
  jobT: number
  /** The freshest scent it has followed (garrison time). */
  scentT: number
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
  lkp: { x: number; z: number; t: number }
  /** The alarm beacons, the unit running to light one (−1 none), and the wait before another tries. */
  beacons: Beacon[]
  runner: number
  runnerWait: number
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
  kind: 'pile' | 'light'
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
 * Losing them (round 3, after Odyssey): guards that lost sight go to the last
 * known position the base shares, spread round it and search it for this
 * long, walking a new point every SEARCH_HOP_S, then go back to their rounds
 * warier (wider and further sight). With nobody fighting and nobody having
 * seen the mech for CHAOS_COOL_S, a full alert stands down: lit beacons burn
 * out and the meter falls back to ALERT_AFTER of full.
 */
export const SEARCH_HOT_S = 25
const SEARCH_HOP_S = 6
const SEARCH_SPREAD = 7
export const CHAOS_COOL_S = 45
const ALERT_AFTER = 0.6
/** On alert patrol, sight is this much wider and further. */
export const WARY_CONE = 1.25
export const WARY_RANGE = 1.15
/** In a fight, sight reaches this much further. */
export const COMBAT_RANGE = 2.5

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
 * Machines: `burst` (apart, in pieces that stay), `slump` (an Enforcer that
 * folds in one piece), `crash` (a drone that falls whole).
 */
export type DeathKind = 'back' | 'front' | 'spin' | 'thrown' | 'burst' | 'slump' | 'crash'
/** What did it: a single round, a burst of them, an explosion, the blade. */
export type KillHow = 'shot' | 'spray' | 'blast' | 'blade'

/** Machines taken apart by anything less than an explosion burst this often. */
export const BURST_CHANCE = 0.6

export type GarrisonEvent =
  | { type: 'suspicious'; id: number }
  | { type: 'spotted'; id: number }
  | { type: 'calm'; id: number }
  | { type: 'body'; id: number; corpse: number }
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
  | { type: 'kill'; id: number; death: DeathKind }
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
      path: [], pathI: 0, repath: 0, bodyT: 0, seenFor: 0, unseenFor: 9, shouted: false, runner: -1, wary: false, hop: 0, fought: false, checkAt: Infinity, checked: false, hp: Math.round(SPECS[p.kind].hp * threat.hp * (p.boss === 'foreman' ? FOREMAN_HP : 1)), maxHp: Math.round(SPECS[p.kind].hp * threat.hp * (p.boss === 'foreman' ? FOREMAN_HP : 1)), boss: p.boss ?? null, shield: !!p.shield, deadT: 0, fallDir: 1, huh: HUH_S, noise: 0, gripped: false, hold: 0, death: 'back', hitX: 0, hitZ: 0, found: false,
      stride: 0, speed01: 0, homeX: p.x, homeZ: p.z, homeYaw: p.facing, altitude: p.altitude,
      spotX: spot.x, spotZ: spot.z,
      seed: (id * 2.399) % (Math.PI * 2),
      power: mech ? 0 : 1, aimT: 0, fireT: 0, burst: 0, burstT: 0, shellT: 0, shellX: 0, shellZ: 0, recoil: 0,
      tagged: false, hidden: false, partner: p.partner ?? -1, chatting: false, poke: false, changeT: 0,
      role: p.role ?? null, job: null, jobT: 0, scentT: -1e9,
      jammed: false, shells: 0, overheat: 0, phase2: false, glintT: 0, dashT: 0, dashX: 0, dashZ: 0, dashCool: 2, dashHit: false
    }
  })
  const beacons: Beacon[] = (f.beacons ?? []).map(b => ({ ...b, state: 'ready' as const, lit: 0 }))
  // The generators, and a servo on each Foreman's pad.
  const rigs: Rig[] = [
    ...(f.generators ?? []).map(gn => ({ kind: 'generator' as const, ...gn, unit: -1, cut: false })),
    ...units.filter(u => u.boss === 'foreman').map(u => ({ kind: 'servo' as const, x: u.x, y: u.y, z: u.z, unit: u.id, cut: false }))
  ]
  return { units, alert: makeAlert(), time: 0, events: [], rng: mulberry32(hashSeed(f.id)), wave: 0, chaosT: 0, lures: [], threat, noiseSeq: 0, beacons, runner: -1, runnerWait: 0, lkp: { x: 0, z: 0, t: -1e9 }, changes: [], scent: [], scentT: 0, unreachable: new Set(), drill: false, rigs }
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
  u.stride += step * 3.4
  u.speed01 = Math.min(1, speed / SPECS[u.kind].run)
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

const viewerOf = (u: Unit): Viewer => {
  const s = SPECS[u.kind]
  const k = u.wary ? 1 : 0
  // In a fight it keeps the mech in view a long way off (#59).
  const fight = u.state === 'combat' ? COMBAT_RANGE : 1
  // Talking: it watches its partner, not the yard.
  const chat = u.chatting ? CHAT_SIGHT : 1
  return { x: u.x, y: u.y + s.eye, z: u.z, yaw: u.yaw + u.look, halfAngle: s.half * (1 + (WARY_CONE - 1) * k) * (u.chatting ? CHAT_CONE : 1), range: s.range * (1 + (WARY_RANGE - 1) * k) * fight * chat }
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
const sight = (u: Unit, g: Grid, t: Seen): number => {
  if (!isLight(u)) return exposure(g, viewerOf(u), t)
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
  gar.events.push({ type: 'chaos' })
  for (const u of gar.units) {
    if (!isAlive(u)) continue
    if (u.state === 'dormant') { wake(gar, u, target.x, target.z); continue }
    u.detect = 1
    u.lured = false
    u.seenX = target.x
    u.seenZ = target.z
    u.repath = 0
    if (u.state !== 'combat') enter(u, 'combat')
  }
}

/** Power a dormant machine up and point it at something. */
const wake = (gar: Garrison, u: Unit, x: number, z: number): void => {
  if (u.state !== 'dormant') return
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
const huntAround = (u: Unit, g: Grid, gar: Garrison, dt: number): void => {
  u.hop -= dt
  if (u.hop <= 0 && gar.lkp.t > -1e8) {
    u.hop = SEARCH_HOP_S
    const a = (u.seed * 6.283 + gar.time * 0.37 + u.id * 1.7) % 6.283
    const r = SEARCH_SPREAD * (0.4 + 0.6 * ((u.seed * 7.3 + gar.time * 0.11) % 1))
    const x = gar.lkp.x + Math.sin(a) * r
    const z = gar.lkp.z + Math.cos(a) * r
    if (!goTo(u, g, x, z)) goTo(u, g, gar.lkp.x, gar.lkp.z)
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

/** A drone or a light is sure: it has no voice, so it calls the nearest guard, who shouts. */
const pingGuard = (gar: Garrison, from: Unit, target: Target): void => {
  let best: Unit | null = null
  let bestD = PING_M
  for (const o of gar.units) {
    if (!isAlive(o) || isLight(o) || o.state === 'dormant' || o.gripped || o.kind === 'goliath') continue
    const d = Math.hypot(o.x - from.x, o.z - from.z)
    if (d < bestD) { best = o; bestD = d }
  }
  if (!best) return
  best.detect = 1
  best.seenX = target.x
  best.seenZ = target.z
  best.lured = false
  best.path = []
  if (best.state !== 'combat') enter(best, 'combat')
  gar.events.push({ type: 'ping', id: from.id, guard: best.id })
  shout(gar, best, target)
}

/** Send whoever is in the fight nearest a working beacon to light it. */
const sendRunner = (gar: Garrison, g: Grid): void => {
  if (gar.runner >= 0 || gar.alert.chaos || gar.runnerWait > 0) return
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
    suspect(gar, o, fromX, fromZ, false)
  }
}

/** The mech put a beacon out of action. True if it was one that could still be lit. */
export const sabotageBeacon = (gar: Garrison, i: number): boolean => {
  const b = gar.beacons[i]
  if (!b || b.state === 'lit' || b.state === 'sabotaged') return false
  const running = gar.runner >= 0 && gar.units[gar.runner]?.runner === i
  b.state = 'sabotaged'
  b.lit = 0
  if (running) { stopRunner(gar); gar.runnerWait = 0 }
  return true
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
    if (u.sees) u.repath = 0
    else if (!gar.alert.chaos && (u.repath += dt) > DRONE_LOST_S) { u.repath = 0; enter(u, 'search') }
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
  }  const engage = u.kind === 'goliath' ? 30 : u.kind === 'enforcer' ? 14 : u.kind === 'hound' ? 1.3 : ENGAGE_DIST
  if (u.kind === 'goliath' && u.overheat > 0) {
    // Overheating: the guns are quiet and the hull swings its open vents
    // round toward the mech (it cannot help it: that is where the air is).
    u.overheat = Math.max(0, u.overheat - dt)
    stand(u)
    turnToward(u, headingTo(u.x, u.z, target.x, target.z) + Math.PI, dt, turn * 2.5)
    return
  }
  if (u.kind === 'goliath') {
    // The tank holds its ground (it is wider than a gate): it turns its
    // hull, slowly, toward where the mech is or was last reported.
    aimTurret(u, gar, g, target, dt)
    if (!u.sees && gar.lkp.t > -1e8) {
      u.seenX = gar.lkp.x
      u.seenZ = gar.lkp.z
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
        // Guards close in pairs from either side, not in a line.
        const side = u.kind === 'guard' ? (u.id % 3) - 1 : 0
        const away = headingTo(target.x, target.z, u.x, u.z)
        const fx = target.x + Math.cos(away) * side * FLANK_M
        const fz = target.z - Math.sin(away) * side * FLANK_M
        if (side === 0 || !goTo(u, g, fx, fz)) goTo(u, g, target.x, target.z)
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
export const stepGarrison = (gar: Garrison, g: Grid, target: Target, dt: number): void => {
  gar.time += dt
  checkIns(gar)
  // A full alert that has gone cold stands down.
  if (gar.alert.chaos && gar.time - gar.lkp.t > CHAOS_COOL_S && !gar.units.some(o => o.state === 'combat' && isAlive(o))) {
    gar.alert.chaos = false
    gar.alert.level = ALERT_MAX * ALERT_AFTER
    gar.alert.quiet = 0
    for (const b of gar.beacons) if (b.state === 'lit') { b.state = 'ready'; b.lit = 0 }
    gar.events.push({ type: 'standDown' })
  }
  if (gar.runnerWait > 0) gar.runnerWait -= dt
  if (gar.beacons.length > 0 && gar.runner < 0 && !gar.alert.chaos && gar.runnerWait <= 0 && gar.units.some(o => isAlive(o) && (o.state === 'combat' || (o.state !== 'patrol' && o.fought)) && !isLight(o))) sendRunner(gar, g)
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
    if (u.state === 'dead') {
      u.deadT += dt
      // A drone drops out of the sky.
      if (u.kind === 'drone') {
        const floor = heightAt(g, u.x, u.z)
        u.y = Math.max((floor === VOID ? 0 : floor) + 0.2, u.y - (4 + u.deadT * 14) * dt)
      }
      continue
    }
    if (u.state === 'dormant' || u.state === 'reserve') continue
    // In the mech's grip: no eyes, no feet, no voice.
    if (u.gripped) { u.speed01 = 0; u.sees = false; continue }
    if (u.power < 1) {
      // Powering up: it stands and whirs, and does nothing else yet.
      u.power = Math.min(1, u.power + dt / (WAKE_S * (u.jammed ? JAM_WAKE : 1)))
      calm = false
      continue
    }

    // ── What it sees of the mech ──
    let exposed = target.visible ? sight(u, g, seen) : 0
    // In a thicket, crouched: nobody sees it but from right on top of it (Odyssey's bushes).
    if (target.brush && Math.hypot(target.x - u.x, target.z - u.z) > BRUSH_SEEN_M) exposed = 0
    // Under the box: a box is a box, unless it moves, or somebody walks into it.
    const boxedAway = !!target.box && Math.hypot(target.x - u.x, target.z - u.z) > BOX_BUMP
    if (boxedAway) exposed = target.box === 'still' ? 0 : exposed * BOX_CREEP_SEEN
    u.sees = exposed > 0
    // A box seen moving: it goes over to give it a poke.
    if (u.sees && boxedAway && target.box === 'creep' && u.seenFor > POKE_AFTER_S && !isLight(u) && u.state !== 'combat' && !u.poke) {
      u.poke = true
      u.detect = Math.max(u.detect, SUSPECT_AT + 0.02)
      gar.events.push({ type: 'poke', id: u.id })
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
        const v = viewerOf(u)
        const off = Math.abs(angleDelta(v.yaw, headingTo(u.x, u.z, target.x, target.z))) / Math.max(0.01, v.halfAngle)
        rate = fillRate({ dist, range: SPECS[u.kind].range, exposed, crouched: target.crouched, off, shadow: !!target.shadow, yellow }, band)
      }
      // A glance is forgiven: the first moment of sight adds nothing to a
      // unit at ease, unless the mech is right in front of it.
      const grace = u.state === 'patrol' && u.seenFor < GRACE_S && dist > CLOSE_M
      // Sharper senses once it has been looking: a fresh white fill is quicker.
      // The yellow band is not: the player gets a fair moment to duck out.
      const wary = !yellow && (u.state === 'suspicious' || u.state === 'search') ? WARY_GAIN : 1
      if (!grace) u.detect = Math.min(boxedAway && u.state !== 'combat' ? BOX_CREEP_CAP : 1, u.detect + rate * wary * gar.threat.notice * dt)
      u.seenX = target.x
      u.seenZ = target.z
      gar.lkp.x = target.x
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
      // A drone's report sends a machine (plan G7).
      if (isLight(u)) wakeNearest(gar, target.x, target.z)
      // A hound barks: the guards round it come, beacons or not.
      if (u.kind === 'hound') shout(gar, u, target)
      if (gar.beacons.length === 0) {
        if (!known) raise(gar, isLight(u) ? 'drone' : 'seen', target)
        else if (pressAlert(gar.alert, SECOND_WITNESS)) goChaos(gar, target)
      } else {
        // Odyssey's fort: the sure one shouts (a light calls a guard, who
        // shouts), and somebody runs to light a beacon. Until one is lit
        // the fight stays where it is.
        if (!known) raise(gar, isLight(u) ? 'drone' : 'seen', target)
        if (isLight(u)) pingGuard(gar, u, target)
        else shout(gar, u, target)
        sendRunner(gar, g)
      }
    } else if (u.state === 'patrol' && u.detect >= SUSPECT_AT) {
      suspect(gar, u, u.seenX, u.seenZ, false)
    } else if (u.state === 'suspicious' && u.lured && u.detect >= SUSPECT_AT) {
      // What it walked over to look at turns out to be worth a real look.
      u.lured = false
    }

    // ── The poke: there, and the box is still there ──
    if (u.poke) {
      if (u.state === 'patrol' || u.state === 'combat' || !target.box) u.poke = false
      else if (Math.hypot(target.x - u.x, target.z - u.z) < BOX_BUMP + 0.8) {
        // A poke, and the box says ow.
        u.poke = false
        u.detect = 1
        u.seenX = target.x
        u.seenZ = target.z
      }
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
        if (sight(u, g, { x: c.x, feetY: c.y, z: c.z, height: 0.8 }) <= 0) continue
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
        if (sight(u, g, { x: c.x, feetY: c.y, z: c.z, height: BODY_HEIGHT }) <= 0) continue
        looking = true
        u.bodyT += dt
        if (u.bodyT >= BODY_NOTICE_S) {
          c.found = true
          u.bodyT = 0
          u.detect = Math.max(u.detect, 0.6)
          gar.events.push({ type: 'body', id: u.id, corpse: c.id })
          suspect(gar, u, c.x, c.z, false)
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
        // After a fight: a proper hunt round the last known position.
        const hunt = u.fought && !u.lured && !isLight(u)
        if (hunt) huntAround(u, g, gar, dt)
        else investigate(u, g, dt)
        const limit = u.lured ? SCAN_LURED_S : hunt ? SEARCH_HOT_S : gar.alert.level > 0 ? HUNT_SCAN_S : SCAN_S
        if (u.t > limit && !u.sees) {
          u.lured = false
          u.detect = Math.min(u.detect, SUSPECT_AT * 0.5)
          u.path = []
          // A hunt that found nothing leaves it on its guard.
          if (hunt) u.wary = true
          enter(u, 'patrol')
          gar.events.push({ type: 'calm', id: u.id })
        }
        break
      }
      case 'combat':
        if (u.runner >= 0) { runToBeacon(u, g, gar, target, dt); break }
        fight(u, g, gar, target, dt)
        if (u.sees) watched = true
        // Out of sight long enough, and not in full alert: it lets go.
        if (!u.sees && !gar.alert.chaos) u.detect = Math.max(0.5, u.detect - 0.12 * dt)
        break
    }
    if (u.state === 'combat' || u.state === 'search' || (u.state === 'suspicious' && !u.lured)) calm = false
  }

  // Full alert: reinforcements come in through the gates, in waves.
  if (gar.alert.chaos) {
    gar.chaosT += dt
    if (gar.wave < WAVE_AT_S.length && gar.chaosT >= WAVE_AT_S[gar.wave]!) {
      gar.wave++
      let n = 0
      for (const u of gar.units) {
        if (u.state !== 'reserve' || n >= WAVE_SIZE) continue
        n++
        u.detect = 1
        u.seenX = target.x
        u.seenZ = target.z
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
  } else {
    // Its own number decides, so the same machine dies the same way in a replay.
    const roll = (((u.seed * 7.13 + u.id * 0.37) % 1) + 1) % 1
    const apart = u.kind === 'goliath' || how === 'blast' || roll < BURST_CHANCE
    u.death = apart || u.kind === 'searchlight' || u.kind === 'hound' ? 'burst' : u.kind === 'drone' ? 'crash' : 'slump'
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
  enter(u, 'combat')
  gar.events.push({ type: 'spotted', id })
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
    if (!isAlive(u) || u.state === 'dormant' || u.state === 'combat') continue
    if (Math.hypot(u.x - x, u.z - z) > radius) continue
    heard = true
    u.detect = Math.max(u.detect, SUSPECT_AT + 0.05)
    suspect(gar, u, x, z, false)
  }
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
