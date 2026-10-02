import { createInput } from './input'

/**
 * The one input record, and the hook that advances its hold timer.
 *
 * It lives in its own module so the simulation can read it and the scene can
 * attach the DOM listeners to it without either importing the other.
 */
export const input = createInput()

/** Set by the scene once the listeners are attached; called every frame by
 *  the live mode (a finger held still sends no events to time the hold by). */
export const inputClock = { tick: (): void => {} }
