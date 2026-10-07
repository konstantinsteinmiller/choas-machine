<template lang="pug">
  //- The training's nudge (#186): a player at a shut door who has not done
  //- the room's thing yet (or, in the weapons room, has not switched weapons)
  //- is shown the very control, until it is used. On touch, a fat yellow arrow
  //- bounces on the button itself; on a keyboard, or when that button is not
  //- on screen right now, the key, the mouse button or the gesture sits big in
  //- the middle of the screen, bouncing.
  div.training-nudge(v-if="hint" aria-hidden="true" data-testid="training-nudge")
    //- The arrow's tip sits on the button's edge; it is turned to point at it.
    div.arrow(v-if="target" :style="arrowStyle" data-testid="nudge-arrow")
      div.shaft
        svg(viewBox="0 0 48 64")
          path(d="M24 62L4 36h12V2h16v34h12z")
    div.centre(v-else data-testid="nudge-centre")
      HintGlyph.glyph(v-if="hint !== 'weapon' || hud.device !== 'mouse'" :hint="hint" :device="hud.device" :weapon="hud.weapon")
      span.glyph.weapon-keys(v-else)
        KeyCap(action="cycle")
        span.or /
        MouseGlyph(lit="wheel")
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { hud } from '@/game/state/hud'
import HintGlyph from '@/components/hud/hints/HintGlyph.vue'
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import MouseGlyph from '@/components/hud/hints/MouseGlyph.vue'
import { NUDGE_BUTTON } from '@/components/hud/touchLook'

const hint = computed(() => hud.training.nudge || null)

/** The button's box on screen, re-read a few times a second (buttons come and go with the situation). */
const target = ref<DOMRect | null>(null)
let timer = 0
const find = (): void => {
  const id = hint.value && hud.device === 'touch' ? NUDGE_BUTTON[hint.value] : undefined
  // The switch on touch is the three weapons side by side: point at one not in hand.
  const el = !id ? null
    : hint.value === 'weapon' ? document.querySelector('[data-testid^="btn-weapon-"]:not([aria-pressed="true"])') ?? document.querySelector(`[data-testid="${id}"]`)
      : document.querySelector(`[data-testid="${id}"]`)
  const r = el?.getBoundingClientRect()
  target.value = r && r.width > 0 ? r : null
}
watch(hint, (h) => {
  window.clearInterval(timer)
  if (!h) { target.value = null; return }
  find()
  timer = window.setInterval(find, 250)
}, { immediate: true })
onUnmounted(() => window.clearInterval(timer))

/**
 * Where the arrow points from: a button in the right-hand column is pointed at
 * from its left (an arrow from above would lie over its neighbours in the
 * column); one near the top from below; any other from above.
 */
const arrowStyle = computed(() => {
  const r = target.value!
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  if (cx > window.innerWidth * 0.6) return { left: `${r.left - 6}px`, top: `${cy}px`, '--angle': '-90deg' }
  if (r.top < window.innerHeight * 0.3) return { left: `${cx}px`, top: `${r.bottom + 6}px`, '--angle': '180deg' }
  return { left: `${cx}px`, top: `${r.top - 6}px`, '--angle': '0deg' }
})
</script>

<style scoped lang="sass">
.training-nudge
  position: absolute
  inset: 0
  pointer-events: none
  z-index: 6
// A point on the button's edge, turned toward the button; the shaft hangs
// above it with its tip on the point and bounces away and back.
.arrow
  position: fixed
  width: 0
  height: 0
  rotate: var(--angle)
.shaft
  // Big and fat (#186 follow-up): it must not be missed.
  --w: clamp(3.6rem, 16vmin, 6rem)
  position: absolute
  width: var(--w)
  height: calc(var(--w) * 1.33)
  left: calc(var(--w) * -0.5)
  bottom: 0
  animation: nudge-bounce 0.8s ease-in-out infinite
  svg
    display: block
    width: 100%
    height: 100%
    overflow: visible
  path
    fill: #ffd23f
    stroke: #3a2600
    stroke-width: 3
    stroke-linejoin: round
    filter: drop-shadow(0 0 0.4rem rgba(255, 210, 63, 0.85))
.centre
  position: absolute
  left: 50%
  // Below the door's line (28%), in the player's face.
  top: 56%
  translate: -50% -50%
  display: grid
  place-items: center
  padding: 0.6em 0.9em
  border-radius: 0.8rem
  background: rgba(21, 12, 43, 0.6)
  box-shadow: 0 0 0 0.2rem #ffd23f, 0 0 1.4rem rgba(255, 210, 63, 0.6)
  font-size: clamp(1.6rem, 6vmin, 2.6rem)
  animation: nudge-pop 0.9s ease-in-out infinite
// The key in the player's face (#186 follow-up): their own key, big and fat.
.glyph
  font-size: inherit
  :deep(.key-cap)
    min-width: clamp(4.6rem, 20vmin, 8.5rem)
    height: clamp(4.6rem, 20vmin, 8.5rem)
    font-size: clamp(2.4rem, 10vmin, 4.6rem)
    font-weight: 800
    --plate-edge: #ffd23f
  :deep(.mouse-glyph)
    width: clamp(3rem, 13vmin, 5rem)
    height: clamp(4.2rem, 18vmin, 7rem)
  :deep(.touch-button-glyph), :deep(.finger-glyph)
    --size: clamp(4.6rem, 20vmin, 8.5rem)
.weapon-keys
  display: inline-flex
  align-items: center
  gap: 0.35em
.or
  color: #ffd23f
  font-weight: 700
@keyframes nudge-bounce
  0%, 100%
    translate: 0 0
  50%
    translate: 0 -0.9rem
// An attention bounce: up and back, never bigger (no control is sized by scale).
@keyframes nudge-pop
  0%, 100%
    translate: -50% -50%
  50%
    translate: -50% calc(-50% - 0.7rem)
@media (prefers-reduced-motion: reduce)
  .shaft, .centre
    animation: none
</style>
