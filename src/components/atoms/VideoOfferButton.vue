<template lang="pug">
  //- A rewarded video's button: always the film mark. Spent for this visit, it
  //- stays on screen, disabled, and says why: on hover, or for a few seconds
  //- after a tap on touch (a disabled button gets no events of its own, so the
  //- wrapper takes them).
  span.video-offer(
    :class="{ spent }"
    @pointerenter="onEnter"
    @pointerleave="onLeave"
    @pointerdown="onDown"
  )
    FButton(
      type="success"
      size="sm"
      icon="video"
      icon-only
      :is-disabled="spent"
      :aria-label="spent ? t('offer.refresh') : label"
      :aria-describedby="spent && tip ? tipId : undefined"
      :data-testid="testid"
      @click="emit('watch')"
    )
    span.tip(v-if="spent && tip" :id="tipId" role="tooltip" data-testid="video-refresh-tip") {{ t('offer.refresh') }}
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'

const props = defineProps<{ label: string; testid?: string; spent?: boolean }>()
const emit = defineEmits<{ (e: 'watch'): void }>()
const { t } = useI18n()

/** How long the note stays up after a tap (touch has no hover). */
const TIP_TAP_MS = 4000

const tipId = `video-tip-${Math.random().toString(36).slice(2, 9)}`
const tip = ref(false)
let timer = 0

const onEnter = (e: PointerEvent): void => {
  if (e.pointerType === 'mouse' && props.spent) tip.value = true
}
const onLeave = (e: PointerEvent): void => {
  if (e.pointerType === 'mouse') tip.value = false
}
const onDown = (e: PointerEvent): void => {
  if (!props.spent || e.pointerType === 'mouse') return
  tip.value = true
  window.clearTimeout(timer)
  timer = window.setTimeout(() => { tip.value = false }, TIP_TAP_MS)
}
onUnmounted(() => window.clearTimeout(timer))
</script>

<style scoped lang="sass">
.video-offer
  position: relative
  display: inline-flex
  // The disabled button lets the pointer through to the wrapper, which explains it.
  &.spent :deep(button)
    pointer-events: none
.tip
  position: absolute
  bottom: calc(100% + 0.4rem)
  right: 0
  z-index: 5
  width: max-content
  max-width: min(14rem, 70vw)
  padding: 0.35rem 0.55rem
  border-radius: 0.35rem
  background: rgba(21, 12, 43, 0.95)
  border: 1px solid rgba(77, 232, 255, 0.6)
  color: var(--cm-text)
  font-size: var(--cm-fs-xs)
  line-height: 1.25
  white-space: normal
  overflow-wrap: anywhere
  pointer-events: none
</style>
