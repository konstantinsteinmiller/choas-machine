import { registerOneShotSource } from '@/use/useAssets'
import { audio, audioForced, canPlay, noise, pulse, midiHz, duckMusic } from './engine'
import { setSfxPlayer, type SfxName } from './sfx'
import { SFX_FILES } from '../assets/overrides'
import { FOLEY, minigunBurst, minigunSpin, type FoleyName } from './foley'

/**
 * ─── Synthesised SFX ─────────────────────────────────────────────────────────
 *
 * Every sound effect is a small recipe on a few voices: pulse waves, a
 * triangle, a saw, a sine, and noise through a filter. Recipes are pitched
 * sweeps, arpeggios and bursts; nothing is sampled, so the whole SFX set costs
 * zero bytes of download. A file dropped into `public/audio/sfx/` under a
 * recipe's name replaces it (see `game/assets/overrides.ts`).
 *
 * The palette follows the GDD's two phases: the stealth sounds are soft and
 * short (a silenced rifle is a thump and a click, not a crack), the loud ones
 * are wide and noisy.
 *
 * The weapons are the exception to "a few voices": a gunshot is too dense for
 * that, so they are rendered sample by sample once (`foley.ts`) and played
 * like recordings, one buffer source per sound.
 *
 * Every source is registered with `registerOneShotSource`, so an ad or a
 * platform mute hard-stops in-flight sounds (the suspend gate alone would only
 * freeze them).
 */

type Wave = 'p12' | 'p25' | 'p50' | 'tri' | 'saw' | 'sine'

interface ToneOpts {
  wave: Wave
  f0: number
  f1?: number
  dur: number
  vol: number
  at?: number
  attack?: number
  exp?: boolean
  vib?: number
  vibRate?: number
  pan?: number
}

let busOut: GainNode | null = null
const panners: StereoPannerNode[] = []
/** A muffled sound's low-pass (see `play`): while its recipe runs, every
 *  voice routes through it on its way to the sfx bus. */
let route: BiquadFilterNode | null = null
/** The current recipe's pitch factor (see `VARY`): every voice it starts is
 *  tuned by it. 1 outside `play`. */
let pitch = 1

const out = (pan: number): AudioNode | null => {
  const a = audio()
  if (!a) return null
  if (!busOut) busOut = a.sfx
  const bus = route ?? a.sfx
  if (!pan || !('createStereoPanner' in a.ctx)) return bus
  const p = a.ctx.createStereoPanner()
  p.pan.value = pan
  p.connect(bus)
  panners.push(p)
  if (panners.length > 64) panners.shift()?.disconnect()
  return p
}

const tone = (o: ToneOpts): void => {
  const a = audio()
  if (!a) return
  const dest = out(o.pan ?? 0)
  if (!dest) return
  const t = a.ctx.currentTime + (o.at ?? 0)
  const osc = a.ctx.createOscillator()
  if (o.wave === 'tri') osc.type = 'triangle'
  else if (o.wave === 'saw') osc.type = 'sawtooth'
  else if (o.wave === 'sine') osc.type = 'sine'
  else {
    const w = pulse(o.wave === 'p12' ? 0.125 : o.wave === 'p25' ? 0.25 : 0.5)
    if (w) osc.setPeriodicWave(w)
  }
  osc.frequency.setValueAtTime(o.f0 * pitch, t)
  if (o.f1 !== undefined) {
    if (o.exp !== false) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 * pitch), t + o.dur)
    else osc.frequency.linearRampToValueAtTime(o.f1 * pitch, t + o.dur)
  }
  if (o.vib) {
    const lfo = a.ctx.createOscillator()
    const lg = a.ctx.createGain()
    lfo.frequency.value = o.vibRate ?? 14
    lg.gain.value = o.vib
    lfo.connect(lg).connect(osc.frequency)
    lfo.start(t)
    lfo.stop(t + o.dur + 0.05)
  }
  const g = a.ctx.createGain()
  const atk = o.attack ?? 0.004
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.vol, t + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  osc.connect(g).connect(dest)
  osc.start(t)
  osc.stop(t + o.dur + 0.02)
  registerOneShotSource(osc)
}

interface NoiseOpts {
  dur: number
  vol: number
  type?: BiquadFilterType
  f0?: number
  f1?: number
  q?: number
  at?: number
  pan?: number
}

const burst = (o: NoiseOpts): void => {
  const a = audio()
  const buf = noise()
  if (!a || !buf) return
  const dest = out(o.pan ?? 0)
  if (!dest) return
  const t = a.ctx.currentTime + (o.at ?? 0)
  const src = a.ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  const f = a.ctx.createBiquadFilter()
  f.type = o.type ?? 'lowpass'
  f.Q.value = o.q ?? 0.8
  f.frequency.setValueAtTime((o.f0 ?? 4000) * pitch, t)
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1 * pitch), t + o.dur)
  const g = a.ctx.createGain()
  g.gain.setValueAtTime(o.vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  src.connect(f).connect(g).connect(dest)
  src.start(t, Math.random() * 0.5)
  src.stop(t + o.dur + 0.02)
  registerOneShotSource(src)
}

