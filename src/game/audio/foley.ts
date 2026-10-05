import type { SfxName } from './sfx'

/**
 * ─── Foley: the weapons, rendered to samples ─────────────────────────────────
 *
 * The weapon sounds are too dense for a handful of oscillators: a gunshot is
 * a crack, a muzzle blast, a thump in the chest and the room answering, all
 * inside a tenth of a second. So they are rendered here, sample by sample,
 * once per sound (and a few variants of the frequent ones), into a buffer the
 * synth plays like a recording (`synth.ts`). A round of the minigun is then
 * one buffer source and a gain, fifteen times a second, however rich it is.
 *
 * The toolkit is the classic one: noise bursts through filters with fast
 * envelopes, sines that drop in pitch for the body, inharmonic partials for
 * struck metal, tanh drive for grit and a small comb/all-pass room for the
 * tail. Pure and seeded: the same call renders the same samples, so the
 * tests can measure them and a render to WAV is what the player hears.
 */

type Rng = () => number

/** Seeded PRNG (mulberry32). */
export const rng = (seed: number): Rng => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Kit { sr: number; r: Rng }

const len = (k: Kit, s: number): number => Math.max(1, Math.round(k.sr * s))

const white = (k: Kit, s: number): Float32Array => {
  const x = new Float32Array(len(k, s))
  for (let i = 0; i < x.length; i++) x[i] = k.r() * 2 - 1
  return x
}

/** A cutoff (Hz), fixed or as a function of the time into the layer. */
type Freq = number | ((t: number) => number)

/** An exponential sweep from f0 to f1 over `T` seconds, then held. */
const sweep = (f0: number, f1: number, T: number): ((t: number) => number) =>
  t => f0 * Math.pow(f1 / f0, Math.min(1, t / T))

/** RBJ biquad, in place. A swept cutoff is re-read every 32 samples. */
const filt = (k: Kit, x: Float32Array, type: 'lp' | 'hp' | 'bp', f: Freq, q = 0.707): Float32Array => {
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0
  const set = (fc: number): void => {
    const w = (2 * Math.PI * Math.min(Math.max(fc, 10), k.sr * 0.45)) / k.sr
    const cw = Math.cos(w)
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    if (type === 'lp') { b0 = (1 - cw) / 2 / a0; b1 = (1 - cw) / a0; b2 = b0 }
    else if (type === 'hp') { b0 = (1 + cw) / 2 / a0; b1 = -(1 + cw) / a0; b2 = b0 }
    else { b0 = alpha / a0; b1 = 0; b2 = -alpha / a0 }
    a1 = (-2 * cw) / a0
    a2 = (1 - alpha) / a0
  }
  const swept = typeof f === 'function'
  if (!swept) set(f)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    if (swept && (i & 31) === 0) set(f(i / k.sr))
    const xi = x[i]!
    const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = xi; y2 = y1; y1 = y
    x[i] = y
  }
  return x
}

/** One-pole low-pass, in place. */
const lp1 = (k: Kit, x: Float32Array, f: number): Float32Array => {
  const a = Math.exp((-2 * Math.PI * f) / k.sr)
  let y = 0
  for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i]! + a * y; x[i] = y }
  return x
}

/** A linear attack, then an exponential decay with time constant `tau`, in place. */
const env = (k: Kit, x: Float32Array, attack: number, tau: number): Float32Array => {
  const na = Math.round(attack * k.sr)
  const d = Math.exp(-1 / (tau * k.sr))
  let e = 1
  for (let i = 0; i < x.length; i++) {
    if (i < na) x[i]! *= i / na
    else { x[i]! *= e; e *= d }
  }
  return x
}

/** A swell: rises and falls as half a sine over the whole layer, in place. */
const swell = (x: Float32Array): Float32Array => {
  for (let i = 0; i < x.length; i++) x[i]! *= Math.sin((Math.PI * i) / x.length)
  return x
}

/** A sine gliding from f0 toward f1 with time constant `T`: the body of a thump. */
const glide = (k: Kit, s: number, f0: number, f1: number, T: number): Float32Array => {
  const x = new Float32Array(len(k, s))
  const d = Math.exp(-1 / (T * k.sr))
  const w = (2 * Math.PI) / k.sr
  let g = 1
  let ph = 0
  for (let i = 0; i < x.length; i++) {
    ph += w * (f1 + (f0 - f1) * g)
    g *= d
    x[i] = Math.sin(ph)
  }
  return x
}

