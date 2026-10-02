<template lang="pug">
  //- A hit on the mech: the edges of the screen flush red, and a wedge points
  //- at where it came from.
  div.hit-flash(aria-hidden="true")
    div.vignette(ref="vignette")
    div.from(ref="from")
      svg(viewBox="0 0 100 100")
        path(d="M 30.6 15.2 A 40 40 0 0 1 69.4 15.2 L 62 25 A 28 28 0 0 0 38 25 Z")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { addHudTicker, vital } from '@/game/state/hud'

/** Written by a HUD ticker: it fades every frame for half a second. */
const vignette = ref<HTMLElement | null>(null)
const from = ref<HTMLElement | null>(null)
const HOLD_S = 0.7
let off: (() => void) | null = null
let shown = false

onMounted(() => {
  off = addHudTicker(() => {
    const v = vignette.value
    const f = from.value
    if (!v || !f) return
    const k = Math.max(0, 1 - vital.hitAge / HOLD_S)
    // Low armor keeps a faint red at the edges, hit or no hit.
    const low = vital.armor < 0.3 ? 0.35 * (1 - vital.armor / 0.3) : 0
    const on = k > 0 || low > 0
    if (!on && !shown) return
    shown = on
    v.style.opacity = String(Math.max(k * 0.8, low))
    f.style.opacity = String(k)
    if (k > 0) f.style.rotate = `${-vital.hitAngle}rad`
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.hit-flash
  position: absolute
  inset: 0
  pointer-events: none
  overflow: hidden
.vignette
  position: absolute
  inset: 0
  opacity: 0
  background: radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(255, 59, 92, 0.6) 100%)
.from
  position: absolute
  left: 50%
  top: 50%
  width: clamp(11rem, 62vmin, 25rem)
  height: clamp(11rem, 62vmin, 25rem)
  translate: -50% -50%
  opacity: 0
  svg
    display: block
    width: 100%
    height: 100%
  path
    fill: rgba(255, 59, 92, 0.85)
    filter: drop-shadow(0 0 0.4rem rgba(255, 59, 92, 0.9))
</style>