/** Quick note run (MIDI numbers), e.g. pickups and fanfares. */
const arp = (notes: number[], step: number, wave: Wave, vol: number, len = step * 1.4, at = 0, pan = 0): void => {
  notes.forEach((n, i) => tone({ wave, f0: midiHz(n), dur: len, vol, at: at + i * step, pan }))
}

// Voice limiting: the same sound can only retrigger every `gap` seconds.
const lastAt = new Map<string, number>()
const GAP: Partial<Record<SfxName, number>> = {
  // The minigun's 15 rounds a second are already spaced by `SFX_MIN_GAP_MS`;
  // this only catches a double trigger (the audio clock moves in steps).
  minigun: 0.035, hit: 0.04, tink: 0.05, enemyShot: 0.07, explode: 0.08, uiClick: 0.03, step: 0.16,
  // A volley whizzes once, and the hurt is one sound however many rounds land.
  whizz: 0.4, hurt: 0.14, ricochet: 0.12,
  // Several guards noticing at once are one sting.
  suspicious: 0.5, spotted: 0.4, alertUp: 0.25, kill: 0.08
}

/**
 * The sounds heard dozens of times a minute get a small random pitch (±4 %)
 * and level (±10 %) each time, so a fight is not one sample on repeat.
 */
const VARY: ReadonlySet<SfxName> = new Set<SfxName>([
  'minigun', 'hit', 'tink', 'explode', 'enemyShot', 'step', 'ricochet', 'sniper', 'kill', 'impactBody', 'impactMetal'
])

/** The big stings: the music steps back under them (seconds). */
const DUCK_FOR: Partial<Record<SfxName, number>> = { alarm: 1.4, killcam: 1.2, medal: 0.5, down: 1.6, extract: 1.2 }

/** The loudest sounds, trimmed 2–3 dB under the frequent ones. */
const TRIM: Partial<Record<SfxName, number>> = { explode: 0.75, shell: 0.8, wreck: 0.85 }

/**
 * At most this many sounds start in any `CAP_WINDOW` seconds. A big fight can
 * fire hits, shots and blasts at once; past the cap the frequent small sounds
 * are dropped, never the rare important ones (`NEVER_DROP`).
 */
const CAP = 24
const CAP_WINDOW = 0.25
const recent: number[] = []
const NEVER_DROP: ReadonlySet<SfxName> = new Set<SfxName>([
  'hurt', 'down', 'alarm', 'spotted', 'sniper', 'rocket', 'blade', 'stab', 'bladePull', 'stabFlesh', 'slashFlesh', 'impactBody', 'impactMetal', 'denied', 'uiClick', 'uiOpen', 'uiClose', 'uiConfirm',
  'objective', 'extract', 'killcam', 'medal', 'telegraph'
])

/** Open (a muffle of 0 has no filter at all) and fully muffled cutoffs (Hz). */
const OPEN_HZ = 16000
const MUFFLED_HZ = 850
/** The low-pass cutoff for a muffle of 0..1, on an exponential (pitch) scale. */
export const muffleHz = (muffle: number): number =>
  OPEN_HZ * Math.pow(MUFFLED_HZ / OPEN_HZ, Math.max(0, Math.min(1, muffle)))

// ─── The rendered sounds (`foley.ts`) ────────────────────────────────────────
// Each variant is rendered once, on first use, at the context's own rate,
// and kept: a round of the minigun is then one buffer source and a gain.

const foleyBuffers = new Map<string, AudioBuffer>()
const lastVariant = new Map<FoleyName, number>()

const foleyBuffer = (name: FoleyName | 'spin' | 'burst', v: number): AudioBuffer | null => {
  const a = audio()
  if (!a) return null
  const sr = a.ctx.sampleRate
  const key = `${name}:${v}:${sr}`
  let buf = foleyBuffers.get(key)
  if (!buf) {
    const data = name === 'spin' ? minigunSpin(sr) : name === 'burst' ? minigunBurst(sr) : FOLEY[name].bake(sr, v)
    buf = a.ctx.createBuffer(1, data.length, sr)
    buf.getChannelData(0).set(data)
    foleyBuffers.set(key, buf)
  }
  return buf
}

let warmed = false
/**
 * Render every variant ahead, one per idle moment: the first rocket of a
 * mission should not wait for its explosion to render (tens of ms on a
 * desktop, the most of any). Started during the drop-in (`gameSounds.ts`),
 * like the music's halls, or by the first sound heard, whichever comes
 * first; a sound asked for before its turn is rendered on the spot.
 */
export const warmFoley = (): void => {
  if (warmed || !audio()) return
  warmed = true
  const todo: Array<[FoleyName | 'spin', number]> = [['spin', 0]]
  for (const name of Object.keys(FOLEY) as FoleyName[]) {
    for (let v = 0; v < FOLEY[name].variants; v++) todo.push([name, v])
  }
  const idle = (fn: () => void): void => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 1000 })
    else setTimeout(fn, 16)
  }
  const next = (): void => {
    const job = todo.shift()
    if (!job) return
    try { foleyBuffer(job[0], job[1]) } catch { /* rendered on demand instead */ }
    idle(next)
  }
  idle(next)
}

