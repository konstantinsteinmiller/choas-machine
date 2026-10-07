<template lang="pug">
  //- Twenty taps on the title inside twenty seconds play an interstitial: QA's
  //- way to check an ad on the submitted build. No counter, on purpose.
  FModal(:model-value="flow.modal === 'pause'" :title="t('pause.title')" @update:model-value="resume" @title-tap="registerQaAdTap()")
    //- The system controls live here during a mission: the corner they have in
    //- the Command Base belongs to the move stick.
    div.pause-row
      FMuteButton
      SettingsButton
    //- The language, one tap away: a player who landed in the wrong one finds it here.
    div.pause-lang
      FSelect(
        :label="t('options.language')"
        :options="languages"
        :model-value="locale"
        data-testid="pause-language"
        @update:model-value="chooseLanguage($event)"
      )
    template(#footer)
      //- The training ground, once finished before, can be left for the first raid.
      FButton(v-if="flow.training && profile.seen.includes('training')" type="ghost" size="md" icon="skip-forward" data-testid="btn-skip-training" @click="skip") {{ t('training.skip') }}
      FButton(size="lg" icon="play" data-testid="btn-resume" @click="resume") {{ t('pause.resume') }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FSelect from '@/components/atoms/FSelect.vue'
import useUser from '@/use/useUser'
import { setI18nLocale } from '@/i18n'
import { LANGUAGES, LANGUAGE_AUTONYMS } from '@/utils/enums'
import { bcp47For } from '@/i18n/localeTag'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import SettingsButton from '@/components/organisms/SettingsButton.vue'
import { flow, finishTraining } from '@/game/flow'
import { registerQaAdTap } from '@/use/useQaAdTrigger'
import { profile } from '@/game/state/profile'

/**
 * The pause menu. Open, it holds the pause gate (through FModal), so the
 * simulation is frozen and the portals are told gameplay has stopped.
 */
const emit = defineEmits<{ (e: 'resume'): void }>()
const { t, locale }: any = useI18n({ useScope: 'global' })
const { setSettingValue } = useUser()
// Each language in its own name, as in Options.
const languages = computed(() => LANGUAGES.map(loc => ({ value: loc, label: LANGUAGE_AUTONYMS[loc] ?? loc, lang: bcp47For(loc) })))
const chooseLanguage = (code: string): void => {
  setSettingValue('language', code)
  const appI18n: any = (window as any).__i18n
  if (appI18n) void setI18nLocale(appI18n, code)
  else locale.value = code
}
const resume = (): void => {
  flow.modal = ''
  emit('resume')
}
const skip = (): void => {
  flow.modal = ''
  void finishTraining()
}
</script>

<style scoped lang="sass">
.pause-row
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  gap: clamp(0.6rem, 3vmin, 1.4rem)
.pause-lang
  margin-top: clamp(0.6rem, 3vmin, 1.2rem)
  min-width: min(18rem, 70vw)
</style>
