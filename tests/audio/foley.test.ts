// The weapon sounds are rendered to samples (`game/audio/foley.ts`); nobody can
// listen in a test, so each one is measured: its length, where its energy
// sits in the spectrum, how its level falls away. With SFX_RENDER_DIR set the
// renders (and a few sequences as the game plays them) are written as WAV
// files to listen to:
//   SFX_RENDER_DIR=/some/dir npx vitest run tests/audio/foley.test.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BURST_LOOP_S, FOLEY, SPIN_LOOP_S, boltCycle, bladePull, bladeSlash, bladeStab, explosion, hitBody, impactBody, impactMetal,
  minigunBurst as minigunBurstLoop, minigunRound, minigunSpin, rocketLaunch, sniperShot, tinkMetal, type FoleyName
} from '@/game/audio/foley'
import { SFX_MIN_GAP_MS } from '@/game/audio/sfx'
import { MINIGUN_RPS, MINIGUN_SPOOL_S } from '@/game/sim/weapons'

const SR = 48000

// ─── Measuring ───────────────────────────────────────────────────────────────

const peak = (x: Float32Array): number => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)

/** Power spectrum of `x` (zero-padded to a power of two), radix-2 FFT. */
const spectrum = (x: Float32Array): { power: Float64Array; hz: number } => {
  let n = 1
  while (n < x.length) n <<= 1
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  re.set(x)
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!] }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const ang = (-2 * Math.PI) / size
    for (let s = 0; s < n; s += size) {
      for (let k = 0; k < size / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k)
        const a = s + k, b = a + size / 2
        const tr = re[b]! * wr - im[b]! * wi
        const ti = re[b]! * wi + im[b]! * wr
        re[b] = re[a]! - tr; im[b] = im[a]! - ti
        re[a] = re[a]! + tr; im[a] = im[a]! + ti
      }
    }
  }
  const power = new Float64Array(n / 2)
  for (let k = 0; k < n / 2; k++) power[k] = re[k]! ** 2 + im[k]! ** 2
  return { power, hz: SR / n }
}

/** Share of the energy between lo and hi Hz. */
const band = (x: Float32Array, lo: number, hi: number): number => {
  const { power, hz } = spectrum(x)
  let inBand = 0, total = 0
  for (let k = 1; k < power.length; k++) {
    total += power[k]!
    if (k * hz >= lo && k * hz < hi) inBand += power[k]!
  }
  return inBand / total
}

/** The part of `x` from a to b seconds. */
const span = (x: Float32Array, a: number, b: number): Float32Array => x.subarray(Math.round(a * SR), Math.min(x.length, Math.round(b * SR)))

const rms = (x: Float32Array): number => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length))

/** Level of a stretch against the loudest 10 ms, in dB. */
const dbAt = (x: Float32Array, a: number, b: number): number => {
  let loud = 0
  for (let t = 0; t + 0.01 <= x.length / SR; t += 0.005) loud = Math.max(loud, rms(span(x, t, t + 0.01)))
  return 20 * Math.log10(rms(span(x, a, b)) / loud)
}

/** Seconds until 99 % of the energy has played: how long it is heard. */
const heard = (x: Float32Array): number => {
  const total = x.reduce((s, v) => s + v * v, 0)
  let acc = 0
  for (let i = 0; i < x.length; i++) { acc += x[i]! ** 2; if (acc >= 0.99 * total) return i / SR }
  return x.length / SR
}

/** Separate transients: onsets where the 2 ms envelope jumps well over the 20 ms before it. */
const onsets = (x: Float32Array): number[] => {
  const hits: number[] = []
  const step = 0.002
  let last = -1
  for (let t = 0.02; t + step <= x.length / SR; t += step) {
    const now = rms(span(x, t, t + step))
    const before = rms(span(x, t - 0.02, t))
    if (now > 4 * before + 1e-4 && now > 0.05 * peak(x) && t - last > 0.03) { hits.push(t); last = t }
  }
  return hits
}