/** Play one of a rendered sound's variants (never the same one twice running). */
const foley = (name: FoleyName) => (pan: number, g: number): void => {
  const n = FOLEY[name].variants
  const prev = lastVariant.get(name) ?? -1
  const v = n < 2 ? 0 : (prev + 1 + Math.floor(Math.random() * (n - 1))) % n
  lastVariant.set(name, v)
  const buf = foleyBuffer(name, v)
  if (buf) playBuffer(buf, pan, g)
}

const RECIPES: Record<SfxName, (pan: number, g: number) => void> = {
  // ── The mech ──
  // A servo and a soft footfall: it moves silently (GDD 2.1), so only the player hears it.
  step: (p, g) => {
    burst({ dur: 0.05, vol: 0.05 * g, type: 'lowpass', f0: 500, f1: 180, pan: p })
    tone({ wave: 'sine', f0: 90, f1: 60, dur: 0.06, vol: 0.06 * g, pan: p })
  },
  land: (p, g) => {
    tone({ wave: 'sine', f0: 120, f1: 38, dur: 0.24, vol: 0.34 * g, pan: p })
    burst({ dur: 0.18, vol: 0.2 * g, type: 'lowpass', f0: 900, f1: 120, pan: p })
  },
  crouch: (_p, g) => tone({ wave: 'tri', f0: 300, f1: 170, dur: 0.1, vol: 0.09 * g }),
  climb: (_p, g) => arp([55, 59], 0.07, 'tri', 0.1 * g, 0.06),
  cable: (_p, g) => {
    tone({ wave: 'saw', f0: 420, f1: 640, dur: 0.3, vol: 0.05 * g, vib: 18, vibRate: 22 })
    burst({ dur: 0.3, vol: 0.05 * g, type: 'bandpass', f0: 2400, f1: 3600, q: 4 })
  },
  hurt: (_p, g) => {
    tone({ wave: 'p50', f0: 240, f1: 90, dur: 0.16, vol: 0.2 * g })
    burst({ dur: 0.12, vol: 0.16 * g, type: 'bandpass', f0: 1400, f1: 500, q: 1.2 })
  },
  armorLow: (_p, g) => arp([76, 76], 0.16, 'p25', 0.1 * g, 0.09),
  down: (_p, g) => {
    tone({ wave: 'saw', f0: 320, f1: 40, dur: 0.9, vol: 0.2 * g, exp: true })
    burst({ dur: 0.7, vol: 0.2 * g, type: 'lowpass', f0: 2600, f1: 90 })
    arp([64, 60, 55, 48], 0.16, 'p25', 0.12 * g, 0.2, 0.15)
  },

  // ── The sniper: suppressed but heavy, then the bolt worked (rendered, `foley.ts`) ──
  sniper: foley('sniper'),
  bolt: foley('bolt'),
  reload: (_p, g) => {
    tone({ wave: 'p25', f0: 520, f1: 300, dur: 0.07, vol: 0.1 * g })
    burst({ dur: 0.08, vol: 0.08 * g, type: 'bandpass', f0: 1800, q: 2, at: 0.12 })
  },
  reloadDone: (_p, g) => arp([72, 79], 0.05, 'p12', 0.11 * g, 0.06),
  scopeIn: (_p, g) => tone({ wave: 'sine', f0: 420, f1: 1250, dur: 0.16, vol: 0.07 * g }),
  scopeOut: (_p, g) => tone({ wave: 'sine', f0: 1100, f1: 420, dur: 0.12, vol: 0.06 * g }),
  dry: (_p, g) => tone({ wave: 'p12', f0: 1300, dur: 0.03, vol: 0.09 * g }),
  // Running low (#145): two soft, falling ticks, a warning and not an alarm.
  ammoLow: (_p, g) => {
    tone({ wave: 'p25', f0: 980, dur: 0.045, vol: 0.06 * g })
    tone({ wave: 'p25', f0: 820, dur: 0.05, vol: 0.06 * g, at: 0.11 })
  },

  // ── The loud weapons (the rounds, the launch and the blast rendered, `foley.ts`) ──
  minigun: foley('minigun'),
  overheat: (_p, g) => {
    burst({ dur: 0.7, vol: 0.14 * g, type: 'highpass', f0: 2500, f1: 7000 })
    tone({ wave: 'saw', f0: 700, f1: 160, dur: 0.5, vol: 0.07 * g })
  },
  rocket: foley('rocket'),
  explode: foley('explode'),
  weapon: (_p, g) => {
    tone({ wave: 'p12', f0: 700, dur: 0.03, vol: 0.1 * g })
    tone({ wave: 'p25', f0: 380, f1: 520, dur: 0.07, vol: 0.1 * g, at: 0.06 })
    burst({ dur: 0.06, vol: 0.06 * g, type: 'bandpass', f0: 2600, q: 3, at: 0.06 })
  },

  // ── Salvage: scrap shifted about, then the good part pocketed ──
  loot: (_p, g) => {
    burst({ dur: 0.5, vol: 0.06 * g, type: 'bandpass', f0: 2200, f1: 1400, q: 2.5 })
    tone({ wave: 'p12', f0: 820, f1: 760, dur: 0.04, vol: 0.06 * g, at: 0.08 })
    tone({ wave: 'p12', f0: 1100, f1: 990, dur: 0.04, vol: 0.05 * g, at: 0.27 })
  },
  lootDone: (_p, g) => {
    tone({ wave: 'tri', f0: 523, dur: 0.08, vol: 0.12 * g })
    tone({ wave: 'tri', f0: 784, dur: 0.1, vol: 0.12 * g, at: 0.07 })
    tone({ wave: 'tri', f0: 1046, dur: 0.16, vol: 0.1 * g, at: 0.14 })
    burst({ dur: 0.18, vol: 0.06 * g, type: 'highpass', f0: 5000, at: 0.05 })
  },

  // ── The grappling hook: a line paid out, steel on stone, a winch ──
  hookThrow: (_p, g) => {
    burst({ dur: 0.22, vol: 0.1 * g, type: 'bandpass', f0: 900, f1: 3600, q: 1.2 })
    tone({ wave: 'tri', f0: 300, f1: 900, dur: 0.2, vol: 0.06 * g })
  },
  hookBite: (p, g) => {
    tone({ wave: 'p12', f0: 1900, f1: 1300, dur: 0.05, vol: 0.14 * g, pan: p })
    tone({ wave: 'tri', f0: 620, f1: 480, dur: 0.22, vol: 0.1 * g, pan: p, at: 0.01 })
    burst({ dur: 0.07, vol: 0.14 * g, type: 'highpass', f0: 3200, pan: p })
  },
  hookReel: (_p, g) => {
    tone({ wave: 'saw', f0: 140, f1: 420, dur: 0.9, vol: 0.05 * g, vib: 14, vibRate: 28 })
    burst({ dur: 0.9, vol: 0.035 * g, type: 'bandpass', f0: 1400, f1: 2600, q: 2 })
  },
  hookRecall: (_p, g) => {
    tone({ wave: 'tri', f0: 900, f1: 260, dur: 0.18, vol: 0.07 * g })
    burst({ dur: 0.14, vol: 0.07 * g, type: 'bandpass', f0: 3000, f1: 800, q: 1.2 })
  },

  // ── The blade: drawn (an energy hum), a quick strike, driven in, pulled out ──
  bladeOut: (_p, g) => tone({ wave: 'saw', f0: 500, f1: 1500, dur: 0.14, vol: 0.06 * g, vib: 30, vibRate: 40 }),
  blade: foley('blade'),
  stab: foley('stab'),
  bladePull: foley('bladePull'),
  stabFlesh: foley('stabFlesh'),
  pullFlesh: foley('pullFlesh'),
  slashFlesh: foley('slashFlesh'),
  grab: foley('grab'),
  decoy: (_p, g) => {
    arp([79, 86, 91], 0.05, 'p12', 0.1 * g, 0.12)
    tone({ wave: 'sine', f0: 600, f1: 1800, dur: 0.35, vol: 0.05 * g, vib: 40, vibRate: 9 })
  },
  decoyOut: (_p, g) => arp([86, 79, 72], 0.05, 'p12', 0.07 * g, 0.08),

  // ── What a round does: flesh or metal, by what it struck (`gameSounds.ts`) ──
  hit: foley('hit'),
  impactBody: foley('impactBody'),
  impactMetal: foley('impactMetal'),
  // The one the player is waiting for: a bright two-note ping.
  headshot: (p, g) => {
    arp([88, 100], 0.045, 'p12', 0.17 * g, 0.14, 0, p)
    tone({ wave: 'sine', f0: 180, f1: 70, dur: 0.12, vol: 0.2 * g, pan: p })
  },
  tink: foley('tink'),
  ricochet: (p, g) => tone({ wave: 'sine', f0: 2400, f1: 900, dur: 0.22, vol: 0.07 * g, vib: 80, vibRate: 30, pan: p }),
  kill: (p, g) => {
    tone({ wave: 'tri', f0: 380, f1: 120, dur: 0.18, vol: 0.14 * g, pan: p })
    burst({ dur: 0.12, vol: 0.08 * g, type: 'lowpass', f0: 900, f1: 200, at: 0.12, pan: p })
  },
  wreck: (p, g) => {
    tone({ wave: 'saw', f0: 240, f1: 30, dur: 0.8, vol: 0.22 * g, pan: p })
    burst({ dur: 0.9, vol: 0.26 * g, type: 'lowpass', f0: 3000, f1: 80, pan: p })
    arp([52, 47, 40], 0.12, 'p50', 0.1 * g, 0.2, 0.1, p)
  },

  // ── The base ──
  suspicious: (p, g) => arp([72, 78], 0.09, 'tri', 0.13 * g, 0.16, 0, p),
  spotted: (p, g) => {
    arp([81, 88, 93], 0.05, 'p25', 0.16 * g, 0.09, 0, p)
    burst({ dur: 0.1, vol: 0.08 * g, type: 'highpass', f0: 4000, pan: p })
  },
  body: (_p, g) => arp([67, 66, 67, 73], 0.07, 'p25', 0.13 * g, 0.1),
  alertUp: (_p, g) => tone({ wave: 'p25', f0: 520, f1: 780, dur: 0.14, vol: 0.12 * g }),
  alertDown: (_p, g) => tone({ wave: 'tri', f0: 620, f1: 380, dur: 0.22, vol: 0.08 * g }),
  alarm: (_p, g) => {
    for (let i = 0; i < 3; i++) {
      tone({ wave: 'saw', f0: 520, f1: 860, dur: 0.3, vol: 0.14 * g, at: i * 0.36 })
      tone({ wave: 'p25', f0: 260, f1: 430, dur: 0.3, vol: 0.1 * g, at: i * 0.36 })
    }
  },
  // A machine uplinking (#73): three rising chirps, the last one held.
  uplink: (p, g) => {
    for (let i = 0; i < 3; i++) tone({ wave: 'p12', f0: 700 + i * 260, f1: 900 + i * 300, dur: i === 2 ? 0.22 : 0.09, vol: 0.09 * g, at: i * 0.13, pan: p })
  },
  enemyShot: (p, g) => {
    tone({ wave: 'p25', f0: 480, f1: 180, dur: 0.07, vol: 0.13 * g, pan: p })
    burst({ dur: 0.06, vol: 0.12 * g, type: 'bandpass', f0: 1600, q: 1, pan: p })
  },
  whizz: (p, g) => burst({ dur: 0.16, vol: 0.1 * g, type: 'bandpass', f0: 5200, f1: 1400, q: 5, pan: p }),
  wake: (p, g) => {
    tone({ wave: 'saw', f0: 40, f1: 190, dur: 1.2, vol: 0.14 * g, exp: false, pan: p })
    tone({ wave: 'p50', f0: 80, f1: 380, dur: 1.2, vol: 0.06 * g, exp: false, pan: p })
    arp([57, 64, 69], 0.1, 'p25', 0.09 * g, 0.14, 1.1, p)
  },
  telegraph: (_p, g) => {
    for (let i = 0; i < 4; i++) tone({ wave: 'p12', f0: 1500 + i * 180, dur: 0.07, vol: 0.11 * g, at: i * 0.25 })
  },
  shell: (p, g) => {
    tone({ wave: 'sine', f0: 90, f1: 24, dur: 0.9, vol: 0.46 * g, pan: p })
    burst({ dur: 1.0, vol: 0.36 * g, type: 'lowpass', f0: 4200, f1: 90, pan: p })
  },
  wave: (_p, g) => arp([57, 57, 64], 0.13, 'p50', 0.12 * g, 0.12),

  // ── The mission's beats ──
  objective: (_p, g) => arp([76, 83, 88, 95], 0.07, 'p25', 0.15 * g, 0.16),
  extract: (_p, g) => {
    arp([67, 74, 79, 86, 91], 0.08, 'p25', 0.15 * g, 0.2)
    tone({ wave: 'saw', f0: 120, f1: 620, dur: 1.4, vol: 0.06 * g, exp: false })
  },
  // ── The smithy ──
  // A push of the bellows: a soft rush of air into the coals.
  bellows: (_p, g) => {
    burst({ dur: 0.35, vol: 0.07 * g, type: 'lowpass', f0: 900, f1: 400 })
  },
  // The crucible full: a deep bubbling glug.
  melt: (_p, g) => {
    tone({ wave: 'sine', f0: 140, f1: 90, dur: 0.25, vol: 0.14 * g })
    tone({ wave: 'sine', f0: 180, f1: 110, dur: 0.2, vol: 0.1 * g, at: 0.18 })
    tone({ wave: 'tri', f0: 660, f1: 990, dur: 0.18, vol: 0.06 * g, at: 0.3 })
  },
  // Hammer on hot steel: a bright ring over a thud.
  clang: (_p, g) => {
    tone({ wave: 'tri', f0: 1480, f1: 1420, dur: 0.35, vol: 0.12 * g })
    tone({ wave: 'sine', f0: 2960, f1: 2900, dur: 0.22, vol: 0.05 * g })
    burst({ dur: 0.06, vol: 0.12 * g, type: 'bandpass', f0: 2500, q: 1.2 })
    tone({ wave: 'sine', f0: 110, f1: 70, dur: 0.12, vol: 0.12 * g })
  },
  // A strike off the beat: a dull clunk.
  clangOff: (_p, g) => {
    tone({ wave: 'tri', f0: 420, f1: 380, dur: 0.12, vol: 0.09 * g })
    burst({ dur: 0.08, vol: 0.08 * g, type: 'lowpass', f0: 1200 })
  },
  // Into the water: a hiss of steam.
  hiss: (_p, g) => {
    burst({ dur: 0.9, vol: 0.12 * g, type: 'highpass', f0: 3500, f1: 6000 })
    tone({ wave: 'sine', f0: 300, f1: 120, dur: 0.3, vol: 0.06 * g })
  },
  // The Warden's glint: a thin high ring before the dash.
  glint: (_p, g) => {
    tone({ wave: 'sine', f0: 2400, f1: 3200, dur: 0.35, vol: 0.06 * g })
    tone({ wave: 'sine', f0: 3600, dur: 0.2, vol: 0.04 * g, at: 0.1 })
  },
  // The Goliath's vents blowing: a long hiss.
  vent: (_p, g) => {
    burst({ dur: 1.4, vol: 0.09 * g, type: 'highpass', f0: 2200, f1: 900 })
  },
  // A training gate opens: a rising sweep and a chime.
  gate: (_p, g) => {
    tone({ wave: 'tri', f0: 330, f1: 990, dur: 0.35, vol: 0.08 * g })
    tone({ wave: 'sine', f0: 1320, dur: 0.25, vol: 0.06 * g, at: 0.3 })
  },
  // The scope's zoom clicks a notch.
  zoom: (_p, g) => {
    burst({ dur: 0.04, vol: 0.05 * g, type: 'bandpass', f0: 3200, q: 4 })
  },
  // A hound's bark: two short, gruff, falling yaps through a speaker.
  growl: (p, g) => {
    tone({ wave: 'p12', f0: 520, f1: 260, dur: 0.09, vol: 0.07 * g, pan: p })
    tone({ wave: 'p12', f0: 480, f1: 220, dur: 0.1, vol: 0.07 * g, at: 0.16, pan: p })
  },
  // An Engineer's repair done: a ratchet and a ding.
  repair: (p, g) => {
    burst({ dur: 0.18, vol: 0.06 * g, type: 'bandpass', f0: 2600, f1: 1800, q: 3, pan: p })
    tone({ wave: 'sine', f0: 1320, dur: 0.18, vol: 0.05 * g, at: 0.2, pan: p })
  },
  // A unit tagged through the scope: two short high blips.
  tag: (_p, g) => {
    tone({ wave: 'sine', f0: 1480, dur: 0.05, vol: 0.07 * g })
    tone({ wave: 'sine', f0: 1980, dur: 0.07, vol: 0.07 * g, at: 0.07 })
  },
  // A body grabbed or let go: a low scrape.
  drag: (_p, g) => {
    burst({ dur: 0.22, vol: 0.06 * g, type: 'lowpass', f0: 700, f1: 260 })
  },
  // An armour shard taken: a bright rising chime.
  shard: (_p, g) => {
    tone({ wave: 'tri', f0: 880, f1: 1320, dur: 0.12, vol: 0.1 * g })
    tone({ wave: 'sine', f0: 1760, dur: 0.1, vol: 0.06 * g, at: 0.06 })
  },
  // A guard who is sure: a short two-note squawk, "hey!".
  shout: (_p, g) => {
    tone({ wave: 'p25', f0: 520, f1: 760, dur: 0.12, vol: 0.12 * g })
    tone({ wave: 'p25', f0: 760, f1: 700, dur: 0.16, vol: 0.12 * g, at: 0.13 })
  },
  // The beacon being cranked: a siren winding up.
  crank: (_p, g) => {
    tone({ wave: 'saw', f0: 200, f1: 900, dur: 2.4, vol: 0.06 * g, exp: false })
    burst({ dur: 2.4, vol: 0.03 * g, type: 'bandpass', f0: 600, f1: 1600, q: 3 })
  },
  // A beacon put out of action: a crackle and a dying hum.
  zap: (_p, g) => {
    burst({ dur: 0.3, vol: 0.12 * g, type: 'highpass', f0: 3000 })
    tone({ wave: 'sine', f0: 240, f1: 60, dur: 0.5, vol: 0.1 * g, at: 0.05 })
  },
  // A radio that gets no answer: static, two hopeful beeps, static.
  radio: (_p, g) => {
    burst({ dur: 0.25, vol: 0.07 * g, type: 'bandpass', f0: 2400, q: 1.5 })
    tone({ wave: 'p50', f0: 1320, dur: 0.07, vol: 0.06 * g, at: 0.28 })
    tone({ wave: 'p50', f0: 1320, dur: 0.07, vol: 0.06 * g, at: 0.42 })
    burst({ dur: 0.3, vol: 0.05 * g, type: 'bandpass', f0: 2000, q: 1.5, at: 0.6 })
  },
  // The hide box: down with a hollow clunk; up with a lighter one.
  boxOn: (_p, g) => {
    tone({ wave: 'tri', f0: 220, f1: 140, dur: 0.14, vol: 0.14 * g })
    burst({ dur: 0.1, vol: 0.08 * g, type: 'lowpass', f0: 900 })
  },
  boxOff: (_p, g) => {
    tone({ wave: 'tri', f0: 260, f1: 360, dur: 0.1, vol: 0.1 * g })
  },
  // The jet board: a rising whoosh past, then the hop off it.
  boardJump: (_p, g) => {
    burst({ dur: 0.5, vol: 0.1 * g, type: 'bandpass', f0: 900, f1: 3200, q: 0.9 })
    tone({ wave: 'tri', f0: 330, f1: 660, dur: 0.18, vol: 0.08 * g })
  },
  // The robo dog arrives: two happy electronic yips over its jets.
  bark: (_p, g) => {
    tone({ wave: 'p25', f0: 640, f1: 980, dur: 0.09, vol: 0.09 * g })
    tone({ wave: 'p25', f0: 700, f1: 1100, dur: 0.11, vol: 0.09 * g, at: 0.15 })
    burst({ dur: 1.1, vol: 0.07 * g, type: 'bandpass', f0: 500, f1: 1800, q: 0.8 })
  },
  dropIn: (_p, g) => {
    burst({ dur: 1.0, vol: 0.14 * g, type: 'bandpass', f0: 300, f1: 2400, q: 0.7 })
    tone({ wave: 'sine', f0: 600, f1: 90, dur: 0.9, vol: 0.1 * g })
  },
  // Time slows: everything drops an octave and a half.
  killcam: (_p, g) => {
    tone({ wave: 'sine', f0: 880, f1: 110, dur: 0.7, vol: 0.14 * g })
    burst({ dur: 0.9, vol: 0.09 * g, type: 'lowpass', f0: 6000, f1: 300 })
  },
  lesson: (_p, g) => arp([84, 91], 0.05, 'p12', 0.1 * g, 0.08),
  medal: (_p, g) => arp([79, 86, 91, 98], 0.05, 'p25', 0.15 * g, 0.14),

  // ── The Command Base and the interface ──
  buy: (_p, g) => {
    arp([72, 79, 84], 0.05, 'p25', 0.14 * g, 0.1)
    burst({ dur: 0.08, vol: 0.06 * g, type: 'highpass', f0: 5000, at: 0.1 })
  },
  forgeStart: (_p, g) => {
    tone({ wave: 'saw', f0: 90, f1: 240, dur: 0.5, vol: 0.1 * g, exp: false })
    burst({ dur: 0.5, vol: 0.08 * g, type: 'bandpass', f0: 800, f1: 2600, q: 1 })
  },
  forgeDone: (_p, g) => arp([72, 76, 79, 84, 88], 0.06, 'p25', 0.15 * g, 0.16),
  denied: (_p, g) => tone({ wave: 'p50', f0: 140, f1: 110, dur: 0.14, vol: 0.18 * g }),
  uiClick: (_p, g) => tone({ wave: 'p12', f0: 1800, dur: 0.035, vol: 0.1 * g }),
  uiOpen: (_p, g) => arp([79, 86], 0.045, 'p12', 0.12 * g, 0.06),
  uiClose: (_p, g) => arp([84, 77], 0.04, 'p25', 0.08 * g, 0.05),
  uiConfirm: (_p, g) => arp([79, 84, 91], 0.045, 'p12', 0.13 * g, 0.08)
}