/** The N-shaped pressure wave of something faster than sound: the crack. */
const nwave = (k: Kit, s: number): Float32Array => {
  const x = new Float32Array(len(k, s))
  for (let i = 0; i < x.length; i++) x[i] = 1 - (2 * i) / Math.max(1, x.length - 1)
  return x
}

interface Mode { f: number; a: number; tau: number }

/** Struck metal: decaying sines at inharmonic ratios, each with a slightly
 *  detuned twin so the ring beats and shimmers instead of buzzing. */
const modes = (k: Kit, s: number, list: Mode[]): Float32Array => {
  const x = new Float32Array(len(k, s))
  for (const m of list) {
    for (const [df, w] of [[1, 1], [1.0035, 0.45]] as const) {
      // A rotating phasor, decaying by a constant factor a sample: no sin or
      // exp in the loop. Stops once it is inaudible.
      const ph = k.r() * Math.PI * 2
      const dw = (2 * Math.PI * m.f * df) / k.sr
      const cr = Math.cos(dw), sr = Math.sin(dw)
      const d = Math.exp(-1 / (m.tau * k.sr))
      let c = Math.cos(ph), sn = Math.sin(ph), a = m.a * w
      for (let i = 0; i < x.length && a > 1e-5; i++) {
        x[i]! += a * sn
        const nc = c * cr - sn * sr
        sn = sn * cr + c * sr
        c = nc
        a *= d
      }
    }
  }
  return x
}

/**
 * Something slow or low rendered at a fraction of the rate (`top` Hz is the
 * highest it holds), then stretched back up by linear interpolation: a 3 s
 * rumble below 160 Hz costs a twentieth of the samples.
 */
const coarse = (k: Kit, s: number, top: number, make: (kd: Kit) => Float32Array): Float32Array => {
  const down = Math.max(1, Math.floor(k.sr / (top * 16)))
  const y = make({ sr: k.sr / down, r: k.r })
  if (down === 1) return y
  const x = new Float32Array(len(k, s))
  for (let i = 0; i < x.length; i++) {
    const p = i / down
    const j = Math.floor(p)
    const a = y[Math.min(j, y.length - 1)]!
    const b = y[Math.min(j + 1, y.length - 1)]!
    x[i] = a + (b - a) * (p - j)
  }
  return x
}

/** Noise below `f` Hz (a rumble, a roar's body), rendered coarse. */
const lowNoise = (k: Kit, s: number, f: number): Float32Array =>
  lp1(k, coarse(k, s, f, kd => filt(kd, white(kd, s), 'lp', f, 0.7)), f * 3)

/** Wet: a random, lumpy 0..1 gate at about `rate` lumps a second (a squelch). */
const lumps = (k: Kit, s: number, rate: number): Float32Array => {
  const x = coarse(k, s, rate * 2.5, kd => lp1(kd, lp1(kd, white(kd, s), rate), rate))
  let peak = 1e-9
  for (let i = 0; i < x.length; i++) { const v = Math.max(0, x[i]!); x[i] = v * v; peak = Math.max(peak, x[i]!) }
  for (let i = 0; i < x.length; i++) x[i]! /= peak
  return x
}

const mul = (x: Float32Array, m: Float32Array, floor = 0): Float32Array => {
  for (let i = 0; i < x.length; i++) x[i]! *= floor + (1 - floor) * (m[i] ?? 0)
  return x
}

/** Mix `src` into `dst` from `at` seconds. */
const add = (k: Kit, dst: Float32Array, src: Float32Array, at: number, gain: number): void => {
  const o = Math.round(at * k.sr)
  const n = Math.min(src.length, dst.length - o)
  for (let i = Math.max(0, -o); i < n; i++) dst[o + i]! += src[i]! * gain
}

/** Peak of 1 in, normalised: a layer's gain then means its share of the sound. */
const unit = (x: Float32Array): Float32Array => {
  let p = 1e-9
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]!))
  for (let i = 0; i < x.length; i++) x[i]! /= p
  return x
}

/** tanh drive: grit on the peaks, the quiet parts untouched. */
const drive = (x: Float32Array, amount: number): Float32Array => {
  const n = Math.tanh(amount)
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(amount * x[i]!) / n
  return x
}