/** First difference: a gentle high-pass (+6 dB an octave). */
const slope = (x: Float32Array): Float32Array => x.map((v, i) => (i ? v - x[i - 1]! : 0))

/** Spectral peaks above `lo` Hz within 20 dB of the strongest (struck metal's partials). */
const partials = (x: Float32Array, lo: number): number[] => {
  const { power, hz } = spectrum(x)
  const smooth = new Float64Array(power.length)
  const w = Math.max(1, Math.round(15 / hz))
  for (let k = w; k < power.length - w; k++) {
    let s = 0
    for (let j = -w; j <= w; j++) s += power[k + j]!
    smooth[k] = s
  }
  const top = Math.max(...smooth)
  const found: number[] = []
  const gap = Math.round(150 / hz)
  for (let k = gap; k < smooth.length - gap; k++) {
    if (k * hz < lo || smooth[k]! < top / 100) continue
    let isMax = true
    for (let j = 1; j <= gap && isMax; j++) if (smooth[k - j]! > smooth[k]! || smooth[k + j]! > smooth[k]!) isMax = false
    if (isMax) found.push(Math.round(k * hz))
  }
  return found
}

// ─── The sounds ──────────────────────────────────────────────────────────────

describe('foley renders', () => {
  it('every variant of every sound renders finite samples, at its level, the same every time', () => {
    for (const name of Object.keys(FOLEY) as FoleyName[]) {
      const r = FOLEY[name]
      for (let v = 0; v < r.variants; v++) {
        const x = r.bake(SR, v)
        expect(x.every(Number.isFinite), `${name}:${v}`).toBe(true)
        expect(peak(x), `${name}:${v}`).toBeGreaterThan(0.1)
        expect(peak(x), `${name}:${v}`).toBeLessThanOrEqual(0.8)
        expect(r.bake(SR, v), `${name}:${v} is seeded`).toEqual(x)
      }
      if (r.variants > 1) expect(r.bake(SR, 1), `${name} variants differ`).not.toEqual(r.bake(SR, 0))
    }
  })

  it('renders at the context\'s own rate', () => {
    const a = explosion(44100, 0)
    const b = explosion(48000, 0)
    expect(a.length / 44100).toBeCloseTo(b.length / 48000, 2)
  })

  it('a minigun round: a sharp crack on top of a low thump, over before the next round', () => {
    for (let v = 0; v < FOLEY.minigun.variants; v++) {
      const x = minigunRound(SR, v)
      // The transient: the peak in the first 3 ms.
      expect(x.findIndex(s => Math.abs(s) === peak(x)) / SR).toBeLessThan(0.003)
      // The crack is bright, the body low.
      expect(band(span(x, 0, 0.004), 3000, 12000)).toBeGreaterThan(0.25)
      expect(band(x, 30, 200)).toBeGreaterThan(0.2)
      // Heard about one round's period, its tail overlapping the next into a roar.
      const period = 1 / MINIGUN_RPS
      expect(heard(x)).toBeGreaterThan(period * 0.5)
      expect(heard(x)).toBeLessThan(period * 2.5)
    }
  })

  it('the minigun voices every round it fires: the gap is under its period', () => {
    expect(SFX_MIN_GAP_MS.minigun!).toBeLessThan(1000 / MINIGUN_RPS - 15)
  })

  it('the spinning barrels loop without a seam: motor low, rattle clicking six times a turn', () => {
    const x = minigunSpin(SR)
    expect(x.length).toBe(Math.round(SPIN_LOOP_S * SR))
    // The wrap from the last sample to the first is no bigger than a step inside the loop.
    let maxStep = 0
    for (let i = 1; i < x.length; i++) maxStep = Math.max(maxStep, Math.abs(x[i]! - x[i - 1]!))
    expect(Math.abs(x[0]! - x[x.length - 1]!)).toBeLessThanOrEqual(maxStep)
    // The motor's fundamental (25 cycles a loop, ~208 Hz) carries real weight.
    expect(band(x, 150, 260)).toBeGreaterThan(0.15)
    // The rattle: bright clicks over the motor, six of them a turn.
    expect(band(x, 2000, 6000)).toBeGreaterThan(0.05)
    const turn = x.length / 6
    let clicks = 0
    for (let b = 0; b < 6; b++) {
      const part = x.subarray(Math.round(b * turn), Math.round((b + 1) * turn))
      if (peak(part) > 1.3 * rms(x) * Math.SQRT2) clicks++
    }
    expect(clicks).toBe(6)
  })

  it('the rocket launch: a low hollow thump first, then the motor\'s hiss going away', () => {
    const x = rocketLaunch(SR, 0)
    expect(band(span(x, 0, 0.1), 20, 300)).toBeGreaterThan(0.5)
    expect(band(span(x, 0.25, 0.9), 1500, 8000)).toBeGreaterThan(0.3)
    expect(heard(x)).toBeGreaterThan(0.8)
    // Receding: quieter late than early.
    expect(dbAt(x, 1.1, 1.4)).toBeLessThan(dbAt(x, 0.2, 0.5) - 6)
  })

  it('the minigun firing (#183): one seamless roar of some fifty cracks a second over a low growl', () => {
    const x = minigunBurstLoop(SR)
    expect(x.length).toBe(Math.round(BURST_LOOP_S * SR))
    // No click at the wrap.
    let maxStep = 0
    for (let i = 1; i < x.length; i++) maxStep = Math.max(maxStep, Math.abs(x[i]! - x[i - 1]!))
    expect(Math.abs(x[0]! - x[x.length - 1]!)).toBeLessThanOrEqual(maxStep)
    expect(peak(x)).toBeLessThanOrEqual(1)
    // Bright cracks and a low body both carry weight.
    expect(band(x, 2000, 8000)).toBeGreaterThan(0.05)
    expect(band(x, 40, 300)).toBeGreaterThan(0.1)
    // Twelve rounds a loop (50 a second): nearly every 20 ms slot has its crack.
    const slots = 12
    const slot = x.length / slots
    let cracks = 0
    for (let b = 0; b < slots; b++) {
      const part = x.subarray(Math.round(b * slot), Math.round((b + 1) * slot))
      if (peak(part) > 1.2 * rms(x) * Math.SQRT2) cracks++
    }
    expect(cracks).toBeGreaterThanOrEqual(10)
  })

  it('the explosion: a sharp crack, a boom heavy below 120 Hz, a long debris tail', () => {
    for (let v = 0; v < FOLEY.explode.variants; v++) {
      const x = explosion(SR, v)
      expect(band(x, 20, 120)).toBeGreaterThan(0.4)
      expect(band(span(x, 0, 0.006), 2000, 12000)).toBeGreaterThan(0.2)
      expect(heard(x)).toBeGreaterThan(1.2)
      // The tail rumbles on, well under the blast.
      const tail = dbAt(x, 1.2, 1.8)
      expect(tail).toBeGreaterThan(-40)
      expect(tail).toBeLessThan(-12)
      // And the debris keeps landing in it: bright transients after the blast,
      // above the rumble (the ear picks them out by their brightness, so the
      // count is taken on the signal's slope, which favours the top end).
      expect(onsets(slope(span(x, 0.2, 2.4))).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('the rifle: a supersonic crack, a muffled heavy thump, a short room tail', () => {
    const x = sniperShot(SR, 0)
    expect(band(span(x, 0, 0.003), 3000, 15000)).toBeGreaterThan(0.2)
    expect(band(x, 20, 700)).toBeGreaterThan(0.6)
    const tail = dbAt(x, 0.15, 0.4)
    expect(tail).toBeGreaterThan(-45)
    expect(tail).toBeLessThan(-15)
    expect(heard(x)).toBeLessThan(0.6)
  })

  it('the bolt: silent while the report dies, then its separate clicks and clacks', () => {
    const x = boltCycle(SR, 0)
    expect(peak(span(x, 0, 0.2))).toBeLessThan(0.01)
    expect(onsets(x).length).toBeGreaterThanOrEqual(4)
    expect(heard(x)).toBeLessThan(0.8)
  })

  it('a round into a body: short, low and dull', () => {
    for (let v = 0; v < FOLEY.impactBody.variants; v++) {
      const x = impactBody(SR, v)
      expect(heard(x)).toBeLessThan(0.12)
      expect(band(x, 20, 500)).toBeGreaterThan(0.6)
      expect(band(x, 3000, 24000)).toBeLessThan(0.02)
    }
  })

  it('a round on a machine: bright partials above 2 kHz that ring on', () => {
    for (let v = 0; v < FOLEY.impactMetal.variants; v++) {
      const x = impactMetal(SR, v)
      expect(band(x, 2000, 12000)).toBeGreaterThan(0.45)
      expect(partials(x, 2000).length).toBeGreaterThanOrEqual(3)
      // Still ringing half a second on.
      expect(dbAt(x, 0.45, 0.55)).toBeGreaterThan(-30)
      expect(heard(x)).toBeGreaterThan(0.35)
    }
  })

  it('the metal ring is far longer and brighter than the body thud', () => {
    const body = impactBody(SR, 0)
    const metal = impactMetal(SR, 0)
    expect(heard(metal)).toBeGreaterThan(3 * heard(body))
    expect(band(metal, 2000, 12000)).toBeGreaterThan(10 * band(body, 2000, 12000))
  })

  it('the minigun\'s hits keep the same split, shorter', () => {
    for (let v = 0; v < 3; v++) {
      const flesh = hitBody(SR, v)
      const plate = tinkMetal(SR, v)
      expect(heard(flesh)).toBeLessThan(0.08)
      expect(band(flesh, 3000, 24000)).toBeLessThan(0.03)
      expect(band(plate, 2000, 12000)).toBeGreaterThan(0.5)
      expect(heard(plate)).toBeLessThan(0.25)
    }
  })

  it('the blade into a body: the steel\'s schwing first, then the wet stab and a dull thud', () => {
    for (let v = 0; v < FOLEY.stab.variants; v++) {
      const x = bladeStab(SR, v)
      expect(band(span(x, 0, 0.085), 2500, 12000)).toBeGreaterThan(0.5)
      expect(band(span(x, 0.09, 0.3), 20, 300)).toBeGreaterThan(0.3)
      expect(band(span(x, 0.09, 0.3), 500, 2000)).toBeGreaterThan(0.05)
      expect(heard(x)).toBeLessThan(0.6)
    }
    const pull = bladePull(SR, 0)
    expect(band(span(pull, 0, 0.08), 300, 2000)).toBeGreaterThan(0.4)
    expect(band(span(pull, 0.1, 0.25), 2500, 12000)).toBeGreaterThan(0.4)
    const slash = bladeSlash(SR, 0)
    expect(heard(slash)).toBeLessThan(0.4)
  })
})

// ─── Listening copies ────────────────────────────────────────────────────────

const wav = (x: Float32Array, gain: number): Buffer => {
  const b = Buffer.alloc(44 + x.length * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40)
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i]! * gain)) * 32767), 44 + i * 2)
  return b
}

