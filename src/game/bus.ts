import type { PostKind } from './world/fortress'
import type { WeaponId } from './data/ids'
import type { Phase } from './state/hud'

/**
 * ─── The gameplay event bus ──────────────────────────────────────────────────
 *
 * The simulation says what HAPPENED; the HUD, sound, haptics, lessons, the
 * kill-cam director and the stats subscribe. Nothing on the listening side is
 * imported by the simulation, and listeners do not import each other.
 *
 * Synchronous and typed. `GameEvents` is the whole vocabulary: a system adds
 * its events here, with the payload its listeners need and no more.
 */
export interface GameEvents {
  /** The screen's phase changed (`state/hud.ts`). */
  phase: { phase: Phase; prev: Phase }
  /** The simulation's time scale changed (slow motion in, or back to 1). */
  timeScale: { scale: number }
  /** The mech landed from a drop of `drop` metres. */
  land: { drop: number }
  /** The mech took a way up or across: a ladder, a cable, a mantle. */
  traverse: { kind: 'ladder' | 'cable' | 'mantle' }
  /** The mech crouched or stood up. */
  crouch: { crouched: boolean }
  /** A defender is curious, is sure, or has given up looking. */
  suspicious: { id: number; kind: PostKind }
  spotted: { id: number; kind: PostKind }
  calm: { id: number }
  /** A defender found a body. */
  body: { id: number; corpse: number }
  /** A defender went down. */
  kill: { id: number; kind: PostKind; by: WeaponId | 'blade'; head: boolean; dist: number }
  /** A round left the barrel; a round or a rocket arrived. */
  shot: { weapon: WeaponId }
  hit: { id: number; weapon: WeaponId; zone: string }
  blast: { x: number; y: number; z: number; weak: boolean }
  /** Another weapon was drawn. */
  weapon: { weapon: WeaponId }
  /** The blade went for someone; a decoy lit up. */
  strike: { kind: 'backstab' | 'drop' | 'strike'; id: number }
  decoy: { x: number; y: number; z: number }
  /** The alert meter lit or lost a segment. */
  alert: { segments: number; prev: number }
  /** The base went to full alert: the stealth phase is over. */
  chaos: Record<string, never>
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void

const handlers = new Map<keyof GameEvents, Set<Handler<never>>>()

/** Subscribe. Returns the function that unsubscribes. */
export const on = <K extends keyof GameEvents>(type: K, fn: Handler<K>): (() => void) => {
  let set = handlers.get(type)
  if (!set) handlers.set(type, (set = new Set()))
  set.add(fn as Handler<never>)
  return () => { set.delete(fn as Handler<never>) }
}

/** Subscribe for one event only. */
export const once = <K extends keyof GameEvents>(type: K, fn: Handler<K>): (() => void) => {
  const off = on(type, (payload) => {
    off()
    fn(payload)
  })
  return off
}

/**
 * Tell every listener. A listener that throws is logged and skipped: one
 * broken subscriber (a sound that failed to build) must not stop the kill it
 * was reacting to from reaching the others.
 */
export const emit = <K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void => {
  const set = handlers.get(type)
  if (!set || set.size === 0) return
  // A copy: a listener may unsubscribe itself, or subscribe another, mid-emit.
  for (const fn of [...set]) {
    try {
      (fn as Handler<K>)(payload)
    } catch (e) {
      console.error(`[bus] a "${type}" listener threw`, e)
    }
  }
}

/** Drop every listener (tests, and a full teardown). */
export const clearBus = (): void => handlers.clear()
