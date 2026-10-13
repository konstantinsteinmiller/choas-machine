/**
 * Who has a health bar over its head (#74). A guard shows one when near,
 * hurt, tagged or fighting. A machine follows the same rule, and more: once
 * the mech has struck it, its bar stays up while it lives, and while the
 * alarm rings every machine has its own (a playtester could not tell which of
 * the base's machines the rifle was doing anything to). The mechs always have
 * theirs. The overlay itself is `HealthBars.vue`; `Mission.writeBars` places them.
 */
import { isAlive, type Unit } from './garrison'
import { camKind } from './killcam'

/** Within this, a defender shows one when near, hurt, tagged or fighting; this near, always. */
export const BAR_FAR_M = 40
export const BAR_NEAR_M = 25
/** A struck machine, or any machine under the alarm, shows its bar this far: as far as a rifle is aimed. */
export const BAR_MACHINE_FAR_M = 110

/** Not a person: a mech, a drone, a lamp, a hound, a Roomba. */
export const isMachine = (u: Unit): boolean => camKind(u.kind) !== 'human'

/**
 * Whether `u`, `d` m from the mech, has a bar, and its place in line for the
 * few drawn: 0 first (a machine the mech struck), 1 the rest by distance, -1
 * none. `struck` holds the machines the mech has hit; `alarm` is full alert.
 */
export const barRank = (u: Unit, d: number, alarm: boolean, struck: ReadonlySet<number>): number => {
  // Every mech has its bar, powered down or not (a playtester could not
  // tell the rocket room's mech was taking damage at all). The Goliath
  // too, boss or not: a playtester emptied two rockets and three belts
  // into it with no sign of what any of it did.
  const mech = u.kind === 'enforcer' || u.kind === 'goliath'
  if (!isAlive(u) || (u.state === 'dormant' && !mech) || (u.boss && u.kind !== 'goliath') || u.gripped) return -1
  // A lamp that cannot be put out (#144, #163) is not a target: no bar for being one.
  const marked = isMachine(u) && !u.watch && !u.caged && u.state !== 'reserve' && (struck.has(u.id) || alarm)
  if (marked) return d > BAR_MACHINE_FAR_M ? -1 : struck.has(u.id) ? 0 : 1
  if (d > BAR_FAR_M) return -1
  return mech || u.hp < u.maxHp || u.tagged || u.state === 'combat' || d < BAR_NEAR_M ? 1 : -1
}
