import type { Answers } from '../../sim/adapt'
import type { Fortress } from '../../world/fortress'
import type { ThemeId } from '../themes'

/**
 * ─── The fortresses (round 4, #93 #79) ───────────────────────────────────────
 *
 * Every raidable fortress, in campaign order, with what a menu needs to know
 * about it. Tiny on purpose: the builders are behind dynamic imports, so the
 * base and the menus never pull a level's layout code in, and each level is
 * its own chunk.
 */

export type FortressId = 'bastion' | 'foundry'

export interface FortressMeta {
  id: FortressId
  /** Its look: palette, sky and haze (`data/themes.ts`). */
  theme: ThemeId
  /** Open once this fortress has been cleared at this threat level; null for the first. */
  unlock: { after: FortressId; threat: number } | null
}

export const FORTRESSES: readonly FortressMeta[] = [
  { id: 'bastion', theme: 'dusk', unlock: null },
  // Open once the Bastion has fallen at threat III (Q4).
  { id: 'foundry', theme: 'foundry', unlock: { after: 'bastion', threat: 3 } }
]

export const FORTRESS_IDS: readonly FortressId[] = FORTRESSES.map(f => f.id)

export const fortressMeta = (id: FortressId): FortressMeta => FORTRESSES.find(f => f.id === id) ?? FORTRESSES[0]!

export const isFortressId = (v: unknown): v is FortressId => typeof v === 'string' && (FORTRESS_IDS as readonly string[]).includes(v)

/** Build a fortress at a threat level (its own chunk, loaded on demand). */
export const loadFortress = async (id: FortressId, level: number, run: number, answers?: Answers): Promise<Fortress> => {
  switch (id) {
    case 'bastion': return (await import('./bastion')).buildBastion(level, run, answers)
    case 'foundry': return (await import('./foundry')).buildFoundry(level, run, answers)
  }
}
