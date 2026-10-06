<template lang="pug">
  div.scene-root
    div.canvas-host(ref="canvasHost")
    //- The gesture surface: every touch and click on the scene lands here.
    div.input-surface(v-show="flow.screen === 'mission'" ref="surface")
    div.hud-layer
      //- Built during the drop-in, out of sight (#119): built and first
      //- painted the moment play began, it froze the game for 300-750 ms.
      MissionHud(
        v-if="flow.screen === 'mission' && (hud.phase === 'intro' || hud.phase === 'play' || hud.phase === 'dead')"
        :class="{ 'hud-off': hud.cine || (hud.phase !== 'play' && hud.phase !== 'dead') }"
        @pause="openPause"
      )
      CineBars
      CinemaSkip
      BaseHud(v-if="flow.screen === 'base' && hud.phase !== 'cinema'")
    //- After a pause or an ad the mouse is free, and a browser only captures
    //- it again on a click: the run waits under this veil for one.
    button.relock(
      v-if="relockVeil"
      type="button"
      :aria-label="t('hud.capture')"
      @pointerdown.prevent.stop="relock"
      @keydown.enter.prevent="relock"
    )
      GameIcon.relock-glyph(name="play")
    //- WASTED and LEVEL CLEARED (#150): over the HUD, under every modal.
    BigBanner(v-if="flow.screen === 'mission'")
    LoadingVeil
    PauseModal(@resume="onResume")
    DefeatModal
    RewardsModal
    component(v-if="CheatPanel && cheatPanelOpen" :is="CheatPanel" v-model="cheatPanelOpen")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { app } from '@/game/engine/app'
import { getRenderer } from '@/game/engine/renderer'
import { attachInput, isPointerLocked, releasePointerLock, requestPointerLock, unlockedRecently, type InputHandle } from '@/game/engine/input'
import { input, inputClock } from '@/game/engine/inputState'
import { loadKeyboardLayout } from '@/game/engine/keyLabels'
import { actionForCode } from '@/game/engine/keyBindings'
import { adoptBootMode } from '@/game/boot'
import CinemaSkip from '@/components/hud/CinemaSkip.vue'
import { flow } from '@/game/flow'
import { hud } from '@/game/state/hud'
import { emit as busEmit } from '@/game/bus'
import { profile } from '@/game/state/profile'
import { isGamePaused, isAdShowing, isVisibilityHidden, isPlatformPaused, acquireAppPause } from '@/use/useGamePause'
import { isAnyModalOpen } from '@/use/useModalState'
import { isGameplayLive, syncGameplayLifecycle } from '@/use/useGameplayLifecycle'
import { startGameMusic } from '@/use/useSound'
import { toggleGameMute } from '@/use/useGameMute'
import { armNavigationGuard, disarmNavigationGuard } from '@/use/useBrowserGuard'
import { CheatPanel, cheatPanelOpen, registerGameCheats } from '@/game/cheats'
import GameIcon from '@/components/icons/GameIcon.vue'
import BaseHud from '@/components/base/BaseHud.vue'
import MissionHud from '@/components/hud/MissionHud.vue'
import BigBanner from '@/components/hud/BigBanner.vue'
import CineBars from '@/components/hud/CineBars.vue'
import PauseModal from '@/components/modals/PauseModal.vue'
import LoadingVeil from '@/components/atoms/LoadingVeil.vue'
import DefeatModal from '@/components/modals/DefeatModal.vue'
import RewardsModal from '@/components/modals/RewardsModal.vue'

/**
 * The one game view. Hosts the canvas, the gesture surface and whichever UI
 * the flow is in — the mission HUD or the Command Base — plus every modal.
 * Modals acquire the pause gate (FModal → useModalState), and the loop is
 * suspended while any pause reason holds (ads, modals, platform pause, hidden
 * tab).
 */
registerGameCheats()
// The preview-video recorder's handle: dev server and `?preview=1` only. A
// dynamic import inside a DEV branch, so a production bundle never carries
// the module at all.
if (import.meta.env.DEV) void import('@/game/preview').then(m => m.installPreview())

const { t } = useI18n()
const canvasHost = ref<HTMLElement | null>(null)
const surface = ref<HTMLElement | null>(null)
let inputHandle: InputHandle | null = null
/** How long back / close stay guarded after the capture is LOST (ms). */
const LOCK_LOSS_GRACE_MS = 2500

