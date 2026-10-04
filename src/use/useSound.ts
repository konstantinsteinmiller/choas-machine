import { prependBaseUrl } from '@/utils/function'
import useUser from '@/use/useUser'
import { getAudioContext, loadAudioBuffer, resourceCache, registerHtmlAudio, unregisterHtmlAudio, isAudioSuspended, registerOneShotSource } from '@/use/useAssets'
import { isAudioPaused } from '@/use/useGamePause'
import { isPlatformAudioMuted } from '@/use/useGamePauseAudio'
import { isMobileAudioMuted } from '@/use/useMobileAudioMute'

import { ref, onMounted, watch, onUnmounted } from 'vue'
import { playMusic, stopMusic, type TrackId } from '@/game/audio/music'

// We keep the audio instance outside the hook so it's a true Singleton
const bgMusic = ref<HTMLAudioElement | null>(null)
const isLoaded = ref(false)
const isPlaying = ref(false)
// Tracks whether music is *meant* to be playing right now (i.e. a battle is
// in progress). Used so visibility-change resume only un-pauses when there's
// actually a battle running.
const shouldPlay = ref(false)

/**
 * Hard-stop the background music IMMEDIATELY (no fade) and clear the
 * play-intent flags. Use right before an interstitial ad is requested.
 *
 * Why this and not just the suspend gate: the pause gate (`useGamePauseAudio`)
 * pauses the music while `isAdShowing` is true and RESUMES it when the flag
 * drops. But the GamePix `interstitialAd()` promise can resolve before the ad
 * visually closes — `isAdShowing` then drops and the gate restarts the music
 * UNDER the still-open ad (the bug GamePix QA keeps reporting). Stopping the
 * music here first makes that impossible: the element is already paused before
 * any suspend runs, so it's never queued for auto-resume, and `shouldPlay =
 * false` stops any in-flight fade. The next round's `startBattleMusic()`
 * brings it back. Idempotent and null-safe.
 */
/** Set by `useMusic()` — see the assignment there for why it exists. */
let restartTrack: (() => void) | null = null
let retrackSynth: (() => void) | null = null
/** True while the synthesized score (not a drop-in file) is the music source. */
let usingSynth = false
/** Which part of the game is on screen — picks the synthesized track. */
const gameTrack = ref<TrackId>('stealth')
const synthTrack = (): TrackId => gameTrack.value
/** Start the game's music (sets the play intent). Safe to call repeatedly. */
export const startGameMusic = (): void => {
  restartTrack?.()
}

/** The track the game wants now (a story scene puts it back after itself). */
export const currentMusicTrack = (): TrackId => gameTrack.value

/** Called by the game on mode / sector / boss changes. */
export const setMusicTrack = (id: TrackId): void => {
  if (gameTrack.value === id) return
  gameTrack.value = id
  retrackSynth?.()
}

/**
 * Bring the battle music back after an ad that interrupted a LIVE run.
 *
 * `forceStopMusic` deliberately clears the play INTENT (`shouldPlay`), so the
 * pause gate cannot restart the track underneath an ad that is still open. Its
 * contract is that "the next round's `startBattleMusic()` brings it back", and
 * for the between-rounds interstitial that is exactly right — the next round is
 * one button press away.
 *
 * The GamePix first-LOAD interstitial breaks that assumption: it fires from the
 * splash, while stage 1 is already running, and stages 1-2 hand over without a
 * result screen — so the next `startBattleMusic()` is two or three stages and
 * several minutes away. Measured in a real browser against the built GamePix
 * bundle: the ad no-filled and the game stayed SILENT for the rest of the
 * opening. Nothing threw, and no test covered it.
 *
 * No-ops when the music was never wanted, and it goes through the normal start
 * path — so if the portal is muted this re-asserts the intent and stays silent,
 * and the unmute watcher sounds it later.
 */
export const resumeMusicAfterAd = (): void => {
  restartTrack?.()
}

export const forceStopMusic = (): void => {
  shouldPlay.value = false
  stopMusic(0.02)
  try {
    bgMusic.value?.pause()
    if (bgMusic.value) {
      bgMusic.value.volume = 0
    }
  } catch { /* element gone / not ready */ }
  isPlaying.value = false
}

