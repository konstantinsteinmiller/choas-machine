import { describe, expect, it } from 'vitest'
import {
  HINTS, HINT_IDS, RECALLS_MAX, LOOK_STEP_RAD, MAX_SHOWN, MOVE_STEP_M, coachHelp, coachUse, hintDone, makeCoach, stepCoach,
  type Coach, type CoachContext, type HintView
} from '@/game/sim/coach'

const DT = 1 / 60
const base: CoachContext = {
  playing: true, walked: 0, turned: 0, enemies: true, aiming: false, chaos: false, threat: 0, guardNear: false,
  strike: false, nearLadder: false, nearCable: false, decoys: 3, loot: false, hook: false, seeking: false, far: false
}
const ctx = (over: Partial<CoachContext> = {}): CoachContext => ({ ...base, ...over })

/** Step for `seconds` and return what is on screen at the end. */
const run = (c: Coach, k: CoachContext, seconds: number): HintView[] => {
  let last: HintView[] = lastShown.get(c) ?? []
  for (let t = 0; t < seconds; t += DT) {
    const v = stepCoach(c, k, DT)
    if (v) last = v
  }
  lastShown.set(c, last)
  return last
}
const lastShown = new WeakMap<Coach, HintView[]>()
const ids = (v: HintView[]): string[] => v.map(h => h.id)
/** A player who knows the thumbs already. */
const taught = (...known: string[]): Coach => makeCoach('touch', Object.fromEntries(known.map(id => [id, 9])))

describe('the control coach', () => {
  it('opens with the two thumbs, and nothing else', () => {
    const c = makeCoach('touch')
    expect(ids(run(c, ctx(), 0.1))).toEqual(['move', 'look'])
  })

  it('never shows more than two glyphs, the most urgent first', () => {
    const c = makeCoach('touch')
    const v = run(c, ctx({ strike: true, nearLadder: true, nearCable: true, aiming: true, threat: 0.5 }), 0.1)
    expect(v).toHaveLength(MAX_SHOWN)
    expect(ids(v)).toEqual(['fire', 'blade'])
  })

  it('a ladder or a cable is taught once walking is: it is the same push of the stick', () => {
    expect(ids(run(makeCoach('touch'), ctx({ nearCable: true, nearLadder: true }), 0.1))).toEqual(['move', 'look'])
    expect(ids(run(taught('move'), ctx({ nearCable: true }), 0.1))).toEqual(['cable', 'look'])
  })

  it('nothing times out: an unused glyph is still there a minute later', () => {
    const c = makeCoach('desk')
    expect(ids(run(c, ctx(), 60))).toContain('look')
  })

  it('walking and turning retire their glyphs by how much was done', () => {
    const c = makeCoach('touch')
    const perStep = (MOVE_STEP_M * HINTS.move.goal) / 60
    run(c, ctx({ walked: perStep }), 1.05)
    expect(hintDone(c, 'move')).toBe(true)
    expect(hintDone(c, 'look')).toBe(false)
    run(c, ctx({ turned: (LOOK_STEP_RAD * HINTS.look.goal) / 60 }), 1.05)
    expect(hintDone(c, 'look')).toBe(true)
    // Both gone, a moment later.
    expect(ids(run(c, ctx({ enemies: false }), 4))).toEqual([])
  })

  it('every success flashes the glyph, and the last one reports the retirement', () => {
    const c = taught('move', 'look')
    run(c, ctx(), 0.1)
    expect(coachUse(c, 'scope')).toBe(false)
    const mid = run(c, ctx(), 0.1).find(h => h.id === 'scope')!
    expect([mid.count, mid.goal, mid.flash]).toEqual([1, HINTS.scope.goal, 1])
    expect(coachUse(c, 'scope')).toBe(true)
    expect(coachUse(c, 'scope')).toBe(false)
    expect(ids(run(c, ctx(), 5))).not.toContain('scope')
  })

  it('the scope waits for the thumbs, but not for ever', () => {
    const c = makeCoach('touch')
    expect(ids(run(c, ctx({ strike: false }), 2))).not.toContain('scope')
    const later = taught('move')
    run(later, ctx(), 9)
    // `look` is still unlearned and outranks nothing: the scope has a slot now.
    expect(ids(run(later, ctx(), 0.1))).toContain('scope')
  })

  it('a glyph comes in with its context and lingers a moment after it', () => {
    const c = taught('move', 'look', 'scope')
    expect(ids(run(c, ctx(), 1))).toEqual([])
    expect(ids(run(c, ctx({ strike: true }), 0.1))).toEqual(['blade'])
    expect(ids(run(c, ctx(), 1))).toEqual(['blade'])
    expect(ids(run(c, ctx(), 3))).toEqual([])
  })

  it('crouching is taught when someone starts to notice; the decoy after that', () => {
    const c = taught('move', 'look', 'scope')
    expect(ids(run(c, ctx({ guardNear: true }), 0.1))).toEqual(['crouch'])
    coachUse(c, 'crouch')
    expect(ids(run(c, ctx({ guardNear: true }), 1.5))).toEqual(['decoy'])
    expect(ids(run(taught('move', 'look', 'scope', 'crouch'), ctx({ guardNear: true, decoys: 0 }), 0.1))).toEqual([])
  })

  it('the stealth glyphs stand down once the base is loud; the weapon wheel comes up', () => {
    const c = taught('move', 'look')
    const v = ids(run(c, ctx({ chaos: true, guardNear: true, threat: 1 }), 0.1))
    expect(v).toEqual(['weapon'])
  })

  it('mastery is per input family', () => {
    const touch = makeCoach('touch', { move: 3, look: 3 })
    const desk = makeCoach('desk', {})
    expect(hintDone(touch, 'move')).toBe(true)
    expect(hintDone(desk, 'move')).toBe(false)
  })

  it('a player who stops turning the camera gets its glyph back; one use sends it away', () => {
    const c = taught(...HINT_IDS)
    expect(ids(run(c, ctx({ walked: 0.05 }), 29))).toEqual([])
    expect(ids(run(c, ctx({ walked: 0.05 }), 2))).toEqual(['look'])
    coachUse(c, 'look')
    expect(ids(run(c, ctx({ walked: 0.05, turned: 0.01 }), 2))).toEqual([])
  })

  it('the "?" button (H) brings the whole core set back at once, keeps it up while it is used, and it goes again (#168)', () => {
    const c = taught(...HINT_IDS)
    expect(coachHelp(c)).toBe(true)
    expect(run(c, ctx({ walked: 0.05, turned: 0.01 }), 0.1).length).toBeGreaterThan(MAX_SHOWN)
    // Walking and looking about does not send it away (it went on the next step walked).
    expect(ids(run(c, ctx({ walked: 3, turned: 1 }), 2))).toEqual(expect.arrayContaining(['move', 'look']))
    expect(ids(run(c, ctx({ walked: 0.05, turned: 0.01 }), 24))).toEqual([])
  })

  it('pressed again, the help goes at once', () => {
    const c = taught(...HINT_IDS)
    coachHelp(c)
    run(c, ctx(), 0.5)
    expect(coachHelp(c)).toBe(false)
    expect(ids(run(c, ctx(), 3))).toEqual([])
  })

  it('shows nothing while the player has no control, and reports only changes', () => {
    const c = makeCoach('touch')
    expect(stepCoach(c, ctx({ playing: false }), DT)).toEqual(null)
    expect(stepCoach(c, ctx(), DT)).not.toBeNull()
    expect(stepCoach(c, ctx(), DT)).toBeNull()
  })
})

