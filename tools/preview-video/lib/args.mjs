// ─── CLI arguments ──────────────────────────────────────────────────────────
//
// Three layers, each overriding the one below: built-in defaults, the game's
// `preview.config.mjs`, then the command line. A game that never passes a flag
// gets exactly what its config says; a one-off "give me a 15-second 1080p cut"
// needs no config edit.
//
// A config declares one or more FORMATS — a deliverable shape: a duration, an
// fps, the orientations and their sizes, and which scenario module plays each
// scenario at that length. A run records every scenario in every orientation
// of every selected format, so "a 10 s preview pair and a 30 s trailer pair,
// each in portrait and landscape" is one command. A config with no `formats`
// is one unnamed format built from its top-level `orientations`/`durationMs`,
// and its files are named exactly as they were before formats existed.
//
// The per-orientation size flags (`--portrait 720x1280`) are DERIVED from the
// orientation keys the formats declare rather than hardcoded, so a game that
// adds a `square` orientation gets `--square 1080x1080` for free.

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** @typedef {import('./types.js').PreviewConfig} PreviewConfig */
/** @typedef {import('./types.js').ResolvedOptions} ResolvedOptions */
/** @typedef {import('./types.js').Variant} Variant */
/** @typedef {import('./types.js').Format} Format */

/** `tools/preview-video/lib/args.mjs` → the repo root, three levels up. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const DEFAULTS = {
  fps: 30,
  durationMs: 10_000,
  quality: 'lossless',
  capture: 'virtual',
  outDir: 'preview-videos',
  port: 2063,
  dpr: 2,
  seed: 7
}

export const QUALITIES = ['lossless-rgb', 'lossless', 'high', 'balanced']
const CAPTURES = ['virtual', 'realtime']

/** Flags that take no value. */
const BOOLEAN_FLAGS = new Set([
  'headed', 'keep-frames', 'no-poster', 'only-setup', 'help', 'h', 'no-serve', 'clean', 'no-clean'
])

/** Flags that may be passed more than once and collect into an array. */
const REPEATABLE_FLAGS = new Set(['url-param'])

export function printHelp() {
  console.log(`
  Gameplay preview video pipeline — records scripted gameplay to mp4.

    node tools/preview-video/record.mjs [options]

  What to shoot
    --formats <a,b>          deliverable formats to record        (all in config)
    --scenarios <a,b>        scenarios to run                 (config.scenarios)
    --orientations <a,b>     orientations to shoot, within each format    (all)

  Overrides — each applies to EVERY selected format
    --<orientation> <WxH>    output pixels for one orientation, e.g.
                             --portrait 720x1280  --landscape 1920x1080
    --dpr <n>                device pixel ratio; css size = pixels / dpr
    --duration <seconds>     clip length
    --fps <n>
    --quality <q[,q]>        lossless-rgb | lossless | high | balanced. Several
                             = several files from ONE capture, one folder each

  How it looks
    --clean / --no-clean     pure gameplay: no DOM interface, no canvas text,
                             and the game's own clean flag     (config.clean)
    --seed <n>               seed for the page's Math.random; 'off' lets the
                             game run unseeded and the clip stops being
                             reproducible                                  (7)
    --url-param <k=v>        query parameter for the recording URL, merged over
                             everything else; repeatable

  How it runs
    --capture <mode>         virtual | realtime                     (virtual)
    --out <dir>              output directory, relative to the repo root
                                                            (preview-videos)
    --url <url>              record an already-running server instead of
                             starting one
    --port <n>               port for the server we start               (2063)
    --no-serve               never start a server; requires --url
    --headed                 show the browser while recording
    --keep-frames            also write the PNG frames next to the mp4
    --no-poster              skip the poster PNG
    --only-setup             run setup, screenshot, exit — for authoring
                             scenarios without waiting for an encode
    --help

  Quality ladder (measured, not assumed):
    lossless-rgb  bit-exact (libx264rgb). Archival master; almost nothing
                  plays it.
    lossless      High 4:4:4, qp 0. Visually perfect, but the RGB->YUV
                  conversion still rounds by up to 2/255, and Safari and
                  QuickTime refuse 4:4:4.
    high          crf 14, yuv420p, High profile. Visually lossless, plays
                  everywhere — this is what a portal upload wants.
    balanced      crf 20, yuv420p. For a quick look.
`)
}

/**
 * @param {string[]} argv  `process.argv.slice(2)`
 * @returns {Record<string, string|boolean|string[]>}
 */
