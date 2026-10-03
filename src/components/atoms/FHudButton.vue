<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { sfx } from '@/game/audio/sfx'
import { resolveIconLabel } from '@/components/icons/iconLabels'
import type { GameIconName } from '@/components/icons/iconNames'
import { primaryCode, type Action } from '@/game/engine/keyBindings'
import { keyLabel } from '@/game/engine/keyLabels'

/**
 * The standard HUD chip: one glyph in a square holographic key. Every HUD
 * control (settings, mute, pause, crouch, decoy, the Command Base stations) is
 * one of these, so a row of them reads as one set.
 *
 * Everything is fluid `clamp()` sizing with a hard 2.5rem floor (`--cm-chip`),
 * so a row is compact on a 320px phone, comfortable on a tablet, and never
 * collapses. No `transform: scale()`: a scaled chip keeps its original
 * footprint in its row and its hit target drifts off its painted pixels.
 *
 * The glyph normally comes from the shared set via the `icon` prop; the
 * default slot stays for marks that are art rather than UI. `badge` is the
 * corner indicator (a count, a timer).
 */

interface Props {
  /** Colour family. `cyan` is the everyday control. */
  tone?: 'cyan' | 'pink' | 'violet' | 'warn' | 'danger'
  /** The control is switched on (crouched, muted): it fills with its tone. */
  active?: boolean
  /** A soft pulse: there is something new here. */
  attention?: boolean
  isDisabled?: boolean
  /** A glyph from the shared set. Ignored when the default slot is filled. */
  icon?: GameIconName
  ariaLabel?: string
  /** For a toggle: announced as pressed / not pressed. */
  pressed?: boolean
  /** The key that works it, lettered in a corner (desktop, #82). */
  hotkey?: Action
}

const props = withDefaults(defineProps<Props>(), {
  tone: 'cyan',
  active: false,
  attention: false,
  isDisabled: false,
  pressed: undefined
})

const emit = defineEmits(['click'])
const onClick = (): void => {
  if (props.isDisabled) return
  sfx('uiClick')
  emit('click')
}

const slots = useSlots()
const { t, te } = useI18n()

/** The caller's label, or the shared floor under a glyph that arrived without
 *  one — see `iconLabels.ts`. */
const resolvedAriaLabel = computed<string | undefined>(
  () => resolveIconLabel(props.ariaLabel, props.icon, t, te)
)
const keyText = computed(() => (props.hotkey ? keyLabel(primaryCode(props.hotkey)) : ''))
</script>

<template lang="pug">
  button.f-hud-button(
    type="button"
    :class="[`tone-${tone}`, { 'is-active': active, 'is-attention': attention, 'is-disabled': isDisabled }]"
    :aria-label="resolvedAriaLabel"
    :aria-pressed="pressed"
    :disabled="isDisabled"
    @click="onClick"
  )
    span.f-hud-button__body
      GameIcon.f-hud-button__glyph(v-if="icon && !slots.default" :name="icon")
      slot
    span.f-hud-button__badge(v-if="$slots.badge")
      slot(name="badge")
    span.f-hud-button__key(v-if="keyText" aria-hidden="true" :class="{ wide: keyText.length > 1 }") {{ keyText }}
</template>

<style scoped lang="sass">
.f-hud-button
  --fhb-tone: var(--cm-cyan)
  --fhb-tone-hi: var(--cm-cyan-hi)
  --fhb-glow: var(--cm-glow-cyan)
  position: relative
  display: inline-flex
  align-items: center
  justify-content: center
  flex: 0 0 auto
  width: var(--cm-chip)
  height: var(--cm-chip)
  // Floors keep the tap target legal and the chip visible in any layout.
  min-width: 2.5rem
  min-height: 2.5rem
  padding: 0
  border: 0
  background: none
  cursor: pointer
  // A HUD layer is `pointer-events: none` so the canvas gets the drags; its
  // controls take their own pointers back.
  pointer-events: auto
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent

  &:hover:not(.is-disabled) .f-hud-button__body
    background: var(--cm-gloss), var(--cm-panel-hi)
    box-shadow: var(--cm-sticker), var(--fhb-glow)

  &:active:not(.is-disabled) .f-hud-button__body
    translate: 0 0.12rem
    filter: brightness(0.9)

  &:focus-visible .f-hud-button__body
    outline: var(--cm-edge) solid var(--cm-text)
    outline-offset: 0.15em

  &.is-disabled
    opacity: 0.45
    filter: grayscale(1)
    cursor: not-allowed

