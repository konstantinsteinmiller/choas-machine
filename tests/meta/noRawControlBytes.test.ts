// No raw control characters in source — the single-file builds depend on it.
//
// `vite-plugin-singlefile` inlines the whole bundle into a `<script>` inside
// index.html, and HTML tokenisation replaces a literal U+0000 with U+FFFD
// (WHATWG 13.2.5, "Preprocessing the input stream"). Any code that carried a
// literal NUL therefore arrives at the JS parser mangled.
//
// That is not a cosmetic difference. A name-cleaning helper once had its
// control-character class written with LITERAL characters rather than `\u`
// escapes, so in the GamePix build the class became
// `[\ufffd-\u001f...]` -- a range out of order, which throws at regex PARSE time, which means the entire
// bundle fails to evaluate. The game sat on the splash at 0% and nothing in
// the build output hinted at it. The dev server and every multi-file build
// keep the byte intact and are completely unaffected, which is exactly why it
// shipped.
//
// So: assert on the SOURCE, since that is where the fix has to live. A future
// edit that pastes a literal control character back in fails here rather than
// in a portal's QA queue.

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'

const SRC = resolve(__dirname, '../../src')
const CODE = new Set(['.ts', '.vue', '.js', '.mjs', '.json'])

/** Every byte a JS/HTML round trip must never have to carry literally.
 *  Tab (0x09), LF (0x0a) and CR (0x0d) are ordinary whitespace and allowed. */
const isForbidden = (b: number): boolean =>
  b < 0x09 || (b > 0x0d && b < 0x20) || b === 0x7f

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      // `assets/` is images, audio and fonts — binary by definition.
      if (entry === 'assets') continue
      walk(p, out)
    } else if (CODE.has(extname(p))) {
      out.push(p)
    }
  }
  return out
}

describe('source files carry no raw control characters', () => {
  it('every code file under src/ is free of them', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const buf = readFileSync(file)
      const at = buf.findIndex(isForbidden)
      if (at >= 0) {
        offenders.push(
          `${file.slice(SRC.length + 1)} byte ${at} = 0x${buf[at]!.toString(16).padStart(2, '0')}`
        )
      }
    }
    expect(offenders, 'write these as \\uXXXX escapes instead').toEqual([])
  })
})
