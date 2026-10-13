import { installVoices } from './voice'
import { killCamsEnabled } from '@/use/useKillCam'
import { watch } from 'vue'
import { on } from '../bus'
import { addHudTicker, gun, hud, vital } from '../state/hud'
import { flow } from '../flow'
import { sfx } from './sfx'
import { minigunFire, minigunHum, warmFoley } from './synth'
import { setMusicTrack } from '@/use/useSound'
import { playJingle, warmMusic } from './music'
import { whenAudio } from './engine'
import { app } from '../engine/app'
import { camKind } from '../sim/killcam'
import type { PostKind } from '../world/fortress'

/** The minigun's roar lasts this long past its last round (its rounds come 15 a second). */
const MINIGUN_ROAR_HOLD_MS = 110
let minigunFiringUntil = 0

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

/**
 * Is unit `id` of the running mission flesh? The people of the garrison are;
 * everything built (drones, roombas, enforcers, the Goliath, searchlights,
 * hounds) is metal. Read at the event, while the unit is still in the
 * garrison; an id the mission does not know (no mission running) counts as
 * flesh, the sound a hit always had.
 */
export const isFlesh = (id: number): boolean => {
  const m = app.mode as unknown as { garrison?: { units: ArrayLike<{ kind: PostKind } | undefined> } } | null
  const kind = m?.garrison?.units[id]?.kind
  return kind === undefined || camKind(kind) === 'human'
}

/** Into the drop-in (3.4 to 5 s long) when the loud song's hall is built. */
const WARM_IN_INTRO_MS = 1200
/** ...and when the weapons' sounds start rendering, clear of the hall. */
const WARM_FOLEY_IN_INTRO_MS = 2400

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
    } else if (weapon === 'minigun') {
      // Each round's punch, lighter, under the roar (#183) that the ticker below holds while it fires.
      sfx('minigun', 0, 0.6)
      minigunFiringUntil = performance.now() + MINIGUN_ROAR_HOLD_MS
    } else {
      sfx(weapon)
    }
  })
  on('weapon', () => sfx('weapon'))
  // A story scene's minigun: its motor and its roar (#183).
  on('cineGun', ({ spool, firing }) => {
    minigunHum(spool > 0.01 ? spool : null)
    minigunFire(firing)
  })
  // Low is two ticks once; dry is a click on every pull (#145).
  on('ammoLow', () => sfx('ammoLow'))
  on('dryFire', () => sfx('dry'))
  // A round off armour (#146): the ricochet's ping.
  on('glance', () => sfx('ricochet'))
  // A quick strike is one sound; a takedown plays its own beats.
  // On a person (#172) the body's sounds, not steel on steel.
  on('strike', ({ kind, id }) => { if (kind === 'strike' || !killCamsEnabled.value) sfx(isFlesh(id) ? 'slashFlesh' : 'blade') })
  on('salvage', ({ beat }) => { if (beat !== 'stop') sfx(beat === 'taken' ? 'lootDone' : 'loot') })
  on('grapple', ({ beat }) => sfx(beat === 'throw' ? 'hookThrow' : beat === 'bite' ? 'hookBite' : beat === 'recall' ? 'hookRecall' : 'land'))
  // The backstab, the drop and the dive from a rope: the blade goes into a
  // body and comes out of it. A walking machine taken from a rope is steel
  // through plate instead.
  on('takedown', ({ beat, id }) => {
    const flesh = isFlesh(id)
    // A person (#172): the swish and the body, the hand on the cloth; the
    // blade's own slide out of the forearm only faint under the grab.
    if (beat === 'stab') {
      if (flesh) sfx('stabFlesh')
      else { sfx('blade'); sfx('impactMetal', 0, 0.8) }
    } else if (beat === 'pull') sfx(flesh ? 'pullFlesh' : 'bladeOut', 0, flesh ? 1 : 0.7)
    else if (flesh) { sfx('grab'); sfx('bladeOut', 0, 0.25) } else sfx('bladeOut')
  })
  on('decoy', () => sfx('decoy'))
  // Where a round lands: a body or a machine's shell. The rifle's heavy round
  // has its own pair; the minigun's are the short ones. Armour plate is metal
  // whoever wears it.
  on('hit', ({ id, weapon, zone }) => {
    const metal = zone === 'armor' || !isFlesh(id)
    if (weapon === 'sniper') sfx(metal ? 'impactMetal' : 'impactBody')
    else sfx(metal ? 'tink' : 'hit')
  })
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
  // The disguise room's alarm post (a drill): the siren, and nothing else of an alarm.
  on('trainingAlarm', () => sfx('alarm'))
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
  // A round into a decoy (#171): the shot, and the hologram's crackle where it lands.
  on('decoyShot', () => { sfx('enemyShot', 0, 0.55); sfx('tink', 0, 0.35) })
  on('incoming', ({ hit }) => {
    sfx('enemyShot', 0, 0.8)
    // A round that lands rings off the mech's own plate.
    if (hit) sfx('tink', 0, 0.8)
    else sfx('whizz')
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
  on('pickup', () => sfx('shard'))
  on('hop', () => sfx('crouch', 0, 1.3))
  on('rope', () => { sfx('hookThrow'); sfx('hookBite') })
  on('burn', ({ beat }) => sfx(beat === 'start' ? 'melt' : 'hiss'))
  on('tagged', () => sfx('tag'))
  on('bark', () => sfx('growl'))
  on('lessonDone', () => sfx('gate'))
  on('helmet', () => sfx('zap'))
  on('bossTell', ({ what }) => { if (what === 'glint') sfx('glint'); else if (what === 'overheat') sfx('vent'); else if (what === 'shield' || what === 'phase') sfx('zap') })
  on('trainingReset', () => sfx('shout'))
  on('lessonRestored', () => sfx('shard'))
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
    // A story scene brings its own cue and puts the music back after itself.
    if (phase === 'cinema') return
    if (screen === 'base') setMusicTrack('base')
    else if (screen === 'mission' && phase === 'intro') {
      setMusicTrack('stealth')
      // At boot this fires mid-build, behind the loader: it plays when the scene shows.
      whenAudio(() => sfx('dropIn'))
      // The loud song's reverb is built during the drop-in, while the player
      // watches, not under the veil (it would hold the load) and not at the
      // alarm (a freeze as the fight starts): PERF-LEDGER.md entry 6.
      whenAudio(() => setTimeout(() => { if (flow.screen === 'mission') warmMusic(['chaos']) }, WARM_IN_INTRO_MS))
      // The rendered weapon sounds (`foley.ts`), one per idle moment from here.
      whenAudio(() => setTimeout(() => { if (flow.screen === 'mission') warmFoley() }, WARM_FOLEY_IN_INTRO_MS))
    }
  }, { immediate: true })

  // The minigun's motor: one voice, re-pitched every frame; and its roar while
  // it fires (#183). A story scene drives its own (the intro's minigun).
  addHudTicker(() => {
    if (hud.phase === 'cinema') return
    minigunHum(hud.weapon === 'minigun' && (hud.phase === 'play') ? gun.spool : null)
    minigunFire(hud.phase === 'play' && performance.now() < minigunFiringUntil)
  })
}
