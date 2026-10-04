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
      :aria-label="t('training.replay')"
      data-testid="btn-demo"
      @click="replay"
    )
    p.why(v-if="hud.training.scrapWhy") {{ t('training.scrapWhy') }}
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
  move: 'mech', jump: 'up', cover: 'crouch', weapons: 'sniper', supply: 'bolt', blade: 'blade', burn: 'flame',
  decoy: 'decoy', box: 'box', hook: 'hook', rope: 'rope', beacon: 'siren', salvage: 'scrap', extract: 'play'
}
const ICONS: readonly GameIconName[] = LESSON_IDS.map(id => GLYPH[id])

const replay = (): void => emit('trainingReplay', {})
</script>

<style scoped lang="sass">
.training-hud
  // Hung under the top-centre column, out of its flow: the meter and the
  // haul keep their own width however wide this row is.
  position: absolute
  top: 100%
  left: 50%
  translate: -50% 0
  margin-top: clamp(0.25rem, 1.2vmin, 0.5rem)
  display: flex
  flex-direction: column
  align-items: center
  gap: clamp(0.25rem, 1.2vmin, 0.5rem)
  width: max-content
  pointer-events: none
.pips
  display: flex
  gap: clamp(0.15rem, 0.8vmin, 0.35rem)
  padding: 0.25em 0.5em
  border-radius: 999px
  background: rgba(21, 12, 43, 0.55)
.pip
  display: grid
  place-items: center
  width: clamp(0.85rem, 3.4vmin, 1.6rem)
  height: clamp(0.85rem, 3.4vmin, 1.6rem)
  border-radius: 50%
  color: var(--cm-dim)
  opacity: 0.55
  :deep(svg)
    width: 70%
    height: 70%
  &.done
    color: var(--cm-ok, #7dffb0)
    opacity: 1
  &.here
    color: #5fe9ff
    opacity: 1
    box-shadow: 0 0 0 2px rgba(95, 233, 255, 0.8)
.replay
  pointer-events: auto
.why
  max-width: min(26rem, 80vw)
  margin: 0
  padding: 0.35em 0.8em
  border-radius: 0.6em
  background: rgba(21, 12, 43, 0.7)
  color: #ffd27a
  font-size: var(--cm-fs-s)
  text-align: center
  text-shadow: var(--cm-text-outline)
</style>
