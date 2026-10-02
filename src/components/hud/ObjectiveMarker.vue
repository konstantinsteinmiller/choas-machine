<template lang="pug">
  //- Where to go: a marker over the mission's objective (the Commander, then
  //- the extraction pad). On screen it sits on the thing itself; off screen
  //- it slides to the edge and points.
  div.objective(ref="el" :class="hud.objective" role="img" :aria-label="label")
    div.pin
      GameIcon(:name="hud.objective === 'extract' ? 'up' : 'skull'")
    div.arrow(ref="arrow")
    div.dist(ref="dist")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { addHudTicker, hud, waypoint } from '@/game/state/hud'
import { MARKER_LEGACY } from '@/use/perfVariants'

/**
 * Written straight to the DOM by a HUD ticker: it moves every frame the
 * camera does. Only the distance text goes through a string, and only when
 * its whole-metre value changes.
 */
const { t } = useI18n()
const el = ref<HTMLElement | null>(null)
const arrow = ref<HTMLElement | null>(null)
const dist = ref<HTMLElement | null>(null)
const label = computed(() => t(hud.objective === 'extract' ? 'hud.objective.extract' : 'hud.objective.target'))
let off: (() => void) | null = null
let sizer: ResizeObserver | null = null
let unlisten: (() => void) | null = null

onMounted(() => {
  let shown = false
  let lastM = -1
  let edged = false
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
    // Keep it clear of the HUD's corners.
    const m = Math.min(w, h) * 0.13
    let x = waypoint.x * w
    let y = waypoint.y * h
    const edge = waypoint.behind || x < m || x > w - m || y < m || y > h - m
    if (edge) {
      // Along the line from the screen's centre toward where it is.
      let dx = x - w / 2
      let dy = y - h / 2
      if (waypoint.behind) { dx = -dx; dy = Math.abs(dy) + h }
      const k = Math.min((w / 2 - m) / Math.max(1e-3, Math.abs(dx)), (h / 2 - m) / Math.max(1e-3, Math.abs(dy)))
      x = w / 2 + dx * k
      y = h / 2 + dy * k
      a.style.rotate = `${Math.atan2(dy, dx)}rad`
    }
    if (edge !== edged) {
      edged = edge
      a.style.opacity = edge ? '1' : '0'
    }
    e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
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
.pin
  position: absolute
  inset: 0
  display: flex
  align-items: center
  justify-content: center
  box-sizing: border-box
  border: var(--cm-edge) solid currentColor
  border-radius: 50%
  background: var(--cm-glass)
  box-shadow: 0 0 0.6rem currentColor
  :deep(svg)
    width: 58%
    height: 58%
// A chevron on the ring's edge, turned to point off screen.
.arrow
  position: absolute
  inset: calc(var(--size) * -0.42)
  opacity: 0
  &::after
    content: ''
    position: absolute
    right: 0
    top: 50%
    width: 0
    height: 0
    translate: 0 -50%
    border-left: calc(var(--size) * 0.3) solid currentColor
    border-top: calc(var(--size) * 0.22) solid transparent
    border-bottom: calc(var(--size) * 0.22) solid transparent
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
