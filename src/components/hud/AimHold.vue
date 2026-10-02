<template lang="pug">
  //- The ring under the right thumb: it fills while the press is held still,
  //- and when it closes the weapon is up. Drawn where the finger is, so the
  //- player sees their own hold become the aim.
  div.aim-hold(ref="ring" aria-hidden="true")
    svg(viewBox="0 0 40 40")
      circle.track(cx="20" cy="20" r="17")
      circle.fill(ref="arc" cx="20" cy="20" r="17")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { addHudTicker } from '@/game/state/hud'
import { input } from '@/game/engine/inputState'

/**
 * Written straight to the DOM by a HUD ticker: it changes every frame while a
 * finger is down, and never touches Vue's reactivity.
 */
const ring = ref<HTMLElement | null>(null)
const arc = ref<SVGCircleElement | null>(null)
const LEN = 2 * Math.PI * 17
let off: (() => void) | null = null
let shown = false

onMounted(() => {
  off = addHudTicker(() => {
    const el = ring.value
    const a = arc.value
    if (!el || !a) return
    // Up to the moment the weapon is raised; after that the reticle takes over.
    const show = input.device === 'touch' && input.hold01 > 0.08 && !input.aimHeld
    if (show !== shown) {
      shown = show
      el.style.opacity = show ? '1' : '0'
    }
    if (!show) return
    el.style.transform = `translate(${input.holdX}px, ${input.holdY}px)`
    a.style.strokeDashoffset = String(LEN * (1 - input.hold01))
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.aim-hold
  position: absolute
  left: 0
  top: 0
  // Wider than a thumb, so the ring shows round the finger that hides its
  // centre.
  width: clamp(4.5rem, 22vmin, 7rem)
  height: clamp(4.5rem, 22vmin, 7rem)
  margin: calc(clamp(4.5rem, 22vmin, 7rem) / -2) 0 0 calc(clamp(4.5rem, 22vmin, 7rem) / -2)
  opacity: 0
  pointer-events: none
  will-change: transform
  svg
    display: block
    width: 100%
    height: 100%
    rotate: -90deg
  circle
    fill: none
    stroke-width: 2.5
  .track
    stroke: rgba(246, 241, 255, 0.25)
  .fill
    stroke: var(--cm-pink)
    stroke-linecap: round
    stroke-dasharray: 106.9
    stroke-dashoffset: 106.9
</style>