// ─── Drop-in SFX files ───────────────────────────────────────────────────────
// A file in public/audio/sfx/ named after a recipe replaces it (see
// `game/assets/overrides.ts`). Decoded on an OfflineAudioContext, which needs
// no user gesture, so the buffers are ready before the first shot and the
// autoplay policy never sees a context it would refuse.

/** Drop-ins are mastered hotter than the synth voices; this evens them out. */
const FILE_GAIN = 0.55
const fileBuffers = new Map<string, AudioBuffer>()
let filesRequested = false

/** Fetch and decode every drop-in SFX file (from the boot loader). */
export const loadSfxOverrides = (): void => {
  if (filesRequested || SFX_FILES.size === 0) return
  filesRequested = true
  const Offline = window.OfflineAudioContext
    ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!Offline) return
  const decoder = new Offline(2, 1, 44100)
  for (const [name, url] of SFX_FILES) {
    fetch(url)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(buf => decoder.decodeAudioData(buf))
      .then(ab => { fileBuffers.set(name, ab) })
      .catch(e => console.warn(`[sfx] drop-in "${name}" could not be loaded — keeping the synth`, e))
  }
}

// ─── Voice-overs (#65) ───────────────────────────────────────────────────────
// Decoded once on the offline context (no gesture needed), played on the sfx
// bus: the mute, the volume and an ad's silence cover them like every effect.

