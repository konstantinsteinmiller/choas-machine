<template lang="pug">
  //- The way back into the fortress: pick a threat level, see what has been
  //- won there, and go.
  section.deploy
    h2.label {{ t('base.threat') }}
    div.levels(role="radiogroup" :aria-label="t('base.threat')")
      button.level(
        v-for="n in THREAT_LEVELS"
        :key="n"
        type="button"
        role="radio"
        :aria-checked="n === flow.level"
        :aria-label="n > open ? t('base.locked', { n: n - 1 }) : `${t('base.threat')} ${n}`"
        :disabled="n > open"
        :class="{ on: n === flow.level, locked: n > open, cleared: clears(n) > 0 }"
        :data-testid="`level-${n}`"
        @click="pick(n)"
      )
        GameIcon.lock(v-if="n > open" name="lock")
        span.numeral(v-else) {{ NUMERALS[n - 1] }}
    div.record
      div.medals
        span.medal(
          v-for="m in MEDAL_IDS"
          :key="m"
          :class="{ won: record?.medals[m] }"
          :title="t(`medal.${m}`)"
          :aria-label="t(`medal.${m}`)"
          role="img"
        )
          GameIcon(:name="MEDAL_ICONS[m]")
      div.best(v-if="record && record.bestScore > 0")
        span.best-label {{ t('base.best') }}
        span.best-value {{ fmt(record.bestScore) }}
    FButton.go(size="xl" icon="play" block attention data-testid="btn-deploy" @click="deploy") {{ t('base.deploy') }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { flow, startMission } from '@/game/flow'
import { profile } from '@/game/state/profile'
import { levelKey, unlockedLevel } from '@/game/state/progress'
import { THREAT_LEVELS } from '@/game/sim/rewards'
import { MEDAL_IDS } from '@/game/data/ids'
import { MEDAL_ICONS } from '@/components/base/medals'
import { sfx } from '@/game/audio/sfx'
import { formatAmount } from '@/utils/formatAmount'

const { t, locale } = useI18n()
/** The numerals on the chips are marks, not words: the same in every language. */
const NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const

const open = computed(() => unlockedLevel())
const clears = (n: number): number => profile.fortresses[levelKey(n)]?.clears ?? 0
const record = computed(() => profile.fortresses[levelKey(flow.level)])
const fmt = (n: number): string => formatAmount(n, locale.value)

const pick = (n: number): void => {
  if (n > open.value || n === flow.level) return
  sfx('uiClick')
  flow.level = n
}
const deploy = (): void => { void startMission(flow.level) }
</script>

<style scoped lang="sass">
.deploy
  display: flex
  flex-direction: column
  gap: clamp(0.35rem, 1.6vmin, 0.7rem)
  padding: clamp(0.5rem, 2.2vmin, 1rem)
  box-sizing: border-box
  border: var(--cm-rim-w) solid transparent
  border-radius: var(--cm-radius-l)
  background: var(--cm-surface) padding-box, var(--cm-rim) border-box
  box-shadow: var(--cm-sticker), var(--cm-glow-cyan), var(--cm-inner-glow)
.label
  margin: 0
  color: var(--cm-dim)
  font-size: var(--cm-fs-s)
  font-weight: normal
  line-height: 1.1
.levels
  display: flex
  gap: clamp(0.25rem, 1.2vmin, 0.5rem)
.level
  // Five across a 320 px phone, each still a legal touch target.
  flex: 1 1 0
  min-width: 2.5rem
  min-height: 2.5rem
  height: clamp(2.5rem, 9vmin, 3.2rem)
  padding: 0
  display: flex
  align-items: center
  justify-content: center
  box-sizing: border-box
  border: var(--cm-edge) solid var(--cm-violet)
  border-radius: var(--cm-radius-m)
  background: var(--cm-night)
  color: var(--cm-lilac)
  font: inherit
  font-size: var(--cm-fs-m)
  cursor: pointer
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  transition: background-color 110ms ease-out, border-color 110ms ease-out
  &.cleared
    border-color: var(--cm-ok)
    color: var(--cm-ok)
  &.on
    background: var(--cm-pink)
    border-color: var(--cm-pink-hi)
    color: var(--cm-ink)
    box-shadow: var(--cm-glow-pink)
  &.locked
    opacity: 0.5
    cursor: not-allowed
  &:focus-visible
    outline: var(--cm-edge) solid var(--cm-text)
    outline-offset: 0.12em
.lock
  width: 46%
  height: 46%
.record
  display: flex
  align-items: center
  justify-content: space-between
  gap: clamp(0.4rem, 2vmin, 1rem)
  min-height: clamp(1.6rem, 6vmin, 2.2rem)
.medals
  display: flex
  gap: clamp(0.25rem, 1.2vmin, 0.5rem)
.medal
  display: flex
  width: clamp(1.5rem, 6vmin, 2.2rem)
  height: clamp(1.5rem, 6vmin, 2.2rem)
  color: var(--cm-dim)
  opacity: 0.35
  &.won
    opacity: 1
    color: var(--cm-warn)
    filter: drop-shadow(0 0 0.3rem rgba(255, 210, 63, 0.7))
.best
  display: flex
  flex-direction: column
  align-items: flex-end
  line-height: 1.05
.best-label
  color: var(--cm-dim)
  font-size: var(--cm-fs-xs)
.best-value
  color: var(--cm-text)
  font-size: var(--cm-fs-m)
  font-variant-numeric: tabular-nums
</style>
