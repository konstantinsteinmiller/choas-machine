<template lang="pug">
  //- One key, lettered as it is on THIS player's keyboard.
  //- Which physical key it means, for the layout playtest (`data-code`).
  span.key-cap(:class="{ wide: label.length > 1 }" :data-code="code" :data-action="action") {{ label }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { primaryCode, type Action } from '@/game/engine/keyBindings'
import { keyLabel } from '@/game/engine/keyLabels'

/** Either an action (its bound key is shown) or a physical key code. */
const props = defineProps<{ action?: Action; code?: string }>()
/**
 * Tab carries its word beside its arrow: far more players know the key as
 * "Tab" than by the ⇥ printed on it (the weapons room's "⇥ / wheel" read as a
 * bare arrow).
 */
const code = computed(() => props.code ?? (props.action ? primaryCode(props.action) : ''))
const label = computed(() => (code.value === 'Tab' ? `${keyLabel(code.value)} Tab` : keyLabel(code.value)))
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.key-cap
  display: inline-flex
  align-items: center
  justify-content: center
  box-sizing: border-box
  min-width: clamp(1.7rem, 6.4vmin, 2.5rem)
  height: clamp(1.7rem, 6.4vmin, 2.5rem)
  padding: 0 0.35em
  border-bottom-width: calc(var(--cm-edge) * 2.6)
  color: var(--cm-text)
  font-size: var(--cm-fs-m)
  line-height: 1
  text-transform: uppercase
  white-space: nowrap
  +tech-plate(var(--cm-cyan), linear-gradient(180deg, #4a3590, #2a1a5e), 0.32rem, var(--cm-edge), false)
  &.wide
    font-size: var(--cm-fs-xs)
</style>