/**
 * Set the background-music playback rate directly. The game tick computes a
 * stage-aware rate from the ball's current speed (slow at stage start / under
 * slow-mo, faster as the run heats up — see useEpicGame.step) and feeds it here
 * each frame. Clamped to a sane band so a bad value can never warp the audio.
 * Idempotent, null-safe, and a no-op before the music element exists, so it must
 * never throw or allocate.
 */
export const setMusicRate = (rate: number): void => {
  if (!bgMusic.value) return
  const safe = Number.isFinite(rate) ? rate : 1
  const clamped = Math.max(0.5, Math.min(2, safe))
  try {
    bgMusic.value.playbackRate = clamped
  } catch { /* element not ready / rate unsupported */ }
}

/**
 * ─── The tempo follows the crowd ────────────────────────────────────────────
 *
 * A hundred and eighty people running is not the same scene as nine, and until
 * now the score did not know the difference — `setMusicRate` had been written,
 * clamped and documented here for months with no caller anywhere in the repo.
 *
 * The curve is deliberately shallow and deliberately SATURATING. `+18 %` at the
 * top is about a tone and a half of pitch on a looping track: felt as the run
 * tightening, never heard as a broken tape. It rises LINEARLY to that ceiling
 * at 600 survivors — a very good stage rather than an unreachable one (the hard
 * cap is `MAX_SQUAD`, 4000), because the effect has to be arriving while the
 * crowd is still growing rather than long since pinned at the top.
 *
 * Note the shape: `RANGE × min(1, n / FULL)`, not `min(RANGE, n / FULL)`. The
 * second is the obvious spelling and it is wrong — it saturates at 108
 * survivors, which most runs pass in the first two stages, so the tempo would
 * be pinned at maximum for nine tenths of a career and the feature would be a
 * constant rather than a signal.
 *
 * And it is a function of the crowd ON SCREEN, not of the stage number: losing
 * two thirds of a squad to a `÷3` drops the tempo with it, which is the half of
 * this that a stage-indexed version could never do.
 */
export const MUSIC_RATE_RANGE = 0.18
export const MUSIC_RATE_FULL_SQUAD = 600

/** Playback rate for a crowd of `squad`. Pure, clamped, total. */
export const squadMusicRate = (squad: number): number => {
  const n = Number.isFinite(squad) ? Math.max(0, squad) : 0
  return 1 + MUSIC_RATE_RANGE * Math.min(1, n / MUSIC_RATE_FULL_SQUAD)
}

/**
 * What the track does when the run ends badly.
 *
 * A hard drop below 1.0 rather than a fade: the crowd is gone, and a score that
 * keeps its tempo through a wipe is the single most common way a game tells the
 * player it did not notice. Held for `MUSIC_WIPE_MS`, which outlasts the wipe
 * effect and lands under the result screen.
 */
export const MUSIC_WIPE_RATE = 0.85
export const MUSIC_WIPE_MS = 2000

/**
 * Back-compat: drive tempo from a 0..1 intensity. Retained for any caller that
 * still thinks in "intensity"; maps onto a gentle 1.0×–1.15× rate band.
 */
export const setMusicIntensity = (intensity: number): void => {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : 0))
  setMusicRate(1 + clamped * 0.15)
}

