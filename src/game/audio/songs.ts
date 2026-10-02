import { mulberry32, type Rng } from '../world/rng'

/**
 * ─── The score ───────────────────────────────────────────────────────────────
 *
 * Every song the game plays, as note data plus the instruments that voice it.
 * Nothing is sampled: a song is a few thousand numbers, voiced on whatever
 * AudioContext it is handed — the shared one in play, an OfflineAudioContext
 * when a tool renders it to measure loudness.
 *
 * Three songs, one per place the player can be (GDD 4):
 *
 *   - `stealth`: "Night Watch". Low synth pads and a slow pulse, almost no
 *     drums: the base asleep, and the player's own breath.
 *   - `chaos`: "Overload". The alarm has gone: 140 BPM, a driving kit, brass.
 *   - `base`: "Neon Drift". Mid-tempo synthwave for the Command Base.
 *
 * Detuned saw pads, FM keys, plucks, a real kit and a hall reverb, written
 * out by hand: a 25-second pulse-wave loop is the first thing a new player
 * mutes. The sequencer (`music.ts`) loops each and cross-fades between them.
 */

export type TrackId = 'base' | 'stealth' | 'chaos'
export type SongId = TrackId

type Inst =
  | 'cLead' | 'cArp' | 'cBass' | 'cKick' | 'cSnare' | 'cHat'
  | 'pad' | 'pluck' | 'bass' | 'sub' | 'lead' | 'keys' | 'bell' | 'brass' | 'choir' | 'str'
  | 'kick' | 'lkick' | 'bkick' | 'snare' | 'lsnare' | 'clap' | 'hat' | 'ohat' | 'crash'
  | 'tom' | 'taiko' | 'hit' | 'riser' | 'crackle'

/** One note. Its step is its index in `Song.steps`; `len` is in 16ths. */
export interface Ev { i: Inst; m: number; len: number; v: number; p?: number }

interface ChanSpec { gain?: number; pan?: number; send?: number; lp?: number; hp?: number }

export interface Song {
  id: SongId
  bpm: number
  bars: number
  /** Bar a repeat restarts from (the boss skips its intro on repeats). */
  loopBar: number
  /** Delay of every odd 16th, as a fraction of a 16th (lo-fi swing). */
  swing: number
  /** Loudness trim — songs are matched to each other (see tools/music-render). */
  gain: number
  reverb: { seconds: number; decay: number }
  chans: Record<string, ChanSpec>
  steps: Ev[][]
}

// ─── Output graph ───────────────────────────────────────────────────────────

export interface Out {
  ctx: BaseAudioContext
  master: GainNode
  ch: (name: string) => AudioNode
  /** A node every note of an instrument can share (a filter bank, an LFO),
   *  built once per song. Sources it returns are started here and stopped on
   *  dispose. */
  shared: <T extends AudioNode>(key: string, make: () => T) => T
  dispose: () => void
}

const irCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>()

/** A hall: stereo decaying noise, darkened, with a short pre-delay. */
const impulse = (ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer => {
  let m = irCache.get(ctx)
  if (!m) irCache.set(ctx, (m = new Map()))
  const key = `${seconds}:${decay}`
  const hit = m.get(key)
  if (hit) return hit
  const len = Math.floor(ctx.sampleRate * seconds)
  const pre = Math.floor(ctx.sampleRate * 0.015)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  const rng = mulberry32(7)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let lp = 0
    for (let i = pre; i < len; i++) {
      const k = (i - pre) / (len - pre)
      // The one-pole darkens as the tail goes on, like air absorbing the highs.
      lp += ((rng() * 2 - 1) - lp) * (0.6 - 0.45 * k)
      d[i] = lp * Math.pow(1 - k, decay)
    }
  }
  m.set(key, buf)
  return buf
}

export const makeOut = (ctx: BaseAudioContext, dest: AudioNode, song: Song): Out => {
  const master = ctx.createGain()
  master.gain.value = song.gain
  master.connect(dest)
  const nodes: AudioNode[] = [master]
  let verb: AudioNode | null = null
  const reverbIn = (): AudioNode => {
    if (!verb) {
      const cv = ctx.createConvolver()
      cv.buffer = impulse(ctx, song.reverb.seconds, song.reverb.decay)
      cv.connect(master)
      nodes.push(cv)
      verb = cv
    }
    return verb
  }
  const chans = new Map<string, AudioNode>()
  const ch = (name: string): AudioNode => {
    const hit = chans.get(name)
    if (hit) return hit
    const spec = song.chans[name] ?? {}
    const input = ctx.createGain()
    input.gain.value = spec.gain ?? 1
    nodes.push(input)
    let tail: AudioNode = input
    for (const [type, f] of [['lowpass', spec.lp], ['highpass', spec.hp]] as const) {
      if (!f) continue
      const bq = ctx.createBiquadFilter()
      bq.type = type
      bq.frequency.value = f
      bq.Q.value = 0.5
      tail.connect(bq)
      tail = bq
      nodes.push(bq)
    }
    if (spec.pan && 'createStereoPanner' in ctx) {
      const p = ctx.createStereoPanner()
      p.pan.value = spec.pan
      tail.connect(p).connect(master)
      nodes.push(p)
    } else tail.connect(master)
    if (spec.send) {
      const s = ctx.createGain()
      s.gain.value = spec.send
      tail.connect(s).connect(reverbIn())
      nodes.push(s)
    }
    chans.set(name, input)
    return input
  }
  const sharedNodes = new Map<string, AudioNode>()
  const shared = <T extends AudioNode>(key: string, make: () => T): T => {
    const hit = sharedNodes.get(key)
    if (hit) return hit as T
    const n = make()
    if (n instanceof AudioScheduledSourceNode) n.start()
    sharedNodes.set(key, n)
    nodes.push(n)
    return n
  }
  return {
    ctx,
    master,
    ch,
    shared,
    dispose: () => {
      for (const n of nodes) {
        try { if (n instanceof AudioScheduledSourceNode) n.stop() } catch { /* not started */ }
        try { n.disconnect() } catch { /* gone */ }
      }
    }
  }
}

