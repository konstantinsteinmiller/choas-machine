#!/usr/bin/env node
/**
 * ─── art:prompts: the prompt documents, the index, the references ────────────
 *
 *   pnpm art:prompts                write art-sheets/PROMPTS-*.md and
 *                                   art-sheets/sheet-index.json
 *   pnpm art:prompts --references   also shoot each reference PNG from the
 *                                   game's own procedural drawing
 *   pnpm art:prompts --check        CI: are the written documents current?
 *
 * The manifest (`src/game/art/artSheet.ts`) owns the text; this writes it out,
 * so the prompt pasted by hand and the prompt the Art Desk sends are one
 * string. A reference is the game's own drawing of the thing, never a shipped
 * painting of it: the game is asked for it with its drop-ins switched off.
 *
 * Run through the ts hook:
 *   node --import ./tools/ts-resolve.mjs tools/art-prompts.mjs
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHEETS = join(ROOT, 'art-sheets')
const TITLE = 'Chaos Machine'
const { values: opt } = parseArgs({ options: { references: { type: 'boolean', default: false }, check: { type: 'boolean', default: false } } })
const { ART_SHEETS, promptDocs, referenceFile, sheetIndex } = await import(pathToFileURL(join(ROOT, 'src', 'game', 'art', 'artSheet.ts')).href)
const rel = f => relative(ROOT, f).split('\\').join('/')

const outputs = { ...promptDocs(), 'sheet-index.json': `${JSON.stringify(sheetIndex(), null, 2)}\n` }

if (opt.check) {
  // `art-sheets/` is not committed: only a file that exists and differs fails.
  const stale = Object.entries(outputs).filter(([name, text]) => existsSync(join(SHEETS, name)) && readFileSync(join(SHEETS, name), 'utf-8') !== text)
  for (const [name] of stale) console.error(`  ! ${rel(join(SHEETS, name))} is out of date: run pnpm art:prompts`)
  if (!stale.length) console.log('  = the prompt documents are current')
  process.exit(stale.length ? 1 : 0)
}

mkdirSync(SHEETS, { recursive: true })
for (const [name, text] of Object.entries(outputs)) {
  const file = join(SHEETS, name)
  if (existsSync(file) && readFileSync(file, 'utf-8') === text) { console.log(`  = ${rel(file)}`); continue }
  // Written beside and renamed over: the desk never reads half a file.
  writeFileSync(`${file}.tmp`, text, 'utf-8')
  renameSync(`${file}.tmp`, file)
  console.log(`  ✓ ${rel(file)}`)
}

if (opt.references) {
  const { createRequire } = await import('node:module')
  const require = createRequire(join(ROOT, 'package.json'))
  const { chromium } = require('playwright-core')
  const sharp = require('sharp')
  const { createServer } = await import('vite')
  process.env.VITE_CACHE_DIR = 'node_modules/.vite-promotion'
  process.env.VITE_LEADERBOARD_URL = ''
  const server = await createServer({
    root: ROOT,
    server: { port: 0, strictPort: false, host: '127.0.0.1', open: false, hmr: false, watch: null },
    logLevel: 'warn'
  })
  await server.listen()
  const base = `http://127.0.0.1:${server.httpServer.address().port}/`
  let browser = null
  try {
    const html = await (await fetch(base)).text()
    if (!html.includes(`<title>${TITLE}`)) throw new Error(`the server on ${base} is not ${TITLE}`)
    const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => existsSync(p))
    browser = await chromium.launch({ ...(chrome ? { executablePath: chrome } : { channel: 'chrome' }), headless: true, args: ['--mute-audio'] })
    const page = await browser.newPage()
    // No pointer lock in a headless page: it would take the real mouse.
    await page.addInitScript(() => { Element.prototype.requestPointerLock = () => Promise.resolve() })
    await page.goto(`${base}?preview=1`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!window.__preview, null, { timeout: 120_000 })
    for (const s of ART_SHEETS) {
      const name = s.stem.replace(/^texture-/, '')
      const url = await page.evaluate(n => window.__preview.textureReference(n), name)
      if (!url) { console.log(`  ! ${s.stem}: the game has no procedural drawing called "${name}"`); continue }
      const png = await sharp(Buffer.from(url.split(',')[1], 'base64')).resize(s.size, s.size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer()
      const file = join(SHEETS, referenceFile(s))
      // A reference that rebuilds byte-identically keeps its file: its hash is
      // what tells a painting it has gone stale.
      if (existsSync(file) && readFileSync(file).equals(png)) { console.log(`  = ${rel(file)}`); continue }
      writeFileSync(file, png)
      console.log(`  ✓ ${rel(file)}  ${s.size}x${s.size}`)
    }
  } finally {
    await browser?.close().catch(() => {})
    await server.close()
  }
}
