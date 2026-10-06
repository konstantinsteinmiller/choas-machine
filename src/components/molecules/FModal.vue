<script setup lang="ts">
import { nextTick, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import FTabs, { type TabOption } from '@/components/atoms/FTabs.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { sfx } from '@/game/audio/sfx'
import { acquireModalOpen } from '@/use/useModalState'
import { focusablesIn, keyCapture, listsOpen, menuKey, menuStep } from '@/use/useMenuKeys'

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
  if (open && !prev) void takeFocus()
  else if (!open && prev) giveFocusBack()
})

// ─── By keyboard (#170, `use/useMenuKeys.ts`) ────────────────────────────────
// Open, the dialog takes the focus (its tab row's chosen tab, or its first
// control); Tab and the arrows walk its controls and wrap inside it; closed,
// the focus goes back where it was.
const panel = ref<HTMLElement | null>(null)
let before: HTMLElement | null = null
/** The dialog on top (a settings dialog opened over the pause menu is). */
const onTop = (): boolean => {
  const mine = panel.value?.closest('.f-modal')
  const all = document.querySelectorAll('.f-modal')
  return !!mine && all[all.length - 1] === mine
}
const takeFocus = async (): Promise<void> => {
  before = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await nextTick()
  const p = panel.value
  if (!p) return
  // Its chosen tab; else its first control (the close button only when there is nothing else).
  const body = [p.querySelector('.f-modal__content'), p.querySelector('.f-modal__footer')].flatMap(r => (r ? focusablesIn(r) : []))
  const first = p.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? body[0] ?? focusablesIn(p)[0]
  first?.focus({ preventScroll: true })
}
const giveFocusBack = (): void => {
  const b = before
  before = null
  if (b && b.isConnected) b.focus({ preventScroll: true })
}
const onNav = (e: KeyboardEvent): void => {
  if (!props.modelValue || keyCapture.value || e.defaultPrevented || !onTop()) return
  const k = menuKey(e)
  const p = panel.value
  if (!k || !p) return
  const active = document.activeElement
  // Focus somewhere of its own outside the panel (a picker's open list): not ours.
  if (active && active !== document.body && !p.contains(active)) return
  const to = menuStep(focusablesIn(p), active, k)
  if (!to) return
  e.preventDefault()
  to.focus()
}

const close = (): void => emit('update:modelValue', false)
const handleTabChange = (val: string | number): void => emit('update:activeTab', val)

const onKey = (e: KeyboardEvent): void => {
  // Esc closes the picker's open list first, and is the binding's while a key is being captured.
  if (keyCapture.value || listsOpen.value > 0) return
  if (e.code === 'Escape' && props.modelValue && props.isClosable && onTop()) {
    e.stopPropagation()
    close()
  }
}

