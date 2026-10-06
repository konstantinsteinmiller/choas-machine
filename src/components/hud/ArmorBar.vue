<template lang="pug">
  //- The mech's health (#145): the unit frame's top row. A machined track
  //- ruled in tenths (the half a longer mark), the fill, and a pale trail that
  //- shows what the last hits took before it drains away.
  div.armor-bar(
    role="meter"
    :aria-label="t('hud.armor')"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="now"
    :class="{ low: hud.armorLow }"
    data-testid="armor"
  )
    GameIcon.glyph(name="chassis")
    div.track
      div.lit
        div.trail(ref="trail")
        div.fill(ref="fill")
      div.ticks(aria-hidden="true")
        span.tick(v-for="n in 9" :key="n" :class="{ half: n === 5 }" :style="{ left: n * 10 + '%' }")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { addHudTicker, hud, vital } from '@/game/state/hud'

const { t } = useI18n()
const fill = ref<HTMLElement | null>(null)
const trail = ref<HTMLElement | null>(null)
/** For the screen reader only: the bar itself is written by the ticker. */
const now = ref(100)
let off: (() => void) | null = null

/** The trail holds this long after a hit, then drains at this much a second. */
const TRAIL_HOLD_S = 0.45
const TRAIL_DRAIN = 0.9

onMounted(() => {
  let last = -1
  let trailV = 1
  let lastTrail = -1
  let hold = 0
  off = addHudTicker((dt) => {
    const el = fill.value
    if (!el) return
    const v = Math.round(vital.armor * 200) / 200
    if (v !== last) {
      if (v < last) hold = TRAIL_HOLD_S
      last = v
      el.style.transform = `scaleX(${v})`
      if (Math.abs(v * 100 - now.value) >= 5 || v === 0 || v === 1) now.value = Math.round(v * 100)
    }
    // The trail: up at once with a repair, down slowly after a hit.
    if (v >= trailV) trailV = v
    else if (hold > 0) hold -= dt
    else trailV = Math.max(v, trailV - TRAIL_DRAIN * dt)
    const tv = Math.round(trailV * 200) / 200
    if (tv !== lastTrail && trail.value) {
      lastTrail = tv
      trail.value.style.transform = `scaleX(${tv})`
    }
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.armor-bar
  display: flex
  align-items: center
  gap: clamp(0.3rem, 1.2vmin, 0.5rem)
  color: var(--cm-ok, #5dff9a)
  &.low
    color: var(--cm-danger)
    animation: armor-low 0.5s ease-in-out infinite alternate
.glyph
  flex: none
  width: clamp(1.05rem, 4.4vmin, 1.55rem)
  height: clamp(1.05rem, 4.4vmin, 1.55rem)
  filter: drop-shadow(0 0 0.25rem currentColor)
// The track: cut corners with their edge, a dark well, end caps.
.track
  position: relative
  flex: 1
  min-width: clamp(6rem, 26vmin, 11rem)
  height: clamp(0.8rem, 3vmin, 1.15rem)
  +tech-track(color-mix(in srgb, currentColor 70%, #fff), 0.4rem, var(--cm-edge))
.lit
  position: absolute
  inset: 0
  overflow: hidden
  +tech-track-fill(0.4rem, var(--cm-edge))
.fill, .trail
  position: absolute
  inset: 0
  transform-origin: left center
.fill
  // A lit band through the middle, darker at the foot: a tube of light.
  background: linear-gradient(180deg, color-mix(in srgb, currentColor 55%, #fff) 0%, currentColor 38%, color-mix(in srgb, currentColor 70%, #0a0420) 100%)
  box-shadow: 0 0 0.5rem currentColor
  transition: transform 90ms ease-out
.trail
  background: linear-gradient(180deg, rgba(255, 236, 214, 0.55), rgba(255, 196, 160, 0.3))
.low .fill
  background: linear-gradient(180deg, #ff9db0 0%, var(--cm-danger) 40%, #8a1030 100%)
// Tenths, over the fill: the half reaches across, the others a third in from each edge.
.ticks
  position: absolute
  inset: 0
  pointer-events: none
.tick
  position: absolute
  top: 22%
  bottom: 22%
  width: 1px
  translate: -50% 0
  background: rgba(10, 4, 32, 0.75)
  box-shadow: 1px 0 0 rgba(255, 255, 255, 0.18)
  &.half
    top: 0
    bottom: 0
    width: 2px

@keyframes armor-low
  to
    filter: brightness(1.45)

@media (prefers-reduced-motion: reduce)
  .armor-bar.low
    animation: none
  .fill
    transition: none
</style>
