<template lang="pug">
  //- Shown only while the WebGL context is lost (see `engine/glContext.ts`).
  div.gl-veil(v-if="glLost" role="dialog" aria-modal="true" :aria-label="t('pause.title')")
    FButton(size="lg" icon="play" @click="recoverFromContextLoss") {{ t('pause.resume') }}
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import { glLost, recoverFromContextLoss } from '@/game/engine/glContext'

const { t } = useI18n()
</script>

<style scoped lang="sass">
.gl-veil
  position: fixed
  inset: 0
  z-index: 9000
  display: grid
  place-items: center
  padding: var(--cm-safe-top) var(--cm-safe-right) var(--cm-safe-bottom) var(--cm-safe-left)
  background: rgba(10, 5, 24, 0.86)
  pointer-events: auto
</style>
