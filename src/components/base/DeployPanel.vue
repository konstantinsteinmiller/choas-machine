<template lang="pug">
  //- The way back into the fortress: pick a threat level, see what has been
  //- won there, and go.
  section.deploy
    //- Which fortress (#93): the next opens once the one before has fallen at its threat.
    template(v-if="FORTRESSES.length > 1")
      h2.label {{ t('base.fortress') }}
      div.forts(role="radiogroup" :aria-label="t('base.fortress')")
        button.fort(
          v-for="f in FORTRESSES"
          :key="f.id"
          type="button"
          role="radio"
          :aria-checked="f.id === flow.fortress"
          :disabled="!fortressOpen(f.id)"
          :class="{ on: f.id === flow.fortress, locked: !fortressOpen(f.id) }"
          :title="fortTitle(f)"
          :data-testid="`fort-${f.id}`"
          @click="pickFort(f.id)"
        )
          GameIcon.lock(v-if="!fortressOpen(f.id)" name="lock")
          span.fort-name {{ t('fortress.' + f.id) }}
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
    //- What the base learned from the last raid, and will do about it (R26).
    div.learned(v-if="answers.length" data-testid="learned")
      span.learned-label {{ t('base.learned') }}
      span.answer(v-for="a in answers" :key="a")
        GameIcon(:name="ANSWER_ICONS[a]")
        | {{ t(`base.answer.${a}`) }}
    FButton.go(size="xl" icon="play" block attention data-testid="btn-deploy" @click="deploy") {{ t('base.deploy') }}
    //- The training ground, any time.
    FButton.train(type="ghost" size="sm" icon="replay" icon-position="left" data-testid="btn-training" @click="train") {{ t('base.training') }}
    //- The story's scenes seen so far, to watch again (#100).
    div.story(v-if="scenes.length" role="group" :aria-label="t('base.story')")
      span.story-label {{ t('base.story') }}
      button.scene(
        v-for="id in scenes"
        :key="id"
        type="button"
        :title="t('cine.' + id)"
        :aria-label="t('cine.' + id)"
        :data-testid="'scene-' + id"
        @click="watch(id)"
      )
        GameIcon(name="play")
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { flow, playCinema, startMission, startTraining } from '@/game/flow'
import { CINEMA_IDS, seenKey, type CinemaId } from '@/game/story/cinemaIds'
import { profile } from '@/game/state/profile'
import { fortressOpen, levelKey, unlockedLevel } from '@/game/state/progress'
import { FORTRESSES, type FortressId, type FortressMeta } from '@/game/data/fortresses/registry'
import { THREAT_LEVELS } from '@/game/sim/rewards'
import { MEDAL_IDS } from '@/game/data/ids'
import { MEDAL_ICONS } from '@/components/base/medals'
import { sfx } from '@/game/audio/sfx'
import { formatAmount } from '@/utils/formatAmount'
import { ANSWER_IDS, answersTo, type AnswerId } from '@/game/sim/adapt'
import type { GameIconName } from '@/components/icons/iconNames'

const { t, locale } = useI18n()
/** The numerals on the chips are marks, not words: the same in every language. */
const NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const

const open = computed(() => unlockedLevel(flow.fortress))
/** The answers in force for the next raid. */
const answers = computed<AnswerId[]>(() => { const a = answersTo(profile.habits); return ANSWER_IDS.filter(id => a[id]) })
const ANSWER_ICONS: Readonly<Record<AnswerId, GameIconName>> = { helmets: 'shield', boxCheck: 'box', perchLight: 'eye' }
const clears = (n: number): number => profile.fortresses[levelKey(n, flow.fortress)]?.clears ?? 0
const record = computed(() => profile.fortresses[levelKey(flow.level, flow.fortress)])
const fmt = (n: number): string => formatAmount(n, locale.value)

const pick = (n: number): void => {
  if (n > open.value || n === flow.level) return
  sfx('uiClick')
  flow.level = n
}
/** A fortress chip's tooltip: its name, or what opens it. */
const fortTitle = (f: FortressMeta): string => {
  const name = t('fortress.' + f.id)
  if (fortressOpen(f.id) || !f.unlock) return name
  return t('base.fortressLocked', { name: t('fortress.' + f.unlock.after), n: NUMERALS[f.unlock.threat - 1] })
}
const pickFort = (id: FortressId): void => {
  if (!fortressOpen(id) || id === flow.fortress) return
  sfx('uiClick')
  flow.fortress = id
  flow.level = unlockedLevel(id)
}
const deploy = (): void => { void startMission(flow.level) }
/** The scenes already seen, in story order. */
const scenes = computed<CinemaId[]>(() => CINEMA_IDS.filter(id => profile.seen.includes(seenKey(id))))
const watch = (id: CinemaId): void => { sfx('uiClick'); void playCinema(id) }
const train = (): void => { void startTraining() }
</script>

<style scoped lang="sass">
.story
  display: flex
  align-items: center
  gap: 0.35em
  flex-wrap: wrap
.story-label
  color: var(--cm-dim)
  font-size: var(--cm-fs-xs, 0.75em)
.scene
  width: 2.5rem
  height: 2.5rem
  display: flex
  align-items: center
  justify-content: center
  border: var(--cm-edge) solid var(--cm-violet)
  border-radius: var(--cm-radius-m)
  background: var(--cm-night)
  color: var(--cm-lilac)
  cursor: pointer
  :deep(svg)
    width: 1.1em
    height: 1.1em
.learned
  display: flex
  flex-direction: column
  gap: 0.25em
  padding: 0.4em 0.6em
  border-radius: 0.6em
  background: rgba(255, 64, 96, 0.12)
  font-size: var(--cm-fs-xs, 0.75em)
.learned-label
  color: #ff8aa0
  text-transform: uppercase
  letter-spacing: 0.04em
.answer
  display: flex
  align-items: center
  gap: 0.4em
  :deep(svg)
    width: 1.1em
    height: 1.1em
    flex: none
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
.forts
  display: flex
  gap: clamp(0.25rem, 1.2vmin, 0.5rem)
.fort
  flex: 1 1 0
  min-height: 2.5rem
  padding: 0 0.5em
  display: flex
  align-items: center
  justify-content: center
  gap: 0.35em
  box-sizing: border-box
  border: var(--cm-edge) solid var(--cm-violet)
  border-radius: var(--cm-radius-m)
  background: var(--cm-night)
  color: var(--cm-lilac)
  font: inherit
  font-size: var(--cm-fs-s)
  cursor: pointer
  &.on
    border-color: var(--cm-cyan)
    color: var(--cm-white, #fff)
    box-shadow: var(--cm-glow-cyan)
  &.locked
    opacity: 0.55
    cursor: default
  .lock
    width: 1em
    height: 1em
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
