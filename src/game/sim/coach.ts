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

export const HINT_IDS = ['move', 'look', 'scope', 'fire', 'crouch', 'blade', 'climb', 'cable', 'decoy', 'weapon'] as const
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
  climb: { goal: 1, priority: 8 },
  cable: { goal: 1, priority: 8 },
  crouch: { goal: 1, priority: 7 },
  // The thumbs are never crowded out by the scope: a player who cannot move
  // or look has no use for it yet.
  move: { goal: 3, priority: 5 },
  look: { goal: 3, priority: 5 },
  scope: { goal: 2, priority: 4.5 },
  decoy: { goal: 1, priority: 4 },
  weapon: { goal: 1, priority: 4 }
}

/** At most this many glyphs at once: more than two is more than a new player takes in. */
export const MAX_SHOWN = 2
/** A glyph lingers this long after its context has passed, so it does not flicker. */
const LINGER_S = 2.5
/** Metres walked, and radians turned, that count as one success. */
export const MOVE_STEP_M = 2.5
export const LOOK_STEP_RAD = 0.6
/** Stuck: this long without turning the camera, or without moving. */
const LOOK_IDLE_S = 18
const MOVE_IDLE_S = 16
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
    family, counts, flash: zero(), until: zero(), recalled: new Set(), walked: 0, turned: 0,
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

/** The "?" button: bring the core set back for a while. */
export const coachHelp = (c: Coach): void => {
  c.helpUntil = c.time + HELP_S
  for (const id of CORE) c.recalled.add(id)
}

/** What the mission tells the coach every step. */
export interface CoachContext {
  /** The player has control (not a cutscene, not a menu). */
  playing: boolean
  /** Metres walked and radians of camera turned since the last step. */
  walked: number
  turned: number
  /** There is somebody left to deal with. */
  enemies: boolean
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
    if (c.lookIdle > LOOK_IDLE_S && hintDone(c, 'look')) { c.recalled.add('look'); c.lookIdle = 0 }
    if (c.moveIdle > MOVE_IDLE_S && hintDone(c, 'move') && !ctx.aiming) { c.recalled.add('move'); c.moveIdle = 0 }
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
    scope: ctx.enemies && quiet && (thumbs || c.time > SCOPE_AFTER_S),
    fire: ctx.aiming,
    crouch: quiet && (ctx.threat > 0.12 || ctx.guardNear),
    blade: ctx.strike,
    // The same push of the stick as walking: taught once walking is.
    climb: ctx.nearLadder && hintDone(c, 'move'),
    cable: ctx.nearCable && hintDone(c, 'move'),
    decoy: quiet && ctx.guardNear && ctx.decoys > 0 && hintDone(c, 'crouch'),
    weapon: ctx.chaos
  }

  const shown: HintId[] = []
  if (ctx.playing) {
    for (const id of HINT_IDS) {
      const live = c.recalled.has(id) || (!hintDone(c, id) && wanted[id])
      if (live) c.until[id] = Math.max(c.until[id], c.time + LINGER_S)
      if (c.until[id] > c.time && (live || c.flash[id] > 0 || !hintDone(c, id))) shown.push(id)
    }
    shown.sort((a, b) => HINTS[b].priority - HINTS[a].priority || HINT_IDS.indexOf(a) - HINT_IDS.indexOf(b))
    shown.length = Math.min(shown.length, MAX_SHOWN)
  }

  const sig = shown.map(id => `${id}:${c.counts[id]}:${c.flash[id]}`).join('|')
  if (sig === c.signature) return null
  c.signature = sig
  return shown.map(id => ({ id, count: c.counts[id], goal: HINTS[id].goal, flash: c.flash[id] }))
}
