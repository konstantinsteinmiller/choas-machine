// The NPCs' character chains (#65), as ffmpeg filter graphs. Pure: a speaker
// and a line in, a graph and the levelling targets out; tools/voice/post.mjs
// runs them.
//
// The model speaks a clean human voice (the cards); everything that makes it
// a fortress guard, a helmeted commander or a machine is here, the same on
// every line of that speaker:
//  - people: a little band-limiting and a short hard yard echo (they shout
//    across stone); the Warden through his helmet (a narrow band, a comb);
//  - machines: pitch, ring-mod, band, a tin or steel body; the drone small
//    and buzzy, the Enforcer heavy, the Goliath huge with a hull, the hound a
//    toy speaker.
// Texture stays subtle: a crushed layer under a voice reads as crisping.

/** Ring modulation mixed in at `mix`: x · (1 − mix + mix · sin(2π f t)). */
const ring = (hz, mix) => `aeval=exprs='val(0)*(${1 - mix}+${mix}*sin(2*PI*${hz}*t))':channel_layout=mono`
const eq = (f, g, w = 1) => `equalizer=f=${f}:t=q:w=${w}:g=${g}`
const band = (hp, lp) => `highpass=f=${hp}:poles=2,lowpass=f=${lp}:poles=2`
/** Semitones → rubberband's pitch ratio. */
const semis = (st) => (2 ** (st / 12)).toFixed(5)
/** The yard: a shout off stone walls, a couple of slaps and a short tail. */
const YARD = 'aecho=1:0.9:38|71|113:0.14|0.09|0.05'

/**
 * Dynamics per speaker (`{thr}` dB, ratio, attack/release ms) and the level a
 * finished line is brought to: `lufs` for lines over 1 s, `peak` dBFS for
 * shorter ones (LUFS needs 400 ms blocks). Barks: loud and even.
 */
export const DYNAMICS = {
  guard: { thr: -22, ratio: 4, atk: 3, rel: 90, lufs: -15, peak: -3 },
  sentry: { thr: -22, ratio: 4, atk: 3, rel: 90, lufs: -15, peak: -3 },
  engineer: { thr: -22, ratio: 4, atk: 3, rel: 90, lufs: -15, peak: -3 },
  warden: { thr: -24, ratio: 4, atk: 5, rel: 150, lufs: -15, peak: -3 },
  drone: { thr: -26, ratio: 5, atk: 1, rel: 60, lufs: -16, peak: -3 },
  enforcer: { thr: -26, ratio: 5, atk: 2, rel: 120, lufs: -15, peak: -3 },
  goliath: { thr: -26, ratio: 5, atk: 4, rel: 200, lufs: -14, peak: -3 },
  hound: { thr: -24, ratio: 4, atk: 1, rel: 60, lufs: -16, peak: -3 },
  // CM-07 (#126): close and present; the whisper softer and a good deal quieter.
  hero: { thr: -22, ratio: 3, atk: 4, rel: 100, lufs: -16, peak: -3 },
  heroHush: { thr: -30, ratio: 3, atk: 4, rel: 120, lufs: -21, peak: -8 }
}

/** Speakers whose takes are turned into a true whisper before their chain (#126: no engine whispers). */
export const whispered = (speaker) => speaker === 'heroHush'

/** Per-line exceptions: none yet. */
export const dynamicsFor = (speaker) => ({ ...DYNAMICS[speaker] })

/** Seconds of tail kept after the last sound: the yard rings a little. */
export const tailFor = (key) => (/^npc\.(goliath|warden)\./.test(key) ? 0.2 : 0.1)

/**
 * The character chain as a `-filter_complex` graph from `[0:a]` to `[fx]`,
 * mono, 48 kHz. `dry: true` gives the same graph without the character (the
 * prep only), for A/B listening.
 */
export const chainFor = (speaker, key, { dry = false } = {}) => {
  const prep = 'aformat=channel_layouts=mono,aresample=48000,highpass=f=70:poles=2,highpass=f=70:poles=2'
  if (dry) return `[0:a]${prep}[fx]`
  switch (speaker) {
    case 'guard':
    case 'sentry':
    case 'engineer':
      // A shout in the yard: a touch of presence, the wall slaps.
      return `[0:a]${prep},${band(110, 9000)},${eq(2800, 2)},${YARD}[fx]`
    case 'warden':
      // Through the armoured helm: a narrower band, a hollow 6 ms comb, a low push; then the yard.
      return `[0:a]${prep},${band(160, 6500)},${eq(900, 3, 1.5)},${eq(250, 2)},aecho=1:1:6:0.3,${YARD}[fx]`
    case 'drone':
      // A small machine: +4 semitones, a buzzy 220 Hz ring at 25 %, a tiny speaker.
      return `[0:a]${prep},rubberband=pitch=${semis(4)},${ring(220, 0.25)},${band(400, 7000)},${eq(2500, 3)}[fx]`
    case 'enforcer':
      // Heavy: −4 semitones, a 90 Hz ring at 20 %, a steel body (a 9 ms comb), weight low.
      return `[0:a]${prep},rubberband=pitch=${semis(-4)},${ring(90, 0.2)},${band(80, 7000)},${eq(150, 3)},${eq(3000, -2)},aecho=1:1:9:0.25[fx]`
    case 'goliath':
      // Huge: −7 semitones, a slow 55 Hz ring at 15 %, a hull (13 and 27 ms), a short rumble tail.
      return `[0:a]${prep},rubberband=pitch=${semis(-7)},${ring(55, 0.15)},${band(60, 6000)},${eq(110, 4)},aecho=1:1:13|27:0.25|0.15,aecho=1:0.9:60:0.1[fx]`
    case 'hound':
      // A toy speaker on a robot dog: +5 semitones, a bright 660 Hz ring at 12 %, thin and close.
      return `[0:a]${prep},rubberband=pitch=${semis(5)},${ring(660, 0.12)},${band(500, 8000)},${eq(3500, 3)},aecho=1:1:5:0.18[fx]`
    case 'hero':
      // The player's robot (#126): a human showman with a faint machine in him:
      // +1 semitone, a 330 Hz ring at 8 %, a little tin (a 4 ms comb), presence; dry and close.
      return `[0:a]${prep},rubberband=pitch=${semis(1)},${ring(330, 0.08)},${band(140, 9500)},${eq(3000, 2.5)},aecho=1:1:4:0.12[fx]`
    case 'heroHush':
      // The same, whispered: no ring (a whisper has no tone to ring), the tin and the air up top.
      return `[0:a]${prep},rubberband=pitch=${semis(1)},${band(260, 10000)},${eq(5000, 3)},aecho=1:1:4:0.1[fx]`
    default:
      throw new Error(`no chain for speaker ${speaker}`)
  }
}
