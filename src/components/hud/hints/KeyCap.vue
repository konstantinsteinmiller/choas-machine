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
.key-cap
  display: inline-flex
  align-items: center
  justify-content: center
  box-sizing: border-box
  min-width: clamp(1.7rem, 6.4vmin, 2.5rem)
  height: clamp(1.7rem, 6.4vmin, 2.5rem)
  padding: 0 0.35em
  border: var(--cm-edge) solid var(--cm-cyan)
  border-bottom-width: calc(var(--cm-edge) * 2.4)
  border-radius: var(--cm-radius-s)
  background: var(--cm-glass)
  color: var(--cm-text)
  font-size: var(--cm-fs-m)
  line-height: 1
  text-transform: uppercase
  white-space: nowrap
  &.wide
    font-size: var(--cm-fs-xs)
</style>
