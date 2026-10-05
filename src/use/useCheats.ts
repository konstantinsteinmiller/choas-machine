import { onMounted, onUnmounted, ref } from 'vue'
import { toggleDebug } from '@/use/useMatch'
import { safeGetBool } from '@/utils/safeStorage'

/**
 * Dev cheats.
 *
 * Enabled only when `localStorage.cheat` is truthy (set it in DevTools and
 * reload). The cheat MAP is filled by the game at runtime through
 * `registerCheat` rather than by importing game modules here — this file is
 * imported by the eager `App.vue`, and a static import of the mission sim
 * would hoist the whole 3D engine into the entry chunk.
 */
const isCheat = ref<boolean>(safeGetBool('cheat'))

type CheatFn = () => void
const cheats = new Map<string, { fn: CheatFn; label: string; always: boolean }>()

/**
 * Register a cheat under a shortcut like `ctrl+shift+alt+k`. Last one wins.
 * `always`: on the dev server it works without cheats switched on (the cheat
 * panel); a built bundle still wants them on.
 */
export const registerCheat = (shortcut: string, label: string, fn: CheatFn, opts: { always?: boolean } = {}): void => {
  cheats.set(shortcut.toLowerCase(), { fn, label, always: !!opts.always })
}

let debugUnlockInstalled = false
/** Typing "cmarc" anywhere flips debug mode (FPS meter, extra logs). */
export const installDebugUnlock = (): void => {
  if (typeof window === 'undefined' || debugUnlockInstalled) return
  debugUnlockInstalled = true
  const target = 'cmarc'
  let buf = ''
  const isTypingTarget = (el: EventTarget | null): boolean => {
    if (!(el instanceof HTMLElement)) return false
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    return el.isContentEditable
  }
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) { buf = ''; return }
    const k = e.key.toLowerCase()
    if (k.length !== 1) return
    buf = (buf + k).slice(-target.length)
    if (buf === target) {
      buf = ''
      toggleDebug()
    }
  })
}
installDebugUnlock()

let cheatUnlockInstalled = false
/** Typing "cmonc" anywhere switches the dev cheats on or off (`localStorage.cheat`), no reload needed (#116). */
export const installCheatUnlock = (): void => {
  if (typeof window === 'undefined' || cheatUnlockInstalled) return
  cheatUnlockInstalled = true
  const target = 'cmonc'
  let buf = ''
  window.addEventListener('keydown', (e) => {
    const el = e.target
    if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) { buf = ''; return }
    const k = e.key.toLowerCase()
    if (k.length !== 1) return
    buf = (buf + k).slice(-target.length)
    if (buf !== target) return
    buf = ''
    isCheat.value = !isCheat.value
    try { localStorage.setItem('cheat', isCheat.value ? 'true' : 'false') } catch { /* private mode */ }
    console.warn(`[CHEAT] ${isCheat.value ? 'on' : 'off'}`)
  })
}
installCheatUnlock()

const buildShortcut = (e: KeyboardEvent): string => {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  const k = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase()
    : e.code.startsWith('Digit') ? e.code.slice(5)
      : e.key.toLowerCase()
  parts.push(k)
  return parts.join('+')
}

const useCheats = () => {
  // Always listening; a key does nothing unless cheats are on (they can be switched on by typing, #116).
  const handleKeyDown = (e: KeyboardEvent) => {
    const entry = cheats.get(buildShortcut(e))
    if (!entry) return
    if (!isCheat.value && !(entry.always && import.meta.env.DEV)) return
    e.preventDefault()
    entry.fn()
    console.warn(`[CHEAT] ${entry.label}`)
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown, { passive: false })
    console.warn('[CHEAT] enabled:', [...cheats.keys()].join(', ') || '(game not loaded yet)')
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  return { isCheat }
}

export default useCheats