.f-hud-button__body
  position: relative
  display: flex
  align-items: center
  justify-content: center
  width: 100%
  height: 100%
  box-sizing: border-box
  border: var(--cm-rim-w) solid var(--fhb-tone)
  border-radius: var(--cm-radius-m)
  background: var(--cm-gloss), var(--cm-surface-soft)
  box-shadow: var(--cm-sticker), inset 0 0 0.8em color-mix(in srgb, var(--fhb-tone) 22%, transparent)
  color: var(--fhb-tone-hi)
  transition: background-color 110ms ease-out, box-shadow 110ms ease-out

  // The glyph fills a consistent fraction of the chip regardless of chip size,
  // so a row of mixed icons reads as one set.
  .f-hud-button__glyph
    width: 56%
    height: 56%
    filter: drop-shadow(0.05em 0.07em 0 var(--cm-ink))

  // Both element types, deliberately: a slotted <img> that is not sized here
  // renders at its natural size and bursts out of the chip.
  :slotted(svg), :slotted(img)
    width: 62%
    height: 62%
    pointer-events: none

// Switched on: the chip fills with its tone and the glyph goes dark on it.
.is-active .f-hud-button__body
  background: var(--cm-gloss), linear-gradient(180deg, var(--fhb-tone-hi), var(--fhb-tone))
  color: var(--cm-ink)
  box-shadow: var(--cm-sticker), var(--fhb-glow)

.f-hud-button__badge
  position: absolute
  top: 0
  right: 0
  translate: 30% -30%
  display: flex
  align-items: center
  justify-content: center
  pointer-events: none

// The key that works it: a small keycap on the bottom-left corner.
.f-hud-button__key
  position: absolute
  left: 0
  bottom: 0
  translate: -28% 28%
  min-width: 1.15rem
  height: 1.15rem
  padding: 0 0.2rem
  box-sizing: border-box
  display: flex
  align-items: center
  justify-content: center
  border: var(--cm-edge) solid var(--cm-cyan)
  border-bottom-width: calc(var(--cm-edge) * 2)
  border-radius: 0.3rem
  background: linear-gradient(180deg, #4a3590, #2a1a5e)
  box-shadow: 0 0 0 var(--cm-outline) var(--cm-ink)
  color: var(--cm-text)
  font-size: 0.68rem
  line-height: 1
  text-transform: uppercase
  white-space: nowrap
  pointer-events: none
  &.wide
    font-size: 0.55rem

// ─── Tones ──────────────────────────────────────────────────────────────────

.tone-pink
  --fhb-tone: var(--cm-pink)
  --fhb-tone-hi: var(--cm-pink-hi)
  --fhb-glow: var(--cm-glow-pink)

.tone-violet
  --fhb-tone: var(--cm-violet)
  --fhb-tone-hi: var(--cm-lilac)
  --fhb-glow: 0 0 0.75em rgba(154, 120, 255, 0.5)

.tone-warn
  --fhb-tone: var(--cm-warn)
  --fhb-tone-hi: #ffe98f
  --fhb-glow: 0 0 0.75em rgba(255, 210, 63, 0.45)

.tone-danger
  --fhb-tone: var(--cm-danger)
  --fhb-tone-hi: #ff96ab
  --fhb-glow: 0 0 0.75em rgba(255, 85, 118, 0.45)

// The pulse animates a child's opacity, never the button itself: a lesson's
// highlight animates the button, and one animation would replace the other.
.is-attention .f-hud-button__body::after
  content: ''
  position: absolute
  inset: calc(var(--cm-edge) * -2)
  border: var(--cm-edge) solid var(--fhb-tone-hi)
  border-radius: inherit
  opacity: 0
  animation: fhb-pulse 1.6s ease-in-out infinite

@keyframes fhb-pulse
  50%
    opacity: 0.9

@media (prefers-reduced-motion: reduce)
  .is-attention .f-hud-button__body::after
    animation: none
    opacity: 0.6
</style>
