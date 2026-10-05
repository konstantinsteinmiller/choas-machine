<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  modelValue: number
  min?: number
  max?: number
  step?: number
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 50,
  min: 0,
  max: 100,
  step: 1
})

const emit = defineEmits(['update:modelValue'])

/** How full the track is, 0..1. A zero-width range reads as empty. */
const fill = computed(() => {
  const span = props.max - props.min
  return span > 0 ? Math.min(1, Math.max(0, (props.modelValue - props.min) / span)) : 0
})

const updateValue = (event: Event): void => {
  emit('update:modelValue', Number((event.target as HTMLInputElement).value))
}
</script>

<template lang="pug">
  label.f-slider(:style="{ '--fsl-fill': fill }")
    span.f-slider__label(v-if="label") {{ label }}
    span.f-slider__row
      span.f-slider__track(aria-hidden="true")
        span.f-slider__fill
      span.f-slider__thumb(aria-hidden="true")
      //- The native range sits on top, invisible: it owns the dragging, the
      //- keyboard and the accessibility; the spans under it are the paint.
      input.f-slider__input(
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        @input="updateValue"
      )
</template>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.f-slider
  // The thumb size drives the row height, the track inset and the thumb's
  // travel, so all three stay in step at any viewport.
  --fsl-thumb: clamp(1.9rem, 7.5vmin, 2.5rem)
  display: flex
  flex-direction: column
  gap: 0.3em
  width: 100%
  // A slider squeezed below this is no longer draggable with a thumb.
  min-width: 7rem
  font-size: var(--cm-fs-m)
  -webkit-tap-highlight-color: transparent

.f-slider__label
  color: var(--cm-dim)
  font-size: var(--cm-fs-s)
  text-transform: uppercase
  letter-spacing: 0.05em

.f-slider__row
  position: relative
  display: block
  height: var(--fsl-thumb)

.f-slider__track
  position: absolute
  inset-inline: 0
  top: 50%
  height: calc(var(--fsl-thumb) * 0.42)
  translate: 0 -50%
  overflow: hidden
  +tech-track(var(--cm-violet))

.f-slider__fill
  display: block
  height: 100%
  // The fill ends under the thumb's centre at every value.
  width: calc(var(--fsl-thumb) / 2 + (100% - var(--fsl-thumb)) * var(--fsl-fill))
  background-image: linear-gradient(to right, var(--cm-pink), var(--cm-cyan))

.f-slider__thumb
  position: absolute
  top: 0
  left: calc((100% - var(--fsl-thumb)) * var(--fsl-fill))
  width: var(--fsl-thumb)
  height: var(--fsl-thumb)
  box-sizing: border-box
  border: var(--cm-edge) solid var(--cm-text)
  background: radial-gradient(circle at 35% 30%, var(--cm-cyan-hi), var(--cm-cyan) 60%, var(--cm-cyan-deep))
  box-shadow: var(--cm-glow-cyan)
  pointer-events: none
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)

.f-slider__input
  position: absolute
  inset: 0
  width: 100%
  height: 100%
  margin: 0
  opacity: 0
  cursor: pointer
  // The page forbids panning; a slider drag is horizontal by nature.
  touch-action: pan-y
  -webkit-appearance: none
  appearance: none
  background: transparent

  &::-webkit-slider-thumb
    -webkit-appearance: none
    width: var(--fsl-thumb)
    height: var(--fsl-thumb)

  &::-moz-range-thumb
    width: var(--fsl-thumb)
    height: var(--fsl-thumb)
    border: 0
    background: transparent

.f-slider__input:focus-visible ~ .f-slider__thumb, .f-slider__row:focus-within .f-slider__thumb
  outline: var(--cm-edge) solid var(--cm-text)
  outline-offset: 0.15em
</style>