export const useMusic = () => {
  const { userMusicVolume } = useUser()

  watch(userMusicVolume, () => {
    if (!bgMusic.value) return
    bgMusic.value.volume = Math.max(0, Math.min(1, (userMusicVolume.value ?? 0.6) * 0.025))
  })

  /** A whole-track drop-in under public/audio/music/ replaces the synth score. */
  const currentTrackFile = (): string => 'theme.ogg'

  /** Gates shared by BOTH music paths: never start under an ad, a hidden tab,
   *  a platform pause or a mute. A modal is not one: it freezes the game, not
   *  the music (see `isAudioPaused`). */
  const blocked = (): boolean => isAudioPaused.value || isMobileAudioMuted.value || isPlatformAudioMuted.value

  const loadAndPlayTrack = () => {
    if (!bgMusic.value) return
    const src = prependBaseUrl('audio/music/' + currentTrackFile())
    const cached = resourceCache.audio.get(src)
    if (!cached) {
      // No drop-in music file → the synthesized chiptune score.
      usingSynth = true
      bgMusic.value.pause()
      if (blocked()) return
      playMusic(synthTrack())
      isPlaying.value = true
      return
    }
    usingSynth = false
    stopMusic(0.1)
    bgMusic.value.pause()
    bgMusic.value.volume = 0
    bgMusic.value.src = cached.src
    isLoaded.value = true
    playWithFade()
  }

  const pauseMusic = () => {
    if (usingSynth) {
      stopMusic(0.1)
      isPlaying.value = false
      return
    }
    if (bgMusic.value) {
      bgMusic.value.pause()
      isPlaying.value = false
    }
  }

  const continueMusic = () => {
    if (!shouldPlay.value) return
    if (usingSynth) {
      if (!blocked()) {
        playMusic(synthTrack())
        isPlaying.value = true
      }
      return
    }
    if (bgMusic.value) playWithFade()
  }

  const resumeIfWanted = () => {
    if (!shouldPlay.value || isPlaying.value) return
    if (usingSynth) continueMusic()
    else if (bgMusic.value && bgMusic.value.paused) playWithFade()
  }

  const initMusic = () => {
    onMounted(() => {
      if (bgMusic.value) return // Already initialized
      const audio = new Audio()
      audio.loop = true
      audio.volume = 0
      audio.preload = 'auto'
      bgMusic.value = audio
      registerHtmlAudio(audio)
      // Re-start on the FALSE edge of every gate: without these a player who
      // unpauses / unmutes gets a permanently silent game, because the intent
      // (`shouldPlay`) was already true and nothing calls the start again.
      watch(isAudioPaused, (paused) => { if (!paused) resumeIfWanted() })
      watch(isMobileAudioMuted, (muted) => { if (!muted) resumeIfWanted() })
      watch(isPlatformAudioMuted, (muted) => {
        if (muted) {
          if (usingSynth) { stopMusic(0.05); isPlaying.value = false }
        } else resumeIfWanted()
      })
    })
    onUnmounted(() => {
      if (bgMusic.value) unregisterHtmlAudio(bgMusic.value)
      bgMusic.value?.pause()
      bgMusic.value?.removeAttribute('src')
      bgMusic.value = null
      stopMusic(0.05)
      shouldPlay.value = false
      isPlaying.value = false
      isLoaded.value = false
    })
  }

  const isMusicPlaying = (): boolean => isPlaying.value

  const startBattleMusic = () => {
    if (!bgMusic.value) return
    if (shouldPlay.value && isPlaying.value) return
    shouldPlay.value = true
    loadAndPlayTrack()
  }
  restartTrack = startBattleMusic
  retrackSynth = () => {
    if (usingSynth && shouldPlay.value && isPlaying.value) playMusic(synthTrack())
  }

  const stopBattleMusic = () => {
    shouldPlay.value = false
    if (usingSynth) {
      stopMusic(0.4)
      isPlaying.value = false
      return
    }
    if (!bgMusic.value) return
    fadeOut(() => {
      bgMusic.value?.pause()
      isPlaying.value = false
    })
  }

  const playWithFade = () => {
    if (!bgMusic.value) return
    if (blocked()) return
    bgMusic.value.play().then(() => {
      isPlaying.value = true
      fadeIn()
    }).catch(() => {
      window.addEventListener('click', () => {
        if (!isPlaying.value && shouldPlay.value) playWithFade()
      }, { once: true })
    })
  }

  const fadeIn = () => {
    if (!bgMusic.value) return
    let vol = 0
    const target = Math.max(0, Math.min(1, (userMusicVolume.value ?? 0.6) * 0.125))
    const interval = setInterval(() => {
      if (!bgMusic.value || !shouldPlay.value) {
        clearInterval(interval)
        return
      }
      if (vol < target) {
        vol += 0.005
        bgMusic.value.volume = Math.min(vol, target)
      } else {
        clearInterval(interval)
      }
    }, 50)
  }

  const fadeOut = (onDone?: () => void) => {
    if (!bgMusic.value) {
      onDone?.()
      return
    }
    const interval = setInterval(() => {
      if (!bgMusic.value) {
        clearInterval(interval)
        onDone?.()
        return
      }
      const v = bgMusic.value.volume
      if (v > 0.005) {
        bgMusic.value.volume = Math.max(0, v - 0.005)
      } else {
        bgMusic.value.volume = 0
        clearInterval(interval)
        onDone?.()
      }
    }, 50)
  }

  return { initMusic, isLoaded, isPlaying, isMusicPlaying, pauseMusic, continueMusic, startBattleMusic, stopBattleMusic }
}