function tokenize(argv) {
  /** @type {Record<string, string|boolean|string[]>} */
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (!tok.startsWith('--') && !(tok === '-h')) {
      throw new Error(`Unexpected argument "${tok}" — every option starts with --. Try --help.`)
    }
    const name = tok.replace(/^--?/, '')
    if (BOOLEAN_FLAGS.has(name)) { out[name] = true; continue }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Option --${name} needs a value. Try --help.`)
    }
    if (REPEATABLE_FLAGS.has(name)) /** @type {string[]} */ ((out[name] ??= [])).push(value)
    else out[name] = value
    i++
  }
  return out
}

/** `720x1280` → `{ width: 720, height: 1280 }`. */
function parseSize(text, flag) {
  const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(String(text).trim())
  if (!m) throw new Error(`--${flag} expects WIDTHxHEIGHT, e.g. 720x1280 (got "${text}")`)
  return { width: Number(m[1]), height: Number(m[2]) }
}

const num = (raw, flag) => {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${flag} expects a positive number (got "${raw}")`)
  return n
}

const list = (raw) => (Array.isArray(raw) ? raw : String(raw).split(',')).map((s) => String(s).trim()).filter(Boolean)

const qualityList = (raw, where) => {
  const qs = list(raw)
  if (qs.length === 0) throw new Error(`${where}: no quality given`)
  for (const q of qs) {
    if (!QUALITIES.includes(q)) throw new Error(`${where}: quality must be one of ${QUALITIES.join(' | ')} (got "${q}")`)
  }
  return [...new Set(qs)]
}

/**
 * The formats a config declares, in declaration order. A config without
 * `formats` is one unnamed format (`id: null`) built from its top level.
 *
 * @param {PreviewConfig} config
 * @returns {Format[]}
 */
export function resolveFormats(config) {
  const declared = Object.entries(config.formats ?? {})
  if (declared.length) {
    return declared.map(([id, f]) => {
      const orientations = f.orientations ?? config.orientations
      if (!orientations || Object.keys(orientations).length === 0) {
        throw new Error(`format "${id}" declares no orientations, and neither does the config.`)
      }
      return { ...f, id, orientations }
    })
  }
  if (!config.orientations || Object.keys(config.orientations).length === 0) {
    throw new Error('preview.config.mjs declares neither `formats` nor `orientations`.')
  }
  return [{ id: null, orientations: config.orientations }]
}

/** Every orientation id any format declares. */
export const allOrientationKeys = (formats) => [...new Set(formats.flatMap((f) => Object.keys(f.orientations)))]

/**
 * `success-30s-portrait-1080x1920` — or, for the unnamed format of a config
 * without `formats`, `success-portrait-720x1280` as it always was.
 */
export const stemFor = (v) =>
  [v.scenarioId, v.formatId, v.orientationId, `${v.width}x${v.height}`].filter(Boolean).join('-')

/**
 * @param {string[]} argv
 * @param {PreviewConfig} config
 * @returns {ResolvedOptions}
 */