// ─── Sources shared per context ─────────────────────────────────────────────

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()
const noise = (ctx: BaseAudioContext): AudioBuffer => {
  const hit = noiseCache.get(ctx)
  if (hit) return hit
  const len = ctx.sampleRate
  const b = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = b.getChannelData(0)
  const rng = mulberry32(3)
  for (let i = 0; i < len; i++) d[i] = rng() * 2 - 1
  noiseCache.set(ctx, b)
  return b
}

const pulseCache = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>()
/** Band-limited pulse wave (12.5 / 25 / 50 % duty — the console channel's timbres). */
const pulse = (ctx: BaseAudioContext, duty: number): PeriodicWave => {
  let m = pulseCache.get(ctx)
  if (!m) pulseCache.set(ctx, (m = new Map()))
  const hit = m.get(duty)
  if (hit) return hit
  const N = 48
  const real = new Float32Array(N)
  const imag = new Float32Array(N)
  for (let n = 1; n < N; n++) {
    real[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI)
    imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI)
  }
  const w = ctx.createPeriodicWave(real, imag)
  m.set(duty, w)
  return w
}

const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

const osc = (ctx: BaseAudioContext, type: OscillatorType, f: number, t: number, detune = 0): OscillatorNode => {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (detune) o.detune.value = detune
  return o
}

/** Attack to `peak`, decay toward `peak * sus`, release from `end`. */
const envGain = (
  ctx: BaseAudioContext, t: number, a: number, peak: number, d: number, sus: number, end: number, rel: number
): GainNode => {
  const g = ctx.createGain()
  const e = Math.max(end, t + a + 0.002)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + a)
  g.gain.setTargetAtTime(Math.max(0.0001, peak * sus), t + a, Math.max(0.01, d / 3))
  g.gain.setTargetAtTime(0.0001, e, Math.max(0.005, rel / 4))
  return g
}

const run = (nodes: AudioScheduledSourceNode[], t: number, stop: number): void => {
  for (const n of nodes) { n.start(t); n.stop(stop) }
}

const noiseSrc = (ctx: BaseAudioContext, t: number, dur: number): AudioBufferSourceNode => {
  const s = ctx.createBufferSource()
  s.buffer = noise(ctx)
  s.start(t, (t * 7.31) % 0.5)
  s.stop(t + dur)
  return s
}

const filter = (ctx: BaseAudioContext, type: BiquadFilterType, f: number, q: number): BiquadFilterNode => {
  const b = ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}

// ─── Instruments ────────────────────────────────────────────────────────────
// Each takes (out, start time, note, seconds per 16th). Levels are relative;
// a song's `gain` sets where it sits against the others.

type Voice = (o: Out, t: number, e: Ev, spb: number) => void

// Chiptune — the original voices, unchanged in character.
const chipVoice = (o: Out, t: number, dur: number, midi: number, kind: 'lead' | 'arp' | 'bass', duty: number): void => {
  const c = o.ctx
  const s = c.createOscillator()
  if (kind === 'bass') s.type = 'triangle'
  else s.setPeriodicWave(pulse(c, duty))
  s.frequency.setValueAtTime(hz(midi), t)
  if (kind === 'lead') {
    const lfo = c.createOscillator()
    const lg = c.createGain()
    lfo.frequency.value = 6
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(hz(midi) * 0.012, t + Math.min(dur, 0.25))
    lfo.connect(lg).connect(s.frequency)
    run([lfo], t, t + dur + 0.05)
  }
  const g = c.createGain()
  const vol = kind === 'lead' ? 0.1 : kind === 'arp' ? 0.04 : 0.3
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006)
  g.gain.setValueAtTime(vol * (kind === 'arp' ? 0.6 : 0.85), t + dur * 0.5)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(g).connect(o.ch(kind === 'bass' ? 'chipBass' : 'chip'))
  run([s], t, t + dur + 0.02)
}

const chipDrum = (o: Out, t: number, kind: 'kick' | 'snare' | 'hat'): void => {
  const c = o.ctx
  const dest = o.ch('chipDrums')
  if (kind === 'kick') {
    const s = osc(c, 'triangle', 150, t)
    s.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    const g = c.createGain()
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    s.connect(g).connect(dest)
    run([s], t, t + 0.18)
    return
  }
  const len = kind === 'hat' ? 0.04 : 0.14
  const n = noiseSrc(c, t, len + 0.02)
  const f = filter(c, kind === 'hat' ? 'highpass' : 'bandpass', kind === 'hat' ? 7000 : 1800, kind === 'hat' ? 0.7 : 0.9)
  const g = c.createGain()
  g.gain.setValueAtTime(kind === 'hat' ? 0.06 : 0.2, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + len)
  n.connect(f).connect(g).connect(dest)
}

/** Detuned three-saw pad, filtered warm, slow in and out. */
const pad: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const end = t + e.len * spb
  // The warmth is the channel's low-pass (`chans.pad.lp`), shared by every note.
  const g = envGain(c, t, 0.4, 0.05 * e.v, 1, 0.85, end, 1.1)
  const oscs = [-11, 0, 10].map(d => osc(c, 'sawtooth', hz(e.m), t, d))
  for (const s of oscs) s.connect(g)
  g.connect(o.ch('pad'))
  run(oscs, t, end + 1.4)
}

/** Plucked saw/square with a snapping filter — the synthwave arpeggio. `p` = brightness. */
const pluck: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const b = e.p ?? 0.6
  const f = filter(c, 'lowpass', 300, 3)
  f.frequency.setValueAtTime(350 + 4200 * b * e.v, t)
  f.frequency.exponentialRampToValueAtTime(260, t + 0.24)
  const end = t + Math.min(e.len * spb, 0.3)
  // ONE oscillator, stopped as soon as the release is inaudible: this plays
  // every 16th, so its voice count is most of the song's audio-thread cost.
  const g = envGain(c, t, 0.003, 0.26 * e.v, 0.18, 0.3, end, 0.16)
  const s = osc(c, 'sawtooth', hz(e.m), t)
  s.connect(f).connect(g).connect(o.ch('pluck'))
  run([s], t, end + 0.18)
}