export type SoundHandle = Pick<
  HTMLAudioElement,
  'addEventListener' | 'removeEventListener'
>

/** Handle returned by `playLoop`. Persistent looping voices (chain whir,
 *  ambient drones) live for the duration of a play state — the caller
 *  is responsible for `stop()` when the state changes. */
export interface LoopHandle {
  stop: () => void
  setVolume: (ratio: number) => void
}

const makeWebAudioHandle = (source: AudioBufferSourceNode): SoundHandle => {
  // AudioBufferSourceNode is already an EventTarget and fires 'ended' when
  // playback finishes or stop() is called. We just need to ignore 'error'
  // (Web Audio doesn't emit one) so callers that add both listeners don't
  // crash. Treating 'error' as a no-op is safe because 'ended' always
  // fires for a successfully-started source.
  return {
    addEventListener: ((event: string, cb: EventListener, opts?: AddEventListenerOptions | boolean) => {
      if (event === 'ended') source.addEventListener('ended', cb, opts)
    }) as HTMLAudioElement['addEventListener'],
    removeEventListener: ((event: string, cb: EventListener, opts?: EventListenerOptions | boolean) => {
      if (event === 'ended') source.removeEventListener('ended', cb, opts)
    }) as HTMLAudioElement['removeEventListener']
  }
}

