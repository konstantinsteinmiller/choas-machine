<template lang="pug">
  //- The attention arrow on touch, one at a time: a button the training has
  //- just revealed (`touchReveal.ts`), until it is pressed; else the button a
  //- lesson is teaching right now (`hud.hints`). The door nudge
  //- (`TrainingNudge`) takes over when it has its own arrow out.
  AttentionArrow(v-if="target" :style="aim" data-testid="reveal-arrow")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AttentionArrow from '@/components/hud/AttentionArrow.vue'
import { aimArrow, otherControls } from '@/components/hud/arrowAim'
import { REVEAL_ARROW, pressedOnce } from '@/components/hud/touchReveal'
import { NUDGE_BUTTON } from '@/components/hud/touchLook'
import { TRAINING_ROOMS } from '@/game/data/fortresses/training'
import { hud } from '@/game/state/hud'

/** The test id the arrow wants (read the DOM: polled, not computed): the room's new button (not yet pressed), else a lesson's button. */
const wanted = (): string | null => {
  if (hud.device !== 'touch' || hud.training.nudge || hud.phase !== 'play') return null
  const room = hud.training.on ? TRAINING_ROOMS[hud.training.room] : undefined
  const id = room ? REVEAL_ARROW[room.lesson] : undefined
  if (id && !pressedOnce.has(id)) return id
  // The backstab room (#193): its lesson watched, sneak is how to get behind
  // the guards unseen — and on touch that button is up in the top row.
  if (room?.lesson === 'blade' && !hud.training.watching && !hud.crouched && hud.training.done <= hud.training.room) return 'btn-crouch'
  // A lesson card is up for a control with a button (or the look stick): the arrow on it too.
  for (const h of hud.hints) {
    const b = NUDGE_BUTTON[h.id]
    if (b && document.querySelector(`[data-testid="${b}"]`)) return b
  }
  return null
}

const target = ref<DOMRect | null>(null)
const aim = ref<Record<string, string>>({})
let timer = 0
const find = (): void => {
  const id = wanted()
  const el = id ? document.querySelector(`[data-testid="${id}"]`) : null
  const r = el?.getBoundingClientRect()
  const onScreen = r && r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
  target.value = onScreen ? r : null
  if (r && onScreen) aim.value = { ...aimArrow(r, otherControls(id ?? undefined)) }
}

/** Any press on a revealed button lets its arrow go. */
const onPress = (e: PointerEvent): void => {
  const id = (e.target as Element | null)?.closest?.('[data-testid^="btn-"]')?.getAttribute('data-testid')
  if (id) pressedOnce.add(id)
}

onMounted(() => {
  document.addEventListener('pointerdown', onPress, true)
  timer = window.setInterval(find, 250)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onPress, true)
  window.clearInterval(timer)
})
</script>