/** Saw bass with a sine under it, filter punched on each note. */
const bass: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const end = t + e.len * spb * 0.9
  const f = filter(c, 'lowpass', 200, 1.5)
  f.frequency.setValueAtTime(180 + 900 * e.v, t)
  f.frequency.exponentialRampToValueAtTime(260, t + 0.16)
  const g = envGain(c, t, 0.005, 0.09 * e.v, 0.25, 0.7, end, 0.06)
  const saw = osc(c, 'sawtooth', hz(e.m), t)
  const sine = osc(c, 'sine', hz(e.m), t)
  const sg = c.createGain()
  sg.gain.value = 1
  saw.connect(f).connect(g)
  sine.connect(sg).connect(g)
  g.connect(o.ch('bass'))
  run([saw, sine], t, end + 0.1)
}

/** Round lo-fi bass: sine plus a quiet triangle an octave up for small speakers. */
const sub: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const end = t + e.len * spb * 0.92
  const g = envGain(c, t, 0.012, 0.16 * e.v, 0.6, 0.65, end, 0.12)
  const f = filter(c, 'lowpass', 650, 0.7)
  const s1 = osc(c, 'sine', hz(e.m), t)
  const s2 = osc(c, 'triangle', hz(e.m + 12), t)
  const g2 = c.createGain()
  g2.gain.value = 0.3
  s1.connect(f)
  s2.connect(g2).connect(f)
  f.connect(g).connect(o.ch('sub'))
  run([s1, s2], t, end + 0.2)
}

/** Soft saw lead with a delayed vibrato. */
const lead: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const dur = e.len * spb
  const end = t + dur * 0.95
  // Tone filter on the channel (`chans.lead.lp`); one shared LFO for vibrato,
  // faded in per note so short notes stay straight.
  const g = envGain(c, t, 0.02, 0.16 * e.v, 0.35, 0.75, end, 0.3)
  const oscs = [osc(c, 'sawtooth', hz(e.m), t), osc(c, 'sawtooth', hz(e.m), t, 12), osc(c, 'triangle', hz(e.m - 12), t)]
  if (dur > 0.3) {
    const lfo = o.shared('lead:lfo', () => osc(c, 'sine', 5.2, 0))
    const lg = c.createGain()
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(10, t + 0.4) // cents
    lfo.connect(lg)
    for (const s of oscs) lg.connect(s.detune)
    setTimeout(() => { try { lfo.disconnect(lg) } catch { /* disposed */ } }, (end + 0.5 - c.currentTime) * 1000)
  }
  for (const s of oscs) s.connect(g)
  g.connect(o.ch('lead'))
  run(oscs, t, end + 0.4)
}

/** Electric piano: two-operator FM with a short tine "bark". `p` = strum offset (s). */
const keys: Voice = (o, t0, e, spb) => {
  const c = o.ctx
  const t = t0 + (e.p ?? 0)
  const f0 = hz(e.m)
  const end = t + e.len * spb
  const car = osc(c, 'sine', f0, t)
  const mod = osc(c, 'sine', f0, t)
  const mg = c.createGain()
  mg.gain.setValueAtTime(f0 * 2 * e.v, t)
  mg.gain.exponentialRampToValueAtTime(f0 * 0.2, t + 1.2)
  const tine = osc(c, 'sine', f0 * 14, t)
  const tg = c.createGain()
  tg.gain.setValueAtTime(f0 * 0.5 * e.v, t)
  tg.gain.exponentialRampToValueAtTime(1, t + 0.06)
  mod.connect(mg).connect(car.frequency)
  tine.connect(tg).connect(car.frequency)
  const g = envGain(c, t, 0.004, 0.11 * e.v, 1.4, 0.35, end, 0.35)
  car.connect(g).connect(o.ch('keys'))
  run([car, mod, tine], t, end + 0.5)
}

/** Glassy FM bell. */
const bell: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const f0 = hz(e.m)
  const ring = Math.max(e.len * spb, 1.6)
  const car = osc(c, 'sine', f0, t)
  const mod = osc(c, 'sine', f0 * 3.5, t)
  const mg = c.createGain()
  mg.gain.setValueAtTime(f0 * 2.2 * e.v, t)
  mg.gain.exponentialRampToValueAtTime(f0 * 0.1, t + 0.9)
  mod.connect(mg).connect(car.frequency)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.26 * e.v, t + 0.003)
  g.gain.setTargetAtTime(0.0001, t + 0.003, ring / 4)
  car.connect(g).connect(o.ch('bell'))
  run([car, mod], t, t + ring + 0.2)
}

/** Brass section: detuned saws, the filter swelling open on the attack. */
const brass: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const end = t + e.len * spb * 0.95
  const f = filter(c, 'lowpass', 300, 1.2)
  f.frequency.setValueAtTime(300, t)
  f.frequency.exponentialRampToValueAtTime(400 + 2600 * e.v, t + 0.09)
  f.frequency.setTargetAtTime(1100 + 700 * e.v, t + 0.09, 0.25)
  const g = envGain(c, t, 0.045, 0.16 * e.v, 0.4, 0.8, end, 0.18)
  const oscs = [-7, 6].map(d => osc(c, 'sawtooth', hz(e.m), t, d))
  for (const s of oscs) s.connect(f)
  f.connect(g).connect(o.ch('brass'))
  run(oscs, t, end + 0.3)
}

/** "Aah" choir: saws through vowel formants, slow swell, a little vibrato. */
const choir: Voice = (o, t, e, spb) => {
  const c = o.ctx
  // The vowel and the vibrato are the same for every note, so every note
  // shares them: a note is just two saws and an envelope. (Built per note, the
  // formant bank was the boss song's single biggest audio-thread cost.)
  const vowel = o.shared('choir:vowel', () => {
    const input = c.createGain()
    input.gain.value = 0.5
    for (const [ff, q, lvl] of [[800, 5, 1], [1150, 6, 0.6], [2900, 8, 0.25]] as const) {
      const lv = c.createGain()
      lv.gain.value = lvl
      input.connect(filter(c, 'bandpass', ff, q)).connect(lv).connect(o.ch('choir'))
    }
    return input
  })
  const vibrato = o.shared('choir:vibrato', () => {
    const depth = c.createGain()
    depth.gain.value = 7 // cents
    o.shared('choir:lfo', () => osc(c, 'sine', 4.8, 0)).connect(depth)
    return depth
  })
  const end = t + e.len * spb
  const g = envGain(c, t, 0.6, 0.4 * e.v, 1, 0.9, end, 0.9)
  const oscs = [-8, 8].map(d => osc(c, 'sawtooth', hz(e.m), t, d))
  for (const s of oscs) { vibrato.connect(s.detune); s.connect(g) }
  g.connect(vowel)
  run(oscs, t, end + 1.2)
}