const voiceBuffers = new Map<string, AudioBuffer | null>()
let voiceDecoder: OfflineAudioContext | null = null

/** Fetch and decode voice files ahead of their moment. */
export const prefetchVoices = (urls: Iterable<string>): void => {
  const Offline = window.OfflineAudioContext
    ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!Offline) return
  voiceDecoder ??= new Offline(1, 1, 48000)
  for (const url of urls) {
    if (voiceBuffers.has(url)) continue
    voiceBuffers.set(url, null)
    fetch(url)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(buf => voiceDecoder!.decodeAudioData(buf))
      .then(ab => { voiceBuffers.set(url, ab) })
      .catch(e => { voiceBuffers.delete(url); console.warn('[voice] could not load', url, e) })
  }
}

/** Play a voice file now (silence if it is not decoded yet: it is fetched for next time). True if it played. */
export const playVoice = (url: string, pan: number, gain: number): boolean => {
  const buf = voiceBuffers.get(url)
  if (!buf) { if (!voiceBuffers.has(url)) prefetchVoices([url]); return false }
  if (!canPlay()) return false
  const a = audio()
  if (!a || (a.ctx.state !== 'running' && !audioForced())) return false
  const dest = out(pan)
  if (!dest) return false
  const src = a.ctx.createBufferSource()
  src.buffer = buf
  const g = a.ctx.createGain()
  g.gain.value = gain
  src.connect(g).connect(dest)
  src.start()
  registerOneShotSource(src)
  return true
}

