<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { sfx } from '@/game/audio/sfx'
import { resolveIconLabel } from '@/components/icons/iconLabels'
import type { GameIconName } from '@/components/icons/iconNames'

/**
 * The primary CTA button.
 *
 * Sizing is FLUID, not scaled. A `transform: scale()` on a fixed-size body
 * does not affect layout (so buttons overlap their neighbours at large sizes
 * and leave dead gaps at small ones), blurs the border, and lets the hit
 * target drift away from the painted pixels.
 *
 * Every dimension is a `clamp(min, preferred, max)` on the SHORTER viewport
 * side (`vmin`), so the button is the same size on a phone held either way,
 * grows smoothly up to a 4K desktop, and never collapses below a comfortable
 * 44 px touch target.
 */

interface Props {
  label?: string
  /** `primary` is the one action a screen is for (pink); `secondary` the
   *  everyday action (cyan); `ghost` a quiet outline for the way back. */
  type?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'ghost'
  isDisabled?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  attention?: boolean
  /** Stretch to the container's width. Off by default so a button in a row
   *  sizes to its content instead of fighting its siblings. */
  block?: boolean
  /** A glyph from the shared set, drawn beside the label. */
  icon?: GameIconName
  /** Which side the glyph sits on. Right by default: the label is what the eye
   *  reads first, the glyph confirms the action. */
  iconPosition?: 'left' | 'right'
  /**
   * Drop the label and draw only the glyph, in a square button.
   *
   * This is what lets a row of actions cost one line instead of two. An
   * icon-only button has no accessible name of its own, so the caller MUST
   * pass an `aria-label`.
   */
  iconOnly?: boolean
  /** Required whenever the button has no visible text. */
  ariaLabel?: string
  /**
   * Grow the whole control by this factor - the "this is the one that ends the
   * screen" mark for a row of otherwise identical glyph buttons.
   *
   * Multiplies INSIDE the clamp terms rather than applying a `transform:
   * scale()`, so the layout box grows with the paint and the row gutters
   * correctly around it.
   */
  emphasis?: number
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  type: 'primary',
  size: 'md',
  attention: false,
  block: false,
  iconPosition: 'right',
  iconOnly: false,
  emphasis: 1
})

const emit = defineEmits(['click'])
/** Every button answers with a click sound. */
const onClick = (): void => {
  if (props.isDisabled) return
  sfx('uiClick')
  emit('click')
}

const { t, te } = useI18n()

/**
 * An icon-only button has no text to be announced, so it needs a name from
 * somewhere. The caller's `ariaLabel` is the right answer and normally present;
 * the shared map in `iconLabels.ts` is the floor under the call site that
 * forgets. A button that still has its caption needs neither — its own text is
 * its name, and an `aria-label` there would silently override it.
 */
const resolvedAriaLabel = computed<string | undefined>(() => {
  if (props.ariaLabel) return props.ariaLabel
  return props.iconOnly ? resolveIconLabel(undefined, props.icon, t, te) : undefined
})

/**
 * Per-size fluid metrics. The `vmin` term is what makes the button responsive;
 * the min/max clamp keeps it usable at both extremes. `--fbtn-min-h` is never
 * below 2.25rem (36px) for `sm` and 2.75rem (44px) elsewhere — the WCAG touch
 * target floor — so no parent layout can crush the control out of existence.
 */
const sizeVars = computed<Record<string, string>>(() => {
  switch (props.size) {
    case 'sm':
      return {
        '--fbtn-font': 'clamp(0.7rem, 2.6vmin, 0.95rem)',
        '--fbtn-px': 'clamp(0.6rem, 2.6vmin, 1rem)',
        '--fbtn-py': 'clamp(0.3rem, 1.2vmin, 0.5rem)',
        '--fbtn-min-w': 'clamp(3.5rem, 18vmin, 6rem)',
        '--fbtn-min-h': '2.5rem',
        '--fbtn-radius': 'clamp(0.7rem, 2.8vmin, 1.1rem)'
      }
    case 'lg':
      return {
        '--fbtn-font': 'clamp(1rem, 4.2vmin, 1.6rem)',
        '--fbtn-px': 'clamp(1.1rem, 5vmin, 2.2rem)',
        '--fbtn-py': 'clamp(0.55rem, 2.2vmin, 0.95rem)',
        '--fbtn-min-w': 'clamp(6.5rem, 34vmin, 12rem)',
        '--fbtn-min-h': '3rem',
        '--fbtn-radius': 'clamp(1rem, 4vmin, 1.8rem)'
      }
    case 'xl':
      return {
        '--fbtn-font': 'clamp(1.15rem, 5vmin, 2rem)',
        '--fbtn-px': 'clamp(1.4rem, 6vmin, 2.8rem)',
        '--fbtn-py': 'clamp(0.65rem, 2.6vmin, 1.15rem)',
        '--fbtn-min-w': 'clamp(8rem, 42vmin, 15rem)',
        '--fbtn-min-h': '3.25rem',
        '--fbtn-radius': 'clamp(1.15rem, 4.6vmin, 2.1rem)'
      }
    default:
      return {
        '--fbtn-font': 'clamp(0.85rem, 3.4vmin, 1.25rem)',
        '--fbtn-px': 'clamp(0.85rem, 4vmin, 1.6rem)',
        '--fbtn-py': 'clamp(0.45rem, 1.8vmin, 0.75rem)',
        '--fbtn-min-w': 'clamp(5rem, 26vmin, 9rem)',
        '--fbtn-min-h': '2.75rem',
        '--fbtn-radius': 'clamp(0.85rem, 3.4vmin, 1.4rem)'
      }
  }
})