/** Short bowed strings — the boss ostinato. */
const str: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const end = t + Math.min(e.len * spb, 0.16)
  const f = filter(c, 'lowpass', 1200 + 1600 * e.v, 0.8)
  // One oscillator per note for the same reason as `pluck` (16ths throughout).
  const g = envGain(c, t, 0.004, 0.3 * e.v, 0.12, 0.4, end, 0.08)
  const s = osc(c, 'sawtooth', hz(e.m), t)
  s.connect(f).connect(g).connect(o.ch('str'))
  run([s], t, end + 0.1)
}

const kickVoice = (o: Out, t: number, v: number, f0: number, f1: number, dec: number, click: number, chan: string): void => {
  const c = o.ctx
  const dest = o.ch(chan)
  const s = osc(c, 'sine', f0, t)
  s.frequency.exponentialRampToValueAtTime(f1, t + 0.09)
  const g = c.createGain()
  g.gain.setValueAtTime(0.7 * v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec)
  s.connect(g).connect(dest)
  run([s], t, t + dec + 0.02)
  if (click > 0) {
    const n = noiseSrc(c, t, 0.02)
    const cg = c.createGain()
    cg.gain.setValueAtTime(click * v, t)
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012)
    n.connect(filter(c, 'highpass', 3000, 0.7)).connect(cg).connect(dest)
  }
}

const snareVoice = (o: Out, t: number, v: number, band: number, dec: number, toneHz: number, chan: string): void => {
  const c = o.ctx
  const dest = o.ch(chan)
  const n = noiseSrc(c, t, dec + 0.02)
  const g = c.createGain()
  g.gain.setValueAtTime(1 * v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec)
  n.connect(filter(c, 'bandpass', band, 0.7)).connect(g).connect(dest)
  const s = osc(c, 'triangle', toneHz, t)
  s.frequency.exponentialRampToValueAtTime(toneHz * 0.8, t + 0.08)
  const tg = c.createGain()
  tg.gain.setValueAtTime(0.6 * v, t)
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
  s.connect(tg).connect(dest)
  run([s], t, t + 0.1)
}

const clap: Voice = (o, t, e) => {
  const c = o.ctx
  const n = noiseSrc(c, t, 0.25)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  for (const k of [0, 0.011, 0.022]) {
    g.gain.setValueAtTime(1.5 * e.v, t + k)
    g.gain.exponentialRampToValueAtTime(0.15 * e.v, t + k + 0.009)
  }
  g.gain.setValueAtTime(1.1 * e.v, t + 0.033)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
  n.connect(filter(c, 'bandpass', 1100, 1.4)).connect(g).connect(o.ch('clap'))
}

const hatVoice = (o: Out, t: number, v: number, dec: number, chan: string): void => {
  const c = o.ctx
  const n = noiseSrc(c, t, dec + 0.02)
  const g = c.createGain()
  g.gain.setValueAtTime(0.45 * v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec)
  n.connect(filter(c, 'highpass', 7500, 0.7)).connect(g).connect(o.ch(chan))
}

const crash: Voice = (o, t, e) => {
  const c = o.ctx
  const n = noiseSrc(c, t, 0.99)
  const g = c.createGain()
  g.gain.setValueAtTime(0.3 * e.v, t)
  g.gain.setTargetAtTime(0.0001, t, 0.35)
  n.connect(filter(c, 'highpass', 5000, 0.5)).connect(g).connect(o.ch('crash'))
}

const tom: Voice = (o, t, e) => {
  const c = o.ctx
  const s = osc(c, 'sine', hz(e.m) * 1.6, t)
  s.frequency.exponentialRampToValueAtTime(hz(e.m), t + 0.12)
  const g = c.createGain()
  g.gain.setValueAtTime(0.5 * e.v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
  s.connect(g).connect(o.ch('tom'))
  run([s], t, t + 0.4)
}

/** Big drum: a pitched thump with a skin slap on top. */
const taiko: Voice = (o, t, e) => {
  const c = o.ctx
  const dest = o.ch('taiko')
  const f0 = hz(e.m)
  const s = osc(c, 'sine', f0 * 1.8, t)
  s.frequency.exponentialRampToValueAtTime(f0, t + 0.06)
  const g = c.createGain()
  g.gain.setValueAtTime(0.35 * e.v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8)
  s.connect(g).connect(dest)
  run([s], t, t + 0.85)
  const n = noiseSrc(c, t, 0.12)
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.25 * e.v, t)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
  n.connect(filter(c, 'lowpass', 1200, 0.8)).connect(ng).connect(dest)
}

/** Cinematic impact: a sub drop under a darkening noise burst. */
const hit: Voice = (o, t, e) => {
  const c = o.ctx
  const dest = o.ch('hit')
  const s = osc(c, 'sine', 62, t)
  s.frequency.exponentialRampToValueAtTime(28, t + 1.5)
  const g = c.createGain()
  g.gain.setValueAtTime(0.4 * e.v, t)
  g.gain.setTargetAtTime(0.0001, t + 0.05, 0.5)
  s.connect(g).connect(dest)
  run([s], t, t + 2.2)
  const n = noiseSrc(c, t, 1.8)
  const f = filter(c, 'lowpass', 5000, 0.7)
  f.frequency.setValueAtTime(5000, t)
  f.frequency.exponentialRampToValueAtTime(150, t + 1.6)
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.22 * e.v, t)
  ng.gain.setTargetAtTime(0.0001, t + 0.02, 0.4)
  n.connect(f).connect(ng).connect(dest)
}

