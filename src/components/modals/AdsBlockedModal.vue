<template lang="pug">
  //- An ad blocker stopped a rewarded video (#75): no reward this time, said
  //- plainly. The game holds still under it until the player closes it. Not
  //- on CrazyGames, whose SDK shows its own (`ownsAdBlockUi`).
  FModal(:model-value="isAdsBlockedModalShown" :title="t('ads.blockedTitle')" data-testid="ads-blocked" @update:model-value="dismissAdsBlockedModal")
    p.body {{ t('ads.blockedBody') }}
    template(#footer)
      FButton(size="md" icon="check" data-testid="ads-blocked-ok" @click="dismissAdsBlockedModal") {{ t('ads.ok') }}
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import { dismissAdsBlockedModal, isAdsBlockedModalShown } from '@/use/useAds'

const { t } = useI18n()
</script>

<style scoped lang="sass">
.body
  margin: 0
  max-width: 34ch
  color: var(--cm-text)
  font-size: var(--cm-fs-s)
  line-height: 1.4
</style>
