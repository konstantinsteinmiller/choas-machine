<template lang="pug">
  //- The three stations of the Command Base behind one door: the Armory, the
  //- Chassis Bay and the Forge are tabs of the same workshop.
  FModal(
    :model-value="open"
    :tabs="tabs"
    v-model:activeTab="tab"
    data-testid="workshop"
    @update:model-value="emit('close')"
  )
    div.workshop
      div.purse
        Wallet
      UpgradeList(v-if="tab === 'armory'" station="armory" @focus="emit('show', TRACKS[$event].weapon ?? 'sniper')")
      UpgradeList(v-else-if="tab === 'chassis'" station="chassis")
      ForgePanel(v-else @focus="emit('show', $event)")
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import type { TabOption } from '@/components/atoms/FTabs.vue'
import Wallet from '@/components/base/Wallet.vue'
import UpgradeList from '@/components/base/UpgradeList.vue'
import ForgePanel from '@/components/base/ForgePanel.vue'
import { TRACKS } from '@/game/data/upgrades'
import type { WeaponId } from '@/game/data/ids'

export type WorkshopTab = 'armory' | 'chassis' | 'forge'

const props = defineProps<{ open: boolean; start: WorkshopTab }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'show', weapon: WeaponId): void }>()
const { t } = useI18n()

const tab = ref<WorkshopTab>(props.start)
// Each opening lands on the station whose button was pressed.
watch(() => props.open, (o) => { if (o) tab.value = props.start })

const tabs = computed<TabOption[]>(() => [
  { label: t('base.armory'), value: 'armory', icon: 'sniper' },
  { label: t('base.chassis'), value: 'chassis', icon: 'mech' },
  { label: t('base.forge'), value: 'forge', icon: 'forge' }
])
</script>

<style scoped lang="sass">
.workshop
  display: flex
  flex-direction: column
  gap: clamp(0.4rem, 1.8vmin, 0.8rem)
.purse
  display: flex
  justify-content: flex-end
</style>