/** Noise swell into the next section. */
const riser: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const d = e.len * spb
  const n = c.createBufferSource()
  n.buffer = noise(c)
  n.loop = true
  const f = filter(c, 'bandpass', 250, 2)
  f.frequency.setValueAtTime(250, t)
  f.frequency.exponentialRampToValueAtTime(5000, t + d)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.42 * e.v, t + d)
  g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.06)
  n.connect(f).connect(g).connect(o.ch('riser'))
  run([n], t, t + d + 0.08)
}

/** Vinyl dust. */
const crackle: Voice = (o, t, e) => {
  const c = o.ctx
  const n = noiseSrc(c, t, 0.01)
  const g = c.createGain()
  g.gain.setValueAtTime(0.06 * e.v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006)
  n.connect(filter(c, 'highpass', 2500, 0.7)).connect(g).connect(o.ch('crackle'))
}

const INST: Record<Inst, Voice> = {
  cLead: (o, t, e, spb) => chipVoice(o, t, e.len * spb * 0.92, e.m, 'lead', e.p ?? 0.25),
  cArp: (o, t, e, spb) => chipVoice(o, t, spb * 0.9, e.m, 'arp', e.p ?? 0.125),
  cBass: (o, t, e, spb) => chipVoice(o, t, e.len * spb * 0.8, e.m, 'bass', 0.5),
  cKick: (o, t) => chipDrum(o, t, 'kick'),
  cSnare: (o, t) => chipDrum(o, t, 'snare'),
  cHat: (o, t) => chipDrum(o, t, 'hat'),
  pad, pluck, bass, sub, lead, keys, bell, brass, choir, str,
  kick: (o, t, e) => kickVoice(o, t, e.v, 140, 45, 0.45, 0.12, 'kick'),
  lkick: (o, t, e) => kickVoice(o, t, e.v, 105, 48, 0.32, 0, 'kick'),
  bkick: (o, t, e) => kickVoice(o, t, e.v * 0.65, 150, 36, 0.6, 0.15, 'kick'),
  snare: (o, t, e) => snareVoice(o, t, e.v, 1900, 0.2, 185, 'snare'),
  lsnare: (o, t, e) => snareVoice(o, t, e.v * 0.8, 1500, 0.12, 200, 'snare'),
  clap,
  hat: (o, t, e) => hatVoice(o, t, e.v, 0.04, 'hat'),
  ohat: (o, t, e) => hatVoice(o, t, e.v, 0.26, 'ohat'),
  crash, tom, taiko, hit, riser, crackle
}

/** Voice every note on one 16th. Called by the sequencer ahead of time. */
export const playStep = (o: Out, song: Song, step: number, t: number, spb: number): void => {
  const evs = song.steps[step]
  if (!evs || evs.length === 0) return
  const tt = t + (step % 2 === 1 ? song.swing * spb : 0)
  for (const e of evs) INST[e.i](o, tt, e, spb)
}

// ─── Writing helpers ────────────────────────────────────────────────────────

const PC: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }
/** 'C4' → 60. */
export const note = (s: string): number => {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(s)
  if (!m) throw new Error(`bad note ${s}`)
  return 12 * (Number(m[2]) + 1) + PC[m[1]!]!
}

class Score {
  readonly steps: Ev[][]
  constructor (readonly bars: number) {
    this.steps = Array.from({ length: bars * 16 }, () => [])
  }

  add (bar: number, step: number, i: Inst, m: number, len: number, v: number, p?: number): void {
    const s = bar * 16 + step
    if (s < 0 || s >= this.steps.length) return
    this.steps[s]!.push(p === undefined ? { i, m, len, v } : { i, m, len, v, p })
  }

  /** A melody bar written as "E5:0:6 D5:6:2" (note:step:length). */
  line (bar: number, i: Inst, text: string, v: number, octave = 0): void {
    for (const tok of text.trim().split(/\s+/)) {
      if (!tok) continue
      const [n, s, l] = tok.split(':')
      this.add(bar, Number(s), i, note(n!) + 12 * octave, Number(l), v)
    }
  }
}

const jitter = (rng: Rng, v: number, amt = 0.08): number => Math.max(0.05, Math.min(1, v * (1 - amt + rng() * amt * 2)))

// ─── "Neon Drift" — synthwave, 100 BPM, A minor ─────────────────────────────
// intro 4 · A 8 · B (chorus) 8 · outro 4 = 24 bars, 57.6 s.

