<template lang="pug">
  //- The three stations of the Command Base behind one door: the Armory, the
  //- Chassis Bay and the smithy (the Forge) are tabs of the same workshop. An
  //- upgrade paid for in the Armory or the Bay goes straight to the smithy.
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
      UpgradeList(v-if="tab === 'armory'" station="armory" @focus="toSmithy")
      UpgradeList(v-else-if="tab === 'chassis'" station="chassis" @focus="toSmithy")
      SmithyPanel(v-else @focus="emit('show', $event)")
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import type { TabOption } from '@/components/atoms/FTabs.vue'
import Wallet from '@/components/base/Wallet.vue'
import UpgradeList from '@/components/base/UpgradeList.vue'
import SmithyPanel from '@/components/base/SmithyPanel.vue'
import { TRACKS, type TrackId } from '@/game/data/upgrades'
import type { WeaponId } from '@/game/data/ids'

export type WorkshopTab = 'armory' | 'chassis' | 'forge'

const props = defineProps<{ open: boolean; start: WorkshopTab }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'show', weapon: WeaponId): void }>()
const { t } = useI18n()

const tab = ref<WorkshopTab>(props.start)
// Each opening lands on the station whose button was pressed.
watch(() => props.open, (o) => { if (o) tab.value = props.start })

/** Bought: the mech holds up the weapon it is for, and the smithy opens on it. */
const toSmithy = (id: TrackId): void => {
  emit('show', TRACKS[id].weapon ?? 'sniper')
  tab.value = 'forge'
}

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
