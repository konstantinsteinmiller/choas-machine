<script setup lang="ts">
import { watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import FTabs, { type TabOption } from '@/components/atoms/FTabs.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { sfx } from '@/game/audio/sfx'
import { acquireModalOpen } from '@/use/useModalState'

const { t } = useI18n()

interface Props {
  modelValue: boolean | any
  title?: string
  isClosable?: boolean
  tabs?: TabOption[]
  activeTab?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  isClosable: true,
  tabs: () => []
})

const emit = defineEmits(['update:modelValue', 'update:activeTab'])

// Root is a <Teleport>, so class/style passed by parents can't auto-inherit and
// Vue warns about extraneous attrs. Opt out and forward $attrs explicitly.
defineOptions({ inheritAttrs: false })

/**
 * ─── Layout: three rows, and only the middle one scrolls ────────────────────
 *
 * The panel is a grid: header / content / footer. The header (title or tabs,
 * and the close button) and the footer are rows of their own, so:
 *
 *   • content can never sit under the header, at rest or scrolled: the header
 *     is not an overlay, and the scroll container starts below it;
 *   • the close button is IN the header row, beside the title or the tabs,
 *     so it cannot cover them at any width;
 *   • the content row keeps a minimum height, so a short screen shrinks the
 *     panel's margins before it squeezes the content to nothing.
 */

// ─── Modal-open signal (portal gameplayStop/Start, pause gate) ───────────────
// Centralised here so every FModal consumer participates without per-modal
// wiring. Refcounted; held once per open, dropped on close or unmount.
let releaseModalOpen: (() => void) | null = null
const markOpen = (): void => { if (!releaseModalOpen) releaseModalOpen = acquireModalOpen() }
const markClosed = (): void => { releaseModalOpen?.(); releaseModalOpen = null }

watch(() => props.modelValue, (open, prev) => {
  if (open && !prev) sfx('uiOpen')
  else if (!open && prev) sfx('uiClose')
  if (open) markOpen()
  else markClosed()
})

const close = (): void => emit('update:modelValue', false)
const handleTabChange = (val: string | number): void => emit('update:activeTab', val)

const onKey = (e: KeyboardEvent): void => {
  if (e.code === 'Escape' && props.modelValue && props.isClosable) {
    e.stopPropagation()
    close()
  }
}

onMounted(() => {
  if (props.modelValue) markOpen()
  window.addEventListener('keydown', onKey, true)
})
onUnmounted(() => {
  markClosed()
  window.removeEventListener('keydown', onKey, true)
})
</script>

<template lang="pug">
  //- Teleport to body so `position: fixed` isn't trapped by an ancestor
  //- transform, which would promote that ancestor to a containing block.
  Teleport(to="body")
    Transition(name="f-modal")
      div.f-modal(
        v-if="modelValue"
        v-bind="$attrs"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      )
        div.f-modal__backdrop(@click="isClosable && close()")

        div.f-modal__panel
          header.f-modal__header(v-if="(tabs && tabs.length > 0) || title || isClosable")
            FTabs.f-modal__tabs(
              v-if="tabs && tabs.length > 0"
              :model-value="activeTab"
              :options="tabs"
              @update:model-value="handleTabChange"
            )
            h2.f-modal__title(v-else-if="title") {{ title }}
            span.f-modal__spacer(v-else)
            button.f-modal__close(
              v-if="isClosable"
              type="button"
              :aria-label="t('close')"
              @click="close"
            )
              GameIcon.f-modal__close-icon(name="close")

          div.f-modal__content
            slot

          footer.f-modal__footer(v-if="$slots.footer")
            slot(name="footer")
</template>

<style scoped lang="sass">
.f-modal
  position: fixed
  inset: 0
  // Above the HUD and the rewards screen, below the splash.
  z-index: 110
  display: flex
  align-items: center
  justify-content: center
  padding: var(--cm-safe-top) var(--cm-safe-right) var(--cm-safe-bottom) var(--cm-safe-left)

.f-modal__backdrop
  position: absolute
  inset: 0
  background: rgba(10, 5, 24, 0.72)

