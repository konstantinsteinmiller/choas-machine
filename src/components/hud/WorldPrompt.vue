<template lang="pug">
  //- What a key does right here (#83): over the pile, the body, the beacon,
  //- the wall top. Pinned by a HUD ticker as the camera moves; the key is the
  //- player's own binding, lettered as on their keyboard.
  div.world-prompt(ref="el" :class="`k-${hud.prompt}`" aria-hidden="true")
    KeyCap.key(v-if="hud.device === 'mouse' && hud.prompt" :action="hud.prompt === 'hook' ? 'grapple' : 'act'")
    span.label(v-if="hud.prompt") {{ t(`prompt.${hud.prompt}`) }}
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import { addHudTicker, hud, prompt } from '@/game/state/hud'

const { t } = useI18n()
const el = ref<HTMLElement | null>(null)
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
    e.style.left = `${(prompt.x * 100).toFixed(2)}%`
    e.style.top = `${(prompt.y * 100).toFixed(2)}%`
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.world-prompt
  position: absolute
  display: flex
  align-items: center
  gap: 0.35em
  opacity: 0
  translate: -50% -100%
  transition: opacity 160ms ease-out
  padding: 0.2em 0.6em 0.2em 0.25em
  border: var(--cm-edge) solid var(--cm-cyan)
  border-radius: 999px
  background: var(--cm-gloss), var(--cm-surface-soft)
  box-shadow: var(--cm-sticker)
  color: var(--cm-text)
  font-size: var(--cm-fs-s)
  white-space: nowrap
  pointer-events: none
  // The kind as a prefixed class: a bare `strike` would also match the HUD's own chip rules.
  &.k-salvage
    border-color: var(--cm-warn)
  &.k-sabotage, &.k-cutPower, &.k-jam
    border-color: var(--cm-danger)
  &.k-strike
    border-color: var(--cm-pink)
.key
  min-width: 1.6rem
  height: 1.6rem
  font-size: var(--cm-fs-s)
.label
  padding-left: 0.15em
</style>