const drift = (): Song => {
  const S = new Score(24)
  const rng = mulberry32(501)
  const CH: Record<string, [string[], string]> = {
    Am: [['A3', 'C4', 'E4'], 'A2'],
    F: [['F3', 'A3', 'C4'], 'F2'],
    C: [['G3', 'C4', 'E4'], 'C3'],
    G: [['G3', 'B3', 'D4'], 'G2'],
    Dm: [['F3', 'A3', 'D4'], 'D3'],
    E: [['G#3', 'B3', 'E4'], 'E2'],
    Em: [['G3', 'B3', 'E4'], 'E2']
  }
  const prog = 'Am F C G  Am F C G Am F Dm E  F G Em Am F G E E  Am F C G'.split(/\s+/)
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3]
  const melA = [
    'E5:0:6 D5:6:2 C5:8:4 D5:12:4',
    'C5:0:6 A4:6:2 E5:8:8',
    'E5:0:4 G5:4:4 E5:8:4 D5:12:4',
    'D5:0:12 B4:12:4',
    'E5:0:6 D5:6:2 C5:8:4 D5:12:4',
    'C5:0:6 A4:6:2 C5:8:2 D5:10:2 E5:12:4',
    'F5:0:6 E5:6:2 D5:8:4 A4:12:4',
    'G#4:0:8 B4:8:4 E5:12:4'
  ]
  const melB = [
    'A5:0:8 G5:8:4 F5:12:4',
    'G5:0:8 D5:8:4 B4:12:4',
    'E5:0:6 G5:6:2 B5:8:8',
    'A5:0:12 E5:12:4',
    'A5:0:8 G5:8:4 F5:12:4',
    'G5:0:6 A5:6:2 B5:8:4 D6:12:4',
    'B5:0:8 G#5:8:8',
    'E5:0:12'
  ]
  for (let bar = 0; bar < 24; bar++) {
    const [tones, rootName] = CH[prog[bar]!]!
    const t = tones.map(note)
    const root = note(rootName)
    const sec = bar < 4 ? 'intro' : bar < 12 ? 'A' : bar < 20 ? 'B' : 'outro'
    const k = sec === 'A' ? bar - 4 : sec === 'B' ? bar - 12 : sec === 'outro' ? bar - 20 : bar

    for (const m of t) S.add(bar, 0, 'pad', m, 16, sec === 'B' ? 0.95 : 0.75)

    // Arpeggio: the filter opens through the intro and closes through the outro.
    const bright = sec === 'intro' ? 0.2 + 0.12 * k : sec === 'outro' ? 0.5 - 0.1 * k : sec === 'B' ? 0.75 : 0.6
    const arpTones = [t[0]! + 12, t[1]! + 12, t[2]! + 12, t[0]! + 24]
    for (let s = 0; s < 16; s++) {
      S.add(bar, s, 'pluck', arpTones[ARP[s % 8]!]!, 1, jitter(rng, s % 4 === 0 ? 0.85 : 0.55), bright)
    }

    if (sec === 'A' || sec === 'B' || (sec === 'outro' && k < 2)) {
      for (let e = 0; e < 8; e++) S.add(bar, e * 2, 'bass', root + (e === 3 || e === 7 ? 12 : 0), 2, e % 2 === 0 ? 0.95 : 0.75)
    }

    if (sec === 'intro') {
      if (k >= 2) for (const s of [2, 6, 10, 14]) S.add(bar, s, 'hat', 0, 1, 0.3 + 0.1 * (k - 2))
      if (k === 3) S.add(bar, 0, 'riser', 0, 16, 0.8)
    } else if (sec === 'A' || sec === 'B') {
      S.add(bar, 0, 'kick', 0, 1, 1)
      S.add(bar, 8, 'kick', 0, 1, 0.95)
      if (bar % 2 === 1) S.add(bar, 10, 'kick', 0, 1, 0.7)
      S.add(bar, 4, 'snare', 0, 1, 0.9)
      S.add(bar, 12, 'snare', 0, 1, 0.9)
      if (sec === 'B') {
        S.add(bar, 4, 'clap', 0, 1, 0.8)
        S.add(bar, 12, 'clap', 0, 1, 0.8)
        for (const s of [2, 6, 10, 14]) S.add(bar, s, 'ohat', 0, 1, 0.4)
      } else {
        for (let s = 0; s < 16; s += 2) S.add(bar, s, 'hat', 0, 1, jitter(rng, s % 4 === 2 ? 0.55 : 0.3))
      }
      if (k === 0) S.add(bar, 0, 'crash', 0, 1, 0.8)
      // Fills into the chorus and out of it.
      if (bar === 11 || bar === 19) {
        S.add(bar, 0, 'riser', 0, 16, 0.6)
        ;[57, 55, 52, 50].forEach((m, j) => S.add(bar, 12 + j, 'tom', m, 1, 0.7 + 0.08 * j))
      }
      S.line(bar, 'lead', sec === 'A' ? melA[k]! : melB[k]!, sec === 'B' ? 0.95 : 0.8)
    } else {
      // Outro: the kit thins out, the lead leaves an echo of the hook.
      if (k < 2) S.add(bar, 0, 'kick', 0, 1, 0.8)
      if (k < 3) for (const s of [2, 6, 10, 14]) S.add(bar, s, 'hat', 0, 1, 0.35 - 0.08 * k)
      if (k === 0) { S.add(bar, 0, 'crash', 0, 1, 0.6); S.line(bar, 'lead', 'E5:0:6 D5:6:2 C5:8:8', 0.6) }
      if (k === 1) S.line(bar, 'lead', 'C5:0:6 A4:6:2 E5:8:8', 0.45)
    }
  }
  return {
    id: 'base',
    bpm: 100,
    bars: 24,
    loopBar: 0,
    swing: 0,
    gain: 0.64,
    reverb: { seconds: 2.6, decay: 2.5 },
    chans: {
      pad: { send: 0.35, lp: 1900 },
      pluck: { send: 0.3, pan: 0.2 },
      bass: {},
      lead: { send: 0.4, pan: -0.1, lp: 2400 },
      kick: { send: 0.04 },
      snare: { send: 0.5 },
      clap: { send: 0.35, pan: -0.1 },
      hat: { pan: 0.3, send: 0.08 },
      ohat: { pan: -0.3, send: 0.1 },
      crash: { send: 0.25 },
      tom: { send: 0.3 },
      riser: { send: 0.4 }
    },
    steps: S.steps
  }
}

// ─── "Overload" — the base on full alert, 140 BPM, D minor ───────────────────
// intro 4 (once) · A 8 · B 8 · C (breakdown + build) 8 · A' 4 = 32 bars, 55 s;
// repeats from A, so a long fight never hears the intro twice.

