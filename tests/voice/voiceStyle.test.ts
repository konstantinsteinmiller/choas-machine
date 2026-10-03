// The written delivery an engine is given for a line (tools/voice/style.mjs).
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs tool module, no types
import { styleFor } from '../../tools/voice/style.mjs'
// @ts-expect-error plain .mjs tool module, no types
import { tagFor } from '../../tools/voice/engines/elevenlabs.mjs'

const job = { lang: 'en', direction: 'Worried, quick, not loud.', tone: 'urgent', situation: 'Health under 30 %', emphasis: [], max: 3 }

describe('the delivery a line is spoken with', () => {
  it('carries the direction, the tone, the situation and the length', () => {
    expect(styleFor(job)).toBe('Worried, quick, not loud. Tone: urgent. Situation: Health under 30 %. Brisk, 3 seconds at most.')
  })

  it('names the shouted words, and speaks German to a German line', () => {
    const de = styleFor({ ...job, lang: 'de', direction: 'Besorgt.', emphasis: ['blaze', 'master'] })
    expect(de).toContain('Betont: blaze, master.')
    expect(de).toContain('höchstens 3 Sekunden')
  })

  it("gives ElevenLabs a short audio tag: the tone and the direction's first clause, never the whole note", () => {
    expect(tagFor('Soft: the first words he ever hears. Warm on "Flux".', 'warm')).toBe('[warm, soft] ')
    expect(tagFor('Worried, quick, not loud.', 'urgent')).toBe('[urgent, worried, quick, not loud] ')
    expect(tagFor('A full boxing-announcer build.', 'neutral')).toBe('[a full boxing-announcer build] ')
    expect(tagFor('', 'neutral')).toBe('')
  })
})
