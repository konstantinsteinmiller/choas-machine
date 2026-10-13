<template lang="pug">
  //- The training's nudge (#186): a player at a shut door who has not done
  //- the room's thing yet (or, in the weapons room, has not switched weapons)
  //- is shown the very control, until it is used. On touch, a fat yellow arrow
  //- bounces on the button itself; on a keyboard, or when that button is not
  //- on screen right now, the key, the mouse button or the gesture sits big in
  //- the middle of the screen, bouncing.
  div.training-nudge(v-if="hint" aria-hidden="true" data-testid="training-nudge")
    //- The arrow's tip sits on the button's edge; it is turned to point at it.
    //- A yellow ring round the very button, so in a packed cluster there is no
    //- doubt which one the arrow means.
    div.ring(v-if="target" :style="ringStyle" data-testid="nudge-ring")
    AttentionArrow(v-if="target" :style="arrowStyle" data-testid="nudge-arrow")
    //- Beside the mech, not over it (#201 follow-up: the key hid whether it
    //- was crouched, and the gap it had to crawl through); the wide weapon
    //- switch stays in the middle (it is shown scoped, with no mech in view).
    div.centre(v-else :class="{ beside: hint !== 'weapon' }" data-testid="nudge-centre")
      HintGlyph.glyph(v-if="hint !== 'weapon' || hud.device !== 'mouse'" :hint="hint" :device="hud.device" :weapon="hud.weapon")
      span.glyph.weapon-keys(v-else)
        //- The keys, never the wheel (#201 follow-up: scoped it zooms, and
        //- players read the wheel as a click): Tab, or the minigun's and the
        //- launcher's own numbers.
        KeyCap(action="cycle")
        span.or /
        KeyCap(action="weapon2" data-testid="nudge-weapon-2")
        span.or /
        KeyCap(action="weapon3" data-testid="nudge-weapon-3")
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { hud } from '@/game/state/hud'
import HintGlyph from '@/components/hud/hints/HintGlyph.vue'
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import { NUDGE_BUTTON } from '@/components/hud/touchLook'
import AttentionArrow from '@/components/hud/AttentionArrow.vue'
import { aimArrow, otherControls } from '@/components/hud/arrowAim'

const hint = computed(() => hud.training.nudge || null)

/** The button's box on screen, re-read a few times a second (buttons come and go with the situation). */
const target = ref<DOMRect | null>(null)
let timer = 0
const find = (): void => {
  const id = hint.value && hud.device === 'touch' ? NUDGE_BUTTON[hint.value] : undefined
  const el = id ? document.querySelector(`[data-testid="${id}"]`) : null
  const r = el?.getBoundingClientRect()
  // Only a button that is wholly on screen is pointed at; otherwise the big glyph.
  const onScreen = r && r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
  target.value = onScreen ? r : null
}
watch(hint, (h) => {
  window.clearInterval(timer)
  if (!h) { target.value = null; return }
  find()
  timer = window.setInterval(find, 250)
}, { immediate: true })
onUnmounted(() => window.clearInterval(timer))

const ringStyle = computed(() => {
  const r = target.value!
  const pad = 5
  return { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` }
})

/** The other controls on screen, the arrow must not lie across (re-read with the target). */
const others = ref<DOMRect[]>([])
watch(target, () => { others.value = otherControls(hint.value ? NUDGE_BUTTON[hint.value] : undefined) })
const arrowStyle = computed(() => aimArrow(target.value!, others.value))
</script>

<style scoped lang="sass">
.training-nudge
  position: absolute
  inset: 0
  pointer-events: none
  z-index: 6
.ring
  position: fixed
  box-sizing: border-box
  border-radius: 50%
  border: 0.3rem solid #ffd23f
  box-shadow: 0 0 0.9rem rgba(255, 210, 63, 0.9), inset 0 0 0.6rem rgba(255, 210, 63, 0.6)
  animation: nudge-ring 0.8s ease-in-out infinite
@keyframes nudge-ring
  50%
    opacity: 0.45
.centre
  position: absolute
  left: 50%
  // In the player's face, but below the door ahead (where the hologram
  // shows the way through): over the mech's legs, not the doorway.
  top: 72%
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
  // Three keys: smaller each, so the row stays under the hologram showing the switch.
  :deep(.key-cap)
    min-width: clamp(3rem, 12vmin, 5.5rem)
    height: clamp(3rem, 12vmin, 5.5rem)
    font-size: clamp(1.5rem, 6vmin, 2.8rem)
// The weapon row: low, under the room's hologram and the mech.
.centre:not(.beside)
  top: 86%
.or
  color: #ffd23f
  font-weight: 700
// An attention bounce: up and back, never bigger (no control is sized by scale).
@keyframes nudge-pop
  0%, 100%
    translate: -50% -50%
  50%
    translate: -50% calc(-50% - 0.7rem)
// Right of the mech (it stands in the middle of the view, its legs where the
// centre glyph sat), a little higher: the mech and the door both stay seen.
.centre.beside
  left: calc(50% + clamp(4.5rem, 14vw, 11rem))
  top: 62%
  translate: 0 -50%
  animation-name: nudge-pop-beside
@keyframes nudge-pop-beside
  0%, 100%
    translate: 0 -50%
  50%
    translate: 0 calc(-50% - 0.7rem)
@media (prefers-reduced-motion: reduce)
  .centre, .ring
    animation: none
</style>
