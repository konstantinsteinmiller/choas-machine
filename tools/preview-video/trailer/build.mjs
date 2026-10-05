#!/usr/bin/env node
/**
 * ─── pnpm cinematic-trailer (#X1) ────────────────────────────────────────────
 *
 *   pnpm cinematic-trailer                 record every shot, cut, score, mix
 *   pnpm cinematic-trailer --draft         960x540 at 15 fps: minutes, for the edit
 *   pnpm cinematic-trailer --skip-record   re-cut from the shots already recorded
 *   pnpm cinematic-trailer --shots a,b     re-record only these shots, then cut
 *
 * Out: preview-videos/trailer/chaos-machine-cinematic-trailer.mp4 (H.264 High,
 * 4:2:0, AAC stereo), and `-draft` beside it for a draft.
 *
 *  1. record   every shot of `edit.mjs` is a scenario of the `trailer` format
 *              (`record.mjs`): its own page, staged in real time, recorded on
 *              the virtual clock with handles, its sounds logged.
 *  2. cards    the title cards and the call to action, typeset in the game's
 *              own face (Chakra Petch) as transparent 1080p plates.
 *  3. sound    the game's own audio graph on an OfflineAudioContext in a page
 *              on the dev server (`audio.ts`): the logged sounds at their
 *              frames, CM-07's lines, the score; one WAV.
 *  4. cut      ffmpeg: trim, flash cuts, concat, the cards over the picture,
 *              the end card, the WAV under it.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { EDIT } from './edit.mjs'
import config from '../preview.config.mjs'
import { createLogger } from '../lib/log.mjs'
import { launchBrowser } from '../lib/browser.mjs'
import { assertOwnServer, startServer } from '../lib/server.mjs'
import { resolveFfmpeg } from '../lib/encode.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..', '..')
const log = createLogger('trailer')

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const value = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
const DRAFT = flag('draft')
const W = DRAFT ? 960 : EDIT.width
const H = DRAFT ? 540 : EDIT.height
const FPS = DRAFT ? 15 : EDIT.fps
const OUT = join(ROOT, 'preview-videos', 'trailer')
const RAW = join(OUT, DRAFT ? 'raw-draft' : 'raw')
const WORK = join(OUT, 'work')
const SHOTS = join(OUT, 'shots')
const FINAL = join(OUT, `chaos-machine-cinematic-trailer${DRAFT ? '-draft' : ''}.mp4`)

const run = (cmd, args, opts = {}) => new Promise((ok, fail) => {
  const child = spawn(cmd, args, { stdio: opts.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', cwd: ROOT, ...opts })
  let err = ''
  child.stderr?.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-20000) })
  child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}\n${err.slice(-4000)}`))))
})

// ─── The timeline ────────────────────────────────────────────────────────────

const cuts = []
let at = 0
for (const c of EDIT.cuts) {
  cuts.push({ ...c, start: at })
  at += c.len
}
const endStart = at
const TOTAL = at + EDIT.end.len
const cutOf = (shot) => {
  const c = cuts.find(k => k.shot === shot)
  if (!c) throw new Error(`edit.mjs: no cut of shot "${shot}"`)
  return c
}
const when = (ref) => (ref === 'end' ? TOTAL : ref.cut === 'end' ? endStart + ref.at : cutOf(ref.cut).start + ref.at)
const rawOf = (shot) => join(RAW, `trailer-${shot}-trailer-landscape-${W}x${H}.mp4`)

// ─── 1. record ───────────────────────────────────────────────────────────────

const record = async () => {
  const wanted = value('shots') ? value('shots').split(',') : [...new Set(cuts.map(c => c.shot))]
  const todo = flag('skip-record') ? [] : wanted
  if (todo.length === 0) { log.info('recording skipped'); return }
  log.step(`recording ${todo.length} shot(s)`)
  const args = [join(HERE, '..', 'record.mjs'), '--formats', 'trailer', '--scenarios', todo.map(s => `trailer-${s}`).join(','),
    '--out', RAW.slice(ROOT.length + 1)]
  if (DRAFT) args.push('--landscape', `${W}x${H}`, '--dpr', '1', '--fps', String(FPS), '--quality', 'high')
  await run(process.execPath, args)
  for (const s of wanted) if (!existsSync(rawOf(s))) throw new Error(`shot ${s} was not recorded (${rawOf(s)})`)
}

// ─── 2. cards ────────────────────────────────────────────────────────────────

const FONT = (w) => pathToFileURL(join(ROOT, 'src', 'assets', 'css', 'font', `chakrapetch-${w}-latin.woff2`)).href

const cardHtml = (text, sub, tone, cta) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Chakra Petch'; font-weight: 700; src: url(${FONT(700)}) format('woff2'); }
@font-face { font-family: 'Chakra Petch'; font-weight: 500; src: url(${FONT(500)}) format('woff2'); }
html, body { margin: 0; width: ${W}px; height: ${H}px; background: transparent; overflow: hidden; }
.wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: ${cta ? 'flex-start' : 'center'}; padding-top: ${cta ? H * 0.06 : 0}px; }
.t { font: 700 ${(cta ? 0.06 : 0.115) * H}px/1 'Chakra Petch'; color: #fff; letter-spacing: 0.02em; text-transform: uppercase;
  transform: skewX(-8deg); -webkit-text-stroke: ${0.006 * H}px #10061f; paint-order: stroke fill;
  text-shadow: 0 0 ${0.03 * H}px ${tone === 'pink' ? '#ff4fb6' : '#4de8ff'}, ${0.006 * H}px ${0.008 * H}px 0 #10061f; }
.s { margin-top: ${0.02 * H}px; font: 500 ${0.04 * H}px/1 'Chakra Petch'; color: ${tone === 'pink' ? '#ffb3e0' : '#a8f5ff'}; letter-spacing: 0.3em; text-transform: uppercase; transform: skewX(-8deg); text-shadow: 0 0 ${0.015 * H}px #000; }
.cta { padding: ${0.012 * H}px ${0.04 * H}px; background: linear-gradient(180deg, #ff6fc4, #d6248c); clip-path: polygon(${0.02 * H}px 0, 100% 0, 100% calc(100% - ${0.02 * H}px), calc(100% - ${0.02 * H}px) 100%, 0 100%, 0 ${0.02 * H}px); }
</style></head><body><div class="wrap">${cta ? `<div class="cta"><div class="t" style="transform:none">${text}</div></div>` : `<div class="t">${text}</div>${sub ? `<div class="s">${sub}</div>` : ''}`}</div></body></html>`

const renderCards = async () => {
  mkdirSync(WORK, { recursive: true })
  const { browser, close } = await launchBrowser({ log })
  try {
    const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage()
    const plates = [...EDIT.cards.map((c, i) => ({ file: join(WORK, `card-${i}.png`), html: cardHtml(c.text, c.sub, c.tone, false) }))]
    if (EDIT.end.cta) plates.push({ file: join(WORK, 'cta.png'), html: cardHtml(EDIT.end.cta, '', 'pink', true) })
    for (const p of plates) {
      const html = p.file.replace(/\.png$/, '.html')
      writeFileSync(html, p.html)
      await page.goto(pathToFileURL(html).href)
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: p.file, omitBackground: true })
    }
    log.ok(`${plates.length} card(s)`)
  } finally { await close() }
}

// ─── 3. sound ────────────────────────────────────────────────────────────────

const voiceUrl = (line, whisper) => `/audio/voice/en/hero_${line}_${whisper ? 'whisper' : 'loud'}.ogg`

const soundPlan = () => {
  const sfx = []
  for (const c of cuts) {
    const file = join(SHOTS, `${c.shot}.sfx.json`)
    if (!existsSync(file)) { log.warn(`no sounds logged for ${c.shot}`); continue }
    for (const e of JSON.parse(readFileSync(file, 'utf8'))) {
      if (e.t < c.from || e.t >= c.from + c.len) continue
      sfx.push({ ...e, t: c.start + (e.t - c.from) })
    }
  }
  const voice = EDIT.voice.map(v => ({ t: when(v), url: voiceUrl(v.line, v.whisper), gain: v.gain ?? 1 }))
  const music = EDIT.music.map(m => ({ song: m.song, from: when(m.from), to: when(m.to), step: m.step, fadeIn: m.fadeIn, fadeOut: m.fadeOut, gain: m.gain }))
  return { seconds: TOTAL, sfx, voice, music }
}

const renderSound = async () => {
  const plan = soundPlan()
  log.info(`sound: ${plan.sfx.length} effects, ${plan.voice.length} lines, ${plan.music.length} music cues, ${TOTAL.toFixed(1)} s`)
  const port = (config.server.port ?? 2197) + 1
  const server = await startServer({ repoRoot: ROOT, port, mode: 'dev', command: config.server.command, args: config.server.args, env: config.server.env, log })
  const { browser, close } = await launchBrowser({ log })
  try {
    await assertOwnServer({ url: server.url, expectTitle: config.title, log })
    const page = await (await browser.newContext()).newPage()
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.warn(`page: ${m.text().slice(0, 200)}`) })
    // A page of the dev server (its modules resolve), without booting the game.
    await page.goto(`${server.url}/tools/preview-video/trailer/stage.html`)
    const chunks = await page.evaluate(async (p) => {
      const m = await import('/tools/preview-video/trailer/audio.ts')
      return m.renderTrailerAudio(p)
    }, plan)
    const buf = Buffer.concat(chunks.map(c => Buffer.from(c, 'base64')))
    writeFileSync(join(WORK, 'sound.wav'), buf)
    log.info(`sound.wav ${(buf.length / 1e6).toFixed(1)} MB`)
  } finally {
    await close()
    await server.stop()
  }
}

// ─── 4. cut ──────────────────────────────────────────────────────────────────

const cut = async () => {
  const ff = await resolveFfmpeg()
  const inputs = []
  const filters = []
  const seg = []
  cuts.forEach((c, i) => {
    inputs.push('-i', rawOf(c.shot))
    const flash = c.flash ? `,fade=t=in:st=0:d=${(4 / FPS).toFixed(3)}:color=white` : ''
    filters.push(`[${i}:v]trim=start=${c.from}:duration=${c.len},setpts=PTS-STARTPTS,fps=${FPS},scale=${W}:${H}:flags=lanczos,format=yuv420p${flash}[v${i}]`)
    seg.push(`[v${i}]`)
  })
  // The end card: the key art, a slow push in, out of a white flash.
  const e = cuts.length
  const frames = Math.round(EDIT.end.len * FPS)
  inputs.push('-loop', '1', '-t', String(EDIT.end.len), '-i', join(ROOT, EDIT.end.image))
  filters.push(`[${e}:v]scale=${W * 2}:${H * 2},zoompan=z='1+0.06*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},format=yuv420p,fade=t=in:st=0:d=${(6 / FPS).toFixed(3)}:color=white,fade=t=out:st=${(EDIT.end.len - 0.6).toFixed(2)}:d=0.6[vend]`)
  seg.push('[vend]')
  filters.push(`${seg.join('')}concat=n=${seg.length}:v=1:a=0[base]`)
  // The cards over the picture.
  let last = 'base'
  let n = e + 1
  const overlay = (file, a, b) => {
    inputs.push('-loop', '1', '-t', String(TOTAL), '-i', file)
    const fi = Math.min(0.12, (b - a) / 4)
    filters.push(`[${n}:v]format=rgba,fade=t=in:st=${a.toFixed(3)}:d=${fi.toFixed(3)}:alpha=1,fade=t=out:st=${(b - 0.18).toFixed(3)}:d=0.18:alpha=1[c${n}]`)
    filters.push(`[${last}][c${n}]overlay=0:0:enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'[o${n}]`)
    last = `o${n}`
    n++
  }
  EDIT.cards.forEach((c, i) => { const a = when(c); overlay(join(WORK, `card-${i}.png`), a, a + c.dur) })
  if (EDIT.end.cta) overlay(join(WORK, 'cta.png'), endStart + 0.8, TOTAL - 0.1)
  inputs.push('-i', join(WORK, 'sound.wav'))
  const audioIn = n
  writeFileSync(join(WORK, 'filter.txt'), filters.join(';\n'))
  await run(ff, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex_script', join(WORK, 'filter.txt'),
    '-map', `[${last}]`, '-map', `${audioIn}:a`,
    '-c:v', 'libx264', '-preset', DRAFT ? 'veryfast' : 'slow', '-crf', DRAFT ? '23' : '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    // The game mixes for play, quietly; a trailer sits at YouTube's loudness.
    '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', FINAL], { quiet: true })
  log.ok(`→ ${FINAL}`)
}

// ─── run ─────────────────────────────────────────────────────────────────────

const main = async () => {
  mkdirSync(WORK, { recursive: true })
  log.info(`${cuts.length} cuts + end card = ${TOTAL.toFixed(1)} s at ${W}x${H}, ${FPS} fps${DRAFT ? ' (draft)' : ''}`)
  await record()
  await renderCards()
  await renderSound()
  await cut()
}

main().catch((err) => { log.error(String(err?.stack ?? err)); process.exit(1) })