/** A sample on the sfx bus (through `out`, so the muffle, the pan and every
 *  mute gate hold), tuned by the recipe's pitch. */
const playBuffer = (buf: AudioBuffer, pan: number, gain: number): void => {
  const a = audio()
  if (!a) return
  const dest = out(pan)
  if (!dest) return
  const src = a.ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = pitch
  const g = a.ctx.createGain()
  g.gain.value = gain
  src.connect(g).connect(dest)
  src.start()
  registerOneShotSource(src)
}

const playFile = (buf: AudioBuffer, pan: number, gain: number): void => playBuffer(buf, pan, FILE_GAIN * gain)

const play = (name: SfxName, pan: number, gain: number, muffle = 0): void => {
  if (!canPlay()) return
  const a = audio()
  if (!a || (a.ctx.state !== 'running' && !audioForced())) return
  const gap = GAP[name] ?? 0.02
  const now = a.ctx.currentTime
  const last = lastAt.get(name) ?? -1
  if (now - last < gap) return
  while (recent.length && now - recent[0]! > CAP_WINDOW) recent.shift()
  if (recent.length >= CAP && !NEVER_DROP.has(name)) return
  recent.push(now)
  lastAt.set(name, now)
  warmFoley()
  const vary = VARY.has(name)
  const g = Math.max(0.05, Math.min(1.4, gain * (TRIM[name] ?? 1) * (vary ? 0.9 + Math.random() * 0.2 : 1)))
  pitch = vary ? 0.96 + Math.random() * 0.08 : 1
  const duckFor = DUCK_FOR[name]
  if (duckFor) duckMusic(duckFor)
  // Muffled: one low-pass in front of the SAME sfx bus, so the mute, the
  // volume and the ad gates hold for it like for any other sound.
  if (muffle > 0.01) {
    try {
      route = a.ctx.createBiquadFilter()
      route.type = 'lowpass'
      route.frequency.value = muffleHz(muffle)
      route.Q.value = 0.7
      route.connect(a.sfx)
      // Every voice of a recipe ends within ~2 s; then the filter goes too.
      const r = route
      setTimeout(() => { try { r.disconnect() } catch { /* gone */ } }, 2500)
    } catch { route = null }
  }
  try {
    const file = fileBuffers.get(name)
    if (file) playFile(file, pan, g)
    else RECIPES[name]?.(pan, g)
  } catch { /* a voice failed to start — never fatal */ } finally {
    route = null
    pitch = 1
  }
}

