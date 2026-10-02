<template lang="pug">
  Transition(name="splash-fade" @after-leave="onBackdropGone")
    div.splash-backdrop.no-os-ui(v-if="!backdropHidden")
      div.backdrop-grid(ref="gridEl" aria-hidden="true")
  Transition(name="loader-fade")
    div.loader.no-os-ui(v-if="!done")
      div.card
        //- The same ONE-SVG lockup as the static splash in index.html, byte for
        //- byte (tests/ui/splashLogo.test.ts compares them): the mech's visor head in
        //- the hex badge over the CHAOS / MACHINE wordmark, all paths,
        //- no ids (the two copies share the document during the hand-over).
        h1.logo(:aria-label="t('gameName')")
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 256" aria-hidden="true" focusable="false"><g stroke="#1c1233" stroke-linejoin="round" stroke-linecap="round"><path d="M196.8 87.0L150.0 114.0L103.2 87.0L103.2 33.0L150.0 6.0L196.8 33.0z" fill="#3a2a6e" stroke-width="7"/><path d="M187.2 81.5L150.0 103.0L112.8 81.5L112.8 38.5L150.0 17.0L187.2 38.5z" fill="none" stroke="#5fe3f5" stroke-width="3"/><path d="M150 22v12" fill="none" stroke-width="5"/><circle cx="150" cy="20" r="5" fill="#ff5fb7" stroke-width="4"/><path d="M112 52h10v22h-10zM178 52h10v22h-10z" fill="#5fe3f5" stroke-width="4"/><path d="M128 34h44l10 12v34l-10 10h-44l-10-10V46z" fill="#b9a6ff" stroke-width="5"/><path d="M126 50h48v20h-48z" fill="#1c1233" stroke-width="4"/><path d="M134 56h10v8h-10zM156 56h10v8h-10z" fill="#ff5fb7" stroke="none"/><path d="M42 124h24v8h-24zM34 132h8v8h-8zM66 132h8v8h-8zM34 140h8v8h-8zM34 148h8v8h-8zM34 156h8v8h-8zM34 164h8v8h-8zM66 164h8v8h-8zM42 172h24v8h-24zM82 124h8v8h-8zM114 124h8v8h-8zM82 132h8v8h-8zM114 132h8v8h-8zM82 140h8v8h-8zM114 140h8v8h-8zM82 148h40v8h-40zM82 156h8v8h-8zM114 156h8v8h-8zM82 164h8v8h-8zM114 164h8v8h-8zM82 172h8v8h-8zM114 172h8v8h-8zM138 124h24v8h-24zM130 132h8v8h-8zM162 132h8v8h-8zM130 140h8v8h-8zM162 140h8v8h-8zM130 148h40v8h-40zM130 156h8v8h-8zM162 156h8v8h-8zM130 164h8v8h-8zM162 164h8v8h-8zM130 172h8v8h-8zM162 172h8v8h-8zM186 124h24v8h-24zM178 132h8v8h-8zM210 132h8v8h-8zM178 140h8v8h-8zM210 140h8v8h-8zM178 148h8v8h-8zM210 148h8v8h-8zM178 156h8v8h-8zM210 156h8v8h-8zM178 164h8v8h-8zM210 164h8v8h-8zM186 172h24v8h-24zM234 124h32v8h-32zM226 132h8v8h-8zM226 140h8v8h-8zM234 148h24v8h-24zM258 156h8v8h-8zM258 164h8v8h-8zM226 172h32v8h-32z" fill="#ff5fb7" stroke-width="5" paint-order="stroke"/><path d="M27 196h6v6h-6zM51 196h6v6h-6zM27 202h12v6h-12zM45 202h12v6h-12zM27 208h6v6h-6zM39 208h6v6h-6zM51 208h6v6h-6zM27 214h6v6h-6zM39 214h6v6h-6zM51 214h6v6h-6zM27 220h6v6h-6zM51 220h6v6h-6zM27 226h6v6h-6zM51 226h6v6h-6zM27 232h6v6h-6zM51 232h6v6h-6zM69 196h18v6h-18zM63 202h6v6h-6zM87 202h6v6h-6zM63 208h6v6h-6zM87 208h6v6h-6zM63 214h30v6h-30zM63 220h6v6h-6zM87 220h6v6h-6zM63 226h6v6h-6zM87 226h6v6h-6zM63 232h6v6h-6zM87 232h6v6h-6zM105 196h18v6h-18zM99 202h6v6h-6zM123 202h6v6h-6zM99 208h6v6h-6zM99 214h6v6h-6zM99 220h6v6h-6zM99 226h6v6h-6zM123 226h6v6h-6zM105 232h18v6h-18zM135 196h6v6h-6zM159 196h6v6h-6zM135 202h6v6h-6zM159 202h6v6h-6zM135 208h6v6h-6zM159 208h6v6h-6zM135 214h30v6h-30zM135 220h6v6h-6zM159 220h6v6h-6zM135 226h6v6h-6zM159 226h6v6h-6zM135 232h6v6h-6zM159 232h6v6h-6zM171 196h30v6h-30zM183 202h6v6h-6zM183 208h6v6h-6zM183 214h6v6h-6zM183 220h6v6h-6zM183 226h6v6h-6zM171 232h30v6h-30zM207 196h6v6h-6zM231 196h6v6h-6zM207 202h12v6h-12zM231 202h6v6h-6zM207 208h6v6h-6zM219 208h6v6h-6zM231 208h6v6h-6zM207 214h6v6h-6zM225 214h12v6h-12zM207 220h6v6h-6zM231 220h6v6h-6zM207 226h6v6h-6zM231 226h6v6h-6zM207 232h6v6h-6zM231 232h6v6h-6zM243 196h30v6h-30zM243 202h6v6h-6zM243 208h6v6h-6zM243 214h24v6h-24zM243 220h6v6h-6zM243 226h6v6h-6zM243 232h30v6h-30z" fill="#5fe3f5" stroke-width="5" paint-order="stroke"/></g></svg>
        div.bar(role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100")
          div.track(aria-hidden="true")
          div.lit(aria-hidden="true")
            div.fill(:style="fillStyle")
        Transition(name="hint-fade")
          div.stuck-hint(v-if="showStuckHint") {{ t('loading.tooLong') }}
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useAssets from '@/use/useAssets'
import { stopLoading } from '@/use/useCrazyGames'
import { armFirstLoadInterstitial, notifySplashGone } from '@/use/useFirstLoadInterstitial'
import { whenInteractive } from '@/use/whenInteractive'

/**
 * The boot splash: the Chaos Machine lockup + a plasma bar, driven by
 * `useAssets.preloadAssets`, which primes the 3D engine — procedural meshes,
 * baked textures and the shader compile — so the first frame after the
 * splash is a real frame, not a hitch.
 *
 * Also owns every portal "loading finished" signal (CrazyGames loadingStop,
 * Playgama / GamePix / Poki / Yandex ready), fired once the splash is gone.
 */
const { t } = useI18n()

const { loadingProgress, preloadAssets } = useAssets()
const progress = computed(() => loadingProgress.value)

// ── The bar ──
// One fill scaled by `transform`, clipped by the capsule. A transform
// transition runs on the COMPOSITOR, so the bar keeps moving through a long
// main-thread task (the engine chunk evaluating, a slice that overran) where
// a per-segment class toggle would freeze.
//
// It starts exactly where the static HTML splash's creeping bar has got to,
// so the handover never jumps backwards. While nothing has reported progress
// yet (the engine chunk is still downloading) it creeps toward CREEP_TO.
const readScaleX = (el: Element | null): number => {
  if (!el) return 0
  const m = /matrix\(([^,]+)/.exec(getComputedStyle(el).transform)
  const v = m ? parseFloat(m[1]!) : 0
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
}
const startAt = typeof document !== 'undefined' ? readScaleX(document.querySelector('#static-splash .s-fill')) : 0
const CREEP_TO = 0.14
const armed = ref(false)
const fillStyle = computed(() => {
  const real = Math.max(progress.value / 100, startAt)
  const creeping = progress.value < CREEP_TO * 100
  const target = armed.value ? (creeping ? Math.max(real, CREEP_TO) : real) : startAt
  return {
    transform: `scaleX(${target.toFixed(4)})`,
    transitionDuration: !armed.value ? '0ms' : creeping ? '3200ms' : '420ms'
  }
})

void preloadAssets()

// First-load interstitial (GameMonetize / GameDistribution / GamePix
// moderation requirement). Armed from here behind static env literals so the
// other builds dead-code-eliminate the watcher.
if (
  import.meta.env.VITE_APP_GAMEPIX === 'true'
  || import.meta.env.VITE_APP_GAME_MONETIZE === 'true'
  || import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true'
) {
  armFirstLoadInterstitial()
}

const done = ref(false)
const backdropHidden = ref(false)
const showStuckHint = ref(false)
let stuckHintId: number | null = null
const STALL_MS = 6000
let lastProgressAt = typeof performance !== 'undefined' ? performance.now() : 0
let settleFallbackId: number | null = null

// The backdrop grid pans like the static splash's. Given the static grid's
// start time, it is at the same point of the same loop, so the cross-fade
// below never shows two grids sliding against each other.
const gridEl = ref<HTMLElement | null>(null)
const continuePan = (from: Element | null, to: Element | null): void => {
  if (!from || !to || typeof from.getAnimations !== 'function') return
  const [a] = from.getAnimations()
  const [b] = to.getAnimations()
  if (a && b && a.startTime !== null) b.startTime = a.startTime
}

onMounted(() => {
  performance.mark('boot:loader-mounted')
  // First frame at the static bar's position, then start moving.
  requestAnimationFrame(() => { armed.value = true })
  const staticSplash = document.getElementById('static-splash')
  if (staticSplash) {
    continuePan(staticSplash.querySelector('.s-grid'), gridEl.value)
    staticSplash.classList.add('hidden')
    setTimeout(() => staticSplash.remove(), 500)
  }
  // Last-resort clear. Ordered AFTER the loader's own 20 s cap so it never
  // fires first on exactly the slow devices the wait protects.
  settleFallbackId = window.setTimeout(() => {
    if (!done.value) done.value = true
  }, 22000)
  // Not on Playgama: Playables grades a clean load, and a "taking long" line
  // there reads as an error state. Everywhere else it appears only when the
  // load has actually STALLED — progress frozen for STALL_MS — never on a
  // plain timer: a slow phone loading at an honest pace is not stuck, and
  // being told to disable an ad blocker mid-load reads as the game broken.
  if (import.meta.env.VITE_APP_PLAYGAMA !== 'true') {
    stuckHintId = window.setInterval(() => {
      if (!done.value && performance.now() - lastProgressAt > STALL_MS) showStuckHint.value = true
    }, 1000)
  }
})

onUnmounted(() => {
  if (settleFallbackId !== null) clearTimeout(settleFallbackId)
  if (stuckHintId !== null) clearInterval(stuckHintId)
})

watch(progress, (val) => {
  lastProgressAt = performance.now()
  showStuckHint.value = false
  if (val < 100 || done.value) return
  // Let the fill land on the last segment before the loader fades.
  setTimeout(() => { done.value = true }, 320)
}, { immediate: true })

let cgLoadSignaled = false
const signalGameReadyToCG = () => {
  if (cgLoadSignaled) return
  cgLoadSignaled = true
  try { stopLoading() } catch (e) { console.warn('[FLogoProgress] CG ready-to-play failed', e) }
}

let playgamaLoadSignaled = false
const signalGameReadyToPlaygama = () => {
  if (playgamaLoadSignaled) return
  if (import.meta.env.VITE_APP_PLAYGAMA !== 'true') return
  playgamaLoadSignaled = true
  void import('@/utils/playgamaPlugin').then(({ playgamaGameLoadingStop }) => {
    try { playgamaGameLoadingStop() } catch (e) { console.warn('[FLogoProgress] Playgama game_ready failed', e) }
  })
}

let gamepixLoadSignaled = false
const signalGameReadyToGamepix = () => {
  if (gamepixLoadSignaled) return
  if (import.meta.env.VITE_APP_GAMEPIX !== 'true') return
  gamepixLoadSignaled = true
  void import('@/utils/gamepixPlugin').then(({ gamePixGameLoadingStop }) => {
    try { gamePixGameLoadingStop() } catch (e) { console.warn('[FLogoProgress] GamePix gameLoaded failed', e) }
  })
}

let pokiLoadSignaled = false
const signalGameReadyToPoki = () => {
  if (pokiLoadSignaled) return
  if (import.meta.env.VITE_APP_POKI !== 'true') return
  pokiLoadSignaled = true
  void import('@/utils/pokiPlugin').then(({ pokiGameLoadingFinished }) => {
    try { pokiGameLoadingFinished() } catch (e) { console.warn('[FLogoProgress] Poki gameLoadingFinished failed', e) }
  })
}

let yandexLoadSignaled = false
const signalGameReadyToYandex = () => {
  if (yandexLoadSignaled) return
  if (import.meta.env.VITE_APP_YANDEX !== 'true') return
  yandexLoadSignaled = true
  void import('@/utils/yandexPlugin').then(({ yandexLoadingReady }) => {
    try { yandexLoadingReady() } catch (e) { console.warn('[FLogoProgress] Yandex LoadingAPI.ready failed', e) }
  })
}

watch(done, (isDone) => {
  if (!isDone) return
  setTimeout(() => {
    backdropHidden.value = true
    signalGameReadyToCG()
    signalGameReadyToGamepix()
    signalGameReadyToYandex()
    signalGameReadyToPoki()
    notifySplashGone()
  }, 150)
})

// PLAYGAMA fires later than the rest, on purpose: its `game_ready` is also
// YouTube Playables' `gameReady()`, which MUST NOT arrive while a
// non-interactable layer is on screen. At `done` + 150 ms the loader is still
// fading and still takes the pointer, and the backdrop has not started to go —
// so it waits for the backdrop, the last loading layer, to finish LEAVING, and
// then for the scene to take input (`whenInteractive`: the hub, or a mission
// past its scripted beam-in).
const onBackdropGone = (): void => {
  if (import.meta.env.VITE_APP_PLAYGAMA !== 'true') return
  whenInteractive(signalGameReadyToPlaygama)
}
</script>

<style scoped lang="sass">
.no-os-ui
  caret-color: transparent
  user-select: none
  -webkit-user-select: none
  -webkit-touch-callout: none
  -webkit-tap-highlight-color: transparent
  &, & *
    -webkit-user-drag: none

// The backdrop, the lockup and the bar mirror the static splash in
// index.html rule for rule (same values, same place), so the hand-over moves
// nothing. Change one, change both: tests/ui/splashLogo.test.ts compares them.
.splash-backdrop
  position: fixed
  inset: 0
  z-index: 150
  overflow: hidden
  background: radial-gradient(circle at 50% 40%, rgba(255, 167, 51, 0.16) 0%, rgba(255, 167, 51, 0) 32%), radial-gradient(circle at 50% 40%, #1d2f63 0%, #111d42 52%, #2a1b4d 100%)

.backdrop-grid
  position: absolute
  inset: -64px 0 0 -64px
  background-image: linear-gradient(rgba(120, 160, 230, 0.08) 2px, transparent 2px), linear-gradient(90deg, rgba(120, 160, 230, 0.08) 2px, transparent 2px)
  background-size: 64px 64px
  animation: grid-pan 6s linear infinite
  will-change: transform

@keyframes grid-pan
  to
    transform: translate3d(64px, 64px, 0)

// Laid out exactly like #static-splash > .s-card: a fixed layer that centres
// the column with flex. Not left/top 50% + translate(-50%): that puts the
// lockup on a half pixel through a transform, which rasterises its edges
// differently from the static copy and shows as a shimmer at the hand-over.
.loader
  position: fixed
  inset: 0
  z-index: 200
  display: flex
  align-items: center
  justify-content: center
.card
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  gap: clamp(10px, 3vmin, 20px)
  width: min(84vw, 70vh, 420px)

// ── The lockup: one inline SVG, sized by its box ──
.logo
  margin: 0
  width: 100%
  aspect-ratio: 300 / 256
  :deep(svg)
    display: block
    width: 100%
    height: 100%

// ── The plasma bar ──
// An amber fill in a graphite capsule, leaning with the wordmark. ONE fill
// element animated by transform, clipped by `.lit`; its hot top edge is the
// gloss, so the empty track stays dark and the fill reads at 12 px.
.bar
  position: relative
  width: 76%
  height: clamp(12px, 2.6vmin, 18px)
  border: 2px solid #141a33
  border-radius: 4px
  background: #161a22
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3)
  box-sizing: border-box
  transform: skewX(-12deg)
.track, .lit
  position: absolute
  inset: 1px
  border-radius: 2px
.track
  background: linear-gradient(#232936, #161a22)
.lit
  overflow: hidden
.fill
  width: 100%
  height: 100%
  background: linear-gradient(#fff0cc 0%, #ffc768 35%, #ffa733 62%, #e27a10 100%)
  transform-origin: left center
  transition-property: transform
  transition-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1)
  will-change: transform

.stuck-hint
  font-size: clamp(0.8rem, 3.2vmin, 1rem)
  color: #cfe8ff
  text-align: center

.splash-fade-leave-active, .loader-fade-leave-active
  transition: opacity 0.35s ease-out
.splash-fade-leave-to, .loader-fade-leave-to
  opacity: 0
.hint-fade-enter-active
  transition: opacity 0.4s
.hint-fade-enter-from
  opacity: 0

@media (prefers-reduced-motion: reduce)
  .backdrop-grid
    animation: none
</style>
