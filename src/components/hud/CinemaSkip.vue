<template lang="pug">
  //- A story scene is playing (#100): a skip button you can see, and Space
  //- held for half a second does the same (the ring fills while it is held).
  div.cinema-skip(v-if="hud.phase === 'cinema'")
    button.skip(
      type="button"
      :aria-label="t('ui.skip')"
      data-testid="btn-cinema-skip"
      @click="skipCinema"
    )
      span.ring(:style="ringStyle")
      GameIcon(name="skip-forward")
      span.label {{ t('ui.skip') }}
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { hud } from '@/game/state/hud'
import { skipCinema } from '@/game/flow'
import { holdProgress, newHold, pressHold, releaseHold, stepHold } from '@/game/story/holdSkip'
import { CINEMA_HOLD_S } from '@/game/story/cinemaIds'

const { t } = useI18n()
const hold = newHold()
const fill = ref(0)
const ringStyle = computed(() => ({ '--fill': Math.round(fill.value * 360) + 'deg' }))
let raf = 0
let last = 0

const down = (e: KeyboardEvent): void => {
  if (e.code !== 'Space') return
  e.preventDefault()
  pressHold(hold)
}
const up = (e: KeyboardEvent): void => { if (e.code === 'Space') releaseHold(hold) }
const blur = (): void => releaseHold(hold)
const tick = (now: number): void => {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (stepHold(hold, dt, CINEMA_HOLD_S)) skipCinema()
  fill.value = holdProgress(hold, CINEMA_HOLD_S)
  raf = requestAnimationFrame(tick)
}
const start = (): void => {
  window.addEventListener('keydown', down, true)
  window.addEventListener('keyup', up, true)
  window.addEventListener('blur', blur)
  last = performance.now()
  raf = requestAnimationFrame(tick)
}
const stop = (): void => {
  window.removeEventListener('keydown', down, true)
  window.removeEventListener('keyup', up, true)
  window.removeEventListener('blur', blur)
  cancelAnimationFrame(raf)
  releaseHold(hold)
  fill.value = 0
}
watch(() => hud.phase === 'cinema', (on) => { if (on) start(); else stop() }, { immediate: true })
onUnmounted(stop)
</script>

<style scoped lang="sass">
.cinema-skip
  position: absolute
  right: max(1rem, env(safe-area-inset-right))
  bottom: calc(clamp(1.6rem, 9vmin, 4.5rem) + 0.75rem)
  pointer-events: auto
.skip
  position: relative
  display: flex
  align-items: center
  gap: 0.4em
  min-height: 2.75rem
  padding: 0.35em 0.9em 0.35em 0.6em
  border: var(--cm-edge, 2px) solid var(--cm-cyan, #5fe9ff)
  border-radius: 999px
  background: rgba(10, 5, 24, 0.7)
  color: #fff
  font: inherit
  font-size: var(--cm-fs-s, 0.9rem)
  cursor: pointer
  :deep(svg)
    width: 1.2em
    height: 1.2em
.ring
  position: absolute
  inset: -4px
  border-radius: 999px
  background: conic-gradient(var(--cm-cyan, #5fe9ff) var(--fill), transparent 0)
  mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))
  pointer-events: none
.label
  text-transform: uppercase
  letter-spacing: 0.04em
</style>
