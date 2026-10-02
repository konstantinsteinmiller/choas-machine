import { audio, audioAllowed } from './engine'
import { getSong, makeOut, playStep, playJingleNotes, type Out, type Song, type SongId, type TrackId } from './songs'
import { MUSIC_FILES } from '../assets/overrides'
import { registerHtmlAudio, unregisterHtmlAudio } from '@/use/useAssets'

export type { TrackId, SongId }

/**
 * ─── Music ───────────────────────────────────────────────────────────────────
 *
 * A lookahead step sequencer on the shared AudioContext, playing the songs in
 * `songs.ts`. Because it runs on the shared context, the ad / pause / mute
 * gates silence it automatically.
 *
 * Each place has ONE song and loops it (`stealth`, `chaos`, `base`): a change
 * of place cross-fades the outgoing song's tail under the incoming one, which
 * is how the stealth phase tips into the chaos phase without a cut.
 */

/** No rotation in this game: every area loops its own song. The machinery
 *  stays (it is what a handover is built on); the list is empty. */
const ROTATION: readonly SongId[] = []
export const ROTATION_SIZE = ROTATION.length + 1
/** A song keeps playing whole passes until it has run at least this long. */
export const ROTATE_AFTER_S = 45
/** The first music of the session fades in gently rather than arriving at full level. */
export const FIRST_FADE_S = 4
/** Songs that loop and never rotate: here, all of them. */
const OWN_SONG = (id: TrackId | SongId | null): boolean => id !== null

/**
 * Where a song should START, in seconds, if not at its top: the intro's score
 * follows the cutscene clock, so music that could only start once the player's
 * first tap unlocked the audio (or that an ad stopped) joins at the shot on
 * screen instead of at bar 1. The cutscene registers it while it plays.
 */
let startHint: ((id: SongId) => number) | null = null
export const setSongStartHint = (fn: ((id: SongId) => number) | null): void => {
  startHint = fn
}

/** Song-to-song handover: the outgoing song's tail fades under the incoming one. */
const HANDOVER_FADE_S = 2.5

/** The song an area plays at a rotation slot. */
export const songFor = (area: TrackId, slot: number): SongId =>
  OWN_SONG(area) ? area : slot % ROTATION_SIZE === 0 ? area : ROTATION[(slot % ROTATION_SIZE) - 1]!

/** Whether a finished pass of a song should hand over to the next one. */
export const shouldRotate = (area: TrackId | null, playing: SongId | null, played: number): boolean =>
  !OWN_SONG(area) && !OWN_SONG(playing) && played >= ROTATE_AFTER_S

/**
 * Whether a request for `area` can leave the current song alone. The same song
 * obviously can; so can a rotation song (slot 1 or 2) when the player moves
 * between non-boss areas — only the area theme is tied to the area.
 */
export const keepsPlaying = (area: TrackId, playing: SongId | null, slot: number): boolean => {
  if (!playing) return false
  if (playing === songFor(area, slot)) return true
  return !OWN_SONG(area) && !OWN_SONG(playing) && slot % ROTATION_SIZE !== 0
}

// ─── Sequencer state ────────────────────────────────────────────────────────

let area: TrackId | null = null
let slot = 0
let playing: SongId | null = null
let song: Song | null = null
let out: Out | null = null
let timer: number | null = null
let nextTime = 0
let stepIdx = 0
/** Seconds the current song has played (drives the rotation). */
let played = 0
/** Where a paused song picks up: the start of the bar it was stopped in. */
let resume: { id: SongId; step: number; played: number } | null = null
let everStarted = false

const retire = (o: Out, at: number, fade: number): void => {
  const g = o.master.gain
  const now = o.ctx.currentTime
  g.cancelScheduledValues(now)
  g.setValueAtTime(Math.max(0.0001, g.value), now)
  if (at > now) g.setValueAtTime(Math.max(0.0001, g.value), at)
  g.setTargetAtTime(0.0001, Math.max(at, now), fade / 4)
  setTimeout(() => o.dispose(), (Math.max(0, at - now) + fade + 0.5) * 1000)
}

