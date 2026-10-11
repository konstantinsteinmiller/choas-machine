<template lang="pug">
  //- What the player has to spend: Tech Scrap and Data Cores.
  div.wallet
    //- Twenty taps here ask for a rewarded video: QA's back door (`useQaAdTrigger`), silent.
    div.pill.scrap(:title="t('base.scrap')" @pointerdown="registerQaRewardedTap()")
      GameIcon.glyph(name="scrap")
      span.amount(data-testid="wallet-scrap" :aria-label="`${t('base.scrap')}: ${fmt(profile.scrap)}`") {{ fmt(profile.scrap) }}
    div.pill.cores(:title="t('base.cores')")
      GameIcon.glyph(name="core")
      span.amount(data-testid="wallet-cores" :aria-label="`${t('base.cores')}: ${fmt(profile.cores)}`") {{ fmt(profile.cores) }}
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { profile } from '@/game/state/profile'
import { formatAmount } from '@/utils/formatAmount'
import { registerQaRewardedTap } from '@/use/useQaAdTrigger'

const { t, locale } = useI18n()
const fmt = (n: number): string => formatAmount(n, locale.value)
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.wallet
  display: flex
  flex-wrap: wrap
  justify-content: flex-end
  gap: clamp(0.3rem, 1.4vmin, 0.6rem)
.pill
  pointer-events: auto
  touch-action: manipulation
  display: flex
  align-items: center
  gap: clamp(0.25rem, 1vmin, 0.4rem)
  min-height: clamp(1.7rem, 6.4vmin, 2.4rem)
  padding: 0 clamp(0.5rem, 2vmin, 0.85rem) 0 clamp(0.35rem, 1.4vmin, 0.55rem)
  box-sizing: border-box
  color: var(--cm-warn)
  +tech-plate(var(--pill-tone, var(--cm-warn)), tech-fill(var(--pill-tone, var(--cm-warn)), 14%), 0.55rem)
  &.cores
    --plate-edge: var(--cm-cyan)
    --plate-fill: #{tech-fill(var(--cm-cyan), 14%)}
    color: var(--cm-cyan)
.glyph
  flex: none
  width: clamp(1.1rem, 4.4vmin, 1.6rem)
  height: clamp(1.1rem, 4.4vmin, 1.6rem)
.amount
  color: var(--cm-text)
  font-size: var(--cm-fs-m)
  line-height: 1
  font-variant-numeric: tabular-nums
  text-shadow: var(--cm-text-outline)
  white-space: nowrap
</style>
