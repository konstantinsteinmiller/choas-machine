import type { InputFamily } from '../data/ids'

/**
 * ─── The control coach: wordless, on screen, earned away ─────────────────────
 *
 * Every control is taught by a GLYPH drawn where the action happens (a key
 * cluster, a mouse with a button lit, a finger that holds and lets go, a
 * pulse on the HUD chip itself), never by a sentence that is gone before it
 * is read. A glyph stays until the player has DONE the thing a few times:
 * each success fills a pip, the last one retires it for good.
 *
 * Rules, each from a playtest of an earlier game:
 *  - Nothing times out. A player who has not found the camera still sees its
 *    glyph a minute later; one who has, never sees it again.
 *  - Mastery is per input family: a desktop veteran on a phone has still not
 *    learned the stick.
 *  - A glyph comes in with its CONTEXT (the blade when a guard is in reach,
 *    the weapon wheel when the base goes loud), two at a time at most.
 *  - It comes back when the player seems stuck (no camera movement, no
 *    movement at all), and the "?" button brings the core set back.
 *
 * Pure bookkeeping: the mission reports what the player did (`coachUse`) and
 * the situation each step; the HUD draws what `stepCoach` returns.
 */

export const HINT_IDS = [
  'move', 'look', 'scope', 'fire', 'crouch', 'blade', 'climb', 'cable', 'decoy', 'weapon', 'sprint', 'grapple', 'loot', 'goal', 'hide', 'sabotage',
  'jump', 'rope', 'burn', 'supply', 'rocket'
] as const
export type HintId = (typeof HINT_IDS)[number]

interface HintDef {
  /** Successes that retire the glyph for good. */
  goal: number
  /** Higher shows first when too many compete. */
  priority: number
}

export const HINTS: Readonly<Record<HintId, HintDef>> = {
  fire: { goal: 2, priority: 9 },
  blade: { goal: 2, priority: 9 },
  // At a pile: the one thing the raid is for.
  loot: { goal: 1, priority: 9 },
  // At an alarm beacon, unseen: put it out of action.
  sabotage: { goal: 1, priority: 9 },
  grapple: { goal: 1, priority: 8 },
  climb: { goal: 1, priority: 8 },
  cable: { goal: 1, priority: 8 },
  crouch: { goal: 1, priority: 7 },
  // Somebody is about to be sure: the box.
  hide: { goal: 1, priority: 7.5 },
  // The thumbs are never crowded out by the scope: a player who cannot move
  // or look has no use for it yet.
  move: { goal: 3, priority: 5 },
  look: { goal: 3, priority: 5 },
  scope: { goal: 2, priority: 4.5 },
  decoy: { goal: 1, priority: 4 },
  weapon: { goal: 1, priority: 4 },
  // Where to go: the marker pulses until the first pile is reached.
  goal: { goal: 1, priority: 6 },
  // A long way to go and nobody about: the legs can run.
  sprint: { goal: 2, priority: 4 },
  // Round 4: taught by the training holograms (#87); in a raid by their prompts.
  jump: { goal: 1, priority: 6 },
  rope: { goal: 1, priority: 8 },
  burn: { goal: 1, priority: 8 },
  supply: { goal: 1, priority: 6 },
  // The launcher drawn (#146): taught by its own hologram room.
  rocket: { goal: 1, priority: 4 }
}

/** At most this many glyphs at once: more than two is more than a new player takes in. */
export const MAX_SHOWN = 2
/** A glyph lingers this long after its context has passed, so it does not flicker. */
const LINGER_S = 2.5
/** Metres walked, and radians turned, that count as one success. */
export const MOVE_STEP_M = 2.5
export const LOOK_STEP_RAD = 0.6
/** Stuck: this long without turning the camera, or without moving. */
// Standing still this long brings the thumbs' glyph back, at most RECALLS_MAX
// times a session: a player watching a hologram or waiting on a guard stands
// still on purpose, and the hand kept coming back (a playtester asked if it
// ever went away).
const LOOK_IDLE_S = 30
const MOVE_IDLE_S = 30
export const RECALLS_MAX = 2
/** The "?" button shows the core set for this long. */
const HELP_S = 20
const CORE: readonly HintId[] = ['move', 'look', 'scope', 'crouch', 'weapon']
/** The scope's glyph waits for the thumbs, but not for ever. */
const SCOPE_AFTER_S = 8

export interface HintView {
  id: HintId
  /** Successes so far toward `goal`. */
  count: number
  goal: number
  /** Goes up on every success: the HUD keys its green flash on it. */
  flash: number
}

