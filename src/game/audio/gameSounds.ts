import { watch } from 'vue'
import { on } from '../bus'
import { addHudTicker, gun, hud, vital } from '../state/hud'
import { flow } from '../flow'
import { sfx } from './sfx'
import { minigunHum } from './synth'
import { setMusicTrack } from '@/use/useSound'
import { playJingle } from './music'

/**
 * ─── What the game sounds like ───────────────────────────────────────────────
 *
 * The one place that turns what HAPPENS (the event bus, the HUD mirror) into
 * what is HEARD. The simulation never calls a sound: it says "a round left
 * the barrel", and this module decides that a silenced rifle is a thump and a
 * worked bolt.
 *
 * The music follows the place and the phase (GDD 4): the low stealth theme
 * until the base goes loud, the driving one from then on, synthwave in the
 * Command Base.
 */

/** A sound is quieter from further off: full within `near`, a third at `far`. */
const byDistance = (dist: number, near = 12, far = 70): number =>
  dist <= near ? 1 : Math.max(0.3, 1 - (0.7 * (dist - near)) / (far - near))

let installed = false

export const installGameSounds = (): void => {
  if (installed) return
  installed = true

  // ── The mech ──
  on('step', () => sfx('step'))
  on('land', ({ drop }) => { if (drop > 0.8) sfx('land', 0, Math.min(1.2, 0.5 + drop * 0.1)) })
  on('traverse', ({ kind }) => sfx(kind === 'cable' ? 'cable' : 'climb'))
  on('crouch', () => sfx('crouch'))
  on('hurt', ({ hp }) => {
    sfx('hurt')
    if (hp > 0 && vital.armor < 0.3) sfx('armorLow')
  })
  on('defeat', () => {
    sfx('down')
    playJingle('defeat')
  })

  // ── Its weapons ──
  on('shot', ({ weapon }) => {
    if (weapon === 'sniper') {
      sfx('sniper')
      sfx('bolt')
    } else {
      sfx(weapon)
    }
  })
  on('weapon', () => sfx('weapon'))
  on('strike', () => sfx('blade'))
  on('decoy', () => sfx('decoy'))
  on('hit', ({ zone }) => sfx(zone === 'armor' ? 'tink' : 'hit'))
  on('blast', () => sfx('explode'))
  on('kill', ({ kind, by, head, dist }) => {
    const g = byDistance(dist)
    if (kind === 'drone' || kind === 'enforcer' || kind === 'goliath') sfx('wreck', 0, g)
    else if (by === 'sniper' && head) sfx('headshot')
    else sfx('kill', 0, g)
  })
  on('killcam', ({ kind }) => { if (kind !== 'dip') sfx('killcam') })

  // ── The base ──
  on('suspicious', () => sfx('suspicious'))
  on('spotted', () => sfx('spotted'))
  on('body', () => sfx('body'))
  on('alert', ({ segments, prev }) => {
    // The fifth segment is the alarm's, below.
    if (segments > prev && segments < 5) sfx('alertUp')
    else if (segments < prev) sfx('alertDown')
  })
  on('chaos', () => {
    sfx('alarm')
    setMusicTrack('chaos')
  })
  on('incoming', ({ hit }) => {
    sfx('enemyShot', 0, 0.8)
    if (!hit) sfx('whizz')
  })
  on('wake', () => sfx('wake'))
  on('wave', () => sfx('wave'))
  on('telegraph', () => sfx('telegraph'))

  // ── The mission's beats ──
  on('objective', () => sfx('objective'))
  on('extracting', () => sfx('extract'))
  on('extracted', () => playJingle('victory'))

  // ── What the HUD mirror says ──
  watch(() => hud.reloading, (now, was) => {
    if (now) sfx('reload')
    else if (was && hud.phase === 'play') sfx('reloadDone')
  })
  watch(() => hud.scoped, (now) => { if (hud.phase === 'play') sfx(now ? 'scopeIn' : 'scopeOut') })
  watch(() => hud.overheated, (now) => { if (now) sfx('overheat') })
  watch(() => hud.strike, (now, was) => { if (now && !was) sfx('bladeOut') })
  watch(() => hud.hints.map(h => h.flash).join(), (now, was) => {
    // A lesson's pip fills.
    if (was !== undefined && now !== was && hud.hints.some(h => h.flash > 0)) sfx('lesson', 0, 0.7)
  })

  // The music follows the place: stealth on the way in, synthwave at home.
  watch(() => [flow.screen, hud.phase] as const, ([screen, phase]) => {
    if (screen === 'base') setMusicTrack('base')
    else if (screen === 'mission' && phase === 'intro') {
      setMusicTrack('stealth')
      sfx('dropIn')
    }
  }, { immediate: true })

  // The minigun's motor: one voice, re-pitched every frame.
  addHudTicker(() => {
    minigunHum(hud.weapon === 'minigun' && (hud.phase === 'play') ? gun.spool : null)
  })
}