const useSounds = () => {
  const { userSoundVolume } = useUser()

  const clampVolume = (ratio: number): number =>
    Math.max(0, Math.min(1, (userSoundVolume.value ?? 0.7) * ratio))

  const playViaWebAudio = (
    ctx: AudioContext,
    buffer: AudioBuffer,
    ratio: number,
    pitch: number
  ): SoundHandle | null => {
    try {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      if (pitch !== 1) source.playbackRate.value = pitch
      const gain = ctx.createGain()
      gain.gain.value = clampVolume(ratio)
      source.connect(gain).connect(ctx.destination)
      source.start()
      // Track so an ad can hard-stop it (ctx.suspend only freezes; an early
      // gate-drop would otherwise let it tail audibly under the ad).
      registerOneShotSource(source)
      return makeWebAudioHandle(source)
    } catch (e) {
      // Browser refused to start (context killed, etc.) — signal the
      // caller's cleanup via a dispatched 'ended' so they don't leak a
      // slot in their active-sounds counter.
      console.warn('[sfx] Web Audio start failed', e)
      return null
    }
  }

  const playViaHtmlAudio = (src: string, ratio: number): HTMLAudioElement => {
    const cached = resourceCache.audio.get(src)
    const audio = cached
      ? (cached.cloneNode(false) as HTMLAudioElement)
      : new Audio(src)
    // iOS requires volume to be set BEFORE play(). Clamp to [0,1] —
    // Firefox throws DOMException if volume is NaN or out of range (can
    // happen when userSoundVolume hasn't loaded from IndexedDB yet).
    audio.volume = clampVolume(ratio)
    // Track this element with the global suspend registry so a mid-flight
    // SFX (this fallback path fires while a buffer is still decoding) is
    // paused if an ad opens before it finishes. Auto-unregister when the
    // one-shot ends so the WeakSet/Set don't grow unbounded.
    registerHtmlAudio(audio)
    const release = () => unregisterHtmlAudio(audio)
    audio.addEventListener('ended', release, { once: true })
    audio.addEventListener('error', release, { once: true })
    // `play()` returns a Promise in modern browsers, but `undefined` under
    // jsdom and old Safari — guard the `.catch` so a non-Promise return
    // doesn't throw and abort the gameplay tick that triggered the SFX.
    audio.play()?.catch(() => {
      /* autoplay blocked or media failed — ignore */
    })
    return audio
  }

  const playSound = (effect: string, ratio = 0.025, pitch = 1): SoundHandle | null => {
    // Hard mute while the game is paused for an ad / hidden tab. The Web
    // Audio context is already suspended (so a started source would be
    // frozen), but the HTMLAudio fallback would otherwise play immediately
    // under the ad — refuse to start any one-shot at all. This is the
    // "pause all sounds during ads" guarantee QA asked for.
    if (isAudioSuspended()) return null

    const src = prependBaseUrl(`audio/sfx/${effect}.ogg`)

    // Fast path: preloaded AudioBuffer + Web Audio.
    const buffer = resourceCache.audioBuffers.get(src)
    const ctx = getAudioContext()
    if (ctx && buffer) {
      return playViaWebAudio(ctx, buffer, ratio, pitch)
    }

    // Slow path: Web Audio available but buffer not yet decoded. Kick off
    // a background decode so subsequent calls hit the fast path, and play
    // *this* call via HTMLAudio so the player still hears it immediately.
    if (ctx && !buffer) {
      void loadAudioBuffer(src)
    }

    // Fallback: HTMLAudio (also used when Web Audio is unavailable).
    // Pitch is ignored here — HTMLAudio's playbackRate works but the
    // fallback path is intentionally bare-bones, and any modern browser
    // that hits it isn't sweating a fixed-pitch SFX.
    return playViaHtmlAudio(src, ratio)
  }

  /** Random-variant helper — fires one of `prefix-1` … `prefix-count`
   *  with a small per-call pitch jitter so a rapid burst (e.g. mowing a
   *  whole grass cluster) doesn't sound like a machine gun. */
  const playRandomVariant = (
    prefix: string,
    count: number,
    ratio = 0.04,
    pitchJitter = 0.08
  ): SoundHandle | null => {
    if (count < 1) return null
    const idx = 1 + Math.floor(Math.random() * count)
    const pitch = 1 + (Math.random() - 0.5) * pitchJitter * 2
    return playSound(`${prefix}-${idx}`, ratio, pitch)
  }

  /** Start a looping sample. Returns a handle whose `.stop()` ends the
   *  voice and `.setVolume()` retunes its gain. `playSound` plays one-
   *  shots; this is for chain-saw whirs, ambient drones, anything that
   *  should pulse for the duration of a state. */
  const playLoop = (effect: string, ratio = 0.025): LoopHandle | null => {
    // Don't spin up a looping voice while audio is globally suspended (ad
    // on screen / tab hidden). Gameplay is paused in that window anyway, so
    // nothing should be requesting a new loop — this is belt-and-braces.
    if (isAudioSuspended()) return null
    const src = prependBaseUrl(`audio/sfx/${effect}.ogg`)
    const ctx = getAudioContext()
    if (!ctx) return null
    let source: AudioBufferSourceNode | null = null
    let gain: GainNode | null = null
    let stopped = false
    const begin = (buffer: AudioBuffer) => {
      if (stopped) return
      try {
        source = ctx.createBufferSource()
        source.buffer = buffer
        source.loop = true
        gain = ctx.createGain()
        gain.gain.value = clampVolume(ratio)
        source.connect(gain).connect(ctx.destination)
        source.start()
      } catch (e) {
        console.warn('[sfx] loop start failed', e)
      }
    }
    const buffer = resourceCache.audioBuffers.get(src)
    if (buffer) {
      begin(buffer)
    } else {
      // Defer until decoded. If the user stops the loop before decode
      // resolves, `stopped` short-circuits inside `begin`.
      void loadAudioBuffer(src).then(b => { if (b) begin(b) })
    }
    return {
      stop: () => {
        stopped = true
        if (source) {
          try { source.stop() } catch { /* already stopped */ }
          try { source.disconnect() } catch { /* no-op */ }
          source = null
        }
        if (gain) {
          try { gain.disconnect() } catch { /* no-op */ }
          gain = null
        }
      },
      setVolume: (r: number) => {
        if (gain) gain.gain.value = clampVolume(r)
      }
    }
  }

  return {
    playSound,
    playRandomVariant,
    playLoop
  }
}

export default useSounds

