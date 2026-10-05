// The rendered weapon sounds (foley.ts) play as buffers on the SAME sfx bus as
// every other sound, registered for the ad's hard stop, one buffer source per
// play, each variant rendered once.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const registered = vi.hoisted(() => [] as unknown[])
vi.mock('@/use/useAssets', () => ({
  getAudioContext: () => null,
  audioUnlocked: () => true,
  isAudioSuspended: () => false,
  registerOneShotSource: (s: unknown) => { registered.push(s) }
}))
vi.mock('@/use/useUser', () => ({ default: () => ({ userSoundVolume: { value: 0.7 }, userMusicVolume: { value: 0.6 } }) }))
vi.mock('@/use/useMobileAudioMute', () => ({ isMobileAudioMuted: { value: false } }))
vi.mock('@/use/useGamePauseAudio', () => ({ isPlatformAudioMuted: { value: false } }))

import { audio, forceAudioContext } from '@/game/audio/engine'
import { installSynth, minigunHum } from '@/game/audio/synth'
import { playSfxNow } from '@/game/audio/sfx'
import { FOLEY, minigunRound, minigunSpin } from '@/game/audio/foley'

/** Just enough of an AudioContext to follow what connects to what. */
interface FakeNode { kind: string; out: FakeNode[]; [k: string]: unknown }
const param = (value = 0) => ({ value, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} })
const fakeCtx = () => {
  const sources: FakeNode[] = []
  const buffers: Float32Array[] = []
  const node = (kind: string, extra: Record<string, unknown> = {}): FakeNode => {
    const n: FakeNode = {
      kind, out: [],
      connect: (d: FakeNode) => { n.out.push(d); return d },
      disconnect: () => {},
      ...extra
    }
    return n
  }
  const ctx = {
    sampleRate: 48000,
    currentTime: 0,
    state: 'running',
    destination: node('destination'),
    createGain: () => node('gain', { gain: param(1) }),
    createBiquadFilter: () => node('biquad', { frequency: param(350), Q: param(1), type: 'lowpass' }),
    createStereoPanner: () => node('panner', { pan: param(0) }),
    createDynamicsCompressor: () => node('compressor', { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createBuffer: (_ch: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length)
      buffers.push(data)
      return { length, sampleRate, duration: length / sampleRate, getChannelData: () => data }
    },
    createBufferSource: () => {
      const s = node('source', {
        buffer: null, loop: false, playbackRate: param(1), started: false, stopped: false,
        start() { s.started = true }, stop() { s.stopped = true }, addEventListener() {}
      })
      sources.push(s)
      return s
    }
  }
  return { ctx, sources, buffers }
}

/** Every node `n` reaches downstream. */
const reach = (n: FakeNode, seen = new Set<FakeNode>()): Set<FakeNode> => {
  for (const d of n.out) if (!seen.has(d)) { seen.add(d); reach(d, seen) }
  return seen
}

describe('the rendered sounds on the sfx bus', () => {
  const f = fakeCtx()
  let bus: unknown
  beforeAll(() => {
    forceAudioContext(f.ctx as unknown as BaseAudioContext)
    installSynth()
    bus = audio()!.sfx
  })
  // The synth's own retrigger gaps run on the context clock: each play a second on.
  beforeEach(() => { f.ctx.currentTime += 1 })

  it('a minigun round is one buffer source, through a gain, onto the sfx bus, registered for the ad stop', () => {
    const before = f.sources.length
    playSfxNow('minigun')
    expect(f.sources.length).toBe(before + 1)
    const src = f.sources.at(-1)!
    expect(src.started).toBe(true)
    expect(registered).toContain(src)
    expect(src.out[0]!.kind).toBe('gain')
    expect(src.out[0]!.out[0]).toBe(bus)
    // It plays what foley.ts renders.
    const data = (src.buffer as { getChannelData: () => Float32Array }).getChannelData()
    const variants = Array.from({ length: FOLEY.minigun.variants }, (_, v) => minigunRound(48000, v))
    expect(variants.some(v => v.length === data.length && v.every((s, i) => s === data[i]))).toBe(true)
  })

  it('renders each variant once, and never the same variant twice running', () => {
    const seen: unknown[] = []
    for (let i = 0; i < 12; i++) {
      f.ctx.currentTime += 1
      playSfxNow('minigun')
      seen.push(f.sources.at(-1)!.buffer)
    }
    expect(new Set(seen).size).toBe(FOLEY.minigun.variants)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1])
    const made = f.buffers.length
    f.ctx.currentTime += 1
    playSfxNow('minigun')
    expect(f.buffers.length).toBe(made)
  })

  it('every rendered sound reaches the bus, panned and muffled through it', () => {
    for (const name of ['rocket', 'explode', 'sniper', 'bolt', 'impactBody', 'impactMetal', 'hit', 'tink', 'stab', 'bladePull', 'blade'] as const) {
      f.ctx.currentTime += 1
      playSfxNow(name, 0.5, 1, 0.6)
      const src = f.sources.at(-1)!
      expect(src.started, name).toBe(true)
      expect(registered, name).toContain(src)
      const down = [...reach(src)]
      expect(down, name).toContain(bus)
      expect(down.some(n => n.kind === 'panner'), `${name} panned`).toBe(true)
      expect(down.some(n => n.kind === 'biquad' && n.type === 'lowpass'), `${name} muffled`).toBe(true)
    }
  })

  it('the minigun\'s motor is one looping source on the bus, kept while it spins, stopped when it does not', async () => {
    const before = f.sources.length
    minigunHum(0.2)
    minigunHum(0.6)
    minigunHum(1)
    expect(f.sources.length).toBe(before + 1)
    const src = f.sources.at(-1)!
    expect(src.loop).toBe(true)
    expect(registered).toContain(src)
    expect(reach(src)).toContain(bus)
    expect((src.buffer as { length: number }).length).toBe(minigunSpin(48000).length)
    vi.useFakeTimers()
    minigunHum(null)
    vi.advanceTimersByTime(200)
    vi.useRealTimers()
    expect(src.stopped).toBe(true)
  })
})
