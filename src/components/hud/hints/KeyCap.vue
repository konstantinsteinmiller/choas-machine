<template lang="pug">
  //- One key, lettered as it is on THIS player's keyboard.
  span.key-cap(:class="{ wide: label.length > 1 }") {{ label }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { primaryCode, type Action } from '@/game/engine/keyBindings'
import { keyLabel } from '@/game/engine/keyLabels'

/** Either an action (its bound key is shown) or a physical key code. */
const props = defineProps<{ action?: Action; code?: string }>()
const label = computed(() => keyLabel(props.code ?? (props.action ? primaryCode(props.action) : '')))
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
