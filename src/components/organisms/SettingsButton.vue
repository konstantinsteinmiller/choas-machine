<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FHudButton from '@/components/atoms/FHudButton.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'

/**
 * The settings cog, with the Options modal it opens. Self-contained, so the
 * modal travels with its trigger: a screen mounts this one component and owns
 * no "is the modal open" state of its own.
 */
const { t } = useI18n()
const isOpen = ref(false)
</script>

<template lang="pug">
  FHudButton(
    icon="settings"
    :aria-label="t('options.title')"
    data-testid="btn-settings"
    @click="isOpen = true"
  )
  OptionsModal(:is-open="isOpen" @close="isOpen = false")
</template>
