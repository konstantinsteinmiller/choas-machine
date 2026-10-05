import { watch } from 'vue'
import { getAudioContext, isAudioSuspended, audioUnlocked } from '@/use/useAssets'
import useUser from '@/use/useUser'
import { isMobileAudioMuted } from '@/use/useMobileAudioMute'
import { isPlatformAudioMuted } from '@/use/useGamePauseAudio'

/**
 * ─── Audio graph ─────────────────────────────────────────────────────────────
 *
 * Everything the game plays is SYNTHESIZED on the one shared AudioContext
 * (`useAssets.getAudioContext`). That is what makes the ad / pause / platform
 * mute guarantees hold for free: those gates suspend the context, and a
 * suspended context stops every oscillator and freezes the music clock.
 *
 *   sfx voices ─► sfxBus ─► sfxTone (low-pass) ─┐
 *   voice lines ─► voiceBus ────────────────────┼─► master (compressor) ─► limiter ─► destination
 *   music voices ► musicBus ─► duck ─────────────┘
 *
 * The voice lines have their own bus so they sit above the combat instead of
 * fighting it, and the music ducks under them and under the big stings
 * (`duckMusic`). The SFX low-pass takes the fizz off the bright pulse-wave
 * blips; the limiter after the compressor catches what a pile-up still spikes.
 */

let ctx: AudioContext | null = null
let master: DynamicsCompressorNode | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
let voiceBus: GainNode | null = null
let duck: GainNode | null = null
let duckUntil = 0
let noiseBuf: AudioBuffer | null = null
const pulseWaves = new Map<number, PeriodicWave>()
let watching = false
/** Dev tooling: the graph is built on this context instead (the trailer's offline mix). */
let forced: BaseAudioContext | null = null

/**
 * Dev tooling: build the whole graph (buses, ducking, limiter) on `c`, an
 * OfflineAudioContext, and play everything there, unlocked and unmuted. The
 * cinematic trailer renders its soundtrack through the game's own mixer this
 * way (`tools/preview-video/trailer/`).
 */
export const forceAudioContext = (c: BaseAudioContext): void => {
  forced = c
  ctx = null
  master = sfxBus = musicBus = voiceBus = duck = null
  duckUntil = 0
  noiseBuf = null
  pulseWaves.clear()
}

export const SFX_BASE = 0.32
export const MUSIC_BASE = 0.2
/** A voice line against the SFX level: recorded speech is mastered far hotter
 *  than the synth voices (which peak around 0.3–0.4). */
export const VOICE_BASE = 0.6
/** How far the music drops under a voice line or a sting. */
export const DUCK_DB = 7
/** The SFX bus's top end (Hz): the fizz of the pulse-wave blips is gone, the
 *  bite stays. */
export const SFX_TOP_HZ = 9500

/** False until audio may start (see `audioUnlocked`). */
export const audioAllowed = audioUnlocked

/**
 * The graph, created lazily on first use. It hands out nothing until audio is
 * unlocked, so no voice ever starts on a context the autoplay policy would
 * refuse (each refusal is a console warning).
 */
export interface AudioGraph { ctx: AudioContext; sfx: GainNode; music: GainNode; voice: GainNode }

// ─── Held during the boot (#36, PERF-LEDGER.md entry 4) ──────────────────────
// Opening the audio device costs 50 to 270 ms of main thread (4× CPU), and
// the first sound starts the music's synthesis with it. Nothing can be heard
// behind the loader that matters, so the boot holds the graph until its
// first scene is on screen: sounds asked for meanwhile are dropped, the
// music waits (`music.ts`), and what must not be lost (the intro's drop-in)
// is queued with `whenAudio`.
let held = false
const queued: Array<() => void> = []

/** The boot starts: no audio graph until `releaseAudio`. */
export const holdAudio = (): void => { held = true }
export const audioHeld = (): boolean => held
/** The first scene is live: audio may wake, and what waited for it runs now. */
export const releaseAudio = (): void => {
  if (!held) return
  held = false
  for (const fn of queued.splice(0)) {
    try { fn() } catch (e) { console.warn('[audio] deferred start failed', e) }
  }
}
/** Run `fn` now, or once the boot lets audio wake. */
export const whenAudio = (fn: () => void): void => {
  if (held) queued.push(fn)
  else fn()
}

