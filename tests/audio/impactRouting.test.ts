// Where a round lands decides what is heard: flesh for the garrison's people,
// metal for everything built; the blade's takedown the same (gameSounds.ts).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const units = vi.hoisted(() => [
  { kind: 'guard' }, { kind: 'sentry' }, { kind: 'commander' },
  { kind: 'drone' }, { kind: 'roomba' }, { kind: 'enforcer' }, { kind: 'goliath' }, { kind: 'searchlight' }, { kind: 'hound' }
])
vi.mock('@/game/engine/app', () => ({ app: { mode: { garrison: { units } } } }))
vi.mock('@/game/flow', () => ({ flow: { screen: 'base' } }))
vi.mock('@/game/audio/engine', () => ({ whenAudio: (fn: () => void) => fn() }))
vi.mock('@/game/audio/synth', () => ({ minigunHum: () => {}, warmFoley: () => {} }))
vi.mock('@/game/audio/music', () => ({ playJingle: () => {}, warmMusic: () => {} }))
vi.mock('@/game/audio/voice', () => ({ installVoices: () => {} }))
vi.mock('@/use/useSound', () => ({ setMusicTrack: () => {} }))
vi.mock('@/use/useKillCam', () => ({ killCamsEnabled: { value: true } }))

import { emit } from '@/game/bus'
import { installGameSounds, isFlesh } from '@/game/audio/gameSounds'
import { resetSfxGaps, setSfxPlayer } from '@/game/audio/sfx'

const HUMANS = [0, 1, 2]
const MACHINES = [3, 4, 5, 6, 7, 8]

describe('flesh or metal', () => {
  let now = 0
  const played: string[] = []
  beforeAll(() => installGameSounds())
  beforeEach(() => {
    played.length = 0
    resetSfxGaps()
    // Far apart, so no gap swallows a sound.
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 1000))
    setSfxPlayer(name => { played.push(name) })
  })
  afterEach(() => {
    setSfxPlayer(null)
    vi.restoreAllMocks()
  })

  it('knows the garrison\'s people from its machines', () => {
    for (const id of HUMANS) expect(isFlesh(id), units[id]!.kind).toBe(true)
    for (const id of MACHINES) expect(isFlesh(id), units[id]!.kind).toBe(false)
    // An id the mission does not know keeps the hit a hit always was.
    expect(isFlesh(99)).toBe(true)
  })

  it('a rifle round: a wet thud in a person, a ringing clang on a machine', () => {
    for (const id of HUMANS) emit('hit', { id, weapon: 'sniper', zone: 'body' })
    expect(played).toEqual(['impactBody', 'impactBody', 'impactBody'])
    played.length = 0
    for (const id of MACHINES) emit('hit', { id, weapon: 'sniper', zone: 'body' })
    expect(played).toEqual(MACHINES.map(() => 'impactMetal'))
  })

  it('armour plate rings whoever wears it', () => {
    emit('hit', { id: 0, weapon: 'sniper', zone: 'armor' })
    emit('hit', { id: 0, weapon: 'minigun', zone: 'armor' })
    expect(played).toEqual(['impactMetal', 'tink'])
  })

  it('the minigun\'s rounds split the same way, with its short pair', () => {
    emit('hit', { id: 0, weapon: 'minigun', zone: 'head' })
    emit('hit', { id: 5, weapon: 'minigun', zone: 'joint' })
    expect(played).toEqual(['hit', 'tink'])
  })

  it("a takedown: the blade into a person and out with the body's sounds, no steel ringing (#172); steel through plate on a machine", () => {
    emit('takedown', { beat: 'draw', id: 0 })
    emit('takedown', { beat: 'stab', id: 0 })
    emit('takedown', { beat: 'pull', id: 0 })
    expect(played).toEqual(['grab', 'bladeOut', 'stabFlesh', 'pullFlesh'])
    expect(played).not.toContain('stab')
    expect(played).not.toContain('blade')
    played.length = 0
    emit('takedown', { beat: 'stab', id: 5 })
    expect(played).toEqual(['blade', 'impactMetal'])
  })

  it('a quick strike at a person is the swish and the cut, not steel (#172)', () => {
    emit('strike', { kind: 'strike', id: 0 })
    expect(played).toEqual(['slashFlesh'])
    played.length = 0
    emit('strike', { kind: 'strike', id: 5 })
    expect(played).toEqual(['blade'])
  })

  it('every round fired is voiced, the rifle with its bolt', () => {
    emit('shot', { weapon: 'minigun' })
    emit('shot', { weapon: 'rocket' })
    emit('shot', { weapon: 'sniper' })
    expect(played).toEqual(['minigun', 'rocket', 'sniper', 'bolt'])
  })

  it('a round landing on the mech rings off its plate; a miss whizzes past', () => {
    emit('incoming', { id: 0, kind: 'guard', hit: true })
    emit('incoming', { id: 0, kind: 'guard', hit: false })
    expect(played).toEqual(['enemyShot', 'tink', 'enemyShot', 'whizz'])
  })

  it('a pull on an empty weapon: the dry "out of stock" click, every pull (#202)', () => {
    emit('dryFire', {})
    emit('dryFire', {})
    expect(played).toEqual(['dry', 'dry'])
  })
})
