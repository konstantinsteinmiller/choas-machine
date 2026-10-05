<template lang="pug">
  //- The way back into the fortress: pick a threat level, see what has been
  //- won there, and go.
  section.deploy
    TechFrame(tone="cyan")
    //- Which fortress (#93): shown once there is a choice (a second fortress is open).
    template(v-if="openForts > 1")
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
    //- The missions as cards (jam build): the fortress in silhouette, its
    //- numeral, its name, what has been won there; locked until the one before
    //- has fallen.
    div.levels(role="radiogroup" :aria-label="t('base.threat')")
      button.level(
        v-for="n in THREAT_LEVELS"
        :key="n"
        type="button"
        role="radio"
        :aria-checked="n === flow.level"
        :aria-label="n > open ? t('base.locked', { n: n - 1 }) : `${t('base.threat')} ${n}: ${missionName(n)}`"
        :disabled="n > open"
        :class="{ on: n === flow.level, locked: n > open, cleared: clears(n) > 0 }"
        :data-testid="`level-${n}`"
        @click="pick(n)"
      )
        span.art
          MissionArt(:n="n")
        span.numeral {{ NUMERALS[n - 1] }}
        GameIcon.done(v-if="clears(n) > 0" name="check")
        span.name {{ missionName(n) }}
        span.stars
          span.star(v-for="m in MEDAL_IDS" :key="m" :class="{ won: medalWon(n, m) }")
        span.veil(v-if="n > open")
          GameIcon.lock(name="lock")
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
    //- The training ground, any time; beside it the story's scenes seen so far, to watch again (#100).
    div.extras
      FButton.train(type="ghost" size="sm" icon="replay" icon-position="left" data-testid="btn-training" @click="train") {{ t('base.training') }}
      div.story(v-if="scenes.length" role="group" :aria-label="t('base.story')")
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
import TechFrame from '@/components/atoms/TechFrame.vue'
import MissionArt from '@/components/base/MissionArt.vue'
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
const openForts = computed(() => FORTRESSES.filter(f => fortressOpen(f.id)).length)
/** The answers in force for the next raid. */
const answers = computed<AnswerId[]>(() => { const a = answersTo(profile.habits); return ANSWER_IDS.filter(id => a[id]) })
const ANSWER_ICONS: Readonly<Record<AnswerId, GameIconName>> = { helmets: 'shield', boxCheck: 'box', perchLight: 'eye' }
const clears = (n: number): number => profile.fortresses[levelKey(n, flow.fortress)]?.clears ?? 0
const record = computed(() => profile.fortresses[levelKey(flow.level, flow.fortress)])
/** A mission's name: the Bastion's three are their own fortresses; elsewhere the fortress's name. */
const missionName = (n: number): string => (flow.fortress === 'bastion' ? t(`mission.${n}`) : `${t('fortress.' + flow.fortress)} ${NUMERALS[n - 1]}`)
const medalWon = (n: number, m: (typeof MEDAL_IDS)[number]): boolean => !!profile.fortresses[levelKey(n, flow.fortress)]?.medals[m]
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
@use '@/assets/css/tech' as *
.extras
  display: flex
  flex-wrap: wrap
  align-items: center
  gap: 0.35em
  .train
    flex: 1 1 auto
.story
  display: flex
  gap: 0.25em
  flex: none
.scene
  width: 2.5rem
  height: 2.5rem
  display: flex
  align-items: center
  justify-content: center
  color: var(--cm-lilac)
  cursor: pointer
  +tech-plate(var(--cm-violet), tech-fill(var(--cm-violet), 12%), 0.4rem, var(--cm-edge), false)
  :deep(svg)
    width: 1.1em
    height: 1.1em
.learned
  display: flex
  flex-direction: column
  gap: 0.25em
  padding: 0.4em 0.6em
  font-size: var(--cm-fs-xs, 0.75em)
  +tech-plate(var(--cm-danger), tech-fill(var(--cm-danger), 10%), 0.4rem, var(--cm-edge))
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
  position: relative
  display: flex
  flex-direction: column
  gap: clamp(0.35rem, 1.6vmin, 0.7rem)
  // Room inside the border for the ornaments.
  padding: clamp(0.8rem, 3vmin, 1.3rem) clamp(0.85rem, 3.2vmin, 1.4rem)
  box-sizing: border-box
  border: var(--cm-rim-w) solid transparent
  // Machined: two corners cut, like the buttons and the mech's own panels.
  --cut: clamp(0.8rem, 3vmin, 1.4rem)
  clip-path: polygon(var(--cut) 0, 100% 0, 100% calc(100% - var(--cut)), calc(100% - var(--cut)) 100%, 0 100%, 0 var(--cut))
  // The rim runs cyan to pink, and so do its two cut edges.
  background: tech-cut-strokes(var(--cm-cyan-hi), var(--cut), var(--cm-rim-w), var(--cm-pink)), repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.025) 0 0.1em, transparent 0.1em 0.4em) padding-box, var(--cm-surface) padding-box, var(--cm-rim) border-box
  box-shadow: var(--cm-inner-glow)
  > :not(.tech-frame)
    position: relative
    z-index: 1
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
  color: var(--cm-lilac)
  font: inherit
  font-size: var(--cm-fs-s)
  cursor: pointer
  +tech-plate(var(--cm-violet), tech-fill(var(--cm-violet), 10%), 0.45rem, var(--cm-edge))
  &.on
    --plate-edge: var(--cm-cyan)
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
  gap: clamp(0.3rem, 1.4vmin, 0.6rem)