export interface Coach {
  family: InputFamily
  counts: Record<HintId, number>
  flash: Record<HintId, number>
  /** Until when (coach time) each glyph stays up after its context passed. */
  until: Record<HintId, number>
  /** A recall is up for these: one more use sends them away again. */
  recalled: Set<HintId>
  /** How often each thumb's glyph was brought back by standing still. */
  recalls: { move: number; look: number }
  walked: number
  turned: number
  lookIdle: number
  moveIdle: number
  helpUntil: number
  time: number
  /** What was last handed to the HUD, to tell when it changes. */
  signature: string
}

const zero = (): Record<HintId, number> => Object.fromEntries(HINT_IDS.map(id => [id, 0])) as Record<HintId, number>

/** A coach for one input family, starting from what that family has already learned. */
export const makeCoach = (family: InputFamily, learned: Record<string, number> = {}): Coach => {
  const counts = zero()
  for (const id of HINT_IDS) counts[id] = Math.min(HINTS[id].goal, Math.max(0, learned[id] ?? 0))
  return {
    family, counts, flash: zero(), until: zero(), recalled: new Set(), recalls: { move: 0, look: 0 }, walked: 0, turned: 0,
    lookIdle: 0, moveIdle: 0, helpUntil: -1, time: 0, signature: ''
  }
}

export const hintDone = (c: Coach, id: HintId): boolean => c.counts[id] >= HINTS[id].goal

/**
 * The player did the thing. Returns true when this was the success that
 * retired the glyph (the caller saves the profile then).
 */
export const coachUse = (c: Coach, id: HintId): boolean => {
  c.flash[id]++
  // Asked for (H): it stays until the help goes.
  if (c.helpUntil >= 0 && CORE.includes(id) && c.recalled.has(id)) return false
  if (c.recalled.delete(id)) {
    // A recalled glyph goes with one use.
    c.until[id] = c.time + 0.9
    return false
  }
  if (hintDone(c, id)) return false
  c.counts[id]++
  if (!hintDone(c, id)) return false
  // Retired: it stays a moment, with its last pip lit, then goes.
  c.until[id] = c.time + 0.9
  return true
}

/**
 * The "?" button (H): bring the core set back for a while, all of it at
 * once, and keep it up through using it (#168: it went away again on the
 * next step walked). Pressed again, it goes. Returns whether it came up.
 */
export const coachHelp = (c: Coach): boolean => {
  if (c.helpUntil >= 0) {
    c.helpUntil = -1
    for (const id of CORE) c.recalled.delete(id)
    return false
  }
  c.helpUntil = c.time + HELP_S
  for (const id of CORE) c.recalled.add(id)
  return true
}

/** The help is up (`coachHelp`). */
export const helping = (c: Coach): boolean => c.helpUntil >= 0

/** What the mission tells the coach every step. */
export interface CoachContext {
  /** The player has control (not a cutscene, not a menu). */
  playing: boolean
  /**
   * The training room the mech is in teaches this control and its door is
   * still shut: its card shows from the moment the room is entered until the
   * lesson is done, learned before or not (a playtester stood in the rope room
   * with nothing telling them what opens its door).
   */
  roomLesson?: HintId | ''
  /**
   * Controls the training has not come to yet: no situational card for them
   * (a sentry's suspicion in the sneak room showed the disguise, two rooms
   * before the disguise is taught and before its button is on screen).
   */
  notYet?: ReadonlySet<HintId>
  /** Metres walked and radians of camera turned since the last step. */
  walked: number
  turned: number
  /** There is somebody left to deal with. */
  enemies: boolean
  /** A defender stands in clear sight within the rifle's reach. */
  mark?: boolean
  /** The weapon is up. */
  aiming: boolean
  /** The base is on full alert. */
  chaos: boolean
  /** How sure the most suspicious defender is, 0 … 1. */
  threat: number
  /** An unaware guard is near enough to matter. */
  guardNear: boolean
  /** The blade has something in reach. */
  strike: boolean
  nearLadder: boolean
  nearCable: boolean
  decoys: number
  /** A pile of salvage within reach; the hook's offer at a wall. */
  loot: boolean
  hook: boolean
  /** Salvage is still the job, and none of it has been reached yet. */
  seeking: boolean
  /** The waypoint is a long walk away. */
  far: boolean
  /** Under the hide box already. */
  boxed: boolean
  /** An alarm beacon within reach, nobody looking. */
  sabotage: boolean
}