export const audio = (): AudioGraph | null => {
  if (held && !forced) return null
  if (ctx && sfxBus && musicBus && voiceBus) return forced || audioUnlocked() ? { ctx, sfx: sfxBus, music: musicBus, voice: voiceBus } : null
  // An OfflineAudioContext offers everything the graph uses.
  const c = (forced as AudioContext | null) ?? getAudioContext()
  if (!c) return null
  ctx = c
  master = c.createDynamicsCompressor()
  master.threshold.value = -14
  master.knee.value = 12
  master.ratio.value = 4
  master.attack.value = 0.003
  master.release.value = 0.2
  const limiter = c.createDynamicsCompressor()
  limiter.threshold.value = -1.5
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.1
  master.connect(limiter).connect(c.destination)
  sfxBus = c.createGain()
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = SFX_TOP_HZ
  tone.Q.value = 0.5
  sfxBus.connect(tone).connect(master)
  voiceBus = c.createGain()
  voiceBus.connect(master)
  musicBus = c.createGain()
  duck = c.createGain()
  musicBus.connect(duck).connect(master)
  applyVolumes()
  if (!watching && !forced) {
    watching = true
    const { userSoundVolume, userMusicVolume } = useUser()
    watch([userSoundVolume, userMusicVolume, isMobileAudioMuted, isPlatformAudioMuted], applyVolumes)
  }
  return forced || audioUnlocked() ? { ctx: c, sfx: sfxBus, music: musicBus, voice: voiceBus } : null
}

/**
 * Duck the music for `seconds` (a voice line, a sting): down DUCK_DB in 50 ms,
 * back over 400 ms once the last overlapping duck has ended.
 */
export const duckMusic = (seconds: number): void => {
  if (!ctx || !duck) return
  const t = ctx.currentTime
  const low = Math.pow(10, -DUCK_DB / 20)
  const until = Math.max(t + 0.05, t + Math.max(0, seconds))
  const g = duck.gain
  if (t >= duckUntil) {
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(low, t + 0.05)
  }
  if (until > duckUntil) {
    duckUntil = until
    g.cancelScheduledValues(t + 0.05)
    g.setValueAtTime(low, until)
    g.linearRampToValueAtTime(1, until + 0.4)
  }
}

const applyVolumes = (): void => {
  if (!ctx || !sfxBus || !musicBus) return
  const { userSoundVolume, userMusicVolume } = useUser()
  const muted = !forced && (isMobileAudioMuted.value || isPlatformAudioMuted.value)
  const t = ctx.currentTime
  sfxBus.gain.setTargetAtTime(muted ? 0 : SFX_BASE * (userSoundVolume.value ?? 0.7), t, 0.02)
  voiceBus?.gain.setTargetAtTime(muted ? 0 : SFX_BASE * VOICE_BASE * (userSoundVolume.value ?? 0.7), t, 0.02)
  musicBus.gain.setTargetAtTime(muted ? 0 : MUSIC_BASE * (userMusicVolume.value ?? 0.6), t, 0.05)
}

/** White noise, 1 s, shared by every noise voice. */
export const noise = (): AudioBuffer | null => {
  if (noiseBuf) return noiseBuf
  const a = audio()
  if (!a) return null
  const len = a.ctx.sampleRate
  noiseBuf = a.ctx.createBuffer(1, len, a.ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return noiseBuf
}

/** Band-limited pulse wave with the given duty (0.125 / 0.25 / 0.5 — the
 *  classic console channel's three timbres). */
export const pulse = (duty: number): PeriodicWave | null => {
  const hit = pulseWaves.get(duty)
  if (hit) return hit
  const a = audio()
  if (!a) return null
  const N = 48
  const real = new Float32Array(N)
  const imag = new Float32Array(N)
  for (let n = 1; n < N; n++) {
    real[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI)
    imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI)
  }
  const w = a.ctx.createPeriodicWave(real, imag)
  pulseWaves.set(duty, w)
  return w
}

/** The graph runs on a forced (offline) context: it plays whatever its state reads. */
export const audioForced = (): boolean => !!forced

export const canPlay = (): boolean =>
  !!forced || (!isAudioSuspended() && !isMobileAudioMuted.value && !isPlatformAudioMuted.value)

export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)
