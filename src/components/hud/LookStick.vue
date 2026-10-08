<template lang="pug">
  //- The look stick: the camera's own stick, bottom right, left of the action
  //- buttons, the twin of the move stick on the left. Half-faded at rest; lit
  //- while it is held. `engine/input.ts` reads the push; this only draws it.
  div.look-stick(
    v-if="shown"
    ref="ring"
    aria-hidden="true"
    data-testid="look-stick"
    :class="{ held: input.lookStickActive, 'is-attention': attention }"
  )
    div.look-knob(ref="knob")
      GameIcon.look-glyph(name="eye")
    svg.look-arrows(viewBox="0 0 100 100")
      path(d="M50 6l7 9H43zM50 94l-7-9h14zM6 50l9-7v14zM94 50l-9 7V43z")
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { addHudTicker, hud } from '@/game/state/hud'
import { input } from '@/game/engine/inputState'

/** The look lesson (or the training's nudge to look) makes it pulse. */
defineProps<{ attention?: boolean }>()

const shown = computed(() => hud.device === 'touch' && hud.phase === 'play')
const ring = ref<HTMLElement | null>(null)
const knob = ref<HTMLElement | null>(null)

/** Tell the input where the stick is drawn (its size is fluid). */
const place = (): void => {
  const el = ring.value
  if (!el || !shown.value) { input.lookHomeR = 0; return }
  const r = el.getBoundingClientRect()
  const host = (el.closest('.scene-root') ?? document.body).getBoundingClientRect()
  if (r.width === 0) { input.lookHomeR = 0; return }
  input.lookHomeX = r.left + r.width / 2 - host.left
  input.lookHomeY = r.top + r.height / 2 - host.top
  input.lookHomeR = r.width / 2
}
const placeSoon = (): void => { void nextTick(place) }

let off: (() => void) | null = null
let ro: ResizeObserver | null = null
onMounted(() => {
  placeSoon()
  window.addEventListener('resize', placeSoon)
  window.addEventListener('orientationchange', placeSoon)
  off = addHudTicker(() => {
    const k = knob.value
    if (!k) return
    k.style.transform = input.lookStickActive
      ? `translate(${input.lookStickX * 62}%, ${input.lookStickY * 62}%)`
      : ''
  })
})
watch(shown, placeSoon)
watch(ring, (el) => {
  ro?.disconnect()
  if (el && typeof ResizeObserver === 'function') { ro = new ResizeObserver(placeSoon); ro.observe(el) }
  placeSoon()
})
onUnmounted(() => {
  off?.()
  ro?.disconnect()
  window.removeEventListener('resize', placeSoon)
  window.removeEventListener('orientationchange', placeSoon)
  input.lookHomeR = 0
})
</script>

<style scoped lang="sass">
// Placed by `MissionHud`'s touch layout (`--look-x`, `--look-y`, `--stick`).
.look-stick
  position: absolute
  right: var(--look-x)
  bottom: var(--look-y)
  width: var(--stick)
  height: var(--stick)
  translate: 50% 50%
  box-sizing: border-box
  border-radius: 50%
  background: radial-gradient(circle, rgba(77, 232, 255, 0.05) 0%, rgba(77, 232, 255, 0.16) 70%)
  border: var(--cm-edge) solid rgba(77, 232, 255, 0.55)
  opacity: 0.5
  transition: opacity 0.15s
  pointer-events: none
  &.held
    opacity: 0.95
  &.is-attention
    animation: look-call 1.2s ease-in-out infinite
.look-knob
  position: absolute
  left: 50%
  top: 50%
  width: 44%
  height: 44%
  margin: -22% 0 0 -22%
  display: grid
  place-items: center
  border-radius: 50%
  box-sizing: border-box
  background: radial-gradient(circle at 38% 32%, rgba(168, 245, 255, 0.75), rgba(77, 232, 255, 0.55) 55%, rgba(15, 127, 163, 0.55))
  border: var(--cm-edge) solid rgba(21, 12, 43, 0.5)
  will-change: transform
.look-glyph
  width: 58%
  height: 58%
  color: var(--cm-ink)
.look-arrows
  position: absolute
  inset: 6%
  width: 88%
  height: 88%
  fill: rgba(168, 245, 255, 0.9)
@keyframes look-call
  0%, 100%
    opacity: 0.5
    box-shadow: 0 0 0 0 rgba(255, 210, 63, 0)
  50%
    opacity: 1
    box-shadow: 0 0 0 0.35rem rgba(255, 210, 63, 0.8)
@media (prefers-reduced-motion: reduce)
  .look-stick.is-attention
    animation: none
    opacity: 1
</style>
