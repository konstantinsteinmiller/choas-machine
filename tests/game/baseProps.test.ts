// The Command Base's set: the dropship, the deck, the furnace, the weapons
// lab, the disguise shelf and the floating islands. Each is built from
// separate parts merged at the end, so no two parts may share a face (the
// user's hard rule: no z-fighting, ever).

import { describe, expect, it } from 'vitest'
import type { BufferGeometry } from 'three'
import { dropshipParts } from '@/game/models/dropship'
import { deckLampParts, deckParts } from '@/game/models/baseDeck'
import { furnaceCoreParts, furnaceParts } from '@/game/models/forgeFurnace'
import { labParts } from '@/game/models/weaponLab'
import { nicheModel, shelfParts, shelfRimParts } from '@/game/models/disguiseShelf'
import { islandParts } from '@/game/models/skyIslands'
import { DISGUISE_IDS } from '@/game/models/disguises'
import { allParts, newParts, type Parts } from '@/game/models/propKit'
import { merge } from '@/game/models/kit'
import { coplanarClashes } from '../helpers/coplanar'

/** A part's name for a failure: where it is. */
const where = (g: BufferGeometry): string => {
  g.computeBoundingBox()
  const b = g.boundingBox!
  const f = (v: number): string => v.toFixed(2)
  return `[${f(b.min.x)},${f(b.min.y)},${f(b.min.z)} .. ${f(b.max.x)},${f(b.max.y)},${f(b.max.z)}]`
}

const join = (...ps: Parts[]): Parts => {
  const out = newParts()
  for (const p of ps) for (const k of ['lit', 'fine', 'glow'] as const) out[k].push(...p[k])
  return out
}

const check = (name: string, build: () => Parts, tol = 0.01, colored = true): void => {
  it(`${name}: no two parts share a face`, () => {
    const parts = allParts(build())
    expect(parts.length).toBeGreaterThan(10)
    // Mergeable: every part has the same attributes (a position, a normal, a colour; no uvs), indexed.
    const bad = parts.filter(g => Object.keys(g.attributes).sort().join() !== (colored || g.attributes.color ? 'color,normal,position' : 'normal,position') || !g.index)
    expect(bad.map(g => `${where(g)} ${Object.keys(g.attributes).join()}${g.index ? '' : ' (no index)'}`)).toEqual([])
    expect(coplanarClashes(parts, tol, parts.map(where))).toEqual([])
  })
}

describe('no z-fighting in the Command Base', () => {
  check('dropship', dropshipParts)
  check('deck', () => join(deckParts(), deckLampParts()))
  check('furnace', () => join(furnaceParts(), furnaceCoreParts()))
  check('weapons lab', labParts)
  // Each model in its niche as one part: its own pieces are the disguise
  // suite's to check (at the model's own size); here, against the shelf.
  for (const owned of [true, false]) {
    check(`disguise shelf (${owned ? 'all owned' : 'none owned'})`, () => {
      const set = new Set(owned ? DISGUISE_IDS : [])
      const models = DISGUISE_IDS.map((id, i) => {
        const m = nicheModel(id, i, owned)
        return owned ? merge([...m.lit, ...m.glow]) : merge(m.holo)
      })
      return join(shelfParts(), shelfRimParts(set), { lit: models, fine: [], glow: [] })
    }, 0.01, owned)
  }
  // Seen from 70 m and more: a decimetre is what the depth buffer can tell apart there.
  check('islands', () => { const { parts, lamps } = islandParts(); return join(parts, lamps) }, 0.1)

  it('(the check does catch two plates in one plane, and passes them a centimetre and a half apart)', async () => {
    const { rbox, xform } = await import('@/game/models/kit')
    const deck = rbox(2, 0.1, 2, 0.2)
    expect(coplanarClashes([deck, xform(rbox(0.5, 0.1, 0.5, 0.2), [0.3, 0, 0.2])])).not.toEqual([])
    expect(coplanarClashes([deck, xform(rbox(0.5, 0.1, 0.5, 0.2), [0.3, 0.015, 0.2])])).toEqual([])
  })
})
