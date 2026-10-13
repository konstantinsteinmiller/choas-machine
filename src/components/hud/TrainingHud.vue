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
    //- What the room's lesson wants, in words, under the replay (#193: the
    //- backstab room first; every room has one now).
    p.hint(v-if="roomHint" :data-testid="roomHint.id")
      //- The key it is done with, as this keyboard has it printed (a playtester
      //- read "place a decoy" and had no idea which key that was).
      KeyCap.hint-key(v-if="roomHint.action && hud.device === 'mouse'" :action="roomHint.action")
      span {{ t(roomHint.key) }}
    p.why(v-if="hud.training.scrapWhy") {{ t('training.scrapWhy') }}
    //- The weapons room's goal (#153): its three targets, ticked as each goes down.
    div.goal(v-if="hud.training.goalTotal" data-testid="training-goal")
      span.foes(role="img" :aria-label="t('training.goalProgress', { n: hud.training.goalDown, total: hud.training.goalTotal })")
        span.foe(v-for="n in hud.training.goalTotal" :key="n" :class="{ down: n <= hud.training.goalDown }")
          GameIcon(:name="n <= hud.training.goalDown ? 'check' : 'skull'")
      span.what {{ t('training.goal') }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import type { Action } from '@/game/engine/keyBindings'
import FHudButton from '@/components/atoms/FHudButton.vue'
import { hud } from '@/game/state/hud'
import { emit } from '@/game/bus'
import type { GameIconName } from '@/components/icons/iconNames'
import { LESSON_IDS, type LessonId } from '@/game/data/fortresses/training'

const { t } = useI18n()

/** One glyph per lesson; the pips run in the order the rooms are crossed. */
const GLYPH: Readonly<Record<LessonId, GameIconName>> = {
  move: 'mech', jump: 'up', cover: 'act-crouch', weapons: 'sniper', rocket: 'rocket', hide: 'drone', supply: 'bolt', blade: 'blade', burn: 'flame',
  decoy: 'decoy', box: 'box', hook: 'hook', rope: 'rope', salvage: 'scrap', barrel: 'warning', extract: 'play'
}
const ICONS: readonly GameIconName[] = LESSON_IDS.map(id => GLYPH[id])

const replay = (): void => emit('trainingReplay', {})
/** In the backstab room, its lesson not yet done (and not being watched). */
/** Each room's hint; the salvage room says why scrap matters instead (`scrapWhy`). */
const HINT_KEY: Readonly<Partial<Record<LessonId, string>>> = {
  move: 'training.roomHint.move', jump: 'training.roomHint.jump', cover: 'training.roomHint.cover',
  weapons: 'training.roomHint.weapons', rocket: 'training.roomHint.rocket', hide: 'training.roomHint.hide', supply: 'training.roomHint.supply',
  blade: 'training.bladeHint', burn: 'training.roomHint.burn', decoy: 'training.decoyHint', box: 'training.roomHint.box',
  hook: 'training.roomHint.hook', rope: 'training.roomHint.rope', barrel: 'training.roomHint.barrel', extract: 'training.roomHint.extract'
}
/** The rooms whose hint names one thing to do, and the key that does it (on a keyboard). */
const HINT_ACTION: Readonly<Partial<Record<LessonId, Action>>> = {
  cover: 'crouch', weapons: 'weapon2', jump: 'jump', burn: 'burn', decoy: 'decoy', box: 'hide', hook: 'grapple', rope: 'rope'
}
/** The room the mech is in, its lesson not done yet (and not being watched, #158). */
const roomHint = computed(() => {
  const i = hud.training.room
  const lesson = LESSON_IDS[i]
  if (!lesson || hud.training.done > i || hud.training.watching) return null
  const key = HINT_KEY[lesson]
  return key ? { key, id: `${lesson}-hint`, action: HINT_ACTION[lesson] } : null
})
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
  // Under the unit frame's width on a landscape phone, in one row: the hint
  // sits beside it, top centre, and a second row pushed the goal onto the aim button.
  @media (orientation: landscape) and (max-height: 500px)
    max-width: 12.5rem
    flex-wrap: nowrap
    gap: 0.1rem
    padding: 0.2em 0.3em
    .pip
      width: 0.62rem
      height: 0.62rem
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
.hint-key
  margin-inline-end: 0.45em
  vertical-align: middle
.why, .hint
  max-width: min(26rem, 80vw)
  margin: 0
  padding: 0.35em 0.8em
  color: #ffd27a
  font-size: var(--cm-fs-s)
  text-align: start
  text-shadow: var(--cm-text-outline)
  +tech-plate(var(--cm-violet), tech-fill(var(--cm-violet), 14%), 0.5rem)
.hint
  // Half the old width on a phone (80vw): a long lesson stretched across most of the screen.
  // Never under 9.5rem, so a narrow portrait screen still fits a few words a line.
  max-width: max(9.5rem, min(20rem, 40vw))
  // A landscape phone has room for two lines over the aim button, and a
  // lesson with its noise sentence takes four in Greek: the hint goes up to
  // the top centre there, between the unit frame and the buttons on the right.
  @media (orientation: landscape) and (max-height: 500px)
    position: fixed
    top: var(--cm-safe-top)
    left: 50%
    translate: -50% 0
    width: max-content
    max-width: min(46vw, calc(100vw - 27rem))
    z-index: 2
</style>