export function parseArgs(argv, config) {
  const flags = tokenize(argv)
  const formats = resolveFormats(config)
  const orientationKeys = allOrientationKeys(formats)

  const known = new Set([
    'formats', 'scenarios', 'orientations', 'dpr', 'duration', 'fps', 'quality', 'capture', 'seed',
    'out', 'url', 'port', ...BOOLEAN_FLAGS, ...REPEATABLE_FLAGS, ...orientationKeys
  ])
  for (const name of Object.keys(flags)) {
    if (!known.has(name)) {
      throw new Error(`Unknown option --${name}. Known: ${[...known].sort().join(', ')}`)
    }
  }

  const capture = String(flags.capture ?? config.capture ?? DEFAULTS.capture)
  if (!CAPTURES.includes(capture)) {
    throw new Error(`--capture must be one of ${CAPTURES.join(' | ')} (got "${capture}")`)
  }

  // ── which formats ──
  // A format marked `explicit` (the trailer's raw shots) is recorded only when named.
  let selected = formats.filter((f) => !f.explicit)
  if (flags.formats !== undefined) {
    const want = list(flags.formats)
    const ids = formats.map((f) => f.id)
    for (const id of want) {
      if (!ids.includes(id)) throw new Error(`Unknown format "${id}". preview.config.mjs declares: ${ids.filter(Boolean).join(', ') || '(none — no `formats`)'}`)
    }
    selected = formats.filter((f) => want.includes(f.id))
  }

  const scenarioIds = flags.scenarios !== undefined ? list(flags.scenarios) : (config.scenarios ?? [])
  if (scenarioIds.length === 0) throw new Error('No scenarios: pass --scenarios or set `scenarios` in preview.config.mjs.')

  const orientationFilter = flags.orientations !== undefined ? list(flags.orientations) : null
  if (orientationFilter) {
    const offered = allOrientationKeys(selected)
    for (const id of orientationFilter) {
      if (!offered.includes(id)) {
        throw new Error(`Unknown orientation "${id}". The selected format(s) declare: ${offered.join(', ')}`)
      }
    }
  }

  // ── overrides that apply to every selected format ──
  const cliFps = flags.fps !== undefined ? num(flags.fps, 'fps') : undefined
  const cliDurationMs = flags.duration !== undefined ? num(flags.duration, 'duration') * 1000 : undefined
  const cliQualities = flags.quality !== undefined ? qualityList(flags.quality, '--quality') : undefined
  const cliDpr = flags.dpr !== undefined ? num(flags.dpr, 'dpr') : undefined

  /** @type {Variant[]} */
  const variants = []
  const warnings = []
  for (const format of selected) {
    const fps = cliFps ?? format.fps ?? config.fps ?? DEFAULTS.fps
    const durationMs = cliDurationMs ?? format.durationMs ?? config.durationMs ?? DEFAULTS.durationMs
    const qualities = cliQualities
      ?? qualityList(format.quality ?? config.quality ?? DEFAULTS.quality, `format "${format.id ?? 'default'}"`)
    const orientationIds = Object.keys(format.orientations).filter((id) => !orientationFilter || orientationFilter.includes(id))

    for (const scenarioId of scenarioIds) {
      for (const orientationId of orientationIds) {
        const base = format.orientations[orientationId]
        const size = flags[orientationId] !== undefined
          ? parseSize(flags[orientationId], orientationId)
          : { width: base.width, height: base.height }
        const dpr = cliDpr ?? base.dpr ?? DEFAULTS.dpr

        // libx264 refuses odd dimensions under 4:2:0 and the 4:4:4 path is not
        // worth the risk either — a preview clip is always an even size in
        // practice, so round down and say so rather than failing inside ffmpeg.
        let { width, height } = size
        if (width % 2 || height % 2) {
          warnings.push(`${orientationId} ${width}x${height} has an odd dimension — H.264 needs even; using ${width - (width % 2)}x${height - (height % 2)}`)
          width -= width % 2
          height -= height % 2
        }

        /** @type {Variant} */
        const variant = {
          scenarioId,
          scenarioModule: format.scenarios?.[scenarioId] ?? scenarioId,
          formatId: format.id,
          orientationId,
          width,
          height,
          dpr,
          cssWidth: Math.round(width / dpr),
          cssHeight: Math.round(height / dpr),
          isMobile: base.isMobile ?? (height > width),
          hasTouch: base.hasTouch ?? (height > width),
          fps,
          durationMs,
          qualities,
          urlParams: format.urlParams ?? {},
          stem: ''
        }
        variant.stem = stemFor(variant)
        variants.push(variant)
      }
    }
  }
  if (variants.length === 0) throw new Error('Nothing to record: the selected formats have none of the selected orientations.')

  const url = flags.url !== undefined ? String(flags.url) : null
  const noServe = flags['no-serve'] === true
  if (noServe && !url) throw new Error('--no-serve needs --url: there would be nothing to record.')
  if (flags.clean === true && flags['no-clean'] === true) throw new Error('--clean and --no-clean together: pick one.')

  const port = flags.port !== undefined
    ? num(flags.port, 'port')
    : (config.server?.port ?? DEFAULTS.port)

  // `--url-param tier=high` merges over every other source of URL params, so
  // pinning a debug flag for one run never needs a config edit.
  /** @type {Record<string, string>} */
  const urlParams = {}
  for (const pair of /** @type {string[]} */ (flags['url-param'] ?? [])) {
    const at = String(pair).indexOf('=')
    if (at < 1) throw new Error(`--url-param expects key=value (got "${pair}")`)
    urlParams[pair.slice(0, at)] = pair.slice(at + 1)
  }

  const clean = flags['no-clean'] === true ? false : flags.clean === true ? true : (config.clean?.enabled ?? false)

  return {
    urlParams,
    repoRoot: REPO_ROOT,
    url,
    port,
    serve: !url && !noServe,
    capture: /** @type {'virtual'|'realtime'} */ (capture),
    clean,
    outDir: resolve(REPO_ROOT, String(flags.out ?? config.outDir ?? DEFAULTS.outDir)),
    keepFrames: flags['keep-frames'] === true,
    headed: flags.headed === true,
    poster: flags['no-poster'] !== true,
    seed: flags.seed === 'off' ? null : (flags.seed !== undefined ? num(flags.seed, 'seed') : (config.seedRandom ?? DEFAULTS.seed)),
    onlySetup: flags['only-setup'] === true,
    formats: selected,
    orientationKeys,
    variants,
    warnings
  }
}

export const wantsHelp = (argv) => argv.includes('--help') || argv.includes('-h')
