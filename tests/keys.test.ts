// Pins the literal string values of SAVE_KEYS. These keys are a contract with
// every player's save blob — renaming one strands existing players' progress on
// the old field, and the cloud strategies key their manifests off these exact
// strings. `src/keys.ts` is the single source of truth; this test is the tripwire
// that catches an accidental rename during a refactor.

import { describe, expect, it } from 'vitest'
import { SAVE_KEYS, isPayloadKey, META_KEY } from '@/utils/save/SaveMergePolicy'
import { STATE_KEY, STATE_FIELD_PREFIX } from '@/use/useGameState'
import * as keys from '@/keys'

describe('SAVE_KEYS values are stable', () => {
  it('the campaign position is the literal "cm_cleared"', () => {
    expect(SAVE_KEYS.CLEARED).toBe('cm_cleared')
  })
  it('the medal count is the literal "cm_medals"', () => {
    expect(SAVE_KEYS.MEDALS).toBe('cm_medals')
  })
  it('the mission counter is the literal "cm_missions"', () => {
    expect(SAVE_KEYS.MISSIONS_DONE).toBe('cm_missions')
  })
  it('the currency key is the literal "cm_scrap"', () => {
    expect(SAVE_KEYS.COINS).toBe('cm_scrap')
  })
})

describe('the persisted surface is exactly one state blob plus the meta blob', () => {
  it('accepts the state blob and the meta blob', () => {
    // Renaming this strands every existing save.
    expect(STATE_KEY).toBe('cmachine_state')
    expect(isPayloadKey(STATE_KEY)).toBe(true)
    expect(isPayloadKey(META_KEY)).toBe(true)
  })

  it('accepts stray per-field cm_* writes so nothing is silently dropped', () => {
    expect(isPayloadKey(SAVE_KEYS.COINS)).toBe(true)
    expect(isPayloadKey('cm_anything_new')).toBe(true)
  })

  it('rejects foreign keys so ad-tech / dev scribbles never reach the cloud', () => {
    for (const key of ['debug', 'cheat', 'prebid11_exp', 'li-module-enabled', 'epic_stage', 'mega_droid_state', 'ma_level']) {
      expect(isPayloadKey(key)).toBe(false)
    }
  })
})

describe('every field in the catalogue lives inside the blob', () => {
  it('carries the state prefix, so the payload allowlist covers it', () => {
    const values = Object.values(keys) as string[]
    expect(values.length).toBeGreaterThan(0)
    for (const v of values) expect(v.startsWith(STATE_FIELD_PREFIX)).toBe(true)
  })

  it('names no field twice', () => {
    const values = Object.values(keys) as string[]
    expect(new Set(values).size).toBe(values.length)
  })
})
