<template lang="pug">
  //- A story scene is playing (#100): a skip button you can see (the mouse
  //- is free during a scene, #175), and Space held for a second and a half
  //- does the same, its ring filling round the key.
  div.cinema-skip(v-if="hud.phase === 'cinema'")
    HoldSkipButton(:active="hud.phase === 'cinema'" :keys="hud.device === 'mouse'" testid="btn-cinema-skip" @skip="skipCinema")
</template>

<script setup lang="ts">
import HoldSkipButton from '@/components/hud/HoldSkipButton.vue'
import { hud } from '@/game/state/hud'
import { skipCinema } from '@/game/flow'
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.cinema-skip
  position: absolute
  right: max(1rem, env(safe-area-inset-right))
  bottom: calc(clamp(1.6rem, 9vmin, 4.5rem) + 0.75rem)
  pointer-events: auto
</style>
