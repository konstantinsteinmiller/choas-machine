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
      //- The plate's ornaments: an inset frame with corner brackets and rivets,
      //- and a lit status strip down its leading edge.
      span.f-button__frame(aria-hidden="true")
      span.f-button__strip(aria-hidden="true")
      //- Glyph-only. A separate `v-if` rather than a `v-else` on the label, so
      //- an icon-only button that was passed no icon still renders its slot
      //- instead of an empty box.
      span.f-button__socket.is-solo(v-if="iconOnly && icon")
        GameIcon.f-button__glyph.is-solo(:name="icon")
      template(v-else)
        span.f-button__socket(v-if="icon && iconPosition === 'left'")
          GameIcon.f-button__glyph(:name="icon")
        span.f-button__text
          slot {{ label }}
        span.f-button__socket(v-if="icon && iconPosition === 'right'")
          GameIcon.f-button__glyph(:name="icon")
</template>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
// ─── The plated key (jam build) ─────────────────────────────────────────────
// Machined, not candy: a chamfered metal plate (two corners cut, the mech's
// own panel line) with a neon edge that follows the cut, an inset frame with
// corner brackets and rivets, a lit status strip down its leading edge, the
// glyph in a hex socket, and a cold sweep of light. Every colour comes from
// the tone variables each `is-<type>` sets.
.f-button
  // The colour family; each `is-<type>` below swaps these.
  --fbtn-tone: var(--cm-pink)
  --fbtn-tone-hi: var(--cm-pink-hi)
  --fbtn-shadow: var(--cm-pink-deep)
  --fbtn-glow: var(--cm-glow-pink)
  // How much of the tone the plate itself carries (the CTA burns brightest).
  --fbtn-fill: 46%
  // The cut corners.
  --fbtn-cut: 0.62em
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
    filter: brightness(1.14) saturate(1.1)

    .f-button__body::after
      animation-duration: 1.4s

  // Pressed: the body sinks onto its plate. A translate, not a scale: the
  // layout box and the hit target stay exactly where they are.
  &:active:not(.is-disabled) .f-button__body
    transform: translateY(0.16em)

  &:focus-visible .f-button__body
    outline: var(--cm-edge) solid var(--cm-text)
    outline-offset: 0.15em

  &.is-disabled
    opacity: 0.5
    filter: grayscale(0.9)
    cursor: not-allowed

  // Glyph-only: a square button, not a pill with a lonely icon adrift in it.
  &.is-icon-only
    min-width: var(--fbtn-min-h)

    .f-button__body
      min-width: var(--fbtn-min-h)
      padding-inline: var(--fbtn-py)

.is-primary
  --fbtn-fill: 72%

.is-secondary
  --fbtn-tone: var(--cm-cyan)
  --fbtn-tone-hi: var(--cm-cyan-hi)
  --fbtn-shadow: var(--cm-cyan-deep)
  --fbtn-glow: var(--cm-glow-cyan)
  --fbtn-fill: 30%

.is-success
  --fbtn-tone: var(--cm-ok)
  --fbtn-tone-hi: #a6ffd9
  --fbtn-shadow: var(--cm-ok-deep)
  --fbtn-glow: 0 0 0.75em rgba(77, 255, 176, 0.45)

.is-warning
  --fbtn-tone: var(--cm-warn)
  --fbtn-tone-hi: #ffe98f
  --fbtn-shadow: var(--cm-warn-deep)
  --fbtn-glow: 0 0 0.75em rgba(255, 210, 63, 0.45)

.is-danger
  --fbtn-tone: var(--cm-danger)
  --fbtn-tone-hi: #ff96ab
  --fbtn-shadow: var(--cm-danger-deep)
  --fbtn-glow: 0 0 0.75em rgba(255, 85, 118, 0.45)