const boss = (): Song => {
  const S = new Score(32)
  const rng = mulberry32(1313)
  const CH: Record<string, [string[], string]> = {
    Dm: [['D4', 'F4', 'A4'], 'D3'],
    Bb: [['D4', 'F4', 'Bb4'], 'Bb2'],
    C: [['E4', 'G4', 'C5'], 'C3'],
    Gm: [['D4', 'G4', 'Bb4'], 'G2'],
    Eb: [['Eb4', 'G4', 'Bb4'], 'Eb3'],
    A: [['C#4', 'E4', 'A4'], 'A2']
  }
  const prog = ('Dm Dm Dm A  Dm Dm Bb C Dm Dm Bb A  Gm Eb Dm A Gm Eb Dm A  ' +
    'Dm Bb Gm A Dm Bb Gm A  Dm Eb Dm A').split(/\s+/)
  // Low-string gallop: octaves and fifths only, so it sits under every chord.
  const OST = [0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 12, 0, 7, 0, 12, 7]
  const ACC = new Set([0, 6, 8, 12])
  const theme = [
    'D4:0:4 G4:4:8 A4:12:2 Bb4:14:2',
    'G4:0:12 F4:12:2 Eb4:14:2',
    'F4:0:4 D4:4:8 A3:12:4',
    'C#4:0:8 E4:8:8',
    'D4:0:4 G4:4:8 A4:12:2 Bb4:14:2',
    'C5:0:8 Bb4:8:4 G4:12:4',
    'A4:0:8 F4:8:4 D4:12:4',
    'E4:0:8 A4:8:8'
  ]
  const ostinato = (bar: number, v: number, root: number): void => {
    OST.forEach((o, s) => S.add(bar, s, 'str', root + o, 1, jitter(rng, ACC.has(s) ? v : v * 0.6, 0.05)))
  }
  const fullKit = (bar: number, k: number): void => {
    S.add(bar, 0, 'bkick', 0, 1, 1)
    S.add(bar, 8, 'bkick', 0, 1, 0.9)
    if (k % 2 === 1) S.add(bar, 10, 'bkick', 0, 1, 0.7)
    for (const [s, v] of [[0, 1], [3, 0.55], [6, 0.7], [8, 0.9], [11, 0.55], [14, 0.7]] as const) S.add(bar, s, 'taiko', 40, 1, v)
    S.add(bar, 4, 'snare', 0, 1, 0.8)
    S.add(bar, 12, 'snare', 0, 1, 0.85)
    for (let s = 0; s < 16; s += 2) S.add(bar, s, 'hat', 0, 1, jitter(rng, 0.22))
  }
  const tomFill = (bar: number): void => {
    ;[62, 60, 57, 55, 52, 50, 47, 45].forEach((m, j) => S.add(bar, 8 + j, 'tom', m, 1, 0.6 + 0.05 * j))
  }
  const stabs = (bar: number, chord: number[]): void => {
    for (const [s, l] of [[0, 3], [3, 3], [6, 2]] as const) for (const m of chord) S.add(bar, s, 'brass', m - 12, l, 0.85)
  }

  for (let bar = 0; bar < 32; bar++) {
    const [tones, rootName] = CH[prog[bar]!]!
    const chord = tones.map(note)
    const root = note(rootName)
    const sec = bar < 4 ? 'intro' : bar < 12 ? 'A' : bar < 20 ? 'B' : bar < 28 ? 'C' : 'A2'
    const k = sec === 'intro' ? bar : bar - (sec === 'A' ? 4 : sec === 'B' ? 12 : sec === 'C' ? 20 : 28)

    if (sec === 'intro') {
      if (k === 0) { S.add(bar, 0, 'hit', 0, 1, 1); for (const m of chord) S.add(bar, 0, 'choir', m, 32, 0.7) }
      if (k === 1) { S.add(bar, 0, 'taiko', 40, 1, 0.9); S.add(bar, 8, 'taiko', 40, 1, 0.8) }
      if (k >= 2) ostinato(bar, 0.55 + 0.2 * (k - 2), root)
      if (k === 2) for (const s of [0, 6, 8, 14]) S.add(bar, s, 'taiko', 40, 1, 0.75)
      if (k === 3) {
        for (let s = 0; s < 16; s += s < 8 ? 2 : 1) S.add(bar, s, 'taiko', 40, 1, 0.45 + s * 0.035)
        S.add(bar, 0, 'riser', 0, 16, 0.9)
        for (let s = 12; s < 16; s++) S.add(bar, s, 'snare', 0, 1, 0.5 + 0.1 * (s - 12))
      }
      continue
    }

    if (sec === 'A' || sec === 'A2') {
      if (k === 0) { S.add(bar, 0, 'hit', 0, 1, 0.9); S.add(bar, 0, 'crash', 0, 1, 0.9) }
      ostinato(bar, 1, root)
      fullKit(bar, k)
      if (k % 2 === 1 || sec === 'A2') stabs(bar, chord)
      if (sec === 'A' && k >= 4) for (const m of chord) S.add(bar, 0, 'choir', m, 16, 0.6)
      if ((sec === 'A' && k === 7) || (sec === 'A2' && k === 3)) tomFill(bar)
      continue
    }

    if (sec === 'B') {
      if (k === 0 || k === 4) S.add(bar, 0, 'crash', 0, 1, 0.9)
      ostinato(bar, 0.9, root)
      fullKit(bar, k)
      for (const m of chord) S.add(bar, 0, 'choir', m, 16, 0.75)
      S.line(bar, 'brass', theme[k]!, 0.95)
      S.line(bar, 'brass', theme[k]!, 0.8, -1)
      continue
    }

    // C — breakdown, then the build back into A.
    if (k === 0) S.add(bar, 0, 'hit', 0, 1, 1)
    for (const m of chord) S.add(bar, 0, 'choir', m, 16, 0.8)
    S.add(bar, 0, 'brass', root, 16, 0.5)
    S.add(bar, 0, 'brass', root + 7, 16, 0.45)
    if (k < 4) {
      S.add(bar, 0, 'taiko', 40, 1, 0.9)
      S.add(bar, 8, 'taiko', 40, 1, 0.75)
      S.add(bar, 0, 'bkick', 0, 1, 0.8)
    } else {
      ostinato(bar, 0.5 + 0.12 * (k - 4), root)
      const step = k < 6 ? 2 : 1
      for (let s = 0; s < 16; s += step) S.add(bar, s, 'taiko', 40, 1, 0.4 + 0.06 * (k - 4) + s * 0.012)
      if (k === 6) S.add(bar, 0, 'riser', 0, 32, 1)
      if (k === 7) for (let s = 0; s < 16; s++) S.add(bar, s, 'snare', 0, 1, 0.35 + s * 0.04)
    }
  }
  return {
    id: 'chaos',
    bpm: 140,
    bars: 32,
    loopBar: 4,
    swing: 0,
    gain: 0.6,
    reverb: { seconds: 2.8, decay: 2.2 },
    chans: {
      str: { pan: -0.2, send: 0.2 },
      brass: { pan: 0.12, send: 0.3 },
      choir: { send: 0.55 },
      taiko: { send: 0.28 },
      kick: { send: 0.08 },
      snare: { send: 0.35, pan: 0.05 },
      hat: { pan: 0.35, send: 0.1 },
      tom: { send: 0.3 },
      hit: { send: 0.5 },
      crash: { send: 0.3 },
      riser: { send: 0.4 }
    },
    steps: S.steps
  }
}

