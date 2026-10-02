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
  | 'sniper' | 'bolt' | 'reload' | 'reloadDone' | 'scopeIn' | 'scopeOut' | 'dry'
  // The minigun and the launcher
  | 'minigun' | 'overheat' | 'rocket' | 'explode' | 'weapon'
  // The blade and the decoy
  | 'blade' | 'bladeOut' | 'decoy' | 'decoyOut'
  // What a round does
  | 'hit' | 'headshot' | 'tink' | 'ricochet' | 'kill' | 'wreck'
  // The base
  | 'suspicious' | 'spotted' | 'body' | 'alertUp' | 'alertDown' | 'alarm' | 'enemyShot' | 'whizz' | 'wake'
  | 'telegraph' | 'shell' | 'wave'
  // The mission's beats
  | 'objective' | 'extract' | 'dropIn' | 'killcam' | 'lesson' | 'medal'
  // The Command Base and the interface
  | 'buy' | 'forgeStart' | 'forgeDone' | 'denied' | 'uiClick' | 'uiOpen' | 'uiClose' | 'uiConfirm'

type Player = (name: SfxName, pan: number, gain: number, muffle: number) => void
let player: Player | null = null

export const setSfxPlayer = (p: Player | null): void => { player = p }

export const sfx = (name: SfxName, pan = 0, gain = 1, muffle = 0): void => {
  player?.(name, Math.max(-1, Math.min(1, pan)), gain, Math.max(0, Math.min(1, muffle)))
}
