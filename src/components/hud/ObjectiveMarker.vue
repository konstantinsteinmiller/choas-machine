<template lang="pug">
  //- Where to go: a marker over the mission's objective (the nearest pile of
  //- salvage, then the extraction pad). On screen it sits on the thing itself; off screen
  //- it slides to the edge and points. In the training a `target` marks a
  //- guard the lesson is about.
  div.objective(ref="el" :class="[target ? 'target' : hud.objective, { teach }]" role="img" :aria-label="label")
    //- The lesson: rings go out from it until the first pile is reached.
    div.beacon(v-if="teach")
      span(v-for="i in 2" :key="i" :style="{ '--i': i }")
    div.pin
      GameIcon(:name="target ? 'skull' : hud.objective === 'extract' ? 'up' : 'scrap'")
    div.arrow(ref="arrow")
    div.dist(ref="dist")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { addHudTicker, hud, waypoint as primary, type Waypoint } from '@/game/state/hud'
import { MARKER_LEGACY } from '@/use/perfVariants'
import { markerSpot, type MarkerSpot } from './markerEdge'

/**
 * Written straight to the DOM by a HUD ticker: it moves every frame the
 * camera does. Only the distance text goes through a string, and only when
 * its whole-metre value changes.
 */
const props = defineProps<{ mark?: Waypoint; target?: boolean }>()
const { t } = useI18n()
const el = ref<HTMLElement | null>(null)
const arrow = ref<HTMLElement | null>(null)
const dist = ref<HTMLElement | null>(null)
/** The "go there" lesson is up: the marker calls attention to itself. */
const teach = computed(() => !props.target && hud.hints.some(h => h.id === 'goal'))
const label = computed(() => t(props.target ? 'hud.objective.target' : hud.objective === 'extract' ? 'hud.objective.extract' : 'hud.objective.salvage'))
let off: (() => void) | null = null
let sizer: ResizeObserver | null = null
let unlisten: (() => void) | null = null

onMounted(() => {
  const waypoint = props.mark ?? primary
  let shown = false
  let lastM = -1
  let edged = false
  const place: MarkerSpot = { x: 0, y: 0, edge: false, angle: 0 }
  // The host's size, measured when it CHANGES. Reading `clientWidth` in the
  // ticker forced a layout on every frame, right after the other tickers had
  // written their styles: 8 % of a throttled CPU (PERF-LEDGER.md, entry 1).
  let w = window.innerWidth
  let h = window.innerHeight
  const host = el.value?.parentElement ?? null
  const measure = (): void => {
    w = host?.clientWidth || window.innerWidth
    h = host?.clientHeight || window.innerHeight
  }
  measure()
  if (host && typeof ResizeObserver !== 'undefined') {
    sizer = new ResizeObserver(measure)
    sizer.observe(host)
  } else {
    window.addEventListener('resize', measure)
    unlisten = () => window.removeEventListener('resize', measure)
  }
  off = addHudTicker(() => {
    const e = el.value
    const a = arrow.value
    const d = dist.value
    if (!e || !a || !d) return
    if (waypoint.on !== shown) {
      shown = waypoint.on
      e.style.opacity = shown ? '1' : '0'
    }
    if (!shown) return
    if (MARKER_LEGACY) measure()
    const spot = markerSpot(waypoint.x, waypoint.y, waypoint.behind, w, h, place)
    const edge = spot.edge
    if (edge) a.style.rotate = `${spot.angle}rad`
    if (edge !== edged) {
      edged = edge
      a.style.opacity = edge ? '1' : '0'
    }
    e.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px)`
    const metres = Math.round(waypoint.dist)
    if (metres !== lastM) {
      lastM = metres
      d.textContent = t('hud.metres', { n: metres })
    }
  })
})
onUnmounted(() => {
  off?.()
  sizer?.disconnect()
  unlisten?.()
})
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.objective
  --size: clamp(1.6rem, 6.4vmin, 2.4rem)
  position: absolute
  left: 0
  top: 0
  width: var(--size)
  height: var(--size)
  margin: calc(var(--size) / -2) 0 0 calc(var(--size) / -2)
  opacity: 0
  pointer-events: none
  will-change: transform
  color: var(--cm-pink)
  &.extract
    color: var(--cm-ok)
  &.target
    color: var(--cm-danger)
.beacon
  position: absolute
  inset: 0
  span
    position: absolute
    inset: 0
    border: 0.18rem solid var(--cm-pink-hi)
    border-radius: 50%
    opacity: 0
    animation: beacon 1.6s ease-out infinite
    animation-delay: calc(var(--i) * 0.8s - 0.8s)
@keyframes beacon
  0%
    inset: 0
    opacity: 0.9
  100%
    inset: -1.6rem
    opacity: 0
@media (prefers-reduced-motion: reduce)
  .beacon span
    animation: none
    inset: -0.4rem
    opacity: 0.7
.pin
  position: absolute
  inset: 0
  display: flex
  align-items: center
  justify-content: center
  box-sizing: border-box
  +tech-hex(currentColor, var(--cm-glass))
  :deep(svg)
    width: 58%
    height: 58%
// A chevron on the ring's edge, turned to point off screen; it nudges that
// way, so an objective off to the side is noticed.
.arrow
  position: absolute
  inset: calc(var(--size) * -0.5)
  opacity: 0
  &::after
    content: ''
    position: absolute
    right: 0
    top: 50%
    width: 0
    height: 0
    translate: 0 -50%
    border-left: calc(var(--size) * 0.42) solid currentColor
    border-top: calc(var(--size) * 0.3) solid transparent
    border-bottom: calc(var(--size) * 0.3) solid transparent
    filter: drop-shadow(0 0 0.15rem rgba(0, 0, 0, 0.6))
    animation: nudge 0.8s ease-in-out infinite alternate
@keyframes nudge
  from
    right: 0
  to
    right: calc(var(--size) * -0.2)
@media (prefers-reduced-motion: reduce)
  .arrow::after
    animation: none
.dist
  position: absolute
  top: 100%
  left: 50%
  translate: -50% 0.15em
  color: var(--cm-text)
  font-size: var(--cm-fs-xs)
  line-height: 1
  white-space: nowrap
  text-shadow: var(--cm-text-outline)
  font-variant-numeric: tabular-nums
</style>
