// @vitest-environment jsdom
// #36 / PERF-LEDGER.md entry 4: no audio graph while the boot builds the first scene.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const made = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/use/useAssets', () => ({
  getAudioContext: () => { made.n++; return null },
  audioUnlocked: () => true,
  isAudioSuspended: () => false
}))

describe('the boot holds audio', () => {
  beforeEach(() => { vi.resetModules(); made.n = 0 })

  it('opens nothing while held, and runs what waited once released, in order', async () => {
    const e = await import('@/game/audio/engine')
    e.holdAudio()
    expect(e.audioHeld()).toBe(true)
    expect(e.audio()).toBeNull()
    expect(made.n).toBe(0)
    const ran: string[] = []
    e.whenAudio(() => ran.push('drop-in'))
    e.whenAudio(() => ran.push('music'))
    expect(ran).toEqual([])
    e.releaseAudio()
    expect(ran).toEqual(['drop-in', 'music'])
    expect(e.audioHeld()).toBe(false)
    e.audio()
    expect(made.n).toBe(1)
    // After the boot, nothing waits.
    e.whenAudio(() => ran.push('later'))
    expect(ran).toEqual(['drop-in', 'music', 'later'])
  })

  it('a deferred start that throws does not stop the rest', async () => {
    const e = await import('@/game/audio/engine')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    e.holdAudio()
    const ran: string[] = []
    e.whenAudio(() => { throw new Error('x') })
    e.whenAudio(() => ran.push('next'))
    e.releaseAudio()
    expect(ran).toEqual(['next'])
    warn.mockRestore()
  })
})

describe('voices prefetched after the boot', () => {
  it('one file per speaker, in the player\'s language or English', async () => {
    vi.resetModules()
    const { SPEAKERS } = await import('@/game/audio/voiceCatalog')
    // The build lists the shipped files; here, English and German for every speaker.
    const files = new Map<string, string>()
    for (const l of ['en', 'de']) for (const sp of Object.keys(SPEAKERS)) files.set(`${l}/npc_${sp}_alarm`, `/audio/voice/${l}/npc_${sp}_alarm.ogg`)
    vi.doMock('@/game/assets/overrides', () => ({ VOICE_FILES: files }))
    const { voiceSet } = await import('@/game/audio/voice')
    const speakers = Object.keys(SPEAKERS).length
    const de = [...voiceSet('de')]
    expect(de).toHaveLength(speakers)
    expect(de.every(u => u.includes('/voice/de/'))).toBe(true)
    // A language without recordings hears English: still one file per speaker.
    const fr = [...voiceSet('fr')]
    expect(fr).toHaveLength(speakers)
    expect(fr.every(u => u.includes('/voice/en/'))).toBe(true)
  })
})