/**
 * Advance the coach. Returns the glyphs to show when the set (or a count, or
 * a flash) changed since the last call, otherwise null.
 */
export const stepCoach = (c: Coach, ctx: CoachContext, dt: number): HintView[] | null => {
  c.time += dt
  if (ctx.playing) {
    // Walking and looking are counted by how much, not by how often.
    c.walked += ctx.walked
    c.turned += ctx.turned
    c.moveIdle = ctx.walked > 0.001 ? 0 : c.moveIdle + dt
    c.lookIdle = ctx.turned > 0.0005 ? 0 : c.lookIdle + dt
    while (c.walked >= MOVE_STEP_M) { c.walked -= MOVE_STEP_M; coachUse(c, 'move') }
    while (c.turned >= LOOK_STEP_RAD) { c.turned -= LOOK_STEP_RAD; coachUse(c, 'look') }
    // Stuck? Bring the thumbs' glyphs back.
    if (c.lookIdle > LOOK_IDLE_S && hintDone(c, 'look') && c.recalls.look < RECALLS_MAX) { c.recalled.add('look'); c.recalls.look++; c.lookIdle = 0 }
    if (c.moveIdle > MOVE_IDLE_S && hintDone(c, 'move') && !ctx.aiming && c.recalls.move < RECALLS_MAX) { c.recalled.add('move'); c.recalls.move++; c.moveIdle = 0 }
  }
  if (c.helpUntil >= 0 && c.time > c.helpUntil) {
    c.helpUntil = -1
    for (const id of CORE) c.recalled.delete(id)
  }

  const quiet = !ctx.chaos
  const thumbs = hintDone(c, 'move') && hintDone(c, 'look')
  const wanted: Record<HintId, boolean> = {
    move: true,
    look: true,
    // A defender in clear sight from the perch is the lesson's own target.
    scope: ctx.enemies && quiet && (thumbs || c.time > SCOPE_AFTER_S || (!!ctx.mark && hintDone(c, 'look'))),
    fire: ctx.aiming,
    crouch: quiet && (ctx.threat > 0.12 || ctx.guardNear),
    blade: ctx.strike,
    // The same push of the stick as walking: taught once walking is.
    climb: ctx.nearLadder && hintDone(c, 'move'),
    cable: ctx.nearCable && hintDone(c, 'move'),
    decoy: quiet && ctx.guardNear && ctx.decoys > 0 && hintDone(c, 'crouch'),
    weapon: ctx.chaos,
    loot: ctx.loot,
    grapple: ctx.hook && hintDone(c, 'move'),
    // Once the thumbs are learned: then the marker is the next thing to find.
    goal: ctx.seeking && thumbs,
    sprint: quiet && ctx.far && !ctx.guardNear && hintDone(c, 'move'),
    // Taught once crouching is, when a guard is half-way to sure.
    hide: quiet && !ctx.boxed && ctx.threat > 0.3 && hintDone(c, 'crouch'),
    sabotage: ctx.sabotage,
    // Shown by the training holograms only; in a raid the world prompts ask for these.
    jump: false,
    rope: false,
    burn: false,
    rocket: false,
    supply: false
  }

  const shown: HintId[] = []
  if (ctx.playing) {
    for (const id of HINT_IDS) {
      const live = c.recalled.has(id) || id === ctx.roomLesson || (!hintDone(c, id) && wanted[id] && !ctx.notYet?.has(id))
      if (live) c.until[id] = Math.max(c.until[id], c.time + LINGER_S)
      if (c.until[id] > c.time && (live || c.flash[id] > 0 || !hintDone(c, id))) shown.push(id)
    }
    // The room's own lesson card first: it is what the room is for (the decoy
    // room's card lost its place to crouch and move).
    const rank = (id: HintId): number => (id === ctx.roomLesson ? 1e3 : 0) + HINTS[id].priority
    shown.sort((a, b) => rank(b) - rank(a) || HINT_IDS.indexOf(a) - HINT_IDS.indexOf(b))
    shown.length = Math.min(shown.length, c.helpUntil >= 0 ? CORE.length : MAX_SHOWN)
  }

  const sig = shown.map(id => `${id}:${c.counts[id]}:${c.flash[id]}`).join('|')
  if (sig === c.signature) return null
  c.signature = sig
  return shown.map(id => ({ id, count: c.counts[id], goal: HINTS[id].goal, flash: c.flash[id] }))
}
