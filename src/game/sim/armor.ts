/**
 * ─── The mech's armor ────────────────────────────────────────────────────────
 *
 * One number that the base shoots at. Round 4 (#101): it does NOT mend by
 * itself any more; repair kits lying in the fortress do that
 * (`supplies.ts`). Pure.
 */

export const ARMOR_MAX = 100

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

/** Count the quiet since the last hit (the HUD and the music read it); nothing mends. */
export const stepArmor = (a: Armor, dt: number): void => {
  if (a.down) return
  a.quiet += dt
}