/**
 * Emphasis multiplies every fluid metric, so a 1.2x button is a genuinely
 * larger BOX: `calc(clamp(...) * 1.2)` clamps first and scales after, which
 * keeps the floors meaningful.
 */
const scaled = (v: string, e: number): string => (e === 1 ? v : `calc(${v} * ${e})`)

const styleVars = computed(() => {
  const e = Number.isFinite(props.emphasis) && props.emphasis > 0 ? props.emphasis : 1
  return Object.fromEntries(Object.entries(sizeVars.value).map(([key, value]) => [key, scaled(value, e)]))
})
</script>

<template lang="pug">
  button.f-button(
    type="button"
    :style="styleVars"
    :class="[\
      `is-${type}`,\
      block ? 'is-block' : '',\
      attention ? 'attention-bounce' : '',\
      isDisabled ? 'is-disabled' : '',\
      iconOnly ? 'is-icon-only' : ''\
    ]"
    :aria-label="resolvedAriaLabel"
    :disabled="isDisabled"
    @click="onClick"
  )
    //- The depth plate behind the body: the button reads as a pressable key.
    span.f-button__shadow(aria-hidden="true")
    span.f-button__body
      //- A soft band of light across the top half.
      span.f-button__shine(aria-hidden="true")
      //- Glyph-only. A separate `v-if` rather than a `v-else` on the label, so
      //- an icon-only button that was passed no icon still renders its slot
      //- instead of an empty box.
      GameIcon.f-button__glyph.is-solo(v-if="iconOnly && icon" :name="icon")
      template(v-else)
        GameIcon.f-button__glyph(v-if="icon && iconPosition === 'left'" :name="icon")
        span.f-button__text
          slot {{ label }}
        GameIcon.f-button__glyph(v-if="icon && iconPosition === 'right'" :name="icon")
</template>

<style scoped lang="sass">
.f-button
  // The colour family; each `is-<type>` below swaps these.
  --fbtn-from: var(--cm-pink-hi)
  --fbtn-to: var(--cm-pink)
  --fbtn-shadow: var(--cm-pink-deep)
  --fbtn-edge: #ffd3ee
  --fbtn-glow: var(--cm-glow-pink)
  position: relative
  display: inline-flex
  align-items: center
  justify-content: center
  // Floors that guarantee the control can never be collapsed to nothing by a
  // flex/grid parent — the "invisible button" failure mode.
  min-width: var(--fbtn-min-w)
  min-height: var(--fbtn-min-h)
  // A long caption wraps inside the button; it never pushes it past its row.
  max-width: 100%
  padding: 0
  border: 0
  background: none
  cursor: pointer
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  transition: filter 90ms ease-out

  &.is-block
    display: flex
    width: 100%

  &:hover:not(.is-disabled)
    filter: brightness(1.1)

  // Pressed: the body sinks onto its plate. A translate, not a scale: the
  // layout box and the hit target stay exactly where they are.
  &:active:not(.is-disabled) .f-button__body
    transform: translateY(0.18em)

  &:focus-visible .f-button__body
    outline: var(--cm-edge) solid var(--cm-text)
    outline-offset: 0.15em

  &.is-disabled
    opacity: 0.5
    filter: grayscale(0.9)
    cursor: not-allowed

  // Glyph-only: a square button, not a pill with a lonely icon adrift in it.
  // The width floor becomes the height floor, so the control is as tall as it
  // is wide at every size and emphasis - and dropping the caption cannot
  // collapse it, because the caption was never what held it open.
  &.is-icon-only
    min-width: var(--fbtn-min-h)

    .f-button__body
      min-width: var(--fbtn-min-h)
      padding-inline: var(--fbtn-py)

.is-secondary
  --fbtn-from: var(--cm-cyan-hi)
  --fbtn-to: var(--cm-cyan)
  --fbtn-shadow: var(--cm-cyan-deep)
  --fbtn-edge: #e3fbff
  --fbtn-glow: var(--cm-glow-cyan)

.is-success
  --fbtn-from: #a6ffd9
  --fbtn-to: var(--cm-ok)
  --fbtn-shadow: var(--cm-ok-deep)
  --fbtn-edge: #e2fff3
  --fbtn-glow: 0 0 0.75em rgba(77, 255, 176, 0.45)

.is-warning
  --fbtn-from: #ffe98f
  --fbtn-to: var(--cm-warn)
  --fbtn-shadow: var(--cm-warn-deep)
  --fbtn-edge: #fff6cf
  --fbtn-glow: 0 0 0.75em rgba(255, 210, 63, 0.45)

