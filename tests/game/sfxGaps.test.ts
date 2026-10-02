import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SFX_MIN_GAP_MS, resetSfxGaps, setSfxPlayer, sfx } from '@/game/audio/sfx'

describe('rapid-fire sounds', () => {
  let now = 0
  const played: string[] = []
  beforeEach(() => {
    now = 1000
    played.length = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    resetSfxGaps()
    setSfxPlayer(name => { played.push(name) })
  })
  afterEach(() => {
    setSfxPlayer(null)
    vi.restoreAllMocks()
  })

  it('voices a minigun burst at most once per gap, and again after it', () => {
    const gap = SFX_MIN_GAP_MS.minigun!
    // 40 rounds in one second.
    for (let i = 0; i < 40; i++) { sfx('minigun'); now += 25 }
    expect(played.length).toBeLessThanOrEqual(Math.ceil(1000 / gap) + 1)
    expect(played.length).toBeGreaterThanOrEqual(Math.floor(1000 / (gap + 25)))
    const before = played.length
    now += gap
    sfx('minigun')
    expect(played.length).toBe(before + 1)
  })

  it('limits each sound on its own, and never the one-off sounds', () => {
    sfx('minigun'); sfx('hit'); sfx('minigun'); sfx('hit')
    expect(played).toEqual(['minigun', 'hit'])
    played.length = 0
    sfx('sniper'); sfx('sniper'); sfx('explode'); sfx('explode'); sfx('kill'); sfx('kill')
    expect(played).toEqual(['sniper', 'sniper', 'explode', 'explode', 'kill', 'kill'])
  })

  it('keeps the gaps short enough to still read as a burst', () => {
    for (const [name, gap] of Object.entries(SFX_MIN_GAP_MS)) {
      expect(gap, name).toBeGreaterThanOrEqual(40)
      expect(gap, name).toBeLessThanOrEqual(100)
    }
  })
})
