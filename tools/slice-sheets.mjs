#!/usr/bin/env node
/**
 * ─── slice-sheets: a painted return becomes the file the game picks up ───────
 *
 *   pnpm slice-sheets                         every painting in art-sheets/painted/
 *   pnpm slice-sheets art-sheets/painted/texture-floor.jpg     just this one
 *
 * The drop-ins this game takes are surface detail maps (`src/game/art/
 * artSheet.ts`), so the cut is short: check the shape, square it, take the
 * colour out, resize, write WebP. What it keeps from the pipeline is the part
 * that matters:
 *
 * · A FAILURE IS LOUD. A painting that is not square, is too small, or is
 *   named for nothing in the manifest is refused with the reason and a
 *   non-zero exit. Nothing is guessed.
 * · A PAINTING IS A SNAPSHOT OF A DRAWING. The receipt
 *   (`art-sheets/painted/.sliced.json`) records the reference revision each
 *   painting was cut against and the painting's own hash. If the reference
 *   was redrawn since, the painting is parked in `painted/stale/` and the
 *   file cut from it is removed, so the game draws the new procedural map
 *   instead of a painting of the old one.
 *
 * Afterwards: `pnpm compress-folder public/images` (the Art Desk does both).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHEETS = join(ROOT, 'art-sheets')
const PAINTED = join(SHEETS, 'painted')
const INDEX = join(SHEETS, 'sheet-index.json')
const RECEIPT = join(PAINTED, '.sliced.json')
const PUBLIC = join(ROOT, 'public')
/** How far from square a return may be before it is refused. */
const SQUARE_TOLERANCE = 0.03
const MIN_SIDE = 256

const rel = f => relative(ROOT, f).split('\\').join('/')
const rev = buf => createHash('sha1').update(buf).digest('hex').slice(0, 12)
const stemOf = f => basename(f).replace(/\.[^.]+$/, '').toLowerCase()

if (!existsSync(INDEX)) {
  console.error(`no ${rel(INDEX)}: run pnpm art:prompts first`)
  process.exit(1)
}
const index = JSON.parse(readFileSync(INDEX, 'utf-8'))
const sheets = new Map(index.sheets.map(s => [stemOf(s.files.clean), s]))
const receipt = (() => { try { return JSON.parse(readFileSync(RECEIPT, 'utf-8')) } catch { return { files: {} } } })()
receipt.files ??= {}

const arg = process.argv[2]
const paintings = arg
  ? [resolve(ROOT, arg)]
  : (existsSync(PAINTED) ? readdirSync(PAINTED).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).map(f => join(PAINTED, f)) : [])
if (!paintings.length) {
  console.log(`nothing to slice: ${rel(PAINTED)} holds no painting`)
  process.exit(0)
}

let failed = 0
let wrote = 0
for (const file of paintings) {
  const name = basename(file)
  if (!existsSync(file)) { console.error(`  ! ${name}: no such file`); failed++; continue }
  const sheet = sheets.get(stemOf(file))
  if (!sheet) {
    console.error(`  ! ${name}: nothing in the manifest is called "${stemOf(file)}". Known: ${[...sheets.keys()].join(', ')}`)
    failed++
    continue
  }
  const reference = join(SHEETS, sheet.files.clean)
  const refRev = existsSync(reference) ? rev(readFileSync(reference)) : null
  const bytes = readFileSync(file)
  const own = rev(bytes)
  const line = receipt.files[name]
  // The same name with different bytes is a new painting: judged on its own.
  const known = line?.painting === own ? line : null
  if (known?.rev && refRev && known.rev !== refRev) {
    // Painted from a drawing that has since changed.
    const to = join(PAINTED, 'stale', name)
    mkdirSync(dirname(to), { recursive: true })
    renameSync(file, to)
    for (const c of sheet.cells) rmSync(join(PUBLIC, c.target), { force: true })
    delete receipt.files[name]
    console.error(`  ! ${name}: its reference was redrawn (${known.rev} → ${refRev}). Parked in ${rel(dirname(to))}/, and ${sheet.cells.map(c => c.target).join(', ')} removed: the game draws the new map until this is repainted.`)
    failed++
    continue
  }
  const meta = await sharp(bytes).metadata()
  const ratio = meta.width / meta.height
  if (Math.abs(ratio - 1) > SQUARE_TOLERANCE) {
    console.error(`  ! ${name}: ${meta.width}x${meta.height} is ${ratio.toFixed(2)}:1, and a detail map is square. Re-roll it; cropping one would break its tiling.`)
    failed++
    continue
  }
  if (Math.min(meta.width, meta.height) < MIN_SIDE) {
    console.error(`  ! ${name}: ${meta.width}x${meta.height} is too small (at least ${MIN_SIDE} px a side)`)
    failed++
    continue
  }
  for (const c of sheet.cells) {
    const side = Math.min(meta.width, meta.height)
    const out = join(PUBLIC, c.target)
    mkdirSync(dirname(out), { recursive: true })
    const buf = await sharp(bytes)
      .extract({ left: Math.floor((meta.width - side) / 2), top: Math.floor((meta.height - side) / 2), width: side, height: side })
      // Greyscale: the fortress tints the map itself, per area.
      .greyscale()
      .resize(c.size, c.size, { kernel: 'lanczos3' })
      .webp({ quality: 92, effort: 6 })
      .toBuffer()
    writeFileSync(out, buf)
    const mean = (await sharp(buf).stats()).channels[0].mean / 255
    console.log(`  ✓ ${rel(out)}  ${c.size}x${c.size}, ${(buf.length / 1024).toFixed(0)} kB, mean value ${(mean * 100).toFixed(0)} %${mean < 0.55 ? '  (dark: the fortress will look muddy; the prompt asks for 65-95 %)' : ''}`)
    wrote++
  }
  receipt.files[name] = { rev: refRev, painting: own, at: new Date().toISOString() }
}
mkdirSync(PAINTED, { recursive: true })
writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, 'utf-8')
console.log(`\n${wrote} file(s) written${failed ? `, ${failed} refused` : ''}. The drop-in list is read at build time: restart the dev server (or rebuild) to see them.`)
process.exit(failed ? 1 : 0)
