// `pnpm voice:compare` — the listening report: one local page with two tabs.
//
//  Engines      every sample line from every engine that ran
//               (`voice:gen --jobs samples --engine <name>`), blind: the
//               engines are letters, shuffled per line, with a reveal
//               button. Each clip plays with the robot chain (as shipped) or
//               dry (the model's own take), and gets 1–5 stars.
//  Compression  the same lines from one engine's WAV masters, encoded every
//               way the lab knows (ENCODINGS in post.mjs) plus a q2 file
//               compressed a second time, against the master; blind too, with
//               the size per line and for every line the game speaks.
//
// Ratings stay in the page (localStorage); "Export" downloads them as
// voice-ratings.json. Writes vo-src/compare/index.html and opens it.
//   --codec-engine <name>   whose masters the compression tab uses (default: the first engine)
//   --no-open               just write the page

import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT, VO_SRC, args } from './lib.mjs'
import { ENCODINGS, SHIP, encode, ffmpeg } from './post.mjs'

const a = args()
const out = join(VO_SRC, 'compare')
mkdirSync(out, { recursive: true })
const rel = (p) => relative(out, p).replaceAll('\\', '/')

// ── Engines that ran the samples ──
const gen = join(VO_SRC, 'gen')
const runs = (existsSync(gen) ? readdirSync(gen) : [])
  .map(e => join(gen, e, 'samples-results.json'))
  .filter(existsSync)
  .map(f => JSON.parse(readFileSync(f, 'utf8')))
if (!runs.length) throw new Error('No sample runs yet: pnpm voice:collect --samples, then pnpm voice:gen --jobs samples --engine <name>')

// A fixed shuffle per line, so the letters stay put between rebuilds.
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const shuffle = (xs, seed) => xs.map(x => [hash(seed + x.engine), x]).sort((p, q) => p[0] - q[0]).map(p => p[1])

const lines = new Map()
for (const run of runs) {
  for (const r of run.results) {
    const best = r.takes.find(t => t.take === r.best) ?? r.takes[0]
    if (!best) continue
    const e = lines.get(r.job.id) ?? { job: r.job, clips: [] }
    // The dry take: the model's own WAV, as delivered.
    const dry = best.master.replace(/\.master\.wav$/, '.wav')
    e.clips.push({
      engine: run.engine,
      label: run.label,
      fx: r.shipped ? rel(join(ROOT, r.shipped)) : rel(best.master),
      dry: rel(dry),
      seconds: best.seconds,
      heard: best.heard,
      qa: best.qa
    })
    lines.set(r.job.id, e)
  }
}
const engineRows = [...lines.values()].map(({ job, clips }) => ({
  id: job.id, lang: job.lang, speaker: job.speaker, text: job.shown, direction: job.direction, tone: job.tone,
  clips: shuffle(clips, job.id).map((c, i) => ({ ...c, letter: String.fromCharCode(65 + i) }))
}))

// ── Compression lab: one engine's masters, every encoding ──
const codecEngine = a['codec-engine'] ?? runs[0].engine
const codecRun = runs.find(r => r.engine === codecEngine) ?? runs[0]
const live = join(VO_SRC, 'jobs', 'live.json')
const liveSeconds = existsSync(live)
  ? JSON.parse(readFileSync(live, 'utf8')).jobs.reduce((s, j) => s + Math.min(j.max, 2.2), 0) // no takes yet: about each line's length
  : null
const codecs = [...Object.keys(ENCODINGS), 'vorbis-q2-twice']
const codecRows = []
for (const r of codecRun.results) {
  const best = r.takes.find(t => t.take === r.best) ?? r.takes[0]
  if (!best) continue
  const items = []
  for (const name of codecs) {
    const enc = name === 'vorbis-q2-twice' ? ENCODINGS[SHIP] : ENCODINGS[name]
    const file = join(out, 'codec', name, r.job.lang, `${r.job.file}.${enc.ext}`)
    if (name === 'vorbis-q2-twice') {
      // What "compress the shipped file again" does: decode the q2 file, encode it at q2 once more.
      const once = join(out, 'codec', SHIP, r.job.lang, `${r.job.file}.ogg`)
      if (!existsSync(once)) await encode(best.master, once, SHIP)
      const back = join(out, 'codec', name, r.job.lang, `${r.job.file}.decoded.wav`)
      mkdirSync(join(out, 'codec', name, r.job.lang), { recursive: true })
      await ffmpeg(['-i', once, '-ar', '48000', back])
      await encode(back, file, SHIP)
    } else {
      await encode(best.master, file, name)
    }
    const bytes = statSync(file).size
    items.push({ name, file: rel(file), bytes, kbps: +((bytes * 8) / 1000 / best.seconds).toFixed(1) })
  }
  const master = join(out, 'codec', 'master', r.job.lang, `${r.job.file}.wav`)
  mkdirSync(join(out, 'codec', 'master', r.job.lang), { recursive: true })
  copyFileSync(best.master, master)
  codecRows.push({ id: r.job.id, text: r.job.shown, seconds: best.seconds, master: rel(master), items: shuffle(items.map(i => ({ ...i, engine: i.name })), `c${r.job.id}`).map((c, i) => ({ ...c, letter: String.fromCharCode(65 + i) })) })
}
// Bytes per second of speech, per codec, over the sample lines: the game's total follows from it.
const rates = Object.fromEntries(codecs.map(n => {
  const xs = codecRows.map(r => [r.items.find(i => i.name === n).bytes, r.seconds])
  return [n, xs.reduce((s, x) => s + x[0], 0) / xs.reduce((s, x) => s + x[1], 0)]
}))

const data = { engines: runs.map(r => ({ engine: r.engine, label: r.label })), engineRows, codecEngine: codecRun.label, codecRows, rates, liveSeconds, liveLines: existsSync(live) ? JSON.parse(readFileSync(live, 'utf8')).jobs.length : null, built: new Date().toISOString() }
const page = readFileSync(join(ROOT, 'tools', 'voice', 'compare.html'), 'utf8').replace('/*DATA*/null', JSON.stringify(data))
writeFileSync(join(out, 'index.html'), page)
console.log(`vo-src/compare/index.html: ${engineRows.length} lines × ${runs.length} engines, ${codecRows.length} lines × ${codecs.length} encodings`)
if (!a['no-open']) spawn(process.platform === 'win32' ? 'explorer' : 'xdg-open', [join(out, 'index.html')], { detached: true, stdio: 'ignore' }).unref()
