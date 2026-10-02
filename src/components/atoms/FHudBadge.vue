<script setup lang="ts">
/**
 * The small corner indicator used inside `FHudButton`'s `badge` slot —
 * a count, an amount, or a countdown. Fluidly sized so it stays legible on a
 * 320 px phone without swallowing the chip it sits on.
 */
interface Props {
  tone?: 'pink' | 'cyan' | 'warn' | 'ok'
}
withDefaults(defineProps<Props>(), { tone: 'pink' })
</script>

<template lang="pug">
  span.f-hud-badge(:class="`tone-${tone}`")
    slot
</template>

<style scoped lang="sass">
.f-hud-badge
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.15em
  min-width: clamp(1rem, 4vmin, 1.3rem)
  min-height: clamp(1rem, 4vmin, 1.3rem)
  padding-inline: 0.35em
  border: var(--cm-edge) solid var(--cm-ink)
  border-radius: 999px
  color: var(--cm-ink)
  line-height: 1
  font-size: clamp(0.6rem, 2.4vmin, 0.78rem)
  font-variant-numeric: tabular-nums
  white-space: nowrap

  // Both element types, deliberately: every glyph in the set is an inline
  // <svg>, but a painted icon is an <img>, and an svg-only rule would let it
  // fall through to its natural size and burst out of the badge.
  :slotted(svg),
  :slotted(img)
    flex: 0 0 auto
    width: 1em
    height: 1em
    object-fit: contain

.tone-pink
  background-color: var(--cm-pink-hi)
.tone-cyan
  background-color: var(--cm-cyan)
.tone-warn
  background-color: var(--cm-warn)
.tone-ok
  background-color: var(--cm-ok)
</style>