// ─── "Night Watch" — the stealth phase, 76 BPM, A minor ─────────────────────
// 32 bars, 101 s. A sub pulse like a heartbeat, a pad that moves one chord
// every two bars, a muted arpeggio that only half appears, a bell now and
// then. No kick, no snare: nothing in it says "fight".

const stealth = (): Song => {
  const S = new Score(32)
  const rng = mulberry32(733)
  const CH: Record<string, [string[], string]> = {
    Am: [['A3', 'C4', 'E4'], 'A1'],
    F: [['F3', 'A3', 'C4'], 'F1'],
    Dm: [['D3', 'F3', 'A3'], 'D2'],
    Em: [['E3', 'G3', 'B3'], 'E1'],
    G: [['D3', 'G3', 'B3'], 'G1'],
    C: [['E3', 'G3', 'C4'], 'C2']
  }
  // One chord every two bars; the last line turns round on the dominant minor.
  const prog = 'Am Am F F Dm Dm Em Em  Am Am F F C C G G  Am Am F F Dm Dm Em Em  F F G G Am Am Em Em'.split(/\s+/)
  const bells = ['E5:0:8', 'C5:8:8', 'A4:0:12', 'B4:4:8', 'E5:0:6 D5:8:8', 'C5:0:12', 'G4:4:8', 'A4:0:16']
  for (let bar = 0; bar < 32; bar++) {
    const [tones, rootName] = CH[prog[bar]!]!
    const t = tones.map(note)
    const root = note(rootName)
    const part = Math.floor(bar / 8)
    const first = bar % 2 === 0

    // The pad: struck on the chord change, held for both bars.
    if (first) for (const m of t) S.add(bar, 0, 'pad', m, 32, part === 1 ? 0.7 : 0.55)

    // The heartbeat: two soft subs a bar, a third when the line lifts.
    S.add(bar, 0, 'sub', root + 12, 6, 0.8)
    S.add(bar, 8, 'sub', root + 12, 4, 0.55)
    if (part === 1 || part === 3) S.add(bar, 13, 'sub', root + 19, 2, 0.4)

    // The arpeggio: present from the second part, dark, never on every step.
    if (part >= 1) {
      const arp = [t[0]! + 12, t[1]! + 12, t[2]! + 12, t[1]! + 12]
      const bright = part === 1 ? 0.18 : part === 2 ? 0.26 : 0.34
      for (let st = 0; st < 16; st += 2) {
        if (rng() < 0.22) continue
        S.add(bar, st, 'pluck', arp[(st / 2) % 4]!, 2, jitter(rng, st % 8 === 0 ? 0.5 : 0.32), bright)
      }
    }

    // A tick of a hat, like a clock, in the outer parts; a held breath in the middle.
    if (part !== 2) for (const st of [4, 12]) S.add(bar, st, 'hat', 0, 1, jitter(rng, 0.2))
    if (part === 3) for (const st of [2, 6, 10, 14]) S.add(bar, st, 'hat', 0, 1, jitter(rng, 0.14))

    // The bell: one phrase every other bar from the second part on.
    if (part >= 1 && first) S.line(bar, 'bell', bells[(bar / 2) % bells.length]!, part === 3 ? 0.5 : 0.38)

    // Vinyl dust under all of it, and a slow swell into each new part.
    if (bar % 4 === 0) S.add(bar, 0, 'crackle', 0, 64, 0.35)
    if (bar % 8 === 7) S.add(bar, 0, 'riser', 0, 16, 0.25)
  }
  return {
    id: 'stealth',
    bpm: 76,
    bars: 32,
    loopBar: 0,
    swing: 0,
    // Measured: about 3 dB under the base theme, 5 under the alarm. Quiet on
    // purpose, but not so quiet that the alarm arrives as a jump scare.
    gain: 0.95,
    reverb: { seconds: 3.4, decay: 2.2 },
    chans: {
      pad: { send: 0.5, lp: 1300 },
      sub: {},
      pluck: { send: 0.45, pan: 0.25, lp: 1800 },
      bell: { send: 0.65, pan: -0.2 },
      hat: { pan: 0.35, send: 0.2 },
      crackle: { send: 0.1 },
      riser: { send: 0.5 }
    },
    steps: S.steps
  }
}

// ─── Registry ───────────────────────────────────────────────────────────────

const cache = new Map<SongId, Song>()

/** The song, composed on first use (a few ms) and kept. */
export const getSong = (id: SongId): Song => {
  const hit = cache.get(id)
  if (hit) return hit
  const s = id === 'base' ? drift() : id === 'chaos' ? boss() : stealth()
  cache.set(id, s)
  return s
}

/** Length of one pass through a song, in seconds. */
export const songSeconds = (s: Song): number => (s.bars * 16 * 60) / s.bpm / 4

/** Result-screen fanfares, on the chiptune voices. */
export const playJingleNotes = (ctx: BaseAudioContext, dest: AudioNode, kind: 'victory' | 'defeat'): Out => {
  const o = makeOut(ctx, dest, { ...getSong('base'), gain: 1 })
  const t0 = ctx.currentTime + 0.05
  const notes = kind === 'victory'
    ? [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [79, 0.6], [84, 0.72], [88, 0.84]]
    : [[67, 0], [63, 0.2], [60, 0.4], [55, 0.7]]
  const d = kind === 'victory' ? 0.22 : 0.35
  for (const [m, dt] of notes) chipVoice(o, t0 + dt!, d, m!, 'lead', 0.25)
  for (const [m, dt] of notes) chipVoice(o, t0 + dt!, d, m! - 24, 'bass', 0.5)
  return o
}