onMounted(() => {
  if (props.modelValue) { markOpen(); void takeFocus() }
  window.addEventListener('keydown', onKey, true)
  // In the bubble: a control that handles its own keys (a picker's list, a tab row) stops them first.
  window.addEventListener('keydown', onNav)
})
onUnmounted(() => {
  markClosed()
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('keydown', onNav)
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

        div.f-modal__panel(ref="panel")
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
@use '@/assets/css/tech' as *
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
  // A thick rim that runs cyan to pink round the corner, over an ink ground,
  // with the panel's lit surface inside it.
  color: var(--cm-text)
  overflow: hidden
  +tech-plate(var(--cm-cyan), var(--cm-surface), clamp(0.9rem, 3vmin, 1.5rem))

  // Scan lines over the whole panel, under the content.
  &::before
    content: ''
    position: absolute
    inset: 0
    background-image: repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 4px)
    pointer-events: none

  // Targeting brackets in the four corners, breathing slowly: the panel is a
  // projection that is alive, not a box.
  &::after
    --b: clamp(0.7rem, 2.6vmin, 1.2rem)
    --t: clamp(2px, 0.5vmin, 3px)
    content: ''
    position: absolute
    inset: clamp(0.25rem, 1vmin, 0.45rem)
    background: linear-gradient(var(--cm-cyan-hi), var(--cm-cyan-hi)) top left / var(--b) var(--t) no-repeat, linear-gradient(var(--cm-cyan-hi), var(--cm-cyan-hi)) top left / var(--t) var(--b) no-repeat, linear-gradient(var(--cm-pink-hi), var(--cm-pink-hi)) top right / var(--b) var(--t) no-repeat, linear-gradient(var(--cm-pink-hi), var(--cm-pink-hi)) top right / var(--t) var(--b) no-repeat, linear-gradient(var(--cm-cyan-hi), var(--cm-cyan-hi)) bottom left / var(--b) var(--t) no-repeat, linear-gradient(var(--cm-cyan-hi), var(--cm-cyan-hi)) bottom left / var(--t) var(--b) no-repeat, linear-gradient(var(--cm-pink-hi), var(--cm-pink-hi)) bottom right / var(--b) var(--t) no-repeat, linear-gradient(var(--cm-pink-hi), var(--cm-pink-hi)) bottom right / var(--t) var(--b) no-repeat
    opacity: 0.7
    pointer-events: none
    animation: f-modal-breathe 2.8s ease-in-out infinite alternate

.f-modal__header
  position: relative
  display: flex
  align-items: center
  gap: clamp(0.4rem, 2vmin, 0.9rem)
  min-width: 0
  padding: clamp(0.4rem, 1.8vmin, 0.8rem) clamp(0.5rem, 2.4vmin, 1.1rem)
  // A title plate: lit from above, hazard stripes fading in at the far end.
  background: repeating-linear-gradient(-55deg, rgba(255, 79, 182, 0.16) 0 0.45em, transparent 0.45em 0.9em) right / 38% 100% no-repeat, linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 70%), linear-gradient(to right, rgba(255, 79, 182, 0.28), rgba(77, 232, 255, 0.12))

  // Its lower edge is a glowing seam rather than a hairline.
  &::after
    content: ''
    position: absolute
    left: 0
    right: 0
    bottom: 0
    height: var(--cm-edge)
    background: linear-gradient(to right, transparent, var(--cm-cyan) 18%, var(--cm-pink) 82%, transparent)
    box-shadow: 0 0 0.5em rgba(77, 232, 255, 0.6)

.f-modal__tabs, .f-modal__title, .f-modal__spacer
  flex: 1 1 auto
  min-width: 0

.f-modal__title
  margin: 0
  color: var(--cm-text)
  font-size: var(--cm-fs-l)
  // A little sticker of a dot before the title, in the rim's colours.
  &::before
    content: ''
    display: inline-block
    width: 0.5em
    height: 0.5em
    margin-right: 0.45em
    clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)
    vertical-align: 0.12em
    background: radial-gradient(circle at 35% 35%, #fff, var(--cm-cyan) 45%, var(--cm-cyan-deep))
    box-shadow: 0 0 0 0.08em var(--cm-ink), 0 0 0.5em var(--cm-cyan)
  font-weight: 700
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
  color: var(--cm-text)
  filter: drop-shadow(0 0 0.4em rgba(255, 79, 182, 0.45))
  cursor: pointer
  -webkit-tap-highlight-color: transparent
  transition: filter 90ms ease-out
  +tech-plate(var(--cm-pink), tech-fill(var(--cm-pink), 20%), 0.5rem)

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
    filter: drop-shadow(0.05em 0.07em 0 var(--cm-ink))

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
  border-top: var(--cm-edge) solid rgba(77, 232, 255, 0.25)
  background: linear-gradient(0deg, rgba(10, 5, 24, 0.35), transparent)

// The panel flickers on like a projection; it does not bounce.
.f-modal-enter-active
  transition: opacity 200ms ease-out

  .f-modal__panel
    transition: transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1.15)

.f-modal-leave-active
  transition: opacity 140ms ease-in
  // On its way out it takes no taps: they are for what is under it. (The
  // leave can outlast its 140 ms by a lot when the next screen is being
  // built on the same thread: the rewards modal ate the Armory's first tap.)
  pointer-events: none
  :deep(*)
    pointer-events: none !important

  .f-modal__panel
    transition: transform 140ms ease-in

.f-modal-enter-from, .f-modal-leave-to
  opacity: 0

  .f-modal__panel
    transform: scaleY(0.86)

@keyframes f-modal-breathe
  from
    opacity: 0.45
  to
    opacity: 0.95

@media (prefers-reduced-motion: reduce)
  .f-modal-enter-active .f-modal__panel, .f-modal-leave-active .f-modal__panel
    transition: none
  .f-modal__panel::after
    animation: none

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