/**
 * A small room (a Schroeder reverb: four damped feedback combs into two
 * all-passes) mixed under the dry sound, in place. `size` scales the delay
 * times, `fb` sets how long the tail rings, `damp` how dark it gets.
 */
const room = (k: Kit, x: Float32Array, size: number, fb: number, damp: number, mix: number): Float32Array => {
  const s = (k.sr / 44100) * size
  const line = (d: number): Float32Array => new Float32Array(Math.max(1, Math.round(d * s)))
  const combs = [line(1116), line(1188), line(1277), line(1356)]
  const ci = new Int32Array(4)
  const store = new Float64Array(4)
  const alls = [line(556), line(441)]
  const ai = new Int32Array(2)
  for (let n = 0; n < x.length; n++) {
    const input = x[n]! * 0.25
    let wet = 0
    for (let j = 0; j < 4; j++) {
      const buf = combs[j]!
      const i = ci[j]!
      const y = buf[i]!
      store[j] = y * (1 - damp) + store[j]! * damp
      buf[i] = input + store[j]! * fb
      ci[j] = i + 1 === buf.length ? 0 : i + 1
      wet += y
    }
    for (let j = 0; j < 2; j++) {
      const buf = alls[j]!
      const i = ai[j]!
      const b = buf[i]!
      buf[i] = wet + b * 0.5
      ai[j] = i + 1 === buf.length ? 0 : i + 1
      wet = b - wet
    }
    x[n] = x[n]! + wet * mix
  }
  return x
}

/** Scale to a peak of `peak` (the sound's level against the rest of the set). */
const level = (x: Float32Array, peak: number): Float32Array => {
  unit(x)
  for (let i = 0; i < x.length; i++) x[i]! *= peak
  return x
}

/** A short metallic tick: a noise snap through a resonant band-pass. */
const tick = (k: Kit, f: number, q: number, tau: number): Float32Array =>
  env(k, filt(k, white(k, tau * 7), 'bp', f, q), 0.0002, tau)

/** Blade on steel, sliding: a narrow band of noise sweeping `f0` → `f1`. */
const scrape = (k: Kit, s: number, f0: number, f1: number, q = 6): Float32Array =>
  swell(unit(filt(k, white(k, s), 'bp', sweep(f0, f1, s), q)))

/** Flesh giving way: a band of noise, gated into wet lumps. */
const squelch = (k: Kit, s: number, f: Freq, rate: number, tau: number): Float32Array =>
  env(k, mul(unit(filt(k, white(k, s), 'bp', f, 1.6)), lumps(k, s, rate), 0.15), 0.002, tau)

// ─── The minigun ─────────────────────────────────────────────────────────────

/**
 * One round: the supersonic crack, the muzzle blast's bark, a low thump of
 * the body, the action's clack, all driven, with a short slap of room behind
 * it so fifteen a second run together into a roar.
 */
export const minigunRound = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0x6d1 + v * 7919) }
  const x = new Float32Array(len(k, 0.2))
  // The blast and the body, driven for grit...
  add(k, x, unit(env(k, filt(k, white(k, 0.06), 'bp', 1000 * (0.9 + k.r() * 0.2), 0.9), 0.0015, 0.009)), 0.0012, 1)
  add(k, x, env(k, glide(k, 0.1, 190, 52, 0.018), 0.003, 0.022), 0.0012, 0.55)
  add(k, x, unit(tick(k, 3400 + k.r() * 600, 4, 0.0025)), 0.003, 0.22)
  drive(x, 2.2)
  // ...and the crack on top, clean: it is what makes a round sharp.
  add(k, x, nwave(k, 0.0004), 0, 0.5)
  add(k, x, unit(env(k, filt(k, white(k, 0.015), 'hp', 2800, 0.7), 0.0002, 0.0025)), 0, 1.4)
  add(k, x, unit(env(k, filt(k, white(k, 0.18), 'bp', 650, 0.7), 0.004, 0.035)), 0.002, 0.1)
  room(k, x, 0.45, 0.62, 0.45, 0.22)
  return level(x, 0.32)
}

/** One loop of the spinning gun (seconds at playback rate 1): one turn of the barrels. */
export const SPIN_LOOP_S = 0.12
/** Cycles of the motor per loop: its fundamental at full speed is 25 / SPIN_LOOP_S ≈ 208 Hz. */
const MOTOR_CYCLES = 25

