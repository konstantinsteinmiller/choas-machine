import { installVoices } from './voice'
import { killCamsEnabled } from '@/use/useKillCam'
import { watch } from 'vue'
import { on } from '../bus'
import { addHudTicker, gun, hud, vital } from '../state/hud'
import { flow } from '../flow'
import { sfx } from './sfx'
import { minigunHum } from './synth'
import { setMusicTrack } from '@/use/useSound'
import { playJingle, warmMusic } from './music'
import { whenAudio } from './engine'

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

/** Into the drop-in (3.4 to 5 s long) when the loud song's hall is built. */
const WARM_IN_INTRO_MS = 1200

let installed = false

export const installGameSounds = (): void => {
  installVoices()
  if (installed) return
  installed = true

  // ── The mech ──
  on('step', ({ sprint }) => sfx('step', 0, sprint ? 1.5 : 1))
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
  // A quick strike is one sound; a takedown plays its own beats.
  on('strike', ({ kind }) => { if (kind === 'strike' || !killCamsEnabled.value) sfx('blade') })
  on('salvage', ({ beat }) => { if (beat !== 'stop') sfx(beat === 'taken' ? 'lootDone' : 'loot') })
  on('grapple', ({ beat }) => sfx(beat === 'throw' ? 'hookThrow' : beat === 'bite' ? 'hookBite' : beat === 'recall' ? 'hookRecall' : 'land'))
  on('takedown', ({ beat }) => sfx(beat === 'stab' ? 'blade' : 'bladeOut', 0, beat === 'pull' ? 0.7 : 1))
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
  on('uplink', () => sfx('uplink'))
  on('uplinkLost', () => sfx('alertDown'))
  on('uplinkDone', () => sfx('alarm'))
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
  // The hunt went cold: the base stands down, and the music goes quiet again.
  on('standDown', () => {
    sfx('alertDown')
    setMusicTrack('stealth')
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
  on('extracting', () => { sfx('extract'); sfx('bark') })
  on('jump', () => sfx('boardJump'))
  on('checkin', () => sfx('radio'))
  on('shout', () => sfx('shout'))
  on('shard', () => sfx('shard'))
  on('tagged', () => sfx('tag'))
  on('bark', () => sfx('growl'))
  on('lessonDone', () => sfx('gate'))
  on('helmet', () => sfx('zap'))
  on('bossTell', ({ what }) => { if (what === 'glint') sfx('glint'); else if (what === 'overheat') sfx('vent'); else if (what === 'shield' || what === 'phase') sfx('zap') })
  on('trainingReset', () => sfx('shout'))
  on('zoomed', () => sfx('zoom'))
  on('repair', () => sfx('repair'))
  on('drag', () => sfx('drag'))
  on('runner', () => sfx('radio'))
  on('sabotage', ({ beat }) => { if (beat === 'done') sfx('zap'); else if (beat === 'start') sfx('loot') })
  on('box', ({ on: down }) => sfx(down ? 'boxOn' : 'boxOff'))
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
      // At boot this fires mid-build, behind the loader: it plays when the scene shows.
      whenAudio(() => sfx('dropIn'))
      // The loud song's reverb is built during the drop-in, while the player
      // watches, not under the veil (it would hold the load) and not at the
      // alarm (a freeze as the fight starts): PERF-LEDGER.md entry 6.
      whenAudio(() => setTimeout(() => { if (flow.screen === 'mission') warmMusic(['chaos']) }, WARM_IN_INTRO_MS))
    }
  }, { immediate: true })

  // The minigun's motor: one voice, re-pitched every frame.
  addHudTicker(() => {
    minigunHum(hud.weapon === 'minigun' && (hud.phase === 'play') ? gun.spool : null)
  })
}
