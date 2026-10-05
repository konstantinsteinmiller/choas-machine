<script setup lang="ts">
import GameIcon from '@/components/icons/GameIcon.vue'
import type { GameIconName } from '@/components/icons/iconNames'

export interface TabOption {
  label: string
  value: string | number
  /** A glyph from the shared set, drawn before the label. */
  icon?: GameIconName
}

interface Props {
  modelValue?: string | number
  options: TabOption[]
}

defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const selectTab = (value: string | number): void => {
  emit('update:modelValue', value)
}
</script>

<template lang="pug">
  //- The row scrolls sideways rather than wrapping: on a 320px phone with
  //- four tabs, wrapping would push the content down by a row.
  div.f-tabs(role="tablist")
    button.f-tabs__tab(
      v-for="tab in options"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.value"
      :aria-label="tab.label"
      :class="{ 'is-active': modelValue === tab.value }"
      @click="selectTab(tab.value)"
    )
      GameIcon.f-tabs__icon(v-if="tab.icon" :name="tab.icon")
      span.f-tabs__label {{ tab.label }}
</template>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.f-tabs
  display: flex
  align-items: stretch
  gap: clamp(0.2rem, 1vmin, 0.5rem)
  min-width: 0
  max-width: 100%
  // A trough the tabs sit in, sunk into the title plate.
  width: fit-content
  padding: clamp(0.15rem, 0.7vmin, 0.3rem)
  overflow-x: auto
  overflow-y: hidden
  scrollbar-width: none
  // A tab scrolled half out of view snaps back in.
  scroll-snap-type: x proximity
  +tech-plate(var(--cm-violet), linear-gradient(180deg, #1f1246, #150c2b), 0.55rem)

  &::-webkit-scrollbar
    display: none

.f-tabs__tab
  flex: 0 0 auto
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.4em
  // Floors so a tab can never render as an invisible sliver.
  min-width: 2.75rem
  min-height: 2.5rem
  padding: clamp(0.25rem, 1.2vmin, 0.5rem) clamp(0.6rem, 2.8vmin, 1.2rem)
  border: var(--cm-edge) solid transparent
  background: transparent
  color: var(--cm-dim)
  font-size: var(--cm-fs-s)
  cursor: pointer
  scroll-snap-align: center
  transition: background-color 140ms ease-out, color 140ms ease-out, border-color 140ms ease-out
  -webkit-tap-highlight-color: transparent
  +tech-cut(0.4rem)

  &:hover
    color: var(--cm-text)
    background: rgba(255, 255, 255, 0.08)

  &:focus-visible
    outline: var(--cm-edge) solid var(--cm-text)
    outline-offset: -0.2em

  // The active tab lights up in place. It does not lift or grow: nothing a
  // scrolling row could clip, and no neighbour moves when it changes.
  &.is-active
    border-color: var(--cm-cyan-hi)
    background: var(--cm-gloss), linear-gradient(180deg, var(--cm-cyan-hi), var(--cm-cyan) 70%, #2bb8d8)
    color: var(--cm-ink)
    box-shadow: 0 0 0 var(--cm-outline) var(--cm-ink), 0 0 0.7em rgba(77, 232, 255, 0.45)

    .f-tabs__label
      text-shadow: 0 0.06em 0 rgba(255, 255, 255, 0.5)

.f-tabs__label
  text-transform: uppercase
  letter-spacing: 0.04em
  white-space: nowrap
  line-height: 1.1

.f-tabs__tab .f-tabs__icon
  flex: 0 0 auto
  width: 1.2em
  height: 1.2em

// A narrow screen: only the open tab says its name, the others are their
// glyph (named for a screen reader by `aria-label`). Three long German labels
// no longer push the last tab out of sight.
@media (max-width: 560px)
  .f-tabs__tab:not(.is-active):has(.f-tabs__icon)
    padding-inline: clamp(0.5rem, 2.4vmin, 0.8rem)
    .f-tabs__label
      display: none
</style>