/**
 * The barrels turning: the electric motor's whir and whine and the six
 * barrels' rattle, as one seamless loop. Played looping with a playback rate
 * that follows the spool, so the whole mechanism speeds up and rises in
 * pitch together, as a real one does.
 */
export const minigunSpin = (sr: number): Float32Array => {
  const k: Kit = { sr, r: rng(0x5917) }
  const n = len(k, SPIN_LOOP_S)
  const f = MOTOR_CYCLES / (n / sr)
  const x = new Float32Array(n)
  const tau = 2 * Math.PI / sr
  // The motor: a band-limited saw, rolled off above ~900 Hz.
  for (let h = 1; h * f < 6000; h++) {
    const a = 1 / h / Math.sqrt(1 + ((h * f) / 900) ** 2)
    for (let i = 0; i < n; i++) x[i]! += 0.5 * a * Math.sin(tau * h * f * i)
  }
  // Its whine: the electric part, two thin partials above.
  for (let i = 0; i < n; i++) x[i]! += 0.07 * Math.sin(tau * 8 * f * i) + 0.03 * Math.sin(tau * 13 * f * i)
  // The whir of air and bearings: noise filtered round the loop (filtered
  // twice over and the second pass kept, so the loop has no seam).
  const w = white(k, SPIN_LOOP_S)
  const ww = new Float32Array(2 * n)
  ww.set(w); ww.set(w, n)
  filt(k, ww, 'bp', 720, 0.7)
  const whir = unit(ww.subarray(n))
  for (let i = 0; i < n; i++) x[i]! += 0.22 * whir[i]! * (1 + 0.35 * Math.sin((tau * i * sr) / n))
  // The rattle: six barrels, six clicks a turn, each a little different.
  for (let b = 0; b < 6; b++) {
    const at = Math.round(((b + (k.r() - 0.5) * 0.12) / 6) * n)
    const c = unit(tick(k, 2800 + b * 260 + k.r() * 200, 3, 0.0018))
    const thud = env(k, glide(k, 0.012, 340, 300, 1), 0.0003, 0.003)
    const g = 0.75 + 0.2 * (b % 2)
    for (let i = 0; i < c.length; i++) x[(at + i) % n]! += g * c[i]!
    for (let i = 0; i < thud.length; i++) x[(at + i) % n]! += 0.12 * thud[i]!
  }
  return level(x, 0.9)
}

// ─── The rocket launcher ─────────────────────────────────────────────────────

/** The launch: a hollow "fwoomp" out of the tube, then the motor's hiss going away. */
export const rocketLaunch = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0x40c + v * 7919) }
  const x = new Float32Array(len(k, 1.7))
  // The fwoomp: a low thump and the tube's hollow resonance.
  add(k, x, env(k, glide(k, 0.4, 135, 42, 0.07), 0.004, 0.09), 0, 1)
  const tube = env(k, filt(k, white(k, 0.4), 'bp', sweep(300, 190, 0.15), 2.4), 0.003, 0.05)
  // A tube is a comb: its delay sets the hollow ring.
  const d = Math.round(sr / 210)
  for (let i = d; i < tube.length; i++) tube[i]! += 0.72 * tube[i - d]!
  add(k, x, unit(tube), 0, 0.85)
  add(k, x, env(k, filt(k, white(k, 0.06), 'hp', 1500, 0.7), 0.0005, 0.01), 0, 0.3)
  // The motor: hiss and roar, receding, with the uneven crackle of a burn.
  const burn = lumps(k, 1.6, 35)
  const hiss = filt(k, white(k, 1.6), 'bp', sweep(3200, 1300, 1.4), 0.8)
  mul(hiss, burn, 0.65)
  const roar = lowNoise(k, 1.6, 520)
  for (const [layer, tau, g] of [[hiss, 0.5, 0.55], [roar, 0.38, 0.45]] as const) {
    env(k, layer, 0.07, tau)
    add(k, x, unit(layer), 0.03, g)
  }
  drive(x, 1.6)
  room(k, x, 0.8, 0.7, 0.4, 0.18)
  return level(x, 0.42)
}