const startSong = (id: SongId, at: number | null, fadeIn: number, allowResume: boolean): void => {
  const a = audio()
  if (!a) return
  const s = getSong(id)
  const o = makeOut(a.ctx, a.music, s)
  const t0 = at ?? a.ctx.currentTime + 0.08
  o.master.gain.setValueAtTime(0.0001, a.ctx.currentTime)
  o.master.gain.setValueAtTime(0.0001, t0)
  o.master.gain.exponentialRampToValueAtTime(s.gain, t0 + Math.max(0.03, fadeIn))
  if (allowResume && resume && resume.id === id && !OWN_SONG(id)) {
    stepIdx = resume.step
    played = resume.played
  } else {
    // Join a scored song where the picture is (see `setSongStartHint`).
    const sec = startHint?.(id) ?? 0
    stepIdx = Math.max(0, Math.min(s.steps.length - 1, Math.round(sec / (60 / s.bpm / 4))))
    played = 0
  }
  resume = null
  song = s
  out = o
  playing = id
  nextTime = t0
  if (timer === null) timer = window.setInterval(tick, 30)
  tick()
}

/** The end of a pass: hand over to the next song in the rotation, or repeat. */
const endOfPass = (): void => {
  if (!song || !out) return
  if (shouldRotate(area, playing, played)) {
    slot = (slot + 1) % ROTATION_SIZE
    const next = songFor(area ?? 'base', slot)
    if (MUSIC_FILES.has(next)) {
      stopMusic(0.8)
      begin(next)
      return
    }
    retire(out, nextTime, HANDOVER_FADE_S)
    startSong(next, nextTime, 0.03, false)
    return
  }
  stepIdx = song.loopBar * 16
}

const tick = (): void => {
  const a = audio()
  if (!a || !song || !out) return
  const horizon = a.ctx.currentTime + 0.15
  if (nextTime < a.ctx.currentTime - 0.5) nextTime = a.ctx.currentTime + 0.05 // resumed after a long suspend
  while (nextTime < horizon && song && out) {
    if (stepIdx >= song.steps.length) {
      endOfPass()
      if (timer === null || !song) return
      continue
    }
    const spb = 60 / song.bpm / 4
    playStep(out, song, stepIdx, nextTime, spb)
    nextTime += spb
    played += spb
    stepIdx++
  }
}

// A track asked for before the first gesture waits here. Activation lands on
// pointerup for touch (pointerdown only counts for a mouse), so listen to both.
let pending: TrackId | null = null
let gestureArmed = false
const GESTURES = ['pointerdown', 'pointerup', 'keydown'] as const

const onGesture = (): void => {
  if (!audioAllowed()) return
  for (const g of GESTURES) window.removeEventListener(g, onGesture, true)
  gestureArmed = false
  const id = pending
  pending = null
  if (id) playMusic(id)
}

const startOnGesture = (id: TrackId): void => {
  pending = id
  if (gestureArmed) return
  gestureArmed = true
  for (const g of GESTURES) window.addEventListener(g, onGesture, true)
}

// ─── Drop-in music files ─────────────────────────────────────────────────────
// public/audio/music/<song id>.ogg replaces that composed song, and
// victory / defeat.ogg the jingles (see `game/assets/overrides.ts`). A file
// STREAMS through a media element, routed into the same music bus as the
// synth, so the volume, the platform mute and the ad / pause gates apply to
// it unchanged; it is also registered with the suspend registry, which pauses
// the element itself under an ad. In the rotation a file plays whole passes
// like a composed song does, then hands over.

/** Drop-ins are mastered far hotter than the synth voices. */
const FILE_GAIN = 0.35
let fileEl: HTMLAudioElement | null = null
let fileGain: GainNode | null = null

