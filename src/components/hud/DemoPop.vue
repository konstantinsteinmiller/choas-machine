<template lang="pug">
  //- The training hologram's button press (#114): its key (on a keyboard),
  //- the mouse button, or the button's picture (on touch) pops up over the
  //- hologram's head, rises and fades. Pinned by a HUD ticker.
  div.demo-pop(ref="el" aria-hidden="true")
    div.chip(v-if="hint && hud.device === 'mouse'" :key="seq")
      HintGlyph(:hint="hint" device="mouse" :weapon="hud.weapon")
    //- On touch (#160): a copy of the very button pressed, its shape and its
    //- colour; a gesture (the stick, a swipe, a hold) as the finger doing it.
    div.touch(v-else-if="hint" :key="seq")
      HintGlyph(:hint="hint" device="touch" :weapon="hud.weapon")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import HintGlyph from '@/components/hud/hints/HintGlyph.vue'
import type { HintId } from '@/game/sim/coach'
import { addHudTicker, demoPop, hud } from '@/game/state/hud'

const el = ref<HTMLElement | null>(null)
const hint = ref<HintId | ''>('')
const seq = ref(0)
let off: (() => void) | null = null

onMounted(() => {
  let shown = false
  off = addHudTicker(() => {
    const e = el.value
    if (!e) return
    if (demoPop.on !== shown) {
      shown = demoPop.on
      e.style.opacity = shown ? '1' : '0'
    }
    if (demoPop.seq !== seq.value) { seq.value = demoPop.seq; hint.value = demoPop.hint as HintId }
    if (!shown) return
    // Kept on screen (#192): on a short landscape phone the hologram's head
    // projects near the top edge, and the pop (which hangs above that point)
    // rose off the screen — touch players never saw a press.
    e.style.left = `clamp(2.5rem, ${(demoPop.x * 100).toFixed(2)}%, calc(100% - 2.5rem))`
    e.style.top = `clamp(calc(var(--cm-safe-top, 0px) + 4.5rem), ${(demoPop.y * 100).toFixed(2)}%, 100%)`
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.demo-pop
  position: absolute
  translate: -50% -100%
  opacity: 0
  transition: opacity 120ms ease-out
  pointer-events: none
.chip
  display: flex
  align-items: center
  justify-content: center
  min-width: 2.2rem
  min-height: 2.2rem
  padding: 0.25rem
  color: var(--cm-cyan, #5fe9ff)
  // As long as the hologram holds its press (`HINT_HOLD_S`).
  animation: demo-pop 2.6s ease-out forwards
  +tech-plate(var(--cm-cyan), linear-gradient(180deg, rgba(43, 27, 92, 0.75), rgba(10, 5, 24, 0.65)), 0.45rem, var(--cm-edge))
// On touch the copy of the button is the chip itself, rising and fading the same way.
.touch
  animation: demo-pop 2.6s ease-out forwards
.icon
  width: 1.5rem
  height: 1.5rem
// A short rise that stays by the head: drifting far up it was easy to miss.
@keyframes demo-pop
  0%
    transform: translateY(0.3rem)
    opacity: 0
  8%
    opacity: 1
  80%
    opacity: 1
  100%
    transform: translateY(-0.9rem)
    opacity: 0
</style>
