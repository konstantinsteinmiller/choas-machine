<template lang="pug">
  //- What a key does right here (#83): over the pile, the body, the beacon,
  //- the wall top. Pinned by a HUD ticker as the camera moves; the key is the
  //- player's own binding, lettered as on their keyboard.
  div.world-prompt(ref="el" aria-hidden="true")
    div.chip(v-for="k in kinds" :key="k" :class="`k-${k}`")
      KeyCap.key(v-if="hud.device === 'mouse'" :action="keyFor(k)")
      span.label {{ t(`prompt.${k}`) }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import { addHudTicker, hud, prompt, type PromptKind } from '@/game/state/hud'
import type { Action } from '@/game/engine/keyBindings'

const { t } = useI18n()
/** The key that does what the prompt offers: the hook, a rope, a body to drag, else the act key (E). */
const keyFor = (kind: PromptKind): Action =>
  kind === 'hook' ? 'grapple' : kind === 'rope' ? 'rope' : kind === 'grab' || kind === 'drop' ? 'drag' : 'act'
const el = ref<HTMLElement | null>(null)
/** What is on offer here: one key, or two (the hook and the rope). */
const kinds = computed<PromptKind[]>(() => [hud.prompt, hud.prompt2].filter((k): k is PromptKind => !!k))
let off: (() => void) | null = null

onMounted(() => {
  let shown = false
  off = addHudTicker(() => {
    const e = el.value
    if (!e) return
    if (prompt.on !== shown) {
      shown = prompt.on
      e.style.opacity = shown ? '1' : '0'
    }
    if (!shown) return
    e.classList.toggle('far', prompt.far)
    e.style.left = `${(prompt.x * 100).toFixed(2)}%`
    e.style.top = `${(prompt.y * 100).toFixed(2)}%`
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.world-prompt
  position: absolute
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.3em
  opacity: 0
  translate: -50% -100%
  transition: opacity 160ms ease-out
  pointer-events: none
// Seen, not yet in reach: dimmed, and the key not lit.
.world-prompt.far
  filter: saturate(0.6) brightness(0.85)
  .chip
    opacity: 0.75
.chip
  display: flex
  align-items: center
  gap: 0.35em
  padding: 0.2em 0.6em 0.2em 0.25em
  +tech-plate(var(--cm-cyan), tech-fill(var(--cm-cyan), 12%), 0.45rem, var(--cm-edge))
  color: var(--cm-text)
  font-size: var(--cm-fs-s)
  white-space: nowrap
  // The kind as a prefixed class: a bare `strike` would also match the HUD's own chip rules.
  &.k-salvage
    --plate-edge: var(--cm-warn)
  &.k-sabotage, &.k-cutPower, &.k-jam
    --plate-edge: var(--cm-danger)
  &.k-strike
    --plate-edge: var(--cm-pink)
.key
  min-width: 1.6rem
  height: 1.6rem
  font-size: var(--cm-fs-s)
.label
  padding-left: 0.15em
</style>