.f-modal__panel
  position: relative
  display: grid
  grid-template-rows: auto minmax(0, 1fr) auto
  width: 100%
  max-width: min(42rem, 100%)
  max-height: 100%
  border: var(--cm-edge) solid var(--cm-cyan)
  border-radius: var(--cm-radius-l)
  background: var(--cm-glass)
  // The hologram: a cyan rim light outside, a faint pink wash inside.
  box-shadow: var(--cm-glow-cyan), inset 0 0 2.5em rgba(255, 79, 182, 0.12)
  color: var(--cm-text)
  overflow: hidden

  // Scan lines over the whole panel, under the content.
  &::before
    content: ''
    position: absolute
    inset: 0
    background-image: repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 4px)
    pointer-events: none

.f-modal__header
  position: relative
  display: flex
  align-items: center
  gap: clamp(0.4rem, 2vmin, 0.9rem)
  min-width: 0
  padding: clamp(0.4rem, 1.8vmin, 0.8rem) clamp(0.5rem, 2.4vmin, 1.1rem)
  border-bottom: var(--cm-edge) solid rgba(77, 232, 255, 0.35)
  background: linear-gradient(to right, rgba(255, 79, 182, 0.22), rgba(77, 232, 255, 0.1))

.f-modal__tabs, .f-modal__title, .f-modal__spacer
  flex: 1 1 auto
  min-width: 0

.f-modal__title
  margin: 0
  color: var(--cm-text)
  font-size: var(--cm-fs-l)
  font-weight: 400
  line-height: 1.15
  text-transform: uppercase
  letter-spacing: 0.05em
  overflow-wrap: anywhere
  text-shadow: var(--cm-text-outline), 0 0 0.6em rgba(255, 79, 182, 0.7)

.f-modal__close
  flex: 0 0 auto
  display: grid
  place-items: center
  width: var(--cm-chip)
  height: var(--cm-chip)
  // A second, absolute floor: the token already has one, and a control that
  // closes a dialog must never depend on a single line of CSS.
  min-width: 2.5rem
  min-height: 2.5rem
  padding: 0
  border: var(--cm-edge) solid var(--cm-pink-hi)
  border-radius: var(--cm-radius-s)
  background: var(--cm-pink)
  color: var(--cm-text)
  cursor: pointer
  -webkit-tap-highlight-color: transparent
  transition: filter 90ms ease-out

  &:hover
    filter: brightness(1.12)

  &:active
    filter: brightness(0.9)

  &:focus-visible
    outline: var(--cm-edge) solid var(--cm-text)
    outline-offset: 0.15em

  // Nested to outrank `GameIcon`'s own `.game-icon` rule, which has the same
  // specificity a flat class selector would.
  .f-modal__close-icon
    width: 46%
    height: 46%

.f-modal__content
  position: relative
  // The floor that keeps the body readable: on a short screen the panel uses
  // the whole height before this row gives way.
  min-height: min(7rem, 40dvh)
  overflow-y: auto
  overscroll-behavior: contain
  // Scrolling inside the panel is the one pan the page allows.
  touch-action: pan-y
  padding: clamp(0.6rem, 2.6vmin, 1.3rem)
  font-size: var(--cm-fs-m)
  scrollbar-width: thin
  scrollbar-color: var(--cm-cyan) transparent

.f-modal__footer
  position: relative
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  gap: clamp(0.4rem, 2vmin, 1rem)
  padding: clamp(0.4rem, 1.8vmin, 0.8rem) clamp(0.5rem, 2.4vmin, 1.1rem)
  border-top: var(--cm-edge) solid rgba(77, 232, 255, 0.35)

// The panel flickers on like a projection; it does not bounce.
.f-modal-enter-active
  transition: opacity 200ms ease-out

  .f-modal__panel
    transition: transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1.15)

.f-modal-leave-active
  transition: opacity 140ms ease-in

  .f-modal__panel
    transition: transform 140ms ease-in

.f-modal-enter-from, .f-modal-leave-to
  opacity: 0

  .f-modal__panel
    transform: scaleY(0.86)

@media (prefers-reduced-motion: reduce)
  .f-modal-enter-active .f-modal__panel, .f-modal-leave-active .f-modal__panel
    transition: none

// ─── Short viewports (landscape phone, embedded iframe) ─────────────────────
// The panel may use the full width, and the header and footer tighten, so the
// content keeps as much of the short axis as possible.
@media (max-height: 520px)
  .f-modal__panel
    max-width: min(52rem, 100%)

  .f-modal__header, .f-modal__footer
    padding-block: 0.3rem

  .f-modal__title
    font-size: var(--cm-fs-m)
</style>
