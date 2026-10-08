<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { sfx } from '@/game/audio/sfx'
import { resolveIconLabel } from '@/components/icons/iconLabels'
import type { GameIconName } from '@/components/icons/iconNames'
import { primaryCode, type Action } from '@/game/engine/keyBindings'
import { keyLabel } from '@/game/engine/keyLabels'
import type { ButtonShape, ButtonTone } from '@/components/hud/touchLook'

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
  tone?: ButtonTone
  /** Shape family (#160): with the tone it names the control, `touchLook.ts`. */
  shape?: ButtonShape
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
  /** The mouse wheel does it too: a little mouse with its wheel lit, before the key ("wheel / Tab"). */
  wheel?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  tone: 'cyan',
  shape: 'plate',
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
const keyText = computed(() => {
  if (!props.hotkey) return ''
  const code = primaryCode(props.hotkey)
  // Beside the wheel the Tab key is spelled out: "wheel / Tab" reads better than an arrow.
  return props.wheel && code === 'Tab' ? 'Tab' : keyLabel(code)
})
</script>

<template lang="pug">
  button.f-hud-button(
    type="button"
    :class="[`tone-${tone}`, `shape-${shape}`, { 'is-active': active, 'is-attention': attention, 'is-disabled': isDisabled, 'is-pictogram': icon?.startsWith('act-') }]"
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
    span.f-hud-button__key(v-if="keyText" aria-hidden="true" :class="{ wide: keyText.length > 1 || wheel }")
      template(v-if="wheel")
        svg.f-hud-button__wheel(viewBox="0 0 12 16")
          rect(x="1" y="1" width="10" height="14" rx="5")
          rect.lit(x="5" y="3" width="2" height="4" rx="1")
        span.f-hud-button__or /
      | {{ keyText }}
</template>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
@use '@/assets/css/buttonLook' as *
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
    filter: brightness(1.18)

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

// The shape (#160): the plate, the hexagon, the diamond, the round.
+button-shapes('.f-hud-button__body')
// A smaller glyph where the shape leaves less room round it.
.shape-diamond .f-hud-button__glyph
  width: 44%
  height: 44%
.shape-round .f-hud-button__glyph, .shape-hex .f-hud-button__glyph
  width: 50%
  height: 50%
// The action pictograms (the mech doing the thing) are scenes: they need the room.
.is-pictogram .f-hud-button__glyph
  width: 70%
  height: 70%

// Switched on: the chip fills with its tone and the glyph goes dark on it.
.is-active .f-hud-button__body
  --plate-fill: linear-gradient(180deg, var(--fhb-tone-hi), var(--fhb-tone) 70%, color-mix(in srgb, var(--fhb-tone) 60%, var(--cm-ink)))
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

// The mouse wheel that works it too (the weapons chip): before the key, "wheel / Tab".
.f-hud-button__wheel
  width: 0.6rem
  height: 0.8rem
  flex: none
  rect
    fill: none
    stroke: currentColor
    stroke-width: 1.4
  rect.lit
    fill: currentColor
    stroke: none
.f-hud-button__or
  margin: 0 0.12rem
  opacity: 0.7
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
  border-bottom-width: calc(var(--cm-edge) * 2)
  color: var(--cm-text)
  font-size: 0.68rem
  line-height: 1
  text-transform: uppercase
  white-space: nowrap
  pointer-events: none
  +tech-plate(var(--cm-cyan), linear-gradient(180deg, #4a3590, #2a1a5e), 0.28rem, var(--cm-edge), false)
  &.wide
    font-size: 0.55rem

// ─── Tones ──────────────────────────────────────────────────────────────────

+button-tones

// The pulse animates a child's opacity, never the button itself: a lesson's
// highlight animates the button, and one animation would replace the other.
.is-attention .f-hud-button__body::after
  content: ''
  position: absolute
  // Inside the plate (its clip would cut anything outside it).
  inset: 0
  border: calc(var(--cm-edge) * 1.5) solid var(--fhb-tone-hi)
  // The ring follows the plate round its cuts.
  background: tech-cut-strokes(var(--fhb-tone-hi), 0.55rem, calc(var(--cm-edge) * 1.5))
  opacity: 0
  animation: fhb-pulse 1.6s ease-in-out infinite

// The other shapes pulse as a flash of their whole face (a ring drawn on the
// square box would show only in pieces inside their clip).
.shape-hex, .shape-diamond, .shape-round
  &.is-attention .f-hud-button__body::after
    border: 0
    background: color-mix(in srgb, var(--fhb-tone-hi) 38%, transparent)

@keyframes fhb-pulse
  50%
    opacity: 0.9

@media (prefers-reduced-motion: reduce)
  .is-attention .f-hud-button__body::after
    animation: none
    opacity: 0.6
</style>