/** The impact: a sharp crack, a deep boom with sub-bass, and the debris coming down. */
export const explosion = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0xb00 + v * 7919) }
  const x = new Float32Array(len(k, 3.2))
  // The blast: bark and boom driven together (the low end takes a few
  // milliseconds to build, as air does), then the crack on top, clean.
  add(k, x, unit(env(k, filt(k, white(k, 0.35), 'bp', 700, 0.6), 0.002, 0.06)), 0.002, 0.7)
  add(k, x, env(k, glide(k, 2.2, 88, 32, 0.25), 0.008, 0.45), 0.002, 1.1)
  add(k, x, env(k, glide(k, 2.4, 56, 27, 0.4), 0.012, 0.7), 0.002, 0.55)
  add(k, x, unit(env(k, filt(k, white(k, 2.2), 'lp', sweep(1800, 90, 0.8), 0.7), 0.005, 0.35)), 0.002, 0.95)
  drive(x, 2)
  add(k, x, nwave(k, 0.0012), 0, 0.7)
  add(k, x, unit(env(k, filt(k, white(k, 0.04), 'hp', 1800, 0.7), 0.0003, 0.005)), 0, 1.15)
  // The rumble: low noise rolling about, slowly dying.
  const rumble = mul(lowNoise(k, 3.1, 160), lumps(k, 3.1, 6), 0.35)
  add(k, x, unit(env(k, rumble, 0.08, 0.9)), 0.05, 0.6)
  // The debris: stones and scrap landing, thick at first, then the odd one.
  const pieces = 26 + Math.floor(k.r() * 10)
  for (let p = 0; p < pieces; p++) {
    const at = 0.15 + 2.1 * k.r() ** 2
    const fade = Math.exp(-at / 1.2)
    if (k.r() < 0.7) add(k, x, unit(tick(k, 1400 + k.r() * 3600, 2.5, 0.002 + k.r() * 0.006)), at, (0.08 + k.r() * 0.22) * fade)
    else add(k, x, env(k, glide(k, 0.08, 120 + k.r() * 120, 70, 0.03), 0.001, 0.02), at, (0.12 + k.r() * 0.18) * fade)
  }
  room(k, x, 1.1, 0.8, 0.35, 0.25)
  return level(x, 0.78)
}

// ─── The sniper ──────────────────────────────────────────────────────────────

/**
 * The shot: suppressed but heavy. The round's own supersonic crack, the
 * muffled thump of the gas caught in the can (and its "pfft" through the
 * baffles), and a short room tail.
 */
export const sniperShot = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0x5a1 + v * 7919) }
  const x = new Float32Array(len(k, 0.9))
  // The thump and the "pfft", driven...
  add(k, x, unit(env(k, filt(k, white(k, 0.2), 'lp', 700, 0.8), 0.002, 0.03)), 0.001, 1)
  add(k, x, env(k, glide(k, 0.4, 125, 44, 0.04), 0.003, 0.07), 0.001, 1)
  add(k, x, unit(env(k, filt(k, white(k, 0.12), 'bp', 1800, 1.2), 0.0015, 0.02)), 0.002, 0.3)
  add(k, x, unit(tick(k, 2500, 3, 0.002)), 0.004, 0.12)
  drive(x, 1.8)
  // ...and the round's crack over them.
  add(k, x, nwave(k, 0.0006), 0, 0.6)
  add(k, x, unit(env(k, filt(k, white(k, 0.02), 'hp', 3000, 0.7), 0.0002, 0.0016)), 0, 0.9)
  room(k, x, 0.7, 0.74, 0.55, 0.32)
  return level(x, 0.5)
}

/**
 * The bolt worked after the shot (it starts as the report dies away): the
 * handle lifted, drawn back to its stop, the case flicked out, pushed home,
 * locked down, and the brass landing.
 */
export const boltCycle = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0xb01 + v * 7919) }
  const x = new Float32Array(len(k, 0.82))
  const clack = (at: number, f: number, ring: number, g: number): void => {
    add(k, x, unit(tick(k, f, 2, 0.0025)), at, g)
    add(k, x, env(k, glide(k, 0.05, ring, ring * 0.97, 1), 0.0005, 0.012), at, g * 0.35)
  }
  clack(0.24, 2300, 520, 0.55)
  add(k, x, scrape(k, 0.08, 2500, 3500, 3), 0.27, 0.22)
  clack(0.355, 1600, 900, 0.9)
  add(k, x, modes(k, 0.12, [{ f: 4100, a: 0.5, tau: 0.03 }, { f: 6200, a: 0.3, tau: 0.02 }]), 0.4, 0.2)
  add(k, x, scrape(k, 0.075, 3300, 2300, 3), 0.47, 0.22)
  clack(0.55, 1300, 700, 1)
  clack(0.6, 2700, 1100, 0.5)
  add(k, x, modes(k, 0.15, [{ f: 3700, a: 0.5, tau: 0.04 }, { f: 5900, a: 0.3, tau: 0.025 }]), 0.68, 0.14)
  return level(x, 0.2)
}

