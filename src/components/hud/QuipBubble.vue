<template lang="pug">
  //- CM-07's one-liner (#126): a bubble over the mech's head, pinned there by
  //- a HUD ticker. Whispered (unseen) it is small, faint and dashed; out loud
  //- (spotted) it is a showman's bubble.
  div.quip-layer(aria-live="polite")
    div.bubble(ref="el" :class="{ whisper }")
      span(v-if="id" :key="seq") {{ t('quip.' + id) }}
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { addHudTicker, quipPop } from '@/game/state/hud'

const { t } = useI18n()
const el = ref<HTMLElement | null>(null)
const id = ref('')
const whisper = ref(false)
const seq = ref(0)
let off: (() => void) | null = null

onMounted(() => {
  let shown = false
  off = addHudTicker(() => {
    const e = el.value
    if (!e) return
    if (quipPop.seq !== seq.value) {
      seq.value = quipPop.seq
      id.value = quipPop.id
      whisper.value = quipPop.whisper
    }
    if (quipPop.on !== shown) {
      shown = quipPop.on
      e.style.opacity = shown ? '1' : '0'
    }
    if (!shown) return
    e.style.left = `${(quipPop.x * 100).toFixed(2)}%`
    e.style.top = `${(quipPop.y * 100).toFixed(2)}%`
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.quip-layer
  position: absolute
  inset: 0
  pointer-events: none
  overflow: hidden
.bubble
  position: absolute
  opacity: 0
  translate: -50% -100%
  transition: opacity 160ms ease-out
  max-width: min(16rem, 46vw)
  padding: 0.35em 0.8em
  border: var(--cm-edge, 2px) solid var(--cm-cyan, #5fe9ff)
  border-radius: 0.9em
  background: #fff6e0
  color: #2a1640
  font-family: var(--font-display, inherit)
  font-size: var(--cm-fs-m, 1rem)
  line-height: 1.15
  text-align: center
  box-shadow: 0 0.18em 0 rgba(21, 12, 43, 0.6), 0 0 0.8em rgba(95, 233, 255, 0.45)
  span
    display: inline-block
    animation: quip-pop 260ms cubic-bezier(.2, 1.6, .4, 1)
  &::after
    content: ''
    position: absolute
    left: 50%
    bottom: -0.5em
    translate: -50% 0
    border: 0.5em solid transparent
    border-top-color: var(--cm-cyan, #5fe9ff)
    border-bottom: 0
  // Whispered: small, faint, dashed, the words leaning in.
  &.whisper
    font-size: var(--cm-fs-s, 0.85rem)
    font-style: italic
    background: rgba(21, 12, 43, 0.72)
    color: #d9ccff
    border-style: dashed
    border-color: rgba(217, 204, 255, 0.7)
    box-shadow: none
    &::after
      border-top-color: rgba(217, 204, 255, 0.7)
// It pops up from just below where it settles (no scale: a scaled box keeps its old footprint).
@keyframes quip-pop
  0%
    transform: translateY(0.5em)
    opacity: 0.3
  100%
    transform: none
    opacity: 1
</style>
