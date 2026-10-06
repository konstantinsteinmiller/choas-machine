// Round 5 (#147): the z-fighting guard over every geometry builder in the
// field. The user's rule: never two opaque faces in one plane. The Command
// Base set has its own suite (`baseProps.test.ts`); this covers the rest: CM-07,
// every defender (each kit), the robo dog, and every fortress prop.
//
// A rig's parts are compared bone by bone, in bind space: parts on different
// bones move apart as soon as the rig is posed, so only parts that ride the
// same bone can share a plane for good.

import { describe, expect, it } from 'vitest'
import type { BufferGeometry } from 'three'
import type { Rig } from '@/game/models/kit'
import { buildMech } from '@/game/models/mech'
import { buildDrone, buildEnforcer, buildGoliath, buildGuard, buildRoomba, buildSearchlight } from '@/game/models/garrison'
import { buildRobodog } from '@/game/models/robodog'
import { buildAirship } from '@/game/models/airship'
import { PARTS } from '@/game/world/decor'
import { beaconParts } from '@/game/models/beacon'
import { hideBoxParts } from '@/game/models/hideBox'
import type { DecorKind } from '@/game/world/fortress'
import { coplanarClashes } from '../helpers/coplanar'

const rigClashes = (rig: Rig): string[] => {
  const byBone = new Map<number, BufferGeometry[]>()
  for (const p of rig.parts) {
    const l = byBone.get(p.bone) ?? []
    l.push(p.geo)
    byBone.set(p.bone, l)
  }
  const bones = rig.mesh.skeleton.bones
  const out: string[] = []
  for (const [bone, geos] of byBone) {
    if (geos.length < 2) continue
    const names = geos.map((_, i) => `${bones[bone]!.name}#${i}`)
    out.push(...coplanarClashes(geos, 0.004, names))
  }
  return out
}

const RIGS: Record<string, () => Rig> = {
  mech: buildMech,
  guard: () => buildGuard(),
  commander: () => buildGuard(true),
  'commander with shield': () => buildGuard(true, true),
  'shield guard': () => buildGuard(false, true),
  engineer: () => buildGuard(false, false, true),
  grenadier: () => buildGuard(false, false, false, 'grenadier'),
  marksman: () => buildGuard(false, false, false, 'marksman'),
  drone: buildDrone,
  searchlight: buildSearchlight,
  roomba: () => buildRoomba(),
  'roomba (shotgun)': () => buildRoomba(true),
  enforcer: () => buildEnforcer(),
  foreman: () => buildEnforcer(true),
  goliath: buildGoliath,
  'robo dog': () => buildRobodog(),
  hound: () => buildRobodog(true),
  airship: buildAirship
}

describe('no z-fighting on anything in the field (#147)', () => {
  for (const [name, build] of Object.entries(RIGS)) {
    it(`${name}: no two parts on one bone share a face`, () => {
      expect(rigClashes(build())).toEqual([])
    })
  }
  it('the alarm beacon: no two parts share a face', () => {
    const geos = beaconParts()
    expect(coplanarClashes(geos, 0.004, geos.map((_, i) => `beacon#${i}`))).toEqual([])
  })
  it('the hide box: no two parts share a face', () => {
    const { lit, glow } = hideBoxParts()
    const geos = [...lit, ...glow]
    expect(coplanarClashes(geos, 0.004, geos.map((_, i) => `box#${i}`))).toEqual([])
  })
  for (const kind of Object.keys(PARTS) as DecorKind[]) {
    it(`fortress prop "${kind}": no two parts share a face`, () => {
      const p = PARTS[kind]()
      const geos = [...p.lit, ...p.glow]
      expect(coplanarClashes(geos, 0.004, geos.map((_, i) => `${kind}#${i}`))).toEqual([])
    })
  }
})
