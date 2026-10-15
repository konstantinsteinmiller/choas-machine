// The training ground's Poki funnels: start → complete/fail once, keys once per room.

import { describe, expect, it, vi } from 'vitest'

const calls: string[] = []
vi.mock('@/utils/pokiPlugin', () => ({ pokiMeasure: (c: string, w: string, a: string) => { calls.push(`${c}|${w}|${a}`) } }))

describe('trainingMeasure', () => {
  it('opens a lesson, logs each key once, closes it exactly once', async () => {
    const { emit } = await import('@/game/bus')
    const { installTrainingMeasure } = await import('@/game/trainingMeasure')
    const { TRAINING_ROOMS } = await import('@/game/data/fortresses/training')
    installTrainingMeasure()
    const room = TRAINING_ROOMS.findIndex(r => r.lesson === 'cover')
    emit('lessonEnter', { room })
    emit('keyPress', { code: 'ControlLeft' })
    emit('keyPress', { code: 'ControlLeft' })
    emit('keyPress', { code: 'KeyC' })
    emit('trainingReset', {})
    emit('lessonDone', { room })
    emit('trainingSkip', {})
    const of = (c: string) => calls.filter(x => x.startsWith(`${c}|`))
    expect(of('training')).toEqual(['training|cover|start', 'training|cover|complete'])
    expect(of('trainingKey')).toEqual(['trainingKey|cover|ControlLeft', 'trainingKey|cover|KeyC'])
    expect(of('trainingSeen')).toEqual(['trainingSeen|cover|1'])
    expect(of('trainingTime')).toHaveLength(1)
    expect(of('keyboard')).toHaveLength(1)
  })
})