// The quiet one: smoked glass with a cyan edge, for "back" and "close".
.is-ghost
  --fbtn-tone: var(--cm-cyan)
  --fbtn-tone-hi: var(--cm-cyan-hi)
  --fbtn-shadow: var(--cm-ink)
  --fbtn-glow: none
  --fbtn-fill: 6%

// The plate under the key: the same cut, darker, a little lower.
.f-button__shadow
  position: absolute
  inset: 0
  font-size: var(--fbtn-font)
  transform: translateY(0.24em)
  background: color-mix(in srgb, var(--fbtn-shadow) 70%, var(--cm-ink))
  clip-path: polygon(var(--fbtn-cut) 0, 100% 0, 100% calc(100% - var(--fbtn-cut)), calc(100% - var(--fbtn-cut)) 100%, 0 100%, 0 var(--fbtn-cut))

// The body is the neon edge; its ::before is the plate, cut the same, inset
// by the edge's width, so the edge runs round the chamfers too.
.f-button__body
  position: relative
  display: flex
  align-items: center
  justify-content: center
  gap: 0.45em
  // The body owns the type scale so the glyph can size itself in `em` off it.
  font-size: var(--fbtn-font)
  width: 100%
  min-height: var(--fbtn-min-h)
  padding: var(--fbtn-py) calc(var(--fbtn-px) + 0.35em)
  background: linear-gradient(135deg, var(--fbtn-tone-hi), var(--fbtn-tone) 45%, var(--fbtn-shadow))
  clip-path: polygon(var(--fbtn-cut) 0, 100% 0, 100% calc(100% - var(--fbtn-cut)), calc(100% - var(--fbtn-cut)) 100%, 0 100%, 0 var(--fbtn-cut))
  filter: drop-shadow(var(--fbtn-glow))
  transition: transform 90ms ease-out

  &::before
    content: ''
    position: absolute
    inset: var(--cm-edge)
    // Brushed metal tinted with the tone, fine machining lines across it.
    background: repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.035) 0 0.08em, rgba(255, 255, 255, 0) 0.08em 0.3em), linear-gradient(180deg, color-mix(in srgb, var(--fbtn-tone) var(--fbtn-fill), #241552) 0%, color-mix(in srgb, var(--fbtn-tone) calc(var(--fbtn-fill) * 0.55), #140a2e) 58%, color-mix(in srgb, var(--fbtn-shadow) 40%, #0e0722) 100%)
    clip-path: polygon(calc(var(--fbtn-cut) - 0.06em) 0, 100% 0, 100% calc(100% - var(--fbtn-cut) + 0.06em), calc(100% - var(--fbtn-cut) + 0.06em) 100%, 0 100%, 0 calc(var(--fbtn-cut) - 0.06em))
    pointer-events: none

  // A cold scan line sweeps across now and then; faster under the pointer.
  &::after
    content: ''
    position: absolute
    top: -20%
    bottom: -20%
    left: 0
    width: 18%
    background: linear-gradient(90deg, rgba(255, 255, 255, 0), color-mix(in srgb, var(--fbtn-tone-hi) 55%, transparent), rgba(255, 255, 255, 0))
    rotate: 16deg
    translate: -220% 0
    animation: fbtn-sheen 5.2s ease-in-out infinite
    pointer-events: none
    mix-blend-mode: screen

// The inset frame: a hairline a step in from the edge, its corners marked by
// brackets, two rivets on its flanks.
.f-button__frame
  position: absolute
  inset: calc(var(--cm-edge) + 0.22em)
  border: 1px solid color-mix(in srgb, var(--fbtn-tone-hi) 34%, transparent)
  clip-path: polygon(calc(var(--fbtn-cut) - 0.3em) 0, 100% 0, 100% calc(100% - var(--fbtn-cut) + 0.3em), calc(100% - var(--fbtn-cut) + 0.3em) 100%, 0 100%, 0 calc(var(--fbtn-cut) - 0.3em))
  // The hairline along its cuts, corner brackets (top right, bottom left) and
  // rivets (left and right middle).
  background: tech-cut-strokes(color-mix(in srgb, var(--fbtn-tone-hi) 34%, transparent), calc(var(--fbtn-cut) - 0.3em), 1px), linear-gradient(var(--fbtn-tone-hi), var(--fbtn-tone-hi)) right 0 top 0 / 0.7em 2px no-repeat, linear-gradient(var(--fbtn-tone-hi), var(--fbtn-tone-hi)) right 0 top 0 / 2px 0.7em no-repeat, linear-gradient(var(--fbtn-tone-hi), var(--fbtn-tone-hi)) left 0 bottom 0 / 0.7em 2px no-repeat, linear-gradient(var(--fbtn-tone-hi), var(--fbtn-tone-hi)) left 0 bottom 0 / 2px 0.7em no-repeat, radial-gradient(circle, color-mix(in srgb, var(--fbtn-tone-hi) 80%, white) 0 0.07em, rgba(0, 0, 0, 0.5) 0.08em 0.11em, transparent 0.12em) right 0.25em center / 0.3em 0.3em no-repeat, radial-gradient(circle, color-mix(in srgb, var(--fbtn-tone-hi) 80%, white) 0 0.07em, rgba(0, 0, 0, 0.5) 0.08em 0.11em, transparent 0.12em) left 0.42em center / 0.3em 0.3em no-repeat
  opacity: 0.85
  pointer-events: none

// The status strip down the leading edge: lit segments, the tone at full.
.f-button__strip
  position: absolute
  left: calc(var(--cm-edge) + 0.42em)
  top: calc(var(--fbtn-cut) + 0.1em)
  bottom: 0.42em
  width: 0.16em
  background: repeating-linear-gradient(180deg, var(--fbtn-tone-hi) 0 0.32em, transparent 0.32em 0.46em)
  box-shadow: 0 0 0.4em var(--fbtn-tone)
  opacity: 0.9
  pointer-events: none

// The glyph sits in a hex socket of the tone, a ring of light round it.
.f-button__socket
  position: relative
  display: grid
  place-items: center
  flex: 0 0 auto
  width: 1.65em
  height: 1.5em
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)
  background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--fbtn-tone-hi) 55%, transparent), color-mix(in srgb, var(--fbtn-shadow) 70%, #0e0722) 72%)

  &.is-solo
    width: 2em
    height: 1.8em

// Nested rather than written flat, and that is load-bearing: `GameIcon`'s own
// scoped rule has exactly the same specificity a flat rule would; nesting
// adds the ancestor class and settles it.
.f-button__body .f-button__glyph
  position: relative
  flex: 0 0 auto
  width: 1.05em
  height: 1.05em
  color: var(--cm-text)
  filter: drop-shadow(0 0 0.18em var(--fbtn-tone)) drop-shadow(0.05em 0.06em 0 var(--cm-ink))

  &.is-solo
    width: 1.3em
    height: 1.3em

.f-button__text
  position: relative
  display: block
  min-width: 0
  color: var(--cm-text)
  text-transform: uppercase
  letter-spacing: 0.08em
  font-size: var(--fbtn-font)
  line-height: 1.12
  text-align: center
  // Two short lines beat one clipped one: German and Vietnamese captions run
  // two to three times the English width.
  overflow-wrap: anywhere
  text-wrap: balance
  text-shadow: 0 0 0.45em color-mix(in srgb, var(--fbtn-tone) 70%, transparent), var(--cm-text-outline)

.attention-bounce
  animation: fbtn-bounce 0.6s infinite alternate

@keyframes fbtn-bounce
  from
    translate: 0 0
  to
    translate: 0 -0.22em

@keyframes fbtn-sheen
  0%, 64%
    translate: -220% 0
  88%, 100%
    translate: 620% 0

@media (prefers-reduced-motion: reduce)
  .attention-bounce
    animation: none
  .f-button__body::after
    animation: none
    display: none
</style>
