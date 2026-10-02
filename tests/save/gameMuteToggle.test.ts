// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { drainAndResetModules, drainPersist, holdGameState } from '../stubs/drainPersist'

// ─── The HUD speaker button and F2 ───────────────────────────────────────────
//
// One switch, three ways in: the top bar's speaker button, F2 on any screen,
// and FMuteButton. `useGameMute` must drive the SAME state FMuteButton does
// (on desktop the volume mute of useCrazyMuteSync), or the button would say
// "muted" over a game that is playing.

const SOUND_KEY = 'cm_user_sound_volume'
const MUSIC_KEY = 'cm_user_music_volume'

beforeEach(async () => {
  localStorage.clear()
  drainAndResetModules()
  await holdGameState()
})

afterEach(drainPersist)

describe('useGameMute (desktop)', () => {
  it('mutes and unmutes through the shared volume mute', async () => {
    const { gameMuted, toggleGameMute } = await import('@/use/useGameMute')
    const { isMuted } = await import('@/use/useCrazyMuteSync')
    const { getState } = await import('@/use/useGameState')
    expect(gameMuted.value).toBe(false)

    toggleGameMute()
    expect(gameMuted.value).toBe(true)
    expect(isMuted.value).toBe(true)
    expect(getState(MUSIC_KEY)).toBe(0)
    expect(getState(SOUND_KEY)).toBe(0)

    toggleGameMute()
    expect(gameMuted.value).toBe(false)
    expect(getState(MUSIC_KEY)).toBeGreaterThan(0)
    expect(getState(SOUND_KEY)).toBeGreaterThan(0)
  })
})

describe('wiring', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8')

  it('F2 toggles the same mute from the scene key handler', () => {
    const scene = src('src/views/GameScene.vue')
    expect(scene).toMatch(/e\.code === 'F2'/)
    expect(scene).toMatch(/toggleGameMute\(\)/)
  })
})
