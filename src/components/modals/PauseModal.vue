<template lang="pug">
  FModal(:model-value="flow.modal === 'pause'" :title="t('pause.title')" @update:model-value="resume")
    //- The system controls live here during a mission: the corner they have in
    //- the Command Base belongs to the move stick.
    div.pause-row
      FMuteButton
      SettingsButton
    template(#footer)
      FButton(size="lg" icon="play" data-testid="btn-resume" @click="resume") {{ t('pause.resume') }}
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import SettingsButton from '@/components/organisms/SettingsButton.vue'
import { flow } from '@/game/flow'

/**
 * The pause menu. Open, it holds the pause gate (through FModal), so the
 * simulation is frozen and the portals are told gameplay has stopped.
 */
const emit = defineEmits<{ (e: 'resume'): void }>()
const { t } = useI18n()
const resume = (): void => {
  flow.modal = ''
  emit('resume')
}
</script>

<style scoped lang="sass">
.pause-row
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  gap: clamp(0.6rem, 3vmin, 1.4rem)
</style>
