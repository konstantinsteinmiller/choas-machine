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
@use '@/assets/css/tech' as *
.f-hud-badge
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.15em
  min-width: clamp(1rem, 4vmin, 1.3rem)
  min-height: clamp(1rem, 4vmin, 1.3rem)
  padding-inline: 0.35em
  color: var(--cm-ink)
  line-height: 1
  font-size: clamp(0.6rem, 2.4vmin, 0.78rem)
  font-variant-numeric: tabular-nums
  white-space: nowrap
  +tech-plate(var(--fhbd-tone, var(--cm-cyan)), linear-gradient(180deg, #2b1b5c, #150c2b), 0.3rem, var(--cm-edge), false)

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
  --plate-fill: linear-gradient(180deg, var(--cm-pink-hi), color-mix(in srgb, var(--cm-pink-hi) 72%, #150c2b))
  --plate-edge: color-mix(in srgb, var(--cm-pink-hi) 55%, white)
.tone-cyan
  --plate-fill: linear-gradient(180deg, var(--cm-cyan), color-mix(in srgb, var(--cm-cyan) 72%, #150c2b))
  --plate-edge: color-mix(in srgb, var(--cm-cyan) 55%, white)
.tone-warn
  --plate-fill: linear-gradient(180deg, var(--cm-warn), color-mix(in srgb, var(--cm-warn) 72%, #150c2b))
  --plate-edge: color-mix(in srgb, var(--cm-warn) 55%, white)
.tone-ok
  --plate-fill: linear-gradient(180deg, var(--cm-ok), color-mix(in srgb, var(--cm-ok) 72%, #150c2b))
  --plate-edge: color-mix(in srgb, var(--cm-ok) 55%, white)
</style>
