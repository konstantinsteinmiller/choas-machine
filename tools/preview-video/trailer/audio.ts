/**
 * ─── The trailer's soundtrack, rendered offline (#X1) ────────────────────────
 *
 * Loaded into a page on the dev server by `build.mjs`. It builds the game's
 * own audio graph (buses, ducking, compressor, limiter) on an
 * OfflineAudioContext (`engine.forceAudioContext`) and plays into it, at
 * their times in the cut:
 *
 *   - every sound the game played during the shots (`sfx`), through the
 *     game's own synthesizers, at the moment the shot logged it;
 *   - CM-07's lines (`voice`), the game's recorded voice files, with the
 *     music ducking under them as it does in play;
 *   - the score (`music`): the game's songs, note by note.
 *
 * An offline context renders faster than real time and the same every run.
 * Sounds that start from `ctx.currentTime` are fired from a `suspend()` at
 * their time, so the synthesizers need no change.
 */
import { audio, duckMusic, forceAudioContext } from '@/game/audio/engine'
import { installSynth } from '@/game/audio/synth'
import { playSfxNow, type SfxName } from '@/game/audio/sfx'
import { getSong, makeOut, playStep, type SongId } from '@/game/audio/songs'

export interface Plan {
  seconds: number
  sfx: Array<{ t: number; name: SfxName; pan: number; gain: number; muffle: number }>
  voice: Array<{ t: number; url: string; gain: number }>
  music: Array<{ song: SongId; from: number; to: number; step?: number; fadeIn?: number; fadeOut?: number; gain?: number }>
}

const RATE = 48000
/** The render quantum: a suspend lands on a multiple of it. */
const QUANTUM = 128 / RATE

/** 16-bit PCM WAV of a rendered buffer, as base64 in chunks (a CDP message has a size cap). */
const wav = (b: AudioBuffer): string[] => {
  const n = b.length
  const ch = b.numberOfChannels
  const bytes = new Uint8Array(44 + n * ch * 2)
  const v = new DataView(bytes.buffer)
  const str = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true)
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * ch * 2, true)
  const data = Array.from({ length: ch }, (_, c) => b.getChannelData(c))
  let o = 44
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c]![i]!))
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      o += 2
    }
  }
  const out: string[] = []
  const CHUNK = 3 * 1024 * 1024
  for (let i = 0; i < bytes.length; i += CHUNK) {
    let bin = ''
    const part = bytes.subarray(i, Math.min(bytes.length, i + CHUNK))
    for (let k = 0; k < part.length; k += 0x8000) bin += String.fromCharCode(...part.subarray(k, k + 0x8000))
    out.push(btoa(bin))
  }
  return out
}

export const renderTrailerAudio = async (plan: Plan): Promise<string[]> => {
  const ctx = new OfflineAudioContext(2, Math.ceil(plan.seconds * RATE), RATE)
  forceAudioContext(ctx)
  installSynth()
  const a = audio()
  if (!a) throw new Error('no audio graph on the offline context')

  // The voice files, decoded up front.
  const buffers = new Map<string, AudioBuffer>()
  for (const url of new Set(plan.voice.map(v => v.url))) {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`voice ${url}: HTTP ${r.status}`)
    buffers.set(url, await ctx.decodeAudioData(await r.arrayBuffer()))
  }

  // The score: every note of every cue, scheduled now (a note's time is its own).
  for (const m of plan.music) {
    const s = getSong(m.song)
    const o = makeOut(ctx, a.music, s)
    const level = s.gain * (m.gain ?? 1)
    const fadeIn = Math.max(0.03, m.fadeIn ?? 0.05)
    const fadeOut = Math.max(0.05, m.fadeOut ?? 0.4)
    for (const { gain: g } of o.levels) {
      g.setValueAtTime(0.0001, 0)
      g.setValueAtTime(0.0001, m.from)
      g.exponentialRampToValueAtTime(level, m.from + fadeIn)
      g.setValueAtTime(level, Math.max(m.from + fadeIn, m.to - fadeOut))
      g.exponentialRampToValueAtTime(0.0001, m.to)
    }
    const spb = 60 / s.bpm / 4
    let step = m.step ?? 0
    for (let t = m.from; t < m.to; t += spb) {
      if (step >= s.steps.length) step = s.loopBar * 16
      playStep(o, s, step, t, spb)
      step++
    }
  }

  // The moments: each sound and line fired at its time from a suspend.
  type Cue = { t: number; fire: () => void }
  const cues: Cue[] = [
    ...plan.sfx.map(e => ({ t: e.t, fire: () => playSfxNow(e.name, e.pan, e.gain, e.muffle) })),
    ...plan.voice.map(v => ({
      t: v.t,
      fire: () => {
        const buf = buffers.get(v.url)!
        const src = ctx.createBufferSource()
        src.buffer = buf
        const g = ctx.createGain()
        g.gain.value = v.gain
        src.connect(g).connect(a.voice)
        src.start()
        duckMusic(buf.duration)
      }
    }))
  ].filter(c => c.t >= 0 && c.t < plan.seconds - 0.05).sort((x, y) => x.t - y.t)
  const byTime = new Map<number, Cue[]>()
  for (const c of cues) {
    const q = Math.max(QUANTUM, Math.round(c.t / QUANTUM) * QUANTUM)
    const k = Math.round(q * RATE)
    let list = byTime.get(k)
    if (!list) {
      byTime.set(k, (list = []))
      void ctx.suspend(k / RATE).then(() => {
        for (const e of list!) { try { e.fire() } catch (err) { console.warn('[trailer audio]', err) } }
        void ctx.resume()
      })
    }
    list.push(c)
  }
  const out = await ctx.startRendering()
  return wav(out)
}
