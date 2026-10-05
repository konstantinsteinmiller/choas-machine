<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted, useId } from 'vue'
import GameIcon from '@/components/icons/GameIcon.vue'

interface Option {
  value: string | number
  label: string
  /** The label's own language (a language picker's autonyms): its font
   *  fallback and its uppercasing follow it, not the UI's language. */
  lang?: string
}

interface Props {
  modelValue: string | number
  options: Option[]
  label?: string
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const trigger = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const listId = useId()

const selected = computed(() => props.options.find(opt => opt.value === props.modelValue))

/**
 * The menu is teleported to <body> and placed with `position: fixed` from the
 * trigger's own box. Inside a modal the list used to be clipped by the
 * modal's scroll container, and each caller stacked z-index wrappers around
 * it. A fixed menu belongs to no scroll container, so it cannot be clipped,
 * and it opens upward when there is more room above than below.
 */
const place = ref({ left: '0px', top: '0px', width: '0px', maxHeight: '0px' })
const GAP = 6
const position = (): void => {
  const el = trigger.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const below = window.innerHeight - r.bottom - GAP * 2
  const above = r.top - GAP * 2
  const up = below < 160 && above > below
  const room = Math.max(96, up ? above : below)
  const height = Math.min(room, menu.value?.scrollHeight ?? room)
  place.value = {
    left: `${Math.round(r.left)}px`,
    top: `${Math.round(up ? r.top - GAP - height : r.bottom + GAP)}px`,
    width: `${Math.round(r.width)}px`,
    maxHeight: `${Math.round(room)}px`
  }
}

const close = (): void => {
  if (!isOpen.value) return
  isOpen.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('scroll', onScroll, true)
}

const onOutside = (e: Event): void => {
  const target = e.target as Node
  if (trigger.value?.contains(target) || menu.value?.contains(target)) return
  close()
}
/** The page behind moved (the modal scrolled): the menu would be left
 *  hanging in mid-air, so it closes. Scrolling the list itself is fine. */
const onScroll = (e: Event): void => {
  if (menu.value?.contains(e.target as Node)) return
  close()
}

const open = async (): Promise<void> => {
  isOpen.value = true
  position()
  await nextTick()
  // Again, now that the list is rendered and its real height is known.
  position()
  document.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('resize', close)
  window.addEventListener('scroll', onScroll, true)
}

const toggle = (): void => { if (isOpen.value) close(); else void open() }

const selectOption = (value: string | number): void => {
  emit('update:modelValue', value)
  close()
}

const onKey = (e: KeyboardEvent): void => {
  if (e.code === 'Escape' && isOpen.value) {
    e.stopPropagation()
    close()
  }
}

onUnmounted(close)
</script>

<template lang="pug">
  div.f-select
    div.f-select__label(v-if="label") {{ label }}

    button.f-select__trigger(
      ref="trigger"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-controls="listId"
      :aria-label="label"
      :class="{ 'is-open': isOpen }"
      @click="toggle"
      @keydown="onKey"
    )
      span.f-select__value(:lang="selected?.lang") {{ selected?.label ?? '' }}
      GameIcon.f-select__caret(name="down")

    Teleport(to="body")
      Transition(name="f-select-pop")
        ul.f-select__menu(
          v-if="isOpen"
          :id="listId"
          ref="menu"
          role="listbox"
          :style="place"
        )
          li.f-select__option(
            v-for="option in options"
            :key="option.value"
            role="option"
            :aria-selected="modelValue === option.value"
            :class="{ 'is-selected': modelValue === option.value }"
            :lang="option.lang"
            @click="selectOption(option.value)"
          ) {{ option.label }}
</template>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.f-select
  display: flex
  flex-direction: column
  gap: 0.3em
  width: 100%
  min-width: 0
  font-size: var(--cm-fs-m)

.f-select__label
  color: var(--cm-dim)
  font-size: var(--cm-fs-s)
  text-transform: uppercase
  letter-spacing: 0.05em

.f-select__trigger
  display: flex
  align-items: center
  justify-content: space-between
  gap: 0.6em
  width: 100%
  min-width: 0
  // The touch floor, in every layout.
  min-height: 2.75rem
  padding: clamp(0.35rem, 1.6vmin, 0.7rem) clamp(0.6rem, 2.6vmin, 1.1rem)
  color: var(--cm-text)
  font-size: inherit
  cursor: pointer
  -webkit-tap-highlight-color: transparent
  transition: background-color 120ms ease-out, box-shadow 120ms ease-out
  +tech-plate(var(--cm-cyan), tech-fill(var(--cm-cyan), 10%), 0.45rem)

  &:hover, &.is-open
    --plate-fill: #{tech-fill(var(--cm-cyan), 24%)}
    box-shadow: var(--cm-glow-cyan)

  &:focus-visible
    outline: var(--cm-edge) solid var(--cm-text)
    outline-offset: 0.15em

.f-select__value
  min-width: 0
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
  text-transform: uppercase
  letter-spacing: 0.03em

// Nested to outrank `GameIcon`'s own `.game-icon` rule (same specificity as a
// flat class selector; the bundler's emit order would decide a tie).
.f-select__trigger .f-select__caret
  flex: 0 0 auto
  width: 1.1em
  height: 1.1em
  color: var(--cm-cyan)
  transition: transform 160ms ease-out

.f-select__trigger.is-open .f-select__caret
  transform: rotate(180deg)

.f-select__menu
  position: fixed
  // Over the modal that holds the trigger (z 110), under the splash.
  z-index: 130
  box-sizing: border-box
  margin: 0
  padding: 0.3em
  list-style: none
  overflow-y: auto
  overscroll-behavior: contain
  touch-action: pan-y
  color: var(--cm-text)
  font-size: var(--cm-fs-m)
  scrollbar-width: thin
  scrollbar-color: var(--cm-cyan) transparent
  +tech-plate(var(--cm-cyan), var(--cm-surface), 0.45rem)

.f-select__option
  display: flex
  align-items: center
  min-height: 2.5rem
  padding: 0.3em 0.7em
  cursor: pointer
  text-transform: uppercase
  letter-spacing: 0.03em
  overflow-wrap: anywhere
  +tech-cut(0.3rem)

  &:hover
    background: rgba(77, 232, 255, 0.16)

  &.is-selected
    background: var(--cm-pink)
    text-shadow: var(--cm-text-outline)

.f-select-pop-enter-active, .f-select-pop-leave-active
  transition: opacity 110ms ease-out

.f-select-pop-enter-from, .f-select-pop-leave-to
  opacity: 0
</style>