.is-danger
  --fbtn-from: #ff96ab
  --fbtn-to: var(--cm-danger)
  --fbtn-shadow: var(--cm-danger-deep)
  --fbtn-edge: #ffd9e0
  --fbtn-glow: 0 0 0.75em rgba(255, 85, 118, 0.45)

// The quiet one: a glass body with a cyan rim, for "back" and "close".
.is-ghost
  --fbtn-from: var(--cm-panel-hi)
  --fbtn-to: var(--cm-panel)
  --fbtn-shadow: var(--cm-ink)
  --fbtn-edge: var(--cm-cyan)
  --fbtn-glow: none

.f-button__shadow
  position: absolute
  inset: 0
  font-size: var(--fbtn-font)
  transform: translateY(0.26em)
  border-radius: var(--fbtn-radius)
  background-color: var(--fbtn-shadow)
  // The ink outline wraps the plate too, so key and plate read as one toy.
  box-shadow: 0 0 0 var(--cm-outline) var(--cm-ink), 0 0.12em 0 var(--cm-outline) rgba(10, 5, 24, 0.6)

.f-button__body
  position: relative
  display: flex
  align-items: center
  justify-content: center
  gap: 0.4em
  // The body owns the type scale so the glyph can size itself in `em` off it -
  // one metric for label and icon, which is what keeps them optically matched
  // at every size and emphasis.
  font-size: var(--fbtn-font)
  width: 100%
  min-height: var(--fbtn-min-h)
  padding: var(--fbtn-py) var(--fbtn-px)
  border: var(--cm-edge) solid var(--fbtn-edge)
  border-radius: var(--fbtn-radius)
  background-image: linear-gradient(to bottom, var(--fbtn-from), var(--fbtn-to) 70%, color-mix(in srgb, var(--fbtn-to) 82%, var(--fbtn-shadow)))
  box-shadow: var(--fbtn-glow), 0 0 0 var(--cm-outline) var(--cm-ink), inset 0 -0.14em 0 rgba(0, 0, 0, 0.14)
  overflow: hidden
  transition: transform 90ms ease-out

// A glossy crown: a rounded highlight inset from the edges, and one small
// sparkle at its left end. It is what makes the key look like candy.
.f-button__shine
  position: absolute
  inset-inline: 7%
  top: 7%
  height: 40%
  border-radius: var(--cm-radius-pill)
  background-image: linear-gradient(to bottom, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.06))
  pointer-events: none

  &::after
    content: ''
    position: absolute
    left: 4%
    top: 22%
    width: 0.32em
    height: 0.32em
    border-radius: 50%
    background: #fff
    opacity: 0.85

// The one action a screen is for catches the light now and then: a band of
// light sweeps across it, then it rests.
.is-primary .f-button__body::after, .attention-bounce .f-button__body::after
  content: ''
  position: absolute
  top: -20%
  bottom: -20%
  left: 0
  width: 28%
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0))
  rotate: 18deg
  translate: -160% 0
  animation: fbtn-sheen 4.2s ease-in-out infinite
  pointer-events: none

// Nested rather than written flat, and that is load-bearing: `GameIcon`'s own
// scoped rule is `.game-icon[data-v-…]` — one class plus one attribute, exactly
// the same specificity a flat `.f-button__glyph[data-v-…]` would have. On a tie
// the winner is whichever stylesheet the bundler happened to emit last.
// Nesting adds the ancestor class and settles it.
.f-button__body .f-button__glyph
  position: relative
  flex: 0 0 auto
  // Sized in `em` off the body's font size, so one metric drives the label and
  // the glyph together at every size and emphasis factor.
  width: 1.25em
  height: 1.25em
  color: var(--cm-text)
  // The same dark offset the captions wear, so a glyph button and a text
  // button read as the same material.
  filter: drop-shadow(0.06em 0.08em 0 var(--cm-ink))

  // Alone in the button it IS the control, not an ornament beside a word.
  &.is-solo
    width: 1.6em
    height: 1.6em

.f-button__text
  position: relative
  display: block
  min-width: 0
  color: var(--cm-text)
  text-transform: uppercase
  letter-spacing: 0.03em
  font-size: var(--fbtn-font)
  line-height: 1.12
  text-align: center
  // Two short lines beat one clipped one: German and Vietnamese captions run
  // two to three times the English width.
  overflow-wrap: anywhere
  text-wrap: balance
  text-shadow: var(--cm-text-outline)

.attention-bounce
  animation: fbtn-bounce 0.6s infinite alternate

@keyframes fbtn-bounce
  from
    translate: 0 0
  to
    translate: 0 -0.3em

@keyframes fbtn-sheen
  0%, 62%
    translate: -160% 0
  86%, 100%
    translate: 520% 0

@media (prefers-reduced-motion: reduce)
  .attention-bounce
    animation: none
  .is-primary .f-button__body::after, .attention-bounce .f-button__body::after
    animation: none
    display: none
</style>
