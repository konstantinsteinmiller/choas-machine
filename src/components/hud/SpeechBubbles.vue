<template lang="pug">
  //- What a defender shouts the moment it is sure (#62): a bubble over its
  //- head, pinned there by a HUD ticker as the camera moves.
  div.speech-layer(aria-live="polite")
    div.bubble(
      v-for="n in MAX_CALLOUTS"
      :key="n"
      :ref="(el) => keep(n - 1, el)"
      :class="{ machine: lines[n - 1] === 1 }"
    )
      span {{ lines[n - 1] === 1 ? t('callout.machine') : t('callout.human') }}
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { addHudTicker, callouts, MAX_CALLOUTS } from '@/game/state/hud'

const { t } = useI18n()
const bubbles: Array<HTMLElement | null> = []
/** Which line each slot says (0 a person, 1 a machine); only this is reactive. */
const lines = ref<number[]>(Array.from({ length: MAX_CALLOUTS }, () => 0))
const shown: boolean[] = []
const keep = (i: number, el: unknown): void => { bubbles[i] = (el as HTMLElement | null) ?? null }
let off: (() => void) | null = null

onMounted(() => {
  off = addHudTicker(() => {
    for (let i = 0; i < MAX_CALLOUTS; i++) {
      const el = bubbles[i]
      if (!el) continue
      const on = i < callouts.n && callouts.on[i] === 1
      if (on !== shown[i]) {
        shown[i] = on
        el.style.opacity = on ? '1' : '0'
      }
      if (!on) continue
      if (lines.value[i] !== callouts.line[i]) lines.value[i] = callouts.line[i]!
      el.style.left = `${(callouts.x[i]! * 100).toFixed(2)}%`
      el.style.top = `${(callouts.y[i]! * 100).toFixed(2)}%`
    }
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.speech-layer
  position: absolute
  inset: 0
  pointer-events: none
  overflow: hidden
.bubble
  position: absolute
  opacity: 0
  translate: -50% -100%
  transition: opacity 140ms ease-out
  max-width: min(14rem, 40vw)
  padding: 0.3em 0.7em
  border-radius: 0.15em
  background: #fff6e0
  color: #2a1640
  font-family: var(--font-display, inherit)
  font-size: var(--cm-fs-s)
  line-height: 1.15
  text-align: center
  box-shadow: 0 0.15em 0 rgba(21, 12, 43, 0.6)
  &::after
    content: ''
    position: absolute
    left: 50%
    bottom: -0.45em
    translate: -50% 0
    border: 0.5em solid transparent
    border-top-color: #fff6e0
    border-bottom: 0
  &.machine
    background: #ffd6de
    color: #5a0b1f
    font-family: ui-monospace, monospace
    &::after
      border-top-color: #ffd6de
</style>
