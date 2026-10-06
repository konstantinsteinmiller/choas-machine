<template lang="pug">
  //- The training ground calls a line out over the middle of the screen: why
  //- the room started over (#155), and "Backstab them" at a shot in the blade
  //- room (#156). Replayed on every call, even the same line twice running.
  div.training-shout(aria-live="assertive")
    p.line(
      v-if="hud.training.shout"
      :key="hud.training.shoutSeq"
      :class="{ big: hud.training.shout === 'shout.backstab' }"
      data-testid="training-shout"
      @animationend="hud.training.shout = ''"
    ) {{ t(`training.${hud.training.shout}`) }}
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { hud } from '@/game/state/hud'

const { t } = useI18n()
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.training-shout
  position: absolute
  inset-inline: 0
  top: 28%
  display: flex
  justify-content: center
  padding-inline: max(1rem, var(--cm-safe-left))
  pointer-events: none
  // Portrait: below the unit frame and the training pips, which run as wide as it.
  @media (max-aspect-ratio: 1/1)
    top: 36%
.line
  box-sizing: border-box
  max-width: min(34rem, 100%)
  margin: 0
  padding: 0.4em 1.1em
  color: #ffd27a
  font-size: var(--cm-fs-l)
  font-weight: 700
  text-align: center
  text-wrap: balance
  text-shadow: var(--cm-text-outline)
  animation: shout 3s ease-out forwards
  +tech-plate(var(--cm-violet), tech-fill(var(--cm-violet), 18%), 0.6rem)
  &.big
    color: #ff7a9c
    font-size: var(--cm-fs-xl)
    letter-spacing: 0.04em
    text-transform: uppercase
    animation-duration: 2.4s
@keyframes shout
  0%
    opacity: 0
    transform: translateY(0.8rem)
  10%
    opacity: 1
    transform: translateY(0)
  80%
    opacity: 1
  100%
    opacity: 0
</style>
