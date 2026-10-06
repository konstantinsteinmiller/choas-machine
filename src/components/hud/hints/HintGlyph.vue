<template lang="pug">
  //- A control as the player presses it: its key (the player's own binding,
  //- lettered by KeyCap) or the mouse button on a keyboard; on touch the copy
  //- of the very button (#160), or the finger doing a gesture. The launcher
  //- shows both ways to draw it (#168): its number and the switch key.
  span.hint-glyph(v-if="device === 'mouse'")
    MouseGlyph.mouse(v-if="MOUSE[hint]" :lit="MOUSE[hint]")
    template(v-else-if="hint === 'rocket'")
      KeyCap(action="weapon3")
      span.or /
      KeyCap(action="cycle")
    KeyCap(v-else :action="HINT_KEYS[hint] ?? 'act'")
  span.hint-glyph(v-else)
    TouchButtonGlyph(v-if="HINT_BUTTON[hint]" :look="lookOf(HINT_BUTTON[hint] ?? 'strike', weapon, hint)")
    FingerGlyph.finger(v-else :mode="HINT_GESTURE[hint] ?? 'tap'")
</template>

<script setup lang="ts">
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import MouseGlyph from '@/components/hud/hints/MouseGlyph.vue'
import FingerGlyph from '@/components/hud/hints/FingerGlyph.vue'
import TouchButtonGlyph from '@/components/hud/hints/TouchButtonGlyph.vue'
import { HINT_BUTTON, HINT_GESTURE, HINT_KEYS, HINT_MOUSE as MOUSE, lookOf } from '@/components/hud/touchLook'
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
</style>
