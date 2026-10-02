// The gameplay event bus (`game/bus.ts`): the simulation says what happened,
// listeners subscribe, and neither side imports the other.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearBus, emit, on, once } from '@/game/bus'
import { hud, setPhase } from '@/game/state/hud'

afterEach(() => {
  clearBus()
  hud.phase = 'boot'
  vi.restoreAllMocks()
})

describe('the event bus', () => {
  it('delivers a payload to every listener, in subscription order', () => {
    const seen: string[] = []
    on('timeScale', ({ scale }) => seen.push(`a${scale}`))
    on('timeScale', ({ scale }) => seen.push(`b${scale}`))
    emit('timeScale', { scale: 0.1 })
    expect(seen).toEqual(['a0.1', 'b0.1'])
  })

  it('stops delivering once a listener unsubscribes', () => {
    const fn = vi.fn()
    const off = on('timeScale', fn)
    emit('timeScale', { scale: 1 })
    off()
    emit('timeScale', { scale: 2 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('once fires a single time', () => {
    const fn = vi.fn()
    once('timeScale', fn)
    emit('timeScale', { scale: 1 })
    emit('timeScale', { scale: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('lets a listener unsubscribe another during an emit without skipping anyone', () => {
    const seen: string[] = []
    let offB = (): void => {}
    on('timeScale', () => { seen.push('a'); offB() })
    offB = on('timeScale', () => seen.push('b'))
    on('timeScale', () => seen.push('c'))
    emit('timeScale', { scale: 1 })
    // The emit in flight still reaches b; the next one does not.
    expect(seen).toEqual(['a', 'b', 'c'])
    emit('timeScale', { scale: 1 })
    expect(seen).toEqual(['a', 'b', 'c', 'a', 'c'])
  })

  it('a listener that throws does not stop the others', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fn = vi.fn()
    on('timeScale', () => { throw new Error('broken subscriber') })
    on('timeScale', fn)
    emit('timeScale', { scale: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(err).toHaveBeenCalledTimes(1)
  })

  it('an emit with nobody listening is a no-op', () => {
    expect(() => emit('timeScale', { scale: 1 })).not.toThrow()
  })
})

describe('the phase is announced on the bus', () => {
  it('reports the new and the previous phase, once per change', () => {
    const fn = vi.fn()
    on('phase', fn)
    setPhase('intro')
    setPhase('intro')
    setPhase('play')
    expect(fn.mock.calls.map(c => c[0])).toEqual([
      { phase: 'intro', prev: 'boot' },
      { phase: 'play', prev: 'intro' }
    ])
    expect(hud.phase).toBe('play')
  })
})