// ─── Where a round lands ─────────────────────────────────────────────────────

/** A heavy round into a body: a wet, short, dull thud, nothing bright. */
export const impactBody = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0x1b0 + v * 7919) }
  const x = new Float32Array(len(k, 0.2))
  add(k, x, env(k, glide(k, 0.15, 100 - v * 6, 48, 0.03), 0.001, 0.035), 0, 1)
  add(k, x, unit(env(k, filt(k, white(k, 0.1), 'lp', 900, 0.7), 0.0005, 0.018)), 0, 0.85)
  add(k, x, unit(squelch(k, 0.12, 1000 + v * 150, 140, 0.03)), 0.004, 0.45)
  drive(x, 1.3)
  filt(k, filt(k, x, 'lp', 2200, 0.7), 'lp', 2200, 0.7)
  return level(x, 0.38)
}

/** Plate frequencies (Hz) of the three metal variants: the struck shell rings at one of these. */
const METAL_BASE = [1500, 1720, 1380] as const
/** A struck plate's partials: inharmonic ratios, and how loud and long each rings. */
const PLATE: ReadonlyArray<{ r: number; a: number; tau: number }> = [
  { r: 1, a: 0.55, tau: 0.42 },
  { r: 1.47, a: 0.6, tau: 0.36 },
  { r: 2.09, a: 0.75, tau: 0.32 },
  { r: 2.56, a: 0.5, tau: 0.27 },
  { r: 3.39, a: 0.45, tau: 0.2 },
  { r: 4.58, a: 0.3, tau: 0.14 }
]

/** A heavy round on a machine's shell: a sharp clang, then the plate ringing. */
export const impactMetal = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0x3e7 + v * 7919) }
  const base = METAL_BASE[v % METAL_BASE.length]!
  const x = new Float32Array(len(k, 1.3))
  add(k, x, env(k, filt(k, white(k, 0.01), 'hp', 2200, 0.7), 0.0001, 0.0012), 0, 0.9)
  add(k, x, unit(modes(k, 1.3, PLATE.map(p => ({ f: base * p.r, a: p.a, tau: p.tau })))), 0, 0.75)
  add(k, x, env(k, glide(k, 0.1, 270, 200, 0.02), 0.0005, 0.03), 0, 0.4)
  drive(x, 1.4)
  return level(x, 0.3)
}

/** A minigun round into a body: the short version of `impactBody`. */
export const hitBody = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0x41b + v * 7919) }
  const x = new Float32Array(len(k, 0.12))
  add(k, x, env(k, glide(k, 0.1, 125 - v * 8, 60, 0.02), 0.0008, 0.02), 0, 1)
  add(k, x, unit(env(k, filt(k, white(k, 0.06), 'lp', 1100, 0.7), 0.0004, 0.012)), 0, 0.8)
  add(k, x, unit(squelch(k, 0.06, 1200 + v * 200, 180, 0.015)), 0.002, 0.35)
  filt(k, x, 'lp', 2600, 0.7)
  return level(x, 0.22)
}

/** A round off armour plate: the short version of `impactMetal`. */
export const tinkMetal = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0x71c + v * 7919) }
  const base = 2100 + v * 240
  const x = new Float32Array(len(k, 0.3))
  add(k, x, env(k, filt(k, white(k, 0.006), 'hp', 2500, 0.7), 0.0001, 0.0009), 0, 0.8)
  add(k, x, unit(modes(k, 0.3, PLATE.slice(0, 4).map(p => ({ f: base * p.r, a: p.a, tau: p.tau * 0.25 })))), 0, 0.7)
  return level(x, 0.17)
}

// ─── The blade ───────────────────────────────────────────────────────────────

