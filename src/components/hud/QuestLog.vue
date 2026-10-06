<template lang="pug">
  //- The raid's quick quest log (#145), on the right edge like an RPG's: the
  //- salvage still to strip, then the way out. Each line ticks when it is done;
  //- the next one is lit, the one after it waits dim.
  div.quest-log(data-testid="quest-log" role="list" :aria-label="t('hud.questLog')")
    div.line(
      v-if="hud.salvageNeed > 0"
      role="listitem"
      :class="{ done: salvaged, now: !salvaged }"
      :aria-label="t('hud.haul', { n: hud.salvageGot, need: hud.salvageNeed })"
      data-testid="haul"
    )
      span.box(aria-hidden="true")
        GameIcon(v-if="salvaged" name="check")
      GameIcon.glyph(name="scrap")
      span.label {{ t('hud.objective.salvage') }}
      span.count {{ hud.salvageGot }}/{{ hud.salvageNeed }}
    div.line(
      role="listitem"
      :class="{ done: hud.objective === 'done', now: hud.objective === 'extract', wait: hud.objective === 'salvage' }"
      :aria-label="t('hud.quest.extract')"
      data-testid="quest-extract"
    )
      span.box(aria-hidden="true")
        GameIcon(v-if="hud.objective === 'done'" name="check")
      GameIcon.glyph(name="up")
      span.label {{ t('hud.quest.extract') }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { hud } from '@/game/state/hud'

const { t } = useI18n()
const salvaged = computed(() => hud.salvageGot >= hud.salvageNeed)
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.quest-log
  display: flex
  flex-direction: column
  gap: 0.2em
  min-width: 8.5em
  max-width: 13em
  padding: 0.35em 0.7em 0.35em 0.9em
  font-size: var(--cm-fs-s)
  color: var(--cm-text, #f6f1ff)
  pointer-events: none
  +tech-plate(var(--cm-warn), tech-fill(var(--cm-warn), 8%), 0.6rem)
.line
  display: flex
  align-items: center
  gap: 0.35em
  line-height: 1.25
  text-shadow: var(--cm-text-outline)
  transition: opacity 200ms ease-out, color 200ms ease-out
  &.now
    color: #ffe9a8
  &.wait
    opacity: 0.5
  &.done
    color: var(--cm-ok)
    .label
      text-decoration: line-through
      text-decoration-thickness: 0.08em
.box
  flex: none
  display: grid
  place-items: center
  width: 0.95em
  height: 0.95em
  box-sizing: border-box
  border: 0.1em solid currentColor
  :deep(svg)
    width: 0.8em
    height: 0.8em
.glyph
  flex: none
  width: 1.1em
  height: 1.1em
.label
  flex: 1
  min-width: 0
  overflow-wrap: anywhere
.count
  flex: none
  font-variant-numeric: tabular-nums
  font-weight: 700
</style>
