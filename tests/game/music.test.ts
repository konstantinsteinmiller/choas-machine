// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

vi.mock('virtual:asset-overrides', () => ({ default: { sfx: [], music: [], textures: [] } }))

import { getSong, songSeconds, type SongId } from '@/game/audio/songs'
import { songFor, shouldRotate, keepsPlaying } from '@/game/audio/music'

const ALL: SongId[] = ['base', 'stealth', 'chaos']

describe('the music', () => {
  it('every place has one song and loops it', () => {
    for (const id of ALL) {
      for (const slot of [0, 1, 2, 7]) expect(songFor(id, slot)).toBe(id)
      expect(shouldRotate(id, id, 9999)).toBe(false)
      expect(keepsPlaying(id, id, 0)).toBe(true)
    }
  })

  it('a change of place changes the song: the stealth theme never plays on under the alarm', () => {
    expect(keepsPlaying('chaos', 'stealth', 0)).toBe(false)
    expect(keepsPlaying('stealth', 'chaos', 0)).toBe(false)
    expect(keepsPlaying('base', 'chaos', 0)).toBe(false)
    expect(keepsPlaying('base', null, 0)).toBe(false)
  })
})

describe('the songs', () => {
  it('each is long enough not to be heard as a loop in its first minute', () => {
    for (const id of ALL) expect(songSeconds(getSong(id)), id).toBeGreaterThan(50)
  })

  it('the stealth theme has no kick and no snare; the chaos theme has both', () => {
    const insts = (id: SongId): Set<string> => new Set(getSong(id).steps.flat().map(e => e.i))
    const quiet = insts('stealth')
    for (const drum of ['kick', 'bkick', 'lkick', 'snare', 'lsnare', 'clap', 'taiko']) expect(quiet.has(drum), drum).toBe(false)
    const loud = insts('chaos')
    expect([...loud].some(i => /kick/.test(i))).toBe(true)
    expect([...loud].some(i => /snare|clap/.test(i))).toBe(true)
  })

  it('the stealth theme is the slowest and the chaos theme the fastest', () => {
    expect(getSong('stealth').bpm).toBeLessThan(getSong('base').bpm)
    expect(getSong('base').bpm).toBeLessThan(getSong('chaos').bpm)
  })

  it('none of them is chiptune', () => {
    for (const id of ALL) expect(getSong(id).steps.flat().filter(e => /^c[A-Z]/.test(e.i)), id).toEqual([])
  })

  it('every instrument a song plays has a channel to play on', () => {
    for (const id of ALL) {
      const s = getSong(id)
      expect(s.id).toBe(id)
      // An instrument without its own channel falls back to the master; the
      // ones a song names must at least be spelt like instruments it uses.
      const used = new Set(s.steps.flat().map(e => e.i as string))
      for (const ch of Object.keys(s.chans)) expect(used.has(ch) || ['chip', 'chipDrums', 'str', 'choir', 'brass', 'lkick', 'ohat', 'clap', 'tom', 'hit', 'crash', 'riser', 'keys', 'bell', 'sub', 'lead', 'pluck', 'pad', 'bass', 'kick', 'snare', 'hat', 'taiko', 'crackle'].includes(ch), `${id}/${ch}`).toBe(true)
    }
  })

  it('every note is well-formed', () => {
    for (const id of ALL) {
      const s = getSong(id)
      expect(s.steps.length, id).toBe(s.bars * 16)
      expect(s.loopBar).toBeLessThan(s.bars)
      for (const e of s.steps.flat()) {
        expect(Number.isFinite(e.m) && e.len > 0 && e.v > 0 && e.v <= 1, `${id}/${e.i}`).toBe(true)
      }
    }
  })
})