const playLive = computed(() => flow.screen === 'mission' && hud.phase === 'play' && !flow.modal && !isGamePaused.value)

const openPause = (): void => {
  if (flow.screen === 'mission' && hud.phase === 'play' && !flow.modal) flow.modal = 'pause'
}

/** A key typed into a form field is text, not a game key. */
const typing = (e: KeyboardEvent): boolean => {
  const tag = (e.target as HTMLElement | null)?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

const onKey = (e: KeyboardEvent) => {
  // F2 is the speaker button, on every screen: muting is never a thing to
  // hunt for a cursor to do. Not under an ad — the ad's audio gate owns the
  // sound then, and a toggle underneath it would come back as a surprise when
  // the ad ends.
  if (e.code === 'F2') {
    e.preventDefault()
    if (!e.repeat && !typing(e) && !isAdShowing.value) toggleGameMute()
    return
  }
  // While the mouse is captured, Esc belongs to the browser: it releases the
  // capture, and the lost capture opens the pause menu (`onLockLost`). The
  // same Esc must not then toggle the menu shut again.
  if (e.code === 'Escape' && (isPointerLocked() || unlockedRecently())) return
  // Esc always; the pause KEY is whatever the player bound it to.
  if ((e.code === 'Escape' || actionForCode(e.code) === 'pause') && !typing(e) && !e.repeat) openPause()
  // The lessons, back on request: the help key, or F1 (#82).
  if ((e.code === 'F1' || actionForCode(e.code) === 'help') && !typing(e) && !e.repeat && hud.phase === 'play' && !isAnyModalOpen.value) {
    e.preventDefault()
    busEmit('help', {})
  }
  // The training's "show me again" (#169): its key, while the button is up.
  if (actionForCode(e.code) === 'replay' && !typing(e) && !e.repeat && hud.phase === 'play' && hud.training.replay && !isAnyModalOpen.value) busEmit('trainingReplay', {})
}

onMounted(async () => {
  if (!canvasHost.value || !surface.value) return
  app.attach(canvasHost.value)
  inputHandle = attachInput(surface.value, input, {
    // Capture the mouse only over live play: never under a modal or an ad.
    canLock: () => playLive.value,
    // Esc, alt-tab or a system dialog took the mouse back: pause, like every
    // desktop game with a captured mouse.
    onLockLost: () => openPause(),
    // Browser gestures (a rocker gesture, gesture extensions) must not take
    // the player off the page while captured; a lost capture keeps the guard
    // a moment longer, since the stroke that broke it may still end.
    onLockChange: (locked, asked) => {
      if (locked) armNavigationGuard()
      else if (playLive.value) armNavigationGuard(false)
      else disarmNavigationGuard(asked ? 0 : LOCK_LOSS_GRACE_MS)
    }
  })
  inputClock.tick = inputHandle.tick
  void loadKeyboardLayout()
  app.setSuspended(isGamePaused.value)
  app.setWanted(true)
  // Music intent from the first frame; the context itself unlocks on the
  // first gesture (autoplay policy), and the gates keep it silent under ads.
  startGameMusic()
  window.addEventListener('keydown', onKey)
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__game = { app, flow, hud, input, profile, render: () => getRenderer().info.render }
  }
  // The loader's prepared first scene. The scene never builds its own copy
  // while the loader is still priming (see `adoptBootMode`).
  app.setMode(await adoptBootMode())
})

watch(isGamePaused, (p) => app.setSuspended(p))

// The mouse is handed back whenever play stops for something else: a modal,
// an ad, the base.
watch(() => [isGamePaused.value, flow.screen] as const, ([paused, screen]) => {
  if (paused || screen !== 'mission') releasePointerLock()
})

// Live play without a capture (refused or lost, a portal iframe without
// `allow-pointer-lock`) still blocks on the right button, so a rocker gesture
// can still go back: keep the history entry, without the close prompt.
watch(playLive, (v) => {
  if (v) {
    if (!isPointerLocked()) armNavigationGuard(false)
  } else if (!isPointerLocked()) disarmNavigationGuard()
})

