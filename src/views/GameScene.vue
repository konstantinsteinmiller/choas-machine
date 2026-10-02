<template lang="pug">
  div.scene-root
    div.canvas-host(ref="canvasHost")
    div.hud-layer
      SystemCorner(v-if="flow.screen === 'base'")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { app } from '@/game/engine/app'
import { adoptBootMode } from '@/game/boot'
import { flow } from '@/game/flow'
import { hud } from '@/game/state/hud'
import { isGamePaused, isAdShowing, isVisibilityHidden, isPlatformPaused } from '@/use/useGamePause'
import { isAnyModalOpen } from '@/use/useModalState'
import { isGameplayLive, syncGameplayLifecycle } from '@/use/useGameplayLifecycle'
import { startGameMusic } from '@/use/useSound'
import { toggleGameMute } from '@/use/useGameMute'
import { registerGameCheats } from '@/game/cheats'
import SystemCorner from '@/components/hud/SystemCorner.vue'

/**
 * The one game view. Hosts the canvas and whichever UI the flow is in — the
 * mission HUD or the Command Base — plus every modal. Modals acquire the pause
 * gate (FModal → useModalState), and the loop is suspended while any pause
 * reason holds (ads, modals, platform pause, hidden tab).
 */
registerGameCheats()

const canvasHost = ref<HTMLElement | null>(null)

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
  }
}

onMounted(async () => {
  if (!canvasHost.value) return
  app.attach(canvasHost.value)
  app.setSuspended(isGamePaused.value)
  app.setWanted(true)
  // Music intent from the first frame; the context itself unlocks on the
  // first gesture (autoplay policy), and the gates keep it silent under ads.
  startGameMusic()
  window.addEventListener('keydown', onKey)
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__game = { app, flow, hud }
  }
  // The loader's prepared first scene. The scene never builds its own copy
  // while the loader is still priming (see `adoptBootMode`).
  app.setMode(await adoptBootMode())
})

watch(isGamePaused, (p) => app.setSuspended(p))

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
  window.removeEventListener('keydown', onKey)
  app.setWanted(false)
  app.detach()
})
</script>

<style scoped lang="sass">
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
// The HUD lets every press through to the canvas; each control takes its own
// pointers back (`pointer-events: auto` in the control).
.hud-layer
  position: absolute
  inset: 0
  pointer-events: none
</style>
