// #126: CM-07 comments now and then, never chatty; unseen it whispers.
import { describe, expect, it } from 'vitest'
import { QUIP_GAP_HOT_S, QUIP_GAP_S, QUIP_REPEAT_S, makeQuips, pickQuip } from '@/game/sim/quips'
import { QUIP_IDS, QUIP_SAID, VOICE_LINES } from '@/game/audio/voiceCatalog'
import en from '@/i18n/locales/en'

describe('CM-07\'s one-liners', () => {
  it('unseen it whispers, spotted it says it out loud', () => {
    expect(pickQuip(makeQuips(), 'takedown', 100, false)).toEqual({ id: 'takedown', whisper: true })
    expect(pickQuip(makeQuips(), 'takedown', 100, true)).toEqual({ id: 'takedown', whisper: false })
  })

  it('never two lines within the gap; a headshot or a burn may come sooner, not the same line again', () => {
    const s = makeQuips()
    expect(pickQuip(s, 'loot', 0, false)).not.toBeNull()
    expect(pickQuip(s, 'takedown', QUIP_GAP_S - 1, false)).toBeNull()
    expect(pickQuip(s, 'headshot', QUIP_GAP_HOT_S + 0.1, false)).not.toBeNull()
    // Another headshot right after: the full gap, and then not the same line for a minute.
    expect(pickQuip(s, 'headshot', QUIP_GAP_HOT_S * 2 + 0.2, false)).toBeNull()
    expect(pickQuip(s, 'headshot', QUIP_GAP_HOT_S + 0.1 + QUIP_GAP_S + 1, false)).toBeNull()
    expect(pickQuip(s, 'headshot', QUIP_GAP_HOT_S + 0.1 + QUIP_REPEAT_S + 1, false)).not.toBeNull()
  })

  it('the alarm is never whispered, low health never said out loud', () => {
    expect(pickQuip(makeQuips(), 'alarm', 50, false)).toBeNull()
    expect(pickQuip(makeQuips(), 'alarm', 50, true)).toEqual({ id: 'alarm', whisper: false })
    expect(pickQuip(makeQuips(), 'lowHealth', 50, true)).toBeNull()
    expect(pickQuip(makeQuips(), 'lowHealth', 50, false)).toEqual({ id: 'lowHealth', whisper: true })
  })

  it('every line has its words, and a voice take for each way it can be said', () => {
    const keys = new Set(VOICE_LINES.map(l => l.key))
    for (const id of QUIP_IDS) {
      expect(typeof (en as unknown as Record<string, Record<string, string>>).quip[id], id).toBe('string')
      expect(keys.has(`hero.${id}.loud`)).toBe(QUIP_SAID[id].loud)
      expect(keys.has(`hero.${id}.whisper`)).toBe(QUIP_SAID[id].whisper)
    }
  })
})