export const installSynth = (): void => {
  setSfxPlayer(play)
}

// ─── The minigun's motor ─────────────────────────────────────────────────────
// One persistent voice, re-pitched every frame by how fast the barrels turn:
// the motor's whir and whine and the six barrels' rattle (`foley.minigunSpin`)
// as one seamless loop, played faster as the gun spools up, so the whole
// mechanism speeds up and rises together, and slower as it winds down after
// the last round. Never a new source per frame.

/** The spin loop's playback rate standing still and at speed: a 52 Hz motor
 *  and 12 clicks a second, up to 208 Hz and 50. */
const SPIN_RATE_IDLE = 0.25
const SPIN_RATE_FULL = 1

let hum: { src: AudioBufferSourceNode; lp: BiquadFilterNode; gain: GainNode } | null = null

// ─── The minigun firing (#183) ───────────────────────────────────────────────
// One persistent voice while it fires: the "brrrt" (`foley.minigunBurst`),
// looping, faded in on the first round and out a beat after the last.
let fire: { src: AudioBufferSourceNode; gain: GainNode } | null = null

/** True while the minigun fires; false fades the roar out. */
export const minigunFire = (on: boolean): void => {
  const a = audio()
  if (!a) return
  const t = a.ctx.currentTime
  if (!on || !canPlay()) {
    if (fire) {
      fire.gain.gain.setTargetAtTime(0, t, 0.025)
      const src = fire.src
      setTimeout(() => { try { src.stop() } catch { /* stopped */ } }, 140)
    }
    fire = null
    return
  }
  if (fire) return
  const buf = foleyBuffer('burst', 0)
  if (!buf) return
  const src = a.ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  src.playbackRate.value = 0.97 + Math.random() * 0.06
  const gain = a.ctx.createGain()
  gain.gain.value = 0
  gain.gain.setTargetAtTime(0.42, t, 0.012)
  src.connect(gain).connect(a.sfx)
  src.start(t, Math.random() * buf.duration)
  registerOneShotSource(src)
  fire = { src, gain }
}

