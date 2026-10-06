<template lang="pug">
  //- A small copy of an on-screen button (#160): its shape, its colour, its
  //- picture, so a hint on touch points at the very button to press, the way
  //- a desktop hint shows the keycap.
  span.touch-glyph(:class="[`tone-${look.tone}`, `shape-${look.shape}`]" aria-hidden="true")
    span.body
      GameIcon.glyph(:name="look.icon")
</template>

<script setup lang="ts">
import GameIcon from '@/components/icons/GameIcon.vue'
import type { ButtonLook } from '@/components/hud/touchLook'

defineProps<{ look: ButtonLook }>()
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
@use '@/assets/css/buttonLook' as *
.touch-glyph
  --fhb-tone: var(--cm-cyan)
  --fhb-tone-hi: var(--cm-cyan-hi)
  display: inline-flex
  flex: none
  width: 2.2rem
  height: 2.2rem
.body
  display: flex
  align-items: center
  justify-content: center
  width: 100%
  height: 100%
  box-sizing: border-box
  color: var(--fhb-tone-hi)
.glyph
  width: 56%
  height: 56%
  filter: drop-shadow(0.05em 0.07em 0 var(--cm-ink))
.shape-diamond .glyph
  width: 44%
  height: 44%
.shape-round .glyph, .shape-hex .glyph
  width: 50%
  height: 50%
+button-tones
+button-shapes('.body', 0.4rem)
</style>
