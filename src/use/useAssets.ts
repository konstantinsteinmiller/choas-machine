import { ref } from 'vue'
import { describeError, withRetry } from '@/utils/retry'
import { prependBaseUrl } from '@/utils/function'

// Chaos Machine renders every gameplay asset procedurally (three.js meshes
// built from primitives, canvas-baked textures, synthesized audio). The
// critical-path "assets" are therefore not files but WORK: the engine chunk,
// the first scene's meshes and the shader compile. `preloadAssets` drives that
// work itself (see `@/game/boot`) so the splash can only clear once the first
// frame is ready to draw — procedural assets appear in no network waterfall,
// so a loader that only awaited image decodes would report "done" while the
// game still had nothing to show.

const loadingProgress = ref(100)
const areAllAssetsLoaded = ref(true)

export const resourceCache = {
  images: new Map<string, HTMLImageElement>(),
  audio: new Map<string, HTMLAudioElement>(),
  audioBuffers: new Map<string, AudioBuffer>()
}

let sharedAudioCtx: AudioContext | null = null
let resumeListenerArmed = false
/** Counts every active reason the audio layer should be globally
 *  silent. The single driver is now `useGamePauseAudio`, which holds one
 *  slot for the whole `isGamePaused` gate (ad mid-show, tab hidden,
 *  platform SDK pause, app modal). Each `suspendAllAudio()` increments,
 *  each `resumeAllAudio()` decrements; the AudioContext only resumes when
 *  the counter hits 0 — so an overlapping suspend (e.g. modal opened
 *  during an ad) can never re-unmute early. */
let suspendDepth = 0

type ActivationNavigator = Navigator & { userActivation?: { hasBeenActive: boolean } }

/** The context came up running: the embed already grants autoplay (e.g. an
 *  iframe with allow="autoplay" on a page the player has clicked). */
let autoplayAtBirth = false

/**
 * Whether audio may start yet. Before the first gesture the autoplay policy
 * refuses to start or resume a context (unless the embed grants autoplay), and
 * Chrome logs a console warning for every refusal. Browsers without the User
 * Activation API report true and rely on the gesture resume below.
 */
export const audioUnlocked = (): boolean =>
  autoplayAtBirth || (navigator as ActivationNavigator).userActivation?.hasBeenActive !== false

export const getAudioContext = (): AudioContext | null => {
  if (sharedAudioCtx) return sharedAudioCtx
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null
  try {
    sharedAudioCtx = new Ctor() as AudioContext
  } catch {
    return null
  }
  autoplayAtBirth = sharedAudioCtx.state === 'running'
  // Born into an already-suspended world. A context constructed on a page that
  // has seen a user gesture starts `running`, so one created AFTER a mute has
  // landed (a portal `soundOff` at boot, a tab hidden before the first sound, an
  // ad opening before any SFX has played) would come up audible underneath it —
  // `suspendAllAudio` had already run and had nothing to suspend. The depth
  // counter is the honest record of whether anything wants silence right now.
  // A transition the browser makes on its own (an OS interruption ending, one
  // of ours landing late) is checked against that record too.
  try { sharedAudioCtx.addEventListener('statechange', syncContextState) } catch { /* older impls */ }
  syncContextState()
  armResumeOnGesture()
  return sharedAudioCtx
}

// ─── Context state: reconcile, never race ─────────────────────────────────
//
// `suspend()` and `resume()` are ASYNC: `ctx.state` keeps its old value until
// the promise settles. Deciding from `ctx.state` alone therefore loses a race
// whenever the gate flips twice inside one transition — an ad whose close and a
// platform pause/soundOn edge land together. A resume issued while the suspend
// was still in flight read `state === 'running'`, did nothing, and the suspend
// then landed with the gate already open: the context stayed suspended and the
// game played on in silence (hub after an interstitial, QA Tool 2026-09-26).
// The mirror race let a suspend be skipped under a pending resume, so an ad
// could open over live audio.
//
// So there is one function that moves the context TOWARD the wanted state —
// suspended while anything holds the depth counter, running otherwise (once
// audio is unlocked) — starts at most one transition at a time, and checks
// again the moment it settles.

/** A suspend/resume is in flight; the next sync waits for it. */
let ctxTransitionPending = false

/** A transition that never settles must not wedge the gate. */
const CTX_TRANSITION_CAP_MS = 1000

const syncContextState = (): void => {
  const ctx = sharedAudioCtx
  if (!ctx || ctxTransitionPending) return
  const state = ctx.state as string
  if (state === 'closed') return
  let op: Promise<void> | undefined
  try {
    if (suspendDepth > 0) {
      if (state === 'running') op = ctx.suspend()
    } else if (state !== 'running' && audioUnlocked()) {
      op = ctx.resume()
    }
  } catch { return /* older impls throw instead of rejecting */ }
  if (!op || typeof op.then !== 'function') return
  ctxTransitionPending = true
  let settled = false
  const settle = (checkAgain: boolean): void => {
    if (settled) return
    settled = true
    ctxTransitionPending = false
    // A rejection (autoplay refusal, a closed context) is not retried here:
    // the next gate edge, gesture or statechange asks again.
    if (checkAgain) syncContextState()
  }
  op.then(() => settle(true), () => settle(false))
  setTimeout(() => settle(true), CTX_TRANSITION_CAP_MS)
}

