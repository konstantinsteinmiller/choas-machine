// PERF-LEDGER.md entry 6: one reverb hall per room, shared by every song and
// built ahead in a calm moment (the drop-in), never per song mid-fight.
import { describe, expect, it } from 'vitest'
import { getSong, hallReady, makeOut, warmHalls } from '@/game/audio/songs'

/** Just enough of an AudioContext for the song graph, counting convolvers. */
const fakeCtx = () => {
  let convolvers = 0
  const node = (): Record<string, unknown> => {
    const n: Record<string, unknown> = {
      connect: (d: unknown) => d,
      disconnect: () => {},
      gain: { value: 1 },
      frequency: { value: 0 },
      Q: { value: 0 },
      pan: { value: 0 },
      type: ''
    }
    return n
  }
  const ctx = {
    sampleRate: 8000,
    currentTime: 0,
    createGain: node,
    createBiquadFilter: node,
    createStereoPanner: node,
    createConvolver: () => { convolvers++; return { ...node(), buffer: null } },
    createBuffer: (ch: number, len: number) => ({ getChannelData: () => new Float32Array(len), numberOfChannels: ch })
  }
  return { ctx: ctx as unknown as BaseAudioContext, count: () => convolvers }
}

describe('reverb halls', () => {
  it('a song reuses its hall: starting it again builds nothing', () => {
    const { ctx, count } = fakeCtx()
    const dest = ctx.createGain()
    const song = getSong('stealth')
    // A channel with a send pulls the reverb in on its first note.
    const send = Object.keys(song.chans).find(k => song.chans[k]?.send)
    expect(send).toBeTruthy()
    makeOut(ctx, dest, song).ch(send!)
    expect(count()).toBe(1)
    makeOut(ctx, dest, song).ch(send!)
    expect(count()).toBe(1)
  })

  it('warming builds a scene\'s halls ahead, so its songs build none', () => {
    const { ctx, count } = fakeCtx()
    const dest = ctx.createGain()
    warmHalls(ctx, dest, ['stealth', 'chaos'])
    const built = count()
    expect(built).toBeGreaterThanOrEqual(1)
    expect(hallReady(ctx, dest, getSong('chaos'))).toBe(true)
    for (const id of ['stealth', 'chaos'] as const) {
      const song = getSong(id)
      const send = Object.keys(song.chans).find(k => song.chans[k]?.send)
      if (send) makeOut(ctx, dest, song).ch(send)
    }
    expect(count()).toBe(built)
  })

  it('a song\'s fades move both its dry and its wet level', () => {
    const { ctx } = fakeCtx()
    const o = makeOut(ctx, ctx.createGain(), getSong('base'))
    expect(o.levels).toContain(o.master)
    expect(o.levels).toContain(o.wet)
    expect(o.wet.gain.value).toBe(o.master.gain.value)
  })
})