describe('round 2: the lessons for salvage, the hook and the legs', () => {
  it('once the thumbs are learned, the marker is the next thing to find, until a pile is reached', () => {
    const fresh = taught()
    expect(ids(run(fresh, ctx({ seeking: true }), 1))).not.toContain('goal')
    const c = taught('move', 'look')
    expect(ids(run(c, ctx({ seeking: true }), 1))).toContain('goal')
    coachUse(c, 'goal')
    expect(ids(run(c, ctx({ seeking: true }), 3))).not.toContain('goal')
  })

  it('a pile in reach is taught with the act key; the hook at the foot of a wall with its own', () => {
    const c = taught('move', 'look')
    expect(ids(run(c, ctx({ loot: true }), 0.5))).toContain('loot')
    const d = taught('move', 'look')
    expect(ids(run(d, ctx({ hook: true }), 0.5))).toContain('grapple')
    coachUse(d, 'grapple')
    expect(ids(run(d, ctx({ hook: true }), 3))).not.toContain('grapple')
  })

  it('the legs can run on a long way with nobody about, never next to a guard or in a fight', () => {
    const c = taught('move', 'look', 'scope', 'goal')
    expect(ids(run(c, ctx({ far: true }), 0.5))).toContain('sprint')
    const d = taught('move', 'look', 'scope', 'goal')
    expect(ids(run(d, ctx({ far: true, guardNear: true }), 0.5))).not.toContain('sprint')
    const e = taught('move', 'look', 'scope', 'goal')
    expect(ids(run(e, ctx({ far: true, chaos: true }), 0.5))).not.toContain('sprint')
  })

  it('at a pile with a guard close by, stripping it comes first', () => {
    const c = taught('move', 'look')
    const shown = ids(run(c, ctx({ loot: true, guardNear: true, threat: 0.3 }), 0.5))
    expect(shown[0]).toBe('loot')
    expect(shown.length).toBeLessThanOrEqual(MAX_SHOWN)
  })
})

describe('the training does not suggest what it has not taught yet', () => {
  it('a sentry half-sure in the sneak room: the crouch card, never the disguise (its room is still ahead)', () => {
    const k = ctx({ threat: 0.4, notYet: new Set(['hide', 'decoy']) })
    const shown = ids(run(taught('move', 'look', 'crouch'), k, 0.5))
    expect(shown).not.toContain('hide')
    // Out of the training (no `notYet`), the same moment suggests it.
    expect(ids(run(taught('move', 'look', 'crouch'), ctx({ threat: 0.4 }), 0.5))).toContain('hide')
  })
})

describe('standing still brings the hand back, but not forever', () => {
  it('after half a minute idle the move glyph returns, at most twice a session', () => {
    const c = taught('move', 'look')
    const idle = ctx({ walked: 0, turned: 0 })
    for (let n = 0; n < RECALLS_MAX; n++) {
      expect(ids(run(c, idle, 31))).toContain('move')
      c.recalled.clear()
    }
    expect(c.recalls.move).toBe(RECALLS_MAX)
    run(c, idle, 31)
    expect(c.recalled.has('move')).toBe(false)
  })
})
