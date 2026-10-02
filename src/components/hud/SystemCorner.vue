<script setup lang="ts">
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import SettingsButton from '@/components/organisms/SettingsButton.vue'

/**
 * The system controls every screen carries: the speaker over the settings
 * cog, stacked in the bottom-left corner inside the safe area. The Command
 * Base shows it as is; a mission moves the same two controls into its pause
 * menu, because the bottom-left corner belongs to the move stick there.
 */
</script>

<template lang="pug">
  div.system-corner
    FMuteButton
    SettingsButton
</template>

<style scoped lang="sass">
.system-corner
  position: absolute
  bottom: var(--cm-safe-bottom)
  left: var(--cm-safe-left)
  z-index: 20
  display: flex
  flex-direction: column
  gap: clamp(0.3rem, 1.4vmin, 0.6rem)
</style>
