import { SFX_UNLIMITED } from '@/use/perfVariants'

/**
 * SFX entry point. Every gameplay sound goes through `sfx(name, pan, gain)`;
 * the synthesizer behind it lands in the audio chunk. Until then this is a
 * registry the synth plugs into, so call sites are already final.
 *
 * `muffle` (0..1) low-passes the sound: something far off, or behind a wall.
 */
export type SfxName =
  // The mech
  | 'step' | 'land' | 'crouch' | 'climb' | 'cable' | 'hurt' | 'armorLow' | 'down'
  // The sniper: silenced, with a bolt to work
  | 'sniper' | 'bolt' | 'reload' | 'reloadDone' | 'scopeIn' | 'scopeOut' | 'dry' | 'ammoLow'
  // The minigun and the launcher
  | 'minigun' | 'overheat' | 'rocket' | 'explode' | 'weapon'
  // The blade and the decoy: a quick strike, the blade drawn, driven into a body and pulled out
  | 'blade' | 'bladeOut' | 'stab' | 'bladePull' | 'decoy' | 'decoyOut'
  // ...and in a person (#172): no steel ringing, the swish, the body and the cloth
  | 'stabFlesh' | 'pullFlesh' | 'slashFlesh' | 'grab'
  // The grappling hook: thrown, biting into the wall top, reeling, recalled
  | 'hookThrow' | 'hookBite' | 'hookReel' | 'hookRecall'
  // Salvage: rummaging in a pile, and the pile stripped
  | 'loot' | 'lootDone'
  // What a round does: the minigun's hits on flesh and plate, the rifle's on a body and on a machine
  | 'hit' | 'headshot' | 'tink' | 'impactBody' | 'impactMetal' | 'ricochet' | 'kill' | 'wreck'
  // The base
  | 'suspicious' | 'spotted' | 'body' | 'alertUp' | 'alertDown' | 'alarm' | 'uplink' | 'enemyShot' | 'whizz' | 'wake'
  | 'telegraph' | 'shell' | 'wave'
  // The mission's beats
  | 'objective' | 'extract' | 'dropIn' | 'boardJump' | 'bark' | 'radio' | 'boxOn' | 'boxOff' | 'shout' | 'crank' | 'zap' | 'shard' | 'tag' | 'drag' | 'growl' | 'repair' | 'gate' | 'zoom' | 'glint' | 'vent' | 'killcam' | 'lesson' | 'medal'
  // The Command Base and the interface
  | 'buy' | 'forgeStart' | 'forgeDone' | 'bellows' | 'melt' | 'clang' | 'clangOff' | 'hiss' | 'denied' | 'uiClick' | 'uiOpen' | 'uiClose' | 'uiConfirm'

type Player = (name: SfxName, pan: number, gain: number, muffle: number) => void
let player: Player | null = null

export const setSfxPlayer = (p: Player | null): void => { player = p }

let tap: Player | null = null
/**
 * Dev tooling: hear every sound that plays, as it plays (the cinematic
 * trailer logs them on the recording's clock, `game/preview.ts`).
 */
export const setSfxTap = (t: Player | null): void => { tap = t }
/** Dev tooling: voice a sound now, past the gaps (the trailer's offline mix replays its log). */
export const playSfxNow = (name: SfxName, pan = 0, gain = 1, muffle = 0): void => { player?.(name, pan, gain, muffle) }

/**
 * The sounds that can fire many times a second, and the least time between
 * two of the same. Each play builds a handful of audio nodes; a minigun burst
 * with every round and every hit voiced was 5 % of a throttled CPU in node
 * construction alone (PERF-LEDGER.md, entry 3), and past about fifteen a
 * second the ear hears a buzz either way.
 *
 * The minigun's gap sits under its 15 rounds a second (66.7 ms) by most of a
 * frame: the rounds are emitted on the simulation's steps, which land on the
 * real clock a frame early or late, and a gap of a full period dropped every
 * round that came a little early, a hole in the roar.
 */
export const SFX_MIN_GAP_MS: Partial<Record<SfxName, number>> = {
  minigun: 45,
  hit: 50,
  tink: 50,
  ricochet: 60,
  enemyShot: 50,
  whizz: 80,
  step: 60
}

const lastAt = new Map<SfxName, number>()

/** Forget when each sound last played (a new mission, a test). */
export const resetSfxGaps = (): void => lastAt.clear()

export const sfx = (name: SfxName, pan = 0, gain = 1, muffle = 0): void => {
  if (!player && !tap) return
  const gap = SFX_UNLIMITED ? undefined : SFX_MIN_GAP_MS[name]
  if (gap !== undefined) {
    const now = performance.now()
    const last = lastAt.get(name)
    if (last !== undefined && now - last < gap) return
    lastAt.set(name, now)
  }
  const p = Math.max(-1, Math.min(1, pan))
  const m = Math.max(0, Math.min(1, muffle))
  tap?.(name, p, gain, m)
  player?.(name, p, gain, m)
}
