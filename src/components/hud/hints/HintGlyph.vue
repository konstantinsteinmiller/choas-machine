<template lang="pug">
  //- A control as the player presses it: its key (the player's own binding,
  //- lettered by KeyCap) or the mouse button on a keyboard; on touch the copy
  //- of the very button (#160), or the finger doing a gesture. The launcher
  //- shows both ways to draw it (#168): its number and the switch key.
  span.hint-glyph(v-if="device === 'mouse'")
    //- Looking round: the finger on its loop, on a desktop too (#169).
    FingerGlyph.finger(v-if="hint === 'look'" mode="loop")
    MouseGlyph.mouse(v-else-if="MOUSE[hint]" :lit="MOUSE[hint]")
    template(v-else-if="hint === 'rocket'")
      KeyCap(action="weapon3")
      span.or /
      KeyCap(action="cycle")
    KeyCap(v-else :action="HINT_KEYS[hint] ?? 'act'")
  span.hint-glyph(v-else)
    TouchButtonGlyph(v-if="HINT_BUTTON[hint]" :look="lookOf(HINT_BUTTON[hint] ?? 'strike', weapon, hint)")
    //- A keyboard here too (a touchscreen laptop): its shortcut beside the picture.
    KeyCap(v-if="HINT_BUTTON[hint] && keyboardToo && HINT_KEYS[hint]" :action="HINT_KEYS[hint] ?? 'act'")
    //- Looking round on touch: the look stick itself, small (its knob, its eye).
    span.stick-glyph(v-else-if="hint === 'look'")
      span.stick-knob
        GameIcon.stick-eye(name="eye")
    FingerGlyph.finger(v-else :mode="HINT_GESTURE[hint] ?? 'tap'")
</template>

<script setup lang="ts">
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import MouseGlyph from '@/components/hud/hints/MouseGlyph.vue'
import FingerGlyph from '@/components/hud/hints/FingerGlyph.vue'
import TouchButtonGlyph from '@/components/hud/hints/TouchButtonGlyph.vue'
import { HINT_BUTTON, HINT_GESTURE, HINT_KEYS, HINT_MOUSE as MOUSE, lookOf } from '@/components/hud/touchLook'
import { keyboardToo } from '@/use/useKeyboardToo'
import type { HintId } from '@/game/sim/coach'
import type { WeaponId } from '@/game/data/ids'

defineProps<{ hint: HintId; device: 'mouse' | 'touch'; weapon: WeaponId }>()
</script>

<style scoped lang="sass">
.hint-glyph
  display: inline-flex
  align-items: center
  gap: 0.3em
.or
  opacity: 0.7
  font-weight: 700
.finger
  --size: 2.8rem
.mouse
  width: 1.3rem
  height: 1.8rem
// The look stick's picture (`LookStick.vue`): ring, knob, eye.
.stick-glyph
  --size: 2.8rem
  position: relative
  display: inline-grid
  place-items: center
  width: var(--size)
  height: var(--size)
  box-sizing: border-box
  border-radius: 50%
  border: 0.14rem solid rgba(77, 232, 255, 0.85)
  background: radial-gradient(circle, rgba(77, 232, 255, 0.08), rgba(77, 232, 255, 0.28) 70%)
.stick-knob
  display: grid
  place-items: center
  width: 46%
  height: 46%
  border-radius: 50%
  background: radial-gradient(circle at 38% 32%, var(--cm-cyan-hi), var(--cm-cyan) 60%)
  animation: stick-wiggle 1.6s ease-in-out infinite
.stick-eye
  width: 62%
  height: 62%
  color: var(--cm-ink)
@keyframes stick-wiggle
  25%
    translate: 30% 0
  75%
    translate: -30% 0
@media (prefers-reduced-motion: reduce)
  .stick-knob
    animation: none
</style>
