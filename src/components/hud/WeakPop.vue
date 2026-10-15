<template lang="pug">
  //- The rocket room's mech shot with the rifle: "too weak" wobbles where the
  //- round struck, for WEAK_POP_S. Pinned by a HUD ticker.
  div.weak-layer
    div.weak(ref="el")
      span(v-if="seq" :key="seq") {{ t('training.tooWeak') }}
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { addHudTicker, weakPop } from '@/game/state/hud'

const { t } = useI18n()
const el = ref<HTMLElement | null>(null)
const seq = ref(0)
let off: (() => void) | null = null

onMounted(() => {
  let shown = false
  off = addHudTicker(() => {
    const e = el.value
    if (!e) return
    if (weakPop.seq !== seq.value) seq.value = weakPop.seq
    if (weakPop.on !== shown) {
      shown = weakPop.on
      e.style.opacity = shown ? '1' : '0'
    }
    if (!shown) return
    e.style.left = `${(weakPop.x * 100).toFixed(2)}%`
    e.style.top = `${(weakPop.y * 100).toFixed(2)}%`
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.weak-layer
  position: absolute
  inset: 0
  pointer-events: none
  overflow: hidden
.weak
  position: absolute
  opacity: 0
  translate: -50% -130%
  transition: opacity 140ms ease-out
  max-width: min(15rem, 44vw)
  color: #ffd25f
  font-family: var(--font-display, inherit)
  font-size: var(--cm-fs-m, 1rem)
  line-height: 1.1
  text-align: center
  text-shadow: 0 0.12em 0 #2a1640, 0 0 0.6em rgba(255, 120, 60, 0.7)
  span
    display: inline-block
    // Two seconds of wobble, as long as the label stays (WEAK_POP_S).
    animation: weak-wobble 2s ease-out forwards
@keyframes weak-wobble
  0%
    transform: translateY(0.5rem) rotate(0)
    opacity: 0
  10%
    transform: translateY(-0.15rem) rotate(-7deg)
    opacity: 1
  20%
    transform: translateY(0) rotate(6deg)
  32%
    transform: rotate(-5deg)
  44%
    transform: rotate(4deg)
  56%
    transform: rotate(-3deg)
  68%
    transform: rotate(2deg)
  80%
    transform: rotate(-1deg)
  100%
    transform: rotate(0)
</style>
