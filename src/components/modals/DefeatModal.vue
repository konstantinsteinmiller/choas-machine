<template lang="pug">
  FModal(:model-value="flow.modal === 'defeat'" :title="t('defeat.title')" :is-closable="false")
    div.defeat-body
      GameIcon.defeat-glyph(name="mech")
    template(#footer)
      FButton(size="lg" icon="replay" data-testid="btn-retry" @click="retry") {{ t('defeat.retry') }}
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { flow, startMission } from '@/game/flow'

/**
 * The mech is down. There is one way on from here, so the modal cannot be
 * dismissed: the button drops the mech back onto the perch.
 */
const { t } = useI18n()
const retry = (): void => { void startMission() }
</script>

<style scoped lang="sass">
.defeat-body
  display: flex
  justify-content: center
  padding: clamp(0.4rem, 2vmin, 1rem) 0
.defeat-glyph
  width: clamp(3.5rem, 18vmin, 6rem)
  height: clamp(3.5rem, 18vmin, 6rem)
  color: var(--cm-danger)
  filter: drop-shadow(0 0 0.6rem rgba(255, 59, 92, 0.6))
  rotate: 14deg
</style>