// A mission card: the picture over a name plate, a numeral badge in its cut
// corner, the medals as three pips, a lock veil while it is closed.
.level
  --edge: var(--cm-violet)
  --cut: clamp(0.5rem, 2vmin, 0.8rem)
  position: relative
  flex: 1 1 0
  min-width: 0
  min-height: 2.5rem
  aspect-ratio: 0.82
  max-height: clamp(5.6rem, 26vmin, 9.5rem)
  padding: var(--cm-edge)
  display: flex
  flex-direction: column
  box-sizing: border-box
  border: 0
  background: linear-gradient(160deg, color-mix(in srgb, var(--edge) 90%, white), var(--edge) 40%, color-mix(in srgb, var(--edge) 50%, var(--cm-ink)))
  clip-path: polygon(var(--cut) 0, 100% 0, 100% calc(100% - var(--cut)), calc(100% - var(--cut)) 100%, 0 100%, 0 var(--cut))
  color: var(--cm-lilac)
  font: inherit
  cursor: pointer
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  transition: translate 140ms ease-out, filter 140ms ease-out
  &:hover:not(.locked)
    filter: brightness(1.12)
  &.cleared
    --edge: var(--cm-ok)
  // The chosen one: pink, lifted, a scan line running down its picture.
  &.on
    --edge: var(--cm-pink)
    translate: 0 -0.18rem
    filter: drop-shadow(0 0 0.5rem rgba(255, 79, 182, 0.65))
    .art::after
      animation: card-scan 2.2s linear infinite
  &.locked
    cursor: not-allowed
  // The edge along both cuts, over the picture and the medal strip: the strip
  // runs into the bottom-right corner and would hide the card's colour there.
  &::after
    content: ''
    position: absolute
    inset: 0
    background: tech-cut-strokes(color-mix(in srgb, var(--edge) 90%, white), var(--cut), var(--cm-edge), color-mix(in srgb, var(--edge) 50%, var(--cm-ink)))
    pointer-events: none
  &:focus-visible
    outline: var(--cm-edge) solid var(--cm-text)
    outline-offset: 0.12em
.art
  position: relative
  flex: 1 1 auto
  min-height: 0
  overflow: hidden
  clip-path: polygon(calc(var(--cut) - 0.1rem) 0, 100% 0, 100% 100%, 0 100%, 0 calc(var(--cut) - 0.1rem))
  background: var(--cm-night)
  :deep(svg)
    position: absolute
    inset: 0
    width: 100%
    height: 100%
    object-fit: cover
  &::after
    content: ''
    position: absolute
    left: 0
    right: 0
    top: -30%
    height: 30%
    background: linear-gradient(180deg, transparent, rgba(77, 232, 255, 0.35), transparent)
    pointer-events: none
.numeral
  position: absolute
  top: 0
  right: 0
  min-width: 1.7em
  padding: 0.05em 0.35em 0.1em 0.55em
  clip-path: polygon(0.35em 0, 100% 0, 100% 100%, 0 100%)
  background: var(--edge)
  color: var(--cm-ink)
  font-size: var(--cm-fs-s)
  line-height: 1.2
  text-align: center
.done
  position: absolute
  top: 0.2em
  left: 0.35em
  width: 1.1em
  height: 1.1em
  color: var(--cm-ok)
  filter: drop-shadow(0 0 0.2rem var(--cm-ok))
.name
  display: block
  padding: 0.25em 0.3em 0.1em
  background: linear-gradient(180deg, #241552, #150c2b)
  color: var(--cm-text)
  font-size: var(--cm-fs-xs)
  line-height: 1.1
  text-transform: uppercase
  letter-spacing: 0.04em
  text-align: center
  overflow-wrap: anywhere
  text-wrap: balance
.stars
  display: flex
  justify-content: center
  gap: 0.25em
  padding: 0.12em 0 calc(0.25em + var(--cut) * 0.3)
  background: #150c2b
.star
  width: 0.42em
  height: 0.42em
  rotate: 45deg
  background: rgba(178, 164, 220, 0.25)
  font-size: var(--cm-fs-m)
  &.won
    background: var(--cm-warn)
    box-shadow: 0 0 0.3em var(--cm-warn)
.veil
  position: absolute
  inset: var(--cm-edge)
  display: grid
  place-items: center
  background: repeating-linear-gradient(135deg, rgba(21, 12, 43, 0.78) 0 0.5em, rgba(21, 12, 43, 0.62) 0.5em 1em)
  color: var(--cm-lilac)
  .lock
    width: 34%
    height: auto
    aspect-ratio: 1
    filter: drop-shadow(0 0 0.3rem rgba(154, 120, 255, 0.8))
@keyframes card-scan
  from
    top: -30%
  to
    top: 100%
@media (prefers-reduced-motion: reduce)
  .level.on .art::after
    animation: none
// A short screen (a phone on its side): the cards and the record lose height first.
@media (max-height: 480px)
  .deploy
    gap: 0.3rem
    padding-block: 0.6rem
  .label
    display: none
  .level
    aspect-ratio: auto
    height: clamp(3.9rem, 22vh, 5.4rem)
  // The cards carry the medals already: the record keeps only the best score.
  .record
    min-height: 0
  .medals
    display: none
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
