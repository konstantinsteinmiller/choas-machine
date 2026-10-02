/**
 * ─── The mech's armor ────────────────────────────────────────────────────────
 *
 * One number that the base shoots at. It comes back by itself once the mech
 * has been out of the fire for a few seconds (plan G16), so the action phase
 * is a rhythm of pushing out and ducking back, not a slide to zero. Pure.
 */

export const ARMOR_MAX = 100
/** Seconds without a hit before the plating starts to mend, and how fast. */
export const REGEN_AFTER_S = 4
export const REGEN_PER_S = 14

export interface Armor {
  hp: number
  max: number
  /** Seconds since the last hit. */
  quiet: number
  down: boolean
}

export const makeArmor = (max = ARMOR_MAX): Armor => ({ hp: max, max, quiet: 99, down: false })

/** Take a hit. True when this is the one that brings the mech down. */
export const hurtArmor = (a: Armor, amount: number): boolean => {
  if (a.down || amount <= 0) return false
  a.hp = Math.max(0, a.hp - amount)
  a.quiet = 0
  if (a.hp <= 0) {
    a.down = true
    return true
  }
  return false
}

export const stepArmor = (a: Armor, dt: number): void => {
  if (a.down) return
  a.quiet += dt
  if (a.quiet >= REGEN_AFTER_S && a.hp < a.max) a.hp = Math.min(a.max, a.hp + REGEN_PER_S * dt)
}
