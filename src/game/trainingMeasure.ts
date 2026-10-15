import { on } from './bus'
import { TRAINING_ROOMS, type LessonId } from './data/fortresses/training'
import { activeLayout, keyboard } from './engine/keyLabels'
import { pokiMeasure } from '@/utils/pokiPlugin'

/**
 * ─── The training ground, measured on Poki ───────────────────────────────────
 *
 * Spanish and Portuguese playtesters stood in front of the sneak door and the
 * backstab guard pressing keys. These funnels show, per lesson, where players
 * give up and which keys they try there, so the next fix is read from the
 * data rather than guessed (Poki's dashboard: Statistics → Events).
 *
 *   training     · <lesson> · start | complete | fail (fail = skipped)
 *   trainingTime · <lesson> · 0-15s | 15-30s | 30-60s | 60-120s | 120s+
 *   trainingSeen · <lesson> · 1 … 5+ (seen and sent back, the nth time)
 *   trainingKey  · <lesson> · <KeyboardEvent.code> (each key once per room, bound or not)
 *   keyboard     · <layout>  · <source> (once: what the keycaps were drawn for)
 *
 * Values are stable identifiers (lesson ids, key codes): changing them breaks
 * the funnels. A no-op off Poki (`pokiMeasure` is stubbed there).
 */

/** Keys logged per room at most (a player mashing every key is one story, not fifty events). */
const KEYS_PER_ROOM = 16

const timeBucket = (s: number): string => (s < 15 ? '0-15s' : s < 30 ? '15-30s' : s < 60 ? '30-60s' : s < 120 ? '60-120s' : '120s+')

let installed = false

export const installTrainingMeasure = (): void => {
  if (installed) return
  installed = true
  /** The lesson whose `start` has no `complete`/`fail` yet. */
  let open: LessonId | null = null
  let since = 0
  let seen = 0
  let keys = new Set<string>()
  let layoutSent = false
  const lessonOf = (room: number): LessonId | null => TRAINING_ROOMS[room]?.lesson ?? null
  const close = (action: 'complete' | 'fail'): void => {
    if (!open) return
    pokiMeasure('training', open, action)
    pokiMeasure('trainingTime', open, timeBucket((performance.now() - since) / 1000))
    open = null
  }

  on('lessonEnter', ({ room }) => {
    close('fail')
    const lesson = lessonOf(room)
    if (!lesson) return
    open = lesson
    since = performance.now()
    seen = 0
    keys = new Set()
    pokiMeasure('training', lesson, 'start')
  })
  on('lessonDone', ({ room }) => { if (open && open === lessonOf(room)) close('complete') })
  on('trainingSkip', () => close('fail'))
  on('trainingReset', () => {
    if (!open) return
    seen++
    pokiMeasure('trainingSeen', open, seen >= 5 ? '5+' : String(seen))
  })
  on('keyPress', ({ code }) => {
    if (!layoutSent) {
      layoutSent = true
      pokiMeasure('keyboard', activeLayout.value, keyboard.auto ? keyboard.source : 'manual')
    }
    if (!open || keys.has(code) || keys.size >= KEYS_PER_ROOM) return
    keys.add(code)
    pokiMeasure('trainingKey', open, code)
  })
}
