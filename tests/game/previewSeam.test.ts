import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `game/preview.ts` is the handle the video recorder and the cover-art tool
 * drive the game through. It can move the mech, pin defenders and replace the
 * camera, so it must never reach a player: it is loaded by ONE dynamic import
 * inside a DEV branch, which a production build drops together with the
 * module.
 */
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|vue)$/.test(f) ? [p] : []
})

describe('the preview seam', () => {
  it('is imported only dynamically, behind import.meta.env.DEV', () => {
    const users = walk('src').filter(f => !f.endsWith(join('game', 'preview.ts')) && /game\/preview['"]/.test(readFileSync(f, 'utf-8')))
    expect(users.map(f => f.replace(/[\\/]+/g, '/'))).toEqual(['src/views/GameScene.vue'])
    const src = readFileSync(users[0]!, 'utf-8')
    expect(src).not.toMatch(/^import .*game\/preview/m)
    expect(src).toMatch(/if \(import\.meta\.env\.DEV\) void import\('@\/game\/preview'\)/)
  })

  it('checks for a dev server and the URL flag before it publishes anything', () => {
    const src = readFileSync('src/game/preview.ts', 'utf-8')
    const install = src.slice(src.indexOf('export const installPreview'))
    expect(install).toMatch(/if \(!import\.meta\.env\.DEV\) return/)
    expect(install).toMatch(/get\('preview'\) !== '1'\) return/)
  })
})
