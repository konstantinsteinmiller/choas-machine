// The obfuscator's stringArray rewrite mangles a dynamic import's specifier,
// and the built bundle then asks for a module path that does not exist (a 404
// and a hung boot: PERF-LEDGER.md entry 5). Its pick is random, so a build can
// pass by luck. Every source file with a live `import('…')` must be excluded.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const config = readFileSync('vite.config.ts', 'utf8').replace(/\r\n/g, '\n')
const start = config.indexOf('exclude: [')
const end = config.indexOf('\n        ],', start)
const excludes = config.slice(start, end).split('\n')
  .map(l => /^\s*\/(.+)\/([a-z]*),?\s*$/.exec(l))
  .filter((m): m is RegExpExecArray => !!m)
  .map(m => new RegExp(m[1]!, m[2]))

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? files(p) : /\.(ts|vue)$/.test(f) ? [p] : []
})

/** Files with an `import('…')` that runs in a build: not in a comment, not behind `import.meta.env.DEV`. */
const lazyImporters = (): string[] => files('src').filter((f) => {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/)
  return lines.some((l, i) => {
    if (!/import\(\s*['"]/.test(l)) return false
    const t = l.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false
    const near = lines.slice(Math.max(0, i - 2), i + 1).join('\n')
    return !near.includes('import.meta.env.DEV')
  })
})

const posix = (p: string): string => p.split('\\').join('/')

describe('the obfuscator leaves every dynamic import readable', () => {
  it('parses the exclude list', () => {
    expect(excludes.length).toBeGreaterThan(10)
    expect(excludes[0]!.test('/node_modules/x')).toBe(true)
  })

  it('excludes every file that imports lazily', () => {
    const found = lazyImporters()
    expect(found.length).toBeGreaterThan(5)
    const missing = found.filter(f => !excludes.some(r => r.test(f) || r.test(posix(f))))
    expect(missing).toEqual([])
  })
})