/** The blade's own ring: steel humming after it has moved. */
const bladeRing = (k: Kit, s: number, g: number): Float32Array =>
  modes(k, s, [{ f: 3100, a: g, tau: 0.22 }, { f: 4650, a: g * 0.7, tau: 0.16 }, { f: 6900, a: g * 0.45, tau: 0.1 }])

/**
 * A blade driven into a body (the backstab, the drop, the dive from a rope):
 * the steel's sharp "schwing", the wet stab as it goes in, the dull thud of
 * the hilt against the body, and the flesh settling round it.
 */
export const bladeStab = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0x57a + v * 7919) }
  const x = new Float32Array(len(k, 0.7))
  add(k, x, scrape(k, 0.13, 6500, 3000), 0, 0.5)
  add(k, x, bladeRing(k, 0.6, 0.18), 0.005, 1)
  add(k, x, unit(squelch(k, 0.25, 900, 120, 0.05)), 0.09, 1)
  add(k, x, unit(env(k, filt(k, white(k, 0.1), 'lp', 700, 0.7), 0.001, 0.02)), 0.092, 0.7)
  add(k, x, env(k, glide(k, 0.3, 88, 44, 0.04), 0.0015, 0.07), 0.095, 0.85)
  for (let i = 0; i < 4; i++) add(k, x, unit(tick(k, 1700 + k.r() * 900, 2, 0.0015)), 0.1 + k.r() * 0.06, 0.12)
  add(k, x, unit(squelch(k, 0.3, sweep(1300, 500, 0.25), 70, 0.08)), 0.14, 0.5)
  drive(x, 1.4)
  room(k, x, 0.5, 0.6, 0.6, 0.12)
  return level(x, 0.48)
}

/** The blade pulled out: a wet suck and the steel sliding free. */
export const bladePull = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0x9a1 + v * 7919) }
  const x = new Float32Array(len(k, 0.5))
  add(k, x, unit(swell(mul(unit(filt(k, white(k, 0.18), 'bp', sweep(500, 1400, 0.18), 1.6)), lumps(k, 0.18, 90), 0.2))), 0, 0.6)
  add(k, x, scrape(k, 0.12, 3000, 6500), 0.07, 0.5)
  add(k, x, bladeRing(k, 0.4, 0.12), 0.12, 1)
  return level(x, 0.3)
}

/** A quick strike: the blade's swing through the air, the cut, a thud. */
export const bladeSlash = (sr: number, v: number): Float32Array => {
  const k: Kit = { sr, r: rng(0x51a + v * 7919) }
  const x = new Float32Array(len(k, 0.45))
  add(k, x, swell(unit(filt(k, white(k, 0.12), 'bp', sweep(600, 2400, 0.12), 1.5))), 0, 0.45)
  add(k, x, scrape(k, 0.08, 6000, 3500), 0.07, 0.35)
  add(k, x, bladeRing(k, 0.35, 0.12), 0.08, 1)
  add(k, x, unit(squelch(k, 0.1, 1100, 150, 0.025)), 0.1, 0.5)
  add(k, x, env(k, glide(k, 0.2, 110, 55, 0.03), 0.001, 0.05), 0.1, 0.85)
  drive(x, 1.3)
  return level(x, 0.36)
}

// ─── The table ───────────────────────────────────────────────────────────────

export interface FoleyRecipe {
  /** Render variant `v` at `sr` Hz. */
  bake: (sr: number, v: number) => Float32Array
  /** How many variants: the frequent sounds get a few, so a burst is not one sample on repeat. */
  variants: number
}

/** The sounds rendered here, by the SFX name that plays them. */
export const FOLEY = {
  minigun: { bake: minigunRound, variants: 4 },
  rocket: { bake: rocketLaunch, variants: 1 },
  explode: { bake: explosion, variants: 2 },
  sniper: { bake: sniperShot, variants: 1 },
  bolt: { bake: boltCycle, variants: 1 },
  impactBody: { bake: impactBody, variants: 3 },
  impactMetal: { bake: impactMetal, variants: 3 },
  hit: { bake: hitBody, variants: 3 },
  tink: { bake: tinkMetal, variants: 3 },
  stab: { bake: bladeStab, variants: 2 },
  bladePull: { bake: bladePull, variants: 1 },
  blade: { bake: bladeSlash, variants: 2 }
} as const satisfies Partial<Record<SfxName, FoleyRecipe>>

export type FoleyName = keyof typeof FOLEY
