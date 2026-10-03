// Post-production for one take, from the model's WAV to the file the game
// plays: the speaker's robot chain (fx.mjs), the compressor, the trim (no
// leading silence: a line plays the moment its bubble pops), the loudness or
// peak target, a limiter at -3.3 dBFS (room for the encoder's overshoot), the
// fades, a tempo tighten of up to 8 % when a take runs past the line's max,
// then a 48 kHz WAV master and the shipped file: Opus 24 kbps (voip) in an
// .ogg container, mono. The user's blind listening test (2026-10-02) rated
// Opus 24k/16k above Vorbis q2 at about a third of its size; a decoder that
// reads Ogg Vorbis reads Ogg Opus too (old iOS reads neither: deferred).
//
// The shipped file is always encoded from the master: a lossy file is never
// re-encoded (`encode` takes any of ENCODINGS for the compression lab).

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { ROOT } from './lib.mjs'
import { chainFor, dynamicsFor, tailFor } from './fx.mjs'

const FFMPEG = createRequire(join(ROOT, 'package.json'))('ffmpeg-static')

/** Run ffmpeg; resolves with its stderr (where it reports), rejects on a non-zero exit. */
export const ffmpeg = (args) => new Promise((resolve, reject) => {
  const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], { windowsHide: true })
  let err = ''
  p.stderr.on('data', (d) => { err += d })
  p.on('error', reject)
  p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg ${code}: ${err.slice(-1200)}`))))
})

const db = (x) => (10 ** (x / 20)).toFixed(6)

/** Length (s), integrated loudness (LUFS, null under 0.4 s) and true peak (dBFS). */
export const measure = async (file) => {
  const out = await ffmpeg(['-i', file, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'])
  const d = out.match(/Duration: (\d+):(\d+):([\d.]+)/)
  const seconds = d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : NaN
  const sum = out.slice(out.lastIndexOf('Summary:'))
  const i = sum.match(/I:\s+(-?[\d.]+|-inf) LUFS/)
  const p = sum.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/)
  const lufs = i && i[1] !== '-inf' && seconds >= 0.4 ? +i[1] : null
  return { seconds, lufs, peak: p && p[1] !== '-inf' ? +p[1] : -Infinity }
}

/** The shipped format and the compression lab's candidates (`-c:a` and friends). */
export const ENCODINGS = {
  'vorbis-q2-44k': { ext: 'ogg', args: ['-ar', '44100', '-c:a', 'libvorbis', '-q:a', '2'] },
  'vorbis-q2-22k': { ext: 'ogg', args: ['-ar', '22050', '-c:a', 'libvorbis', '-q:a', '2'] },
  'vorbis-q0-22k': { ext: 'ogg', args: ['-ar', '22050', '-c:a', 'libvorbis', '-q:a', '0'] },
  'opus-24k': { ext: 'opus', args: ['-c:a', 'libopus', '-b:a', '24k', '-application', 'voip'] },
  'opus-16k': { ext: 'opus', args: ['-c:a', 'libopus', '-b:a', '16k', '-application', 'voip'] }
}
export const SHIP = 'opus-24k'

/** Encode a master (never a lossy file) to one of ENCODINGS. */
export const encode = async (master, out, name = SHIP) => {
  mkdirSync(dirname(out), { recursive: true })
  await ffmpeg(['-i', master, '-ac', '1', ...ENCODINGS[name].args, '-map_metadata', '-1', out])
  return out
}

/**
 * One take, end to end. `raw` is the model's WAV; writes `master` (WAV, 48
 * kHz) and, unless `ogg` is null, the shipped OGG. Resolves with the
 * finished take's numbers: seconds, lufs, peak, the tempo applied, the gain.
 */
export const processTake = async ({ raw, master, ogg, speaker, key, max, dry = false }) => {
  mkdirSync(dirname(master), { recursive: true })
  const d = dynamicsFor(speaker, key)
  const shaped = master.replace(/\.wav$/, '.shaped.wav')
  // 1. Chain, compressor, trim (lead over -45 dB minus 5 ms; tail over -50 dB plus the tail).
  const comp = `acompressor=threshold=${db(d.thr)}:ratio=${d.ratio}:attack=${d.atk}:release=${d.rel}:knee=2:makeup=1`
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.005,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse'
  await ffmpeg(['-i', raw, '-filter_complex', `${chainFor(speaker, key, { dry })};[fx]${comp},${trim},apad=pad_dur=${tailFor(key)}[out]`,
    '-map', '[out]', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s24le', shaped])
  // 2. Level: loudness for a line over 1 s, peak for a shorter one.
  const m = await measure(shaped)
  const byLufs = m.seconds > 1 && d.lufs != null && m.lufs != null
  let gain = byLufs ? d.lufs - m.lufs : d.peak - m.peak
  // 3. Tighten a take that runs up to 8 % past its max; a longer one is reported, not squeezed.
  const tempo = max && m.seconds > max && m.seconds <= max * 1.08 ? m.seconds / max : 1
  const len = m.seconds / tempo
  // 4. Gain, limiter, fades. A peaky voice (Vex's crushed layers) loses level in the limiter:
  //    measure and push again, up to three passes, until it lands within 0.5 LU.
  let f
  for (let pass = 0; pass < 3; pass++) {
    const af = [`volume=${gain.toFixed(2)}dB`, `alimiter=limit=${db(-3.3)}:attack=2:release=30:level=0`,
      ...(tempo > 1 ? [`atempo=${tempo.toFixed(4)}`] : []),
      'afade=t=in:d=0.004', `afade=t=out:st=${Math.max(0, len - 0.03).toFixed(3)}:d=0.03`]
    await ffmpeg(['-i', shaped, '-af', af.join(','), '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s24le', master])
    f = await measure(master)
    if (!byLufs || f.lufs == null || f.lufs >= d.lufs - 0.5) break
    gain += d.lufs - f.lufs
  }
  if (ogg) await encode(master, ogg)
  return { ...f, gain: +gain.toFixed(2), tempo: +tempo.toFixed(4), target: byLufs ? { lufs: d.lufs } : { peak: d.peak } }
}
