<template lang="pug">
  //- The training ground: a pip per room (done, here, ahead), the demo once
  //- more on a tap while the lesson is not done, and the one line of words.
  div.training-hud(v-if="hud.training.on" data-testid="training")
    div.pips(role="img" :aria-label="t('training.progress', { n: hud.training.done, total: hud.training.total })")
      span.pip(
        v-for="(icon, n) in ICONS"
        :key="n"
        :class="{ done: n < hud.training.done, here: n === hud.training.room }"
      )
        GameIcon(:name="n < hud.training.done ? 'check' : icon")
    FHudButton.replay(
      v-if="hud.training.replay"
      icon="replay"
      tone="cyan"
      :hotkey="hud.device === 'mouse' ? 'replay' : undefined"
      :aria-label="t('training.replay')"
      data-testid="btn-demo"
      @click="replay"
    )
    p.why(v-if="hud.training.scrapWhy") {{ t('training.scrapWhy') }}
    //- The weapons room's goal (#153): its three targets, ticked as each goes down.
    div.goal(v-if="hud.training.goalTotal" data-testid="training-goal")
      span.foes(role="img" :aria-label="t('training.goalProgress', { n: hud.training.goalDown, total: hud.training.goalTotal })")
        span.foe(v-for="n in hud.training.goalTotal" :key="n" :class="{ down: n <= hud.training.goalDown }")
          GameIcon(:name="n <= hud.training.goalDown ? 'check' : 'skull'")
      span.what {{ t('training.goal') }}
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import FHudButton from '@/components/atoms/FHudButton.vue'
import { hud } from '@/game/state/hud'
import { emit } from '@/game/bus'
import type { GameIconName } from '@/components/icons/iconNames'
import { LESSON_IDS, type LessonId } from '@/game/data/fortresses/training'

const { t } = useI18n()

/** One glyph per lesson; the pips run in the order the rooms are crossed. */
const GLYPH: Readonly<Record<LessonId, GameIconName>> = {
  move: 'mech', jump: 'up', cover: 'crouch', weapons: 'sniper', rocket: 'rocket', supply: 'bolt', blade: 'blade', burn: 'flame',
  decoy: 'decoy', box: 'box', hook: 'hook', rope: 'rope', salvage: 'scrap', extract: 'play'
}
const ICONS: readonly GameIconName[] = LESSON_IDS.map(id => GLYPH[id])

const replay = (): void => emit('trainingReplay', {})
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.training-hud
  // Under the unit frame (#145), left-aligned like a quest's steps.
  display: flex
  flex-direction: column
  align-items: flex-start
  gap: clamp(0.25rem, 1.2vmin, 0.5rem)
  width: max-content
  pointer-events: none
.pips
  display: flex
  flex-wrap: wrap
  max-width: min(22rem, calc(100vw - 2 * var(--cm-safe-left)))
  gap: clamp(0.15rem, 0.8vmin, 0.35rem)
  padding: 0.25em 0.5em
.pip
  display: grid
  place-items: center
  width: clamp(0.85rem, 3.4vmin, 1.6rem)
  height: clamp(0.85rem, 3.4vmin, 1.6rem)
  color: var(--cm-dim)
  opacity: 0.55
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)
  :deep(svg)
    width: 70%
    height: 70%
  &.done
    color: var(--cm-ok, #7dffb0)
    opacity: 1
  &.here
    color: #5fe9ff
    opacity: 1
    +tech-hex(rgba(95, 233, 255, 0.85), transparent, 2px)
.replay
  pointer-events: auto
.goal
  display: flex
  align-items: center
  gap: 0.5em
  padding: 0.3em 0.8em
  color: #ffd27a
  font-size: var(--cm-fs-s)
  font-weight: 700
  text-shadow: var(--cm-text-outline)
  +tech-plate(var(--cm-violet), tech-fill(var(--cm-violet), 14%), 0.5rem)
.foes
  display: flex
  gap: 0.2em
.foe
  display: grid
  place-items: center
  width: clamp(1rem, 3.8vmin, 1.5rem)
  height: clamp(1rem, 3.8vmin, 1.5rem)
  color: #ff7a9c
  :deep(svg)
    width: 85%
    height: 85%
  &.down
    color: var(--cm-ok, #7dffb0)
.why
  max-width: min(26rem, 80vw)
  margin: 0
  padding: 0.35em 0.8em
  color: #ffd27a
  font-size: var(--cm-fs-s)
  text-align: start
  text-shadow: var(--cm-text-outline)
  +tech-plate(var(--cm-violet), tech-fill(var(--cm-violet), 14%), 0.5rem)
</style>
