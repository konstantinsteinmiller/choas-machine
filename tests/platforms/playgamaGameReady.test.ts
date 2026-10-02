// ─── Playgama's game_ready waits for the first INTERACTIVE frame ────────────
//
// On the Playgama archive, `game_ready` is also YouTube Playables'
// `gameReady()` (Bridge forwards it), and Playables grades the moment: only
// "when the game is ready for interaction", and it "MUST NOT" arrive while a
// non-interactable element is on screen. It used to fire 150 ms after the
// loader finished — with the loader still fading over the game and still
// taking the pointer, the backdrop not yet gone, and a mission still in its
// scripted beam-in. Measured in the built archive: the `.loader` element was
// in the DOM at the moment `gameReady()` reached the SDK.
//
// Pinned: the signal waits for the backdrop (the last loading layer) to finish
// leaving, then for the scene to take input — the base, or a mission in `play` —
// and is never withheld past a cap. Every other portal keeps its timing.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hud } from '@/game/state/hud'
import { INTERACTIVE_CAP_MS, whenInteractive } from '@/use/whenInteractive'

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

describe('whenInteractive', () => {
  beforeEach(() => { hud.phase = 'boot' })
  afterEach(() => { vi.useRealTimers(); hud.phase = 'boot' })

  it('holds through the boot and a mission\'s scripted beam-in, fires at "play" — once', async () => {
    const fn = vi.fn()
    whenInteractive(fn)
    hud.phase = 'intro'
    await tick()
    expect(fn).not.toHaveBeenCalled()
    hud.phase = 'play'
    await tick()
    expect(fn).toHaveBeenCalledTimes(1)
    hud.phase = 'dead'
    await tick()
    hud.phase = 'play'
    await tick()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('fires at once in the base', () => {
    hud.phase = 'base'
    const fn = vi.fn()
    whenInteractive(fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('is never withheld: a scene that never reports gets it at the cap', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    whenInteractive(fn)
    vi.advanceTimersByTime(INTERACTIVE_CAP_MS - 1)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('FLogoProgress wires it for Playgama only', () => {
  const src = readFileSync(resolve(__dirname, '../../src/components/atoms/FLogoProgress.vue'), 'utf8')

  it('fires Playgama\'s signal after the backdrop has LEFT, once the scene takes input', () => {
    expect(src).toMatch(/Transition\(name="splash-fade" @after-leave="onBackdropGone"\)/)
    const at = src.indexOf('const onBackdropGone')
    expect(at).toBeGreaterThan(-1)
    const body = src.slice(at, src.indexOf('\n}', at))
    expect(body).toMatch(/if \(import\.meta\.env\.VITE_APP_PLAYGAMA !== 'true'\) return/)
    expect(body).toMatch(/whenInteractive\(signalGameReadyToPlaygama\)/)
  })

  it('no longer fires it with the other portals, while the loader is still fading', () => {
    const at = src.indexOf('watch(done,')
    const block = src.slice(at, src.indexOf('\n})', at))
    expect(block).not.toMatch(/signalGameReadyToPlaygama/)
    // …and the other portals' signals are exactly where they were.
    for (const s of ['signalGameReadyToCG()', 'signalGameReadyToGamepix()', 'signalGameReadyToYandex()', 'signalGameReadyToPoki()']) {
      expect(block).toContain(s)
    }
  })
})
