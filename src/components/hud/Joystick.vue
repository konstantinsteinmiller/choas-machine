<template lang="pug">
  div.joy(ref="root" aria-hidden="true")
    //- The resting stick: always there on touch, faint, low on the left — so
    //- the movement control can be SEEN before it is found. A press on it
    //- grabs it by its centre (`engine/input.ts`); in use, it steps aside
    //- for the live stick below.
    div.joy-home(ref="home" v-show="resting" :class="{ hidden: busy }")
      div.joy-home-knob
    div.joy-base(ref="base")
      div.joy-knob(ref="knob")
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { addHudTicker, hud } from '@/game/state/hud'
import { input } from '@/game/engine/inputState'

/**
 * The joystick's visuals. The logic lives in `engine/input.ts`; the live stick
 * only mirrors it with direct DOM writes from the HUD ticker (never through
 * Vue reactivity — it moves every frame).
 *
 * The ring's size is fluid (`--joy-size`), so the resting stick reports its
 * centre, its grab radius AND its travel to the input record whenever the
 * layout changes: a touch on it and the picture of it always agree.
 */
const root = ref<HTMLElement | null>(null)
const home = ref<HTMLElement | null>(null)
const base = ref<HTMLElement | null>(null)
const knob = ref<HTMLElement | null>(null)
/** The resting stick is part of the touch HUD, in play. */
const resting = computed(() => hud.device === 'touch' && hud.phase === 'play')
/** The live stick is out: the resting one fades away under it. */
const busy = ref(false)
let off: (() => void) | null = null
let shown = false

/** A touch this much wider than the drawn ring still grabs it. */
const GRAB = 1.35

const place = (): void => {
  const r = root.value
  const h = home.value
  const b = base.value
  if (b) {
    const size = b.getBoundingClientRect().width
    if (size > 0) input.joyRadius = size / 2
  }
  if (!r || !h || !resting.value) {
    input.joyHomeR = 0
    return
  }
  const a = r.getBoundingClientRect()
  const box = h.getBoundingClientRect()
  if (box.width === 0) { input.joyHomeR = 0; return }
  input.joyHomeX = box.left + box.width / 2 - a.left
  input.joyHomeY = box.top + box.height / 2 - a.top
  input.joyHomeR = (box.width / 2) * GRAB
}
const placeSoon = (): void => { void nextTick(place) }

let ro: ResizeObserver | null = null
onMounted(() => {
  placeSoon()
  window.addEventListener('resize', placeSoon)
  window.addEventListener('orientationchange', placeSoon)
  if (typeof ResizeObserver === 'function' && root.value) {
    ro = new ResizeObserver(placeSoon)
    ro.observe(root.value)
  }
  off = addHudTicker(() => {
    const b = base.value
    const k = knob.value
    if (!b || !k) return
    if (input.joyActive !== shown) {
      shown = input.joyActive
      busy.value = shown
      b.style.opacity = shown ? '1' : '0'
    }
    if (!shown) return
    b.style.transform = `translate(${input.joyOriginX}px, ${input.joyOriginY}px)`
    const m = Math.min(1, Math.hypot(input.joyX, input.joyY))
    const a = Math.atan2(input.joyY, input.joyX)
    k.style.transform = `translate(${Math.cos(a) * m * 100}%, ${Math.sin(a) * m * 100}%)`
  })
})
watch(resting, placeSoon)
onUnmounted(() => {
  off?.()
  ro?.disconnect()
  window.removeEventListener('resize', placeSoon)
  window.removeEventListener('orientationchange', placeSoon)
  input.joyHomeR = 0
})
</script>

<style scoped lang="sass">
.joy
  // The ring: a thumb's reach, the same on a phone held either way.
  --joy-size: clamp(5.5rem, 27vmin, 8.5rem)
  // The resting stick's centre: ~a ring's width in from each edge, so a full
  // push, thumb and all, stays on the glass.
  --joy-home: calc(var(--joy-size) * 0.95)
  position: absolute
  inset: 0
  pointer-events: none
.joy-home
  position: absolute
  left: calc(env(safe-area-inset-left, 0px) + var(--joy-home))
  bottom: calc(env(safe-area-inset-bottom, 0px) + var(--joy-home))
  width: var(--joy-size)
  height: var(--joy-size)
  translate: -50% 50%
  box-sizing: border-box
  border-radius: 50%
  background: radial-gradient(circle, rgba(77, 232, 255, 0.05) 0%, rgba(77, 232, 255, 0.16) 70%)
  border: var(--cm-edge) solid rgba(77, 232, 255, 0.5)
  // Half-faded at rest, like its twin on the right (`LookStick.vue`).
  opacity: 0.5
  transition: opacity 0.15s
  &.hidden
    opacity: 0
.joy-home-knob, .joy-knob
  position: absolute
  left: 50%
  top: 50%
  width: 44%
  height: 44%
  margin: -22% 0 0 -22%
  box-sizing: border-box
  border-radius: 50%
.joy-home-knob
  background: radial-gradient(circle at 38% 32%, rgba(168, 245, 255, 0.7), rgba(77, 232, 255, 0.5) 55%, rgba(15, 127, 163, 0.5))
  border: var(--cm-edge) solid rgba(21, 12, 43, 0.5)
.joy-base
  position: absolute
  left: 0
  top: 0
  width: var(--joy-size)
  height: var(--joy-size)
  margin: calc(var(--joy-size) / -2) 0 0 calc(var(--joy-size) / -2)
  box-sizing: border-box
  border-radius: 50%
  background: radial-gradient(circle, rgba(77, 232, 255, 0.08) 0%, rgba(77, 232, 255, 0.24) 70%)
  border: var(--cm-edge) solid var(--cm-cyan)
  box-shadow: var(--cm-glow-cyan)
  opacity: 0
  transition: opacity 0.12s
  will-change: transform
.joy-knob
  background: radial-gradient(circle at 38% 32%, var(--cm-cyan-hi), var(--cm-cyan) 55%, var(--cm-cyan-deep))
  border: var(--cm-edge) solid var(--cm-ink)
  will-change: transform
</style>
