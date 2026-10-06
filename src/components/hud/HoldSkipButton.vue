<template lang="pug">
  //- A cutscene's skip (#175): a button to click (the mouse is free during a
  //- cutscene), and Space held for SKIP_HOLD_S, the ring round its key filling
  //- as it is held, as in Red Dead Redemption 2. Letting go empties it.
  button.hold-skip(
    type="button"
    :aria-label="t('ui.skip')"
    :data-testid="testid"
    @click="emit('skip')"
  )
    GameIcon(name="skip-forward")
    span.label {{ t('ui.skip') }}
    //- The key, in a circle that fills while it is held.
    span.keyring(v-if="keys" :style="ringStyle" aria-hidden="true")
      KeyCap.key(code="Space")
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import { holdProgress, newHold, pressHold, releaseHold, stepHold } from '@/game/story/holdSkip'
import { SKIP_HOLD_S } from '@/game/story/cinemaIds'

const props = withDefaults(defineProps<{ active: boolean; keys?: boolean; testid?: string }>(), { keys: true, testid: 'btn-skip' })
const emit = defineEmits<{ (e: 'skip'): void }>()
const { t } = useI18n()

const hold = newHold()
const fill = ref(0)
const ringStyle = computed(() => ({ '--fill': Math.round(fill.value * 360) + 'deg' }))
let raf = 0
let last = 0

// Space is the skip's alone while a cutscene plays: held, it skips; it is
// never also a press the game sees (a jump, an instant skip).
const down = (e: KeyboardEvent): void => {
  if (e.code !== 'Space') return
  e.preventDefault()
  e.stopImmediatePropagation()
  pressHold(hold)
}
const up = (e: KeyboardEvent): void => {
  if (e.code !== 'Space') return
  e.stopImmediatePropagation()
  releaseHold(hold)
}
const blur = (): void => releaseHold(hold)
const tick = (now: number): void => {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (stepHold(hold, dt, SKIP_HOLD_S)) emit('skip')
  fill.value = holdProgress(hold, SKIP_HOLD_S)
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
watch(() => props.active, (on) => { if (on) start(); else stop() }, { immediate: true })
onUnmounted(stop)
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.hold-skip
  position: relative
  display: flex
  align-items: center
  gap: 0.45em
  min-height: 2.75rem
  padding: 0.35em 0.6em 0.35em 0.6em
  color: #fff
  font: inherit
  font-size: var(--cm-fs-s, 0.9rem)
  cursor: pointer
  pointer-events: auto
  +tech-plate(var(--cm-cyan), tech-fill(var(--cm-cyan), 12%), 0.45rem)
  :deep(svg)
    width: 1.2em
    height: 1.2em
.keyring
  position: relative
  display: grid
  place-items: center
  width: 2.6rem
  height: 2.6rem
  pointer-events: none
  // The ring round the key: a dim track, and the held share of it bright.
  &::before
    content: ''
    position: absolute
    inset: 0
    border-radius: 50%
    background: conic-gradient(var(--cm-cyan-hi, #a8f5ff) var(--fill), rgba(246, 241, 255, 0.22) 0)
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))
    mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))
.label
  text-transform: uppercase
  letter-spacing: 0.04em
.key
  min-width: 1.7rem
  height: 1.7rem
</style>