const mixAt = (dst: Float32Array, src: Float32Array, at: number, g = 1): void => {
  const o = Math.round(at * SR)
  for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i]! += src[i]! * g
}

/**
 * The minigun as the game plays it: the barrels spool up (`MINIGUN_SPOOL_S`),
 * fire at `MINIGUN_RPS`, and wind down. The spin loop is resampled at the
 * playback rate and level `minigunHum` sets for the spool, under a low-pass
 * opening with it like the runtime's.
 */
const minigunBurst = (fireS: number): Float32Array => {
  const spinUp = MINIGUN_SPOOL_S
  const down = 0.8
  const x = new Float32Array(Math.round((spinUp + fireS + down + 0.3) * SR))
  const loop = minigunSpin(SR)
  let ph = 0
  let y = 0
  for (let i = 0; i < x.length; i++) {
    const t = i / SR
    const spool = t < spinUp ? t / spinUp : t < spinUp + fireS ? 1 : Math.max(0, 1 - (t - spinUp - fireS) / down)
    if (spool <= 0.01) continue
    ph = (ph + 0.25 + 0.75 * spool) % loop.length
    const j = Math.floor(ph)
    const s = loop[j]! + (loop[(j + 1) % loop.length]! - loop[j]!) * (ph - j)
    const a = Math.exp((-2 * Math.PI * (700 + 5300 * spool)) / SR)
    y = (1 - a) * s + a * y
    x[i] = y * (0.012 + 0.055 * spool)
  }
  const rounds = Math.floor(fireS * MINIGUN_RPS)
  for (let r = 0; r < rounds; r++) mixAt(x, minigunRound(SR, r % FOLEY.minigun.variants), spinUp + r / MINIGUN_RPS, 0.9 + 0.2 * ((r * 7) % 5) / 4)
  return x
}

