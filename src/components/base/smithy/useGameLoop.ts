import { onMounted, onUnmounted } from 'vue'

/**
 * A frame loop for one of the smithy's games: `tick(dt)` every frame while
 * the component is mounted, with `dt` in seconds and clamped (a tab that was
 * hidden comes back to a step of at most 0.1 s, not to a game that ended
 * while nobody watched). Space and Enter press and release `onKey`; the
 * game's own surface handles the pointer.
 */
export const useGameLoop = (tick: (dt: number) => void, onKey?: (down: boolean) => void): void => {
  let raf = 0
  let last = 0
  const frame = (now: number): void => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    tick(dt)
    raf = requestAnimationFrame(frame)
  }
  const key = (down: boolean) => (e: KeyboardEvent): void => {
    if (e.code !== 'Space' && e.code !== 'Enter') return
    if (e.repeat) { e.preventDefault(); return }
    e.preventDefault()
    onKey?.(down)
  }
  const keyDown = key(true)
  const keyUp = key(false)
  onMounted(() => {
    raf = requestAnimationFrame(frame)
    if (onKey) {
      window.addEventListener('keydown', keyDown)
      window.addEventListener('keyup', keyUp)
    }
  })
  onUnmounted(() => {
    cancelAnimationFrame(raf)
    window.removeEventListener('keydown', keyDown)
    window.removeEventListener('keyup', keyUp)
  })
}
