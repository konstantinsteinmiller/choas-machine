<template lang="pug">
  //- A machine telling the base (#73): a red ring fills over it with an
  //- antenna glyph. Break its line of sight, blind it or shoot it before the
  //- ring closes, or the alarm sounds. Pinned by a HUD ticker.
  div.uplink-layer(aria-hidden="true")
    div.uplink(v-for="n in MAX_UPLINKS" :key="n" :ref="(e) => keep(n - 1, e)")
      svg(viewBox="0 0 40 40")
        circle.track(cx="20" cy="20" r="16")
        circle.fill(cx="20" cy="20" r="16" pathLength="1")
      GameIcon.glyph(name="siren")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { addHudTicker, uplinks, MAX_UPLINKS } from '@/game/state/hud'

const els: Array<HTMLElement | null> = []
const arcs: Array<SVGCircleElement | null> = []
const keep = (i: number, e: unknown): void => {
  const el = (e as HTMLElement | null) ?? null
  els[i] = el
  arcs[i] = el ? (el.querySelector('.fill') as SVGCircleElement | null) : null
}
let off: (() => void) | null = null

onMounted(() => {
  const shown: boolean[] = []
  off = addHudTicker(() => {
    for (let i = 0; i < MAX_UPLINKS; i++) {
      const el = els[i]
      if (!el) continue
      const on = i < uplinks.n && uplinks.on[i] === 1
      if (on !== shown[i]) {
        shown[i] = on
        el.style.opacity = on ? '1' : '0'
      }
      if (!on) continue
      el.style.left = `${(uplinks.x[i]! * 100).toFixed(2)}%`
      el.style.top = `${(uplinks.y[i]! * 100).toFixed(2)}%`
      const arc = arcs[i]
      if (arc) arc.style.strokeDashoffset = String(1 - uplinks.frac[i]!)
    }
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.uplink-layer
  position: absolute
  inset: 0
  pointer-events: none
  overflow: hidden
.uplink
  position: absolute
  width: clamp(2.6rem, 9vmin, 3.6rem)
  height: clamp(2.6rem, 9vmin, 3.6rem)
  translate: -50% -50%
  opacity: 0
  transition: opacity 120ms ease-out
  color: var(--cm-danger)
  svg
    position: absolute
    inset: 0
    rotate: -90deg
    overflow: visible
  circle
    fill: rgba(21, 12, 43, 0.6)
    stroke: currentColor
    stroke-width: 3.6
  .track
    opacity: 0.3
  .fill
    fill: none
    stroke-dasharray: 1
    stroke-dashoffset: 1
    stroke-linecap: round
    filter: drop-shadow(0 0 0.3rem currentColor)
.glyph
  position: absolute
  inset: 26%
  width: 48%
  height: 48%
  animation: uplink-blink 0.5s steps(2) infinite

@keyframes uplink-blink
  50%
    opacity: 0.35

@media (prefers-reduced-motion: reduce)
  .glyph
    animation: none
</style>
