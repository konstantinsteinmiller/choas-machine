// #65: the voice catalogue, the cards and the locales stay in step.
import { describe, expect, it } from 'vitest'
import { SPEAKERS, SPEAKER_OF, VOICE_LINES, fileName } from '@/game/audio/voiceCatalog'
import { CARDS, TONES } from '@/game/audio/voiceCards'
import en from '@/i18n/locales/en'
import de from '@/i18n/locales/de'
// @ts-expect-error plain .mjs tool modules, no types
import { chainFor } from '../../tools/voice/fx.mjs'

const at = (o: unknown, key: string): unknown => key.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown>)?.[k], o)

describe('the voice catalogue', () => {
  it('keys hold no underscore (a file name maps back to one line) and are unique', () => {
    const keys = VOICE_LINES.map(l => l.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).not.toContain('_')
    expect(fileName('npc.guard.alarm')).toBe('npc_guard_alarm')
  })

  it('every live line has its words in the voiced languages, and no draft beside them', () => {
    for (const l of VOICE_LINES) {
      if (l.status !== 'live') continue
      for (const loc of [en, de]) expect(typeof at(loc, l.text ?? l.key), l.key).toBe('string')
      expect(l.draft).toBeUndefined()
    }
  })

  it('cards, tones and chains cover every speaker and line, in order', () => {
    expect(Object.keys(TONES)).toEqual(VOICE_LINES.map(l => l.key))
    for (const s of Object.keys(SPEAKERS)) {
      expect(CARDS[s as keyof typeof CARDS]).toBeDefined()
      expect(() => chainFor(s, `npc.${s}.alarm`)).not.toThrow()
    }
  })

  it('every unit that shouts has a voice', () => {
    for (const kind of ['guard', 'sentry', 'commander', 'drone', 'enforcer', 'goliath', 'hound'] as const) {
      expect(SPEAKERS[SPEAKER_OF(kind, null)]).toBeDefined()
    }
    expect(SPEAKER_OF('guard', 'engineer')).toBe('engineer')
    expect(SPEAKER_OF('commander', null)).toBe('warden')
  })
})