describe.runIf(!!process.env.SFX_RENDER_DIR)('foley WAV renders', () => {
  it('writes every sound and the game\'s sequences', () => {
    const dir = process.env.SFX_RENDER_DIR!
    mkdirSync(dir, { recursive: true })
    // One gain for every file, so their levels compare as they do in the game.
    const G = 1.2
    for (const name of Object.keys(FOLEY) as FoleyName[]) {
      for (let v = 0; v < FOLEY[name].variants; v++) writeFileSync(join(dir, `${name}-${v + 1}.wav`), wav(FOLEY[name].bake(SR, v), G))
    }
    const loop = minigunSpin(SR)
    const spin = new Float32Array(SR * 2)
    for (let i = 0; i < spin.length; i++) spin[i] = loop[i % loop.length]! * 0.3
    writeFileSync(join(dir, 'minigun-spin-loop.wav'), wav(spin, G))
    writeFileSync(join(dir, 'seq-minigun-burst.wav'), wav(minigunBurst(2.5), G))

    const rocket = new Float32Array(SR * 4.6)
    mixAt(rocket, rocketLaunch(SR, 0), 0)
    mixAt(rocket, explosion(SR, 0), 1.3)
    writeFileSync(join(dir, 'seq-rocket-launch-impact.wav'), wav(rocket, G))

    const rifle = new Float32Array(SR * 3.2)
    mixAt(rifle, sniperShot(SR, 0), 0); mixAt(rifle, boltCycle(SR, 0), 0); mixAt(rifle, impactBody(SR, 0), 0.3)
    mixAt(rifle, sniperShot(SR, 0), 1.5); mixAt(rifle, boltCycle(SR, 0), 1.5); mixAt(rifle, impactMetal(SR, 0), 1.8)
    writeFileSync(join(dir, 'seq-sniper-body-then-metal.wav'), wav(rifle, G))

    const takedown = new Float32Array(SR * 1.8)
    mixAt(takedown, bladeStab(SR, 0), 0.05)
    mixAt(takedown, bladePull(SR, 0), 1.0)
    writeFileSync(join(dir, 'seq-takedown-stab-pull.wav'), wav(takedown, G))

    const spray = new Float32Array(SR * 1.6)
    for (let r = 0; r < 12; r++) mixAt(spray, r % 3 === 2 ? tinkMetal(SR, r % 3) : hitBody(SR, r % 3), 0.05 + r / MINIGUN_RPS)
    writeFileSync(join(dir, 'seq-minigun-hits.wav'), wav(spray, G))
  })
})
