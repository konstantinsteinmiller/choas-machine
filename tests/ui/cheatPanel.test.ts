// @vitest-environment jsdom
// The dev cheat panel (ctrl+shift+alt+P): Tech Scrap, every level open, god
// mode, and every story scene again.

import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'

const played = vi.hoisted(() => [] as string[])
vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, te: () => false }) }))
vi.mock('@/game/flow', () => ({ flow: { cinema: null }, playCinema: async (id: string) => { played.push(id) } }))

import CheatPanel from '@/game/CheatPanel.vue'
import { profile } from '@/game/state/profile'
import { unlockedLevel, fortressOpen } from '@/game/state/progress'
import { god } from '@/game/state/god'
import { FORTRESS_IDS } from '@/game/data/fortresses/registry'
import { THREAT_LEVELS } from '@/game/sim/rewards'
import { CINEMA_IDS } from '@/game/story/cinemaIds'

const open = () => mount(CheatPanel, { props: { modelValue: true }, attachTo: document.body })
const click = async (id: string): Promise<void> => {
  const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
  expect(el, id).not.toBeNull()
  el!.click()
  await new Promise(r => setTimeout(r, 0))
}

describe('the cheat panel', () => {
  it('gives 5000 Tech Scrap a click', async () => {
    const w = open()
    const before = profile.scrap
    await click('cheat-scrap')
    await click('cheat-scrap')
    expect(profile.scrap).toBe(before + 10000)
    w.unmount()
  })

  it('opens every level of every fortress', async () => {
    const w = open()
    await click('cheat-unlock')
    for (const f of FORTRESS_IDS) {
      expect(fortressOpen(f), f).toBe(true)
      expect(unlockedLevel(f), f).toBe(THREAT_LEVELS)
    }
    w.unmount()
  })

  it('switches god mode on and off', async () => {
    const w = open()
    god.on = false
    await click('cheat-god')
    expect(god.on).toBe(true)
    await click('cheat-god')
    expect(god.on).toBe(false)
    w.unmount()
  })

  it('replays the intro, and every other scene, one button each', async () => {
    played.length = 0
    for (const id of CINEMA_IDS) {
      const w = open()
      await click(id === 'intro' ? 'cheat-intro' : `cheat-scene-${id}`)
      expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
      w.unmount()
    }
    expect(played).toEqual([...CINEMA_IDS])
  })

  it('god mode stops every hit in the sim', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'game', 'sim', 'mission.ts'), 'utf8')
    const hurt = src.slice(src.indexOf('private hurt('), src.indexOf('hurtArmor(this.armor'))
    expect(hurt).toContain('if (god.on) return')
  })
})