/** `spool01` 0 still … 1 at speed; null (or 0) stops it. */
export const minigunHum = (spool01: number | null): void => {
  const a = audio()
  if (!a) return
  const t = a.ctx.currentTime
  if (spool01 === null || spool01 <= 0.01 || !canPlay()) {
    if (hum) {
      hum.gain.gain.setTargetAtTime(0, t, 0.03)
      const src = hum.src
      setTimeout(() => { try { src.stop() } catch { /* stopped */ } }, 160)
    }
    hum = null
    return
  }
  if (!hum) {
    const buf = foleyBuffer('spin', 0)
    if (!buf) return
    const src = a.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.playbackRate.value = SPIN_RATE_IDLE
    // The faster it turns, the brighter: a slow spin is a low hum.
    const lp = a.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 700
    lp.Q.value = 0.6
    const gain = a.ctx.createGain()
    gain.gain.value = 0
    src.connect(lp).connect(gain).connect(a.sfx)
    src.start(t, Math.random() * buf.duration)
    registerOneShotSource(src)
    hum = { src, lp, gain }
  }
  hum.src.playbackRate.setTargetAtTime(SPIN_RATE_IDLE + (SPIN_RATE_FULL - SPIN_RATE_IDLE) * spool01, t, 0.04)
  hum.lp.frequency.setTargetAtTime(700 + spool01 * 5300, t, 0.04)
  hum.gain.gain.setTargetAtTime(0.012 + spool01 * 0.055, t, 0.04)
}
