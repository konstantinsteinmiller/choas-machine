<template lang="pug">
  //- A scripted shot is playing (the drop-in, a kill-cam, the extraction):
  //- letterbox bars, and the one thing the player can do — skip it.
  Transition(name="cine")
    div.cine-bars(v-if="active")
      div.bar.top
      div.bar.bottom
      //- Any press on the scene skips; this is the picture of that.
      div.skip(role="img" :aria-label="t('ui.skip')")
        GameIcon(name="skip-forward")
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { hud } from '@/game/state/hud'
import { flow } from '@/game/flow'

const { t } = useI18n()
const active = computed(() =>
  flow.screen === 'mission' && !flow.curtain && !flow.loading && (hud.cine || hud.phase === 'intro' || hud.phase === 'outro')
)
</script>

<style scoped lang="sass">
.cine-bars
  position: absolute
  inset: 0
  pointer-events: none
.bar
  position: absolute
  left: 0
  right: 0
  height: clamp(1.6rem, 9vmin, 4.5rem)
  background: #0a0518
  &.top
    top: 0
  &.bottom
    bottom: 0
.skip
  position: absolute
  right: var(--cm-safe-right)
  bottom: var(--cm-safe-bottom)
  width: clamp(1.4rem, 6vmin, 2.2rem)
  height: clamp(1.4rem, 6vmin, 2.2rem)
  color: var(--cm-text)
  opacity: 0.75
  animation: cine-skip 1.3s ease-in-out infinite

@keyframes cine-skip
  50%
    opacity: 0.25

// The bars slide in from the edges; nothing fades the picture itself.
.cine-enter-active, .cine-leave-active
  transition: opacity 220ms ease-out
  .bar
    transition: translate 220ms ease-out
.cine-enter-from, .cine-leave-to
  opacity: 0
  .bar.top
    translate: 0 -100%
  .bar.bottom
    translate: 0 100%

@media (prefers-reduced-motion: reduce)
  .skip
    animation: none
</style>