const startFile = (url: string, loop: boolean, fadeIn = 0.35): { el: HTMLAudioElement; gain: GainNode } | null => {
  const a = audio()
  if (!a) return null
  const el = new Audio(url)
  el.loop = loop
  el.preload = 'auto'
  const g = a.ctx.createGain()
  g.gain.setValueAtTime(0.0001, a.ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(FILE_GAIN, a.ctx.currentTime + fadeIn)
  a.ctx.createMediaElementSource(el).connect(g).connect(a.music)
  registerHtmlAudio(el)
  el.play().catch(() => { /* blocked or failed — the gates retry the start */ })
  return { el, gain: g }
}

const stopFile = (el: HTMLAudioElement, g: GainNode, fade: number): void => {
  const a = audio()
  if (a) {
    g.gain.cancelScheduledValues(a.ctx.currentTime)
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), a.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, a.ctx.currentTime + fade)
  }
  setTimeout(() => {
    el.pause()
    unregisterHtmlAudio(el)
    g.disconnect()
  }, (fade + 0.05) * 1000)
}

const startFileSong = (id: SongId, url: string, fadeIn: number): boolean => {
  const rotating = !OWN_SONG(id)
  const f = startFile(url, !rotating, fadeIn)
  if (!f) return false
  // A scored file joins where the picture is, like the composed score.
  const sec = startHint?.(id) ?? 0
  if (sec > 0) f.el.currentTime = sec
  playing = id
  fileEl = f.el
  fileGain = f.gain
  if (rotating) {
    let filePlayed = 0
    f.el.addEventListener('ended', () => {
      if (fileEl !== f.el) return
      filePlayed += Number.isFinite(f.el.duration) ? f.el.duration : 0
      if (shouldRotate(area, playing, filePlayed)) {
        slot = (slot + 1) % ROTATION_SIZE
        stopMusic(0.05)
        begin(songFor(area ?? 'base', slot))
      } else {
        f.el.currentTime = 0
        f.el.play().catch(() => { /* the gates retry */ })
      }
    })
  }
  return true
}

/** Start a song from a file if one was dropped in, else compose it. */
const begin = (id: SongId): void => {
  // The intro's score opens on a hit: no gentle first-of-session fade.
  const fadeIn = everStarted ? 0.35 : FIRST_FADE_S
  everStarted = true
  const url = MUSIC_FILES.get(id)
  if (url && startFileSong(id, url, fadeIn)) return
  startSong(id, null, fadeIn, true)
}

/** Ask for an area's music. Leaves a song alone that may keep playing (see `keepsPlaying`). */
export const playMusic = (id: TrackId): void => {
  const a = audio()
  if (!a) {
    startOnGesture(id)
    return
  }
  area = id
  if (isMusicRunning() && keepsPlaying(id, playing, slot)) return
  // The outgoing song's tail runs on under the first bars of the new one.
  stopMusic(HANDOVER_FADE_S)
  begin(songFor(id, slot))
}

/** Stop with a short fade. A rotation song picks up at the same bar next time. */
export const stopMusic = (fade = 0.25): void => {
  pending = null
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  const a = audio()
  if (out && a) retire(out, a.ctx.currentTime, fade)
  if (song && playing) resume = { id: playing, step: Math.floor(stepIdx / 16) * 16, played }
  out = null
  song = null
  if (fileEl && fileGain) stopFile(fileEl, fileGain, fade)
  fileEl = null
  fileGain = null
  playing = null
}

export const isMusicRunning = (): boolean => timer !== null || fileEl !== null
/** The song playing now. */
export const currentMusic = (): SongId | null => playing

/** Short fanfares (not looped). */
export const playJingle = (kind: 'victory' | 'defeat'): void => {
  const a = audio()
  if (!a) return
  stopMusic(0.1)
  const url = MUSIC_FILES.get(kind)
  if (url) {
    const f = startFile(url, false)
    if (f) f.el.addEventListener('ended', () => stopFile(f.el, f.gain, 0.05), { once: true })
    return
  }
  const o = playJingleNotes(a.ctx, a.music, kind)
  setTimeout(() => o.dispose(), 2500)
}