/** True while engine audio is globally suspended (an ad is on-screen, the
 *  tab is hidden, etc.). SFX entry points (`useSound`) read this to refuse
 *  starting a new one-shot during an ad — so nothing leaks past the mute. */
export const isAudioSuspended = (): boolean => suspendDepth > 0

/**
 * Every gesture asks the context to resume, for the life of the page.
 *
 * Not `once`: iOS suspends ("interrupted") the context on a call, Siri, a
 * video ad or an app switch, and a resume without a gesture is refused there,
 * so the NEXT tap is the only way back to sound. A one-shot listener had
 * already been spent on the first tap, and the game stayed silent for the
 * rest of the session. WebKit also counts `touchend`/`click`, not
 * `pointerdown`, as the activation that may unlock audio, so all of them are
 * heard. `syncContextState` respects the suspend depth, so a tap during an ad
 * or a hidden tab resumes nothing.
 */
const armResumeOnGesture = (): void => {
  if (resumeListenerArmed) return
  resumeListenerArmed = true
  const resume = (): void => {
    if (sharedAudioCtx && sharedAudioCtx.state !== 'running') syncContextState()
  }
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, resume, { capture: true, passive: true })
  }
}

/** Bookkeeping for HTMLAudio elements (music, fallback SFX path) so
 *  the suspend/resume helpers can pause + restart them alongside the
 *  Web Audio context. Loops register on creation in useSound. */
const trackedAudioElements = new Set<HTMLAudioElement>()
const pausedByGlobalSuspend = new WeakSet<HTMLAudioElement>()

export const registerHtmlAudio = (el: HTMLAudioElement) => {
  trackedAudioElements.add(el)
}
export const unregisterHtmlAudio = (el: HTMLAudioElement) => {
  trackedAudioElements.delete(el)
  pausedByGlobalSuspend.delete(el)
}

/** Suspend all engine audio — Web Audio context goes to `suspended`
 *  and any registered HTMLAudio element is paused (and remembered so a
 *  later resume can restart only the ones we actually paused). Stacks:
 *  multiple `suspendAllAudio()` calls require matching `resume` calls
 *  before audio plays again. */
export const suspendAllAudio = (): void => {
  suspendDepth += 1
  syncContextState()
  for (const el of trackedAudioElements) {
    if (!el.paused) {
      pausedByGlobalSuspend.add(el)
      try { el.pause() } catch { /* ignore */ }
    }
  }
}

export const resumeAllAudio = (): void => {
  suspendDepth = Math.max(0, suspendDepth - 1)
  if (suspendDepth > 0) return
  syncContextState()
  for (const el of trackedAudioElements) {
    if (pausedByGlobalSuspend.has(el)) {
      pausedByGlobalSuspend.delete(el)
      void el.play().catch(() => { /* autoplay blocked / element gone */ })
    }
  }
}

// ─── Active one-shot SFX registry ─────────────────────────────────────────
// Transient one-shot SFX (the Web Audio fast path in `useSound`) play on the
// shared AudioContext and aren't HTMLAudio elements, so the suspend gate only
// FREEZES them via `ctx.suspend()`. On an early gate-drop they'd resume and
// tail audibly under an ad. We track them so an ad can hard-STOP them outright.
const activeOneShotSources = new Set<AudioScheduledSourceNode>()

/** Register a one-shot Web Audio source so `killOneShotSfx()` can stop it.
 *  Auto-removes itself when the source finishes. */
export const registerOneShotSource = (source: AudioScheduledSourceNode): void => {
  activeOneShotSources.add(source)
  source.addEventListener('ended', () => activeOneShotSources.delete(source), { once: true })
}

/**
 * Hard-stop EVERY in-flight one-shot SFX so nothing tails into an ad — called
 * right before an interstitial / rewarded ad is requested. Covers:
 *   • Web Audio one-shots  (stopped outright), and
 *   • non-looping tracked HTMLAudio (the decode-fallback one-shots) — paused
 *     AND dropped from the auto-resume set so the gate's resume can't restart
 *     them under or after the ad.
 * Intentionally leaves the bg music (HTMLAudio with `loop=true` → owned by
 * `forceStopMusic`) and the gameplay Web Audio LOOP (owned by the scene's
 * pause watcher) alone, so each is restored by its proper lifecycle.
 */
export const killOneShotSfx = (): void => {
  for (const s of [...activeOneShotSources]) {
    try { s.stop() } catch { /* already ended */ }
    activeOneShotSources.delete(s)
  }
  for (const el of trackedAudioElements) {
    if (el.loop) continue // bg music — forceStopMusic owns its stop/restart
    pausedByGlobalSuspend.delete(el)
    if (!el.paused) { try { el.pause() } catch { /* ignore */ } }
  }
}

