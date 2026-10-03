<template lang="pug">
  FModal(:model-value="flow.modal === 'defeat'" :title="t('defeat.title')" :is-closable="false" data-testid="defeat")
    div.defeat-body
      GameIcon.defeat-glyph(name="mech")
      //- What was salvaged: a defeat is never for nothing.
      div.kept(v-if="flow.kept > 0")
        span.kept-label {{ t('defeat.kept') }}
        span.kept-value
          GameIcon(name="scrap")
          | +{{ fmt(flow.kept) }}
    template(#footer)
      div.actions
        FButton(type="ghost" size="md" icon="home" icon-position="left" data-testid="btn-defeat-base" @click="toBase") {{ t('rewards.continue') }}
        //- From the first stripped pile, with what was stripped still stripped.
        FButton(v-if="flow.checkpoint" type="secondary" size="md" icon="scrap" icon-position="left" data-testid="btn-resume-pile" @click="resume") {{ t('defeat.resume') }}
        FButton(size="lg" icon="replay" data-testid="btn-retry" @click="retry") {{ t('defeat.retry') }}
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { flow, leaveResults } from '@/game/flow'
import { formatAmount } from '@/utils/formatAmount'

/**
 * The mech is down. The modal cannot be dismissed: the two ways on are back
 * onto the perch, or to the Command Base to spend what was salvaged.
 */
const { t, locale } = useI18n()
const fmt = (n: number): string => formatAmount(n, locale.value)
const retry = (): void => { void leaveResults('retry') }
const resume = (): void => { void leaveResults('resume') }
const toBase = (): void => { void leaveResults('base') }
</script>

<style scoped lang="sass">
.defeat-body
  display: flex
  flex-direction: column
  align-items: center
  gap: clamp(0.4rem, 2vmin, 0.9rem)
  padding: clamp(0.4rem, 2vmin, 1rem) 0
.defeat-glyph
  width: clamp(3.5rem, 18vmin, 6rem)
  height: clamp(3.5rem, 18vmin, 6rem)
  color: var(--cm-danger)
  filter: drop-shadow(0 0 0.6rem rgba(255, 59, 92, 0.6))
  rotate: 14deg
.kept
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  gap: 0.3em 0.8em
  font-size: var(--cm-fs-s)
.kept-label
  color: var(--cm-dim)
.kept-value
  display: inline-flex
  align-items: center
  gap: 0.3em
  color: var(--cm-text)
  font-size: var(--cm-fs-m)
  font-variant-numeric: tabular-nums
  :deep(svg)
    width: 1.2em
    height: 1.2em
    color: var(--cm-warn)
.actions
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  gap: clamp(0.5rem, 2.4vmin, 1.2rem)
</style>