// ── Getting the mouse back ──
// A browser only captures the mouse on a user gesture in OUR document. The
// Resume button is one (its click captures at once); Esc is not, and an ad's
// close button is in the SDK's frame. So a mouse player who comes back to
// live play after an ad meets a veil, with the simulation held under it,
// until they click — never a mech walking with a camera that cannot turn.
const relockVeil = ref(false)
let relockRelease: (() => void) | null = null
const onResume = (): void => {
  if (input.device === 'mouse' && !input.lockRefused) requestPointerLock(input)
}
const relockOwed = ref(false)
watch(isAdShowing, (v, prev) => {
  if (!v && prev && flow.screen === 'mission') relockOwed.value = true
})
watch(() => [relockOwed.value, hud.phase, flow.modal, isAdShowing.value] as const, ([owed, ph, modal, ad]) => {
  if (!owed || ph !== 'play' || modal || ad) return
  relockOwed.value = false
  if (input.device !== 'mouse' || input.lockRefused || isPointerLocked()) return
  relockVeil.value = true
  relockRelease = acquireAppPause()
})
const relock = (): void => {
  relockVeil.value = false
  relockRelease?.()
  relockRelease = null
  requestPointerLock(input)
}
watch(() => flow.screen, (sc) => {
  if (sc === 'mission') return
  relockOwed.value = false
  if (relockVeil.value) relock()
})

// ── Cutscenes (#175) ──
// A story scene, a mission's drop-in and its way out hand the mouse back, so
// the Skip button can be clicked; when play comes back the capture is asked
// for again. A key or a click that skipped is a gesture and captures at once;
// a scene that played to its end has none, and the veil asks for one click.
const inCutscene = computed(() => hud.phase === 'cinema' || hud.phase === 'intro' || hud.phase === 'outro')
let lockedBeforeCut = false
watch(inCutscene, (cut, was) => {
  if (cut && !was) {
    lockedBeforeCut = isPointerLocked()
    if (lockedBeforeCut) releasePointerLock()
    return
  }
  if (!cut && was) {
    const owed = lockedBeforeCut
    lockedBeforeCut = false
    if (!owed || hud.phase !== 'play' || flow.screen !== 'mission') return
    if (input.device !== 'mouse' || input.lockRefused) return
    requestPointerLock(input)
    // No gesture to capture on: once the request has had its chance, the veil.
    window.setTimeout(() => { if (!isPointerLocked() && hud.phase === 'play' && !flow.modal) relockOwed.value = true }, 250)
  }
})

// The portals' gameplay bracket (CrazyGames / Poki / Playgama). The rule is in
// `isGameplayLive`; the Poki arm defers a start inside its 50 ms bad-event
// window, so a modal closing in the same breath as an ad opening is safe.
const live = computed(() => isGameplayLive({
  screen: flow.screen,
  phase: hud.phase,
  flowModal: flow.modal !== '',
  anyModalOpen: isAnyModalOpen.value,
  adShowing: isAdShowing.value,
  visibilityHidden: isVisibilityHidden.value,
  platformPaused: isPlatformPaused.value
}))
watch(live, (v) => syncGameplayLifecycle(v), { immediate: true })

onUnmounted(() => {
  syncGameplayLifecycle(false)
  inputHandle?.detach()
  inputClock.tick = () => {}
  disarmNavigationGuard()
  window.removeEventListener('keydown', onKey)
  app.setWanted(false)
  app.detach()
})
</script>

<style scoped lang="sass">
// Out of sight but laid out and painted, so showing it costs nothing (#119):
// at opacity 0 the browser skips the paint, so it is a hair above it.
.hud-off
  opacity: 0.002 !important
  pointer-events: none !important
  & :deep(*)
    pointer-events: none !important
.scene-root
  position: fixed
  inset: 0
  overflow: hidden
  background: #150c2b
.canvas-host
  position: absolute
  inset: 0
  :deep(canvas)
    display: block
    width: 100%
    height: 100%
    touch-action: none
.input-surface
  position: absolute
  inset: 0
  touch-action: none
  -webkit-user-select: none
  user-select: none
// The HUD lets every press through to the scene; each control takes its own
// pointers back (`pointer-events: auto` in the control).
.hud-layer
  position: absolute
  inset: 0
  pointer-events: none
.relock
  position: absolute
  inset: 0
  z-index: 40
  display: grid
  place-items: center
  border: 0
  background: rgba(10, 5, 24, 0.5)
  color: var(--cm-text)
  cursor: pointer
.relock .relock-glyph
  width: clamp(3.5rem, 16vmin, 6rem)
  height: clamp(3.5rem, 16vmin, 6rem)
  filter: drop-shadow(0 0 0.6rem rgba(255, 79, 182, 0.8))
</style>