// Visibility-driven suspend used to live here (`armVisibilitySuspend`). It
// moved into the unified pause gate: `useGamePause` owns the
// `visibilitychange` listener (flipping `isVisibilityHidden`) and
// `useGamePauseAudio` suspends/resumes audio off that gate for ALL builds —
// so there is one suspend driver instead of two overlapping ones.

// ⚠️ TEMP TEST HARNESS (remove before commit) — exposes the live audio state
// so the Chrome MCP can assert "no sound during the fake interstitial". Reads
// the module-private AudioContext + tracked-element registry that aren't
// otherwise observable from the page. Paired with `window.__testInterstitial`
// / `window.__audioDebug` in `useAds.ts`.
export const __audioDebugSnapshot = () => ({
  audioCtxState: sharedAudioCtx ? sharedAudioCtx.state : 'none',
  suspendDepth,
  trackedAudioCount: trackedAudioElements.size,
  trackedAudioPaused: [...trackedAudioElements].map((e) => e.paused),
  anyTrackedAudioPlaying: [...trackedAudioElements].some((e) => !e.paused),
  activeOneShotSfx: activeOneShotSources.size
})

export const getCachedImage = (src: string): HTMLImageElement => {
  // Route every bitmap src through `prependBaseUrl` so the URL matches
  // the build's base. Critical for wavedash (and any other build that
  // ships with `--base=./`) where the CDN serves the bundle under a
  // hashed path prefix — bare `/images/foo.webp` 404s against the CDN
  // root, but `<base>/images/foo.webp` hits the build folder. Cache
  // keys off the prefixed URL so multiple callers (one passing the
  // leading slash, another not) still hit the same entry after the
  // helper's normalisation.
  const prefixed = prependBaseUrl(src)
  const existing = resourceCache.images.get(prefixed)
  if (existing) return existing
  const img = new Image()
  img.src = prefixed
  resourceCache.images.set(prefixed, img)
  return img
}

const pendingDecodes = new Map<string, Promise<AudioBuffer | null>>()

export const loadAudioBuffer = async (src: string): Promise<AudioBuffer | null> => {
  const cached = resourceCache.audioBuffers.get(src)
  if (cached) return cached
  const existing = pendingDecodes.get(src)
  if (existing) return existing

  const ctx = getAudioContext()
  if (!ctx) return null

  const promise = (async () => {
    try {
      const res = await fetch(src)
      if (!res.ok) return null
      const arrayBuffer = await res.arrayBuffer()
      const buffer = await ctx.decodeAudioData(arrayBuffer)
      resourceCache.audioBuffers.set(src, buffer)
      return buffer
    } catch (e) {
      console.warn(`[assets] decodeAudioData failed for ${src}`, e)
      return null
    } finally {
      pendingDecodes.delete(src)
    }
  })()
  pendingDecodes.set(src, promise)
  return promise
}

/**
 * How long the splash may wait on the survivor strips before giving up and
 * letting the player in anyway.
 *
 * A ceiling, not a target: with the bake-slice fix in `heroSprites.ts` the whole
 * set lands in well under a second even on a thread with no idle time. But a
 * loading screen that can hang forever is a worse bug than a crowd of capsules,
 * so the wait is bounded — and the fallback path is exactly the old behaviour.
 */
/** Hard cap on the whole critical boot, for a prime that HANGS — not for a
 *  slow one. The scene waits for the real first scene (`adoptBootMode`), so
 *  clearing the splash early on a slow phone would only reveal an empty
 *  canvas; the build is time-sliced and the bar keeps moving, so a long wait
 *  reads as loading, not as a freeze. Sits BEFORE the splash's own fallback
 *  so that fallback never fires first. */
const BOOT_TIMEOUT_MS = 20000

export default () => {
  const preloadAssets = async (): Promise<void> => {
    loadingProgress.value = 0
    areAllAssetsLoaded.value = false

    const fonts = (async () => {
      try {
        if (typeof document === 'undefined' || !('fonts' in document)) return
        await Promise.race([
          document.fonts.load('700 1em "Chakra Petch"'),
          new Promise((resolve) => setTimeout(resolve, 1500))
        ])
      } catch { /* a missing font is a fallback face, never a blocker */ }
    })()

    const work = (async () => {
      const boot = await withRetry(() => import('@/game/boot'))
      // The engine chunk is in: FLogoProgress creeps toward this mark while
      // it downloads, so the real numbers continue from there.
      loadingProgress.value = Math.max(loadingProgress.value, 14)
      await boot.primeGame((p01) => {
        loadingProgress.value = Math.max(loadingProgress.value, Math.round(14 + p01 * 85))
      })
    })()

    try {
      await Promise.race([
        Promise.all([fonts, work]),
        new Promise((resolve) => setTimeout(resolve, BOOT_TIMEOUT_MS))
      ])
    } catch (e) {
      console.error('[assets] boot priming failed', describeError(e))
    }

    loadingProgress.value = 100
    areAllAssetsLoaded.value = true
  }

  return {
    loadingProgress,
    areAllAssetsLoaded,
    preloadAssets,
    resourceCache
  }
}
