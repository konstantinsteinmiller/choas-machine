/**
 * ─── The touch action pictograms ─────────────────────────────────────────────
 *
 * The on-screen action buttons used to carry abstract marks (a chevron up, a
 * chevron down, a double chevron, a box) that a playtester could not tell
 * apart or decode. Each of these is a small scene instead, the way mobile
 * shooters draw them: the mech DOING the thing — leaping off the ground,
 * crouched behind a low wall, running with speed lines, peeking out of its
 * hide box, projected as a hologram from the decoy puck.
 *
 * Same contract as `iconPaths.ts` (24 × 24, solid, one `<path>`, nonzero),
 * but drawn from parts: limbs are capsules, heads and pucks are polygons.
 * Every part is wound the same way (`wind`), so overlapping limbs merge
 * under nonzero; the few deliberate holes (a visor, the eyes in the box) are
 * wound the other way.
 */

type Pt = readonly [number, number]

const area = (pts: readonly Pt[]): number => {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!
    const [x2, y2] = pts[(i + 1) % pts.length]!
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

const f = (n: number) => +n.toFixed(2)

/** A closed polygon wound as a solid (`hole` false) or as a hole. */
const wind = (pts: readonly Pt[], hole = false): string => {
  const solid = area(pts) > 0
  const ordered = solid !== hole ? pts : [...pts].reverse()
  return 'M' + ordered.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z'
}

const poly = (...pts: Pt[]) => wind(pts)
const hole = (...pts: Pt[]) => wind(pts, true)
const rect = (x0: number, y0: number, x1: number, y1: number, cut = 0, asHole = false): string =>
  wind(cut > 0
    ? [[x0 + cut, y0], [x1 - cut, y0], [x1, y0 + cut], [x1, y1 - cut], [x1 - cut, y1], [x0 + cut, y1], [x0, y1 - cut], [x0, y0 + cut]]
    : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], asHole)

/** A limb: a segment of width `w` with round ends. */
const cap = (x1: number, y1: number, x2: number, y2: number, w: number): string => {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const r = w / 2
  const pts: Pt[] = []
  for (let i = 0; i <= 6; i++) {
    const t = a - Math.PI / 2 + (Math.PI * i) / 6
    pts.push([x2 + Math.cos(t) * r, y2 + Math.sin(t) * r])
  }
  for (let i = 0; i <= 6; i++) {
    const t = a + Math.PI / 2 + (Math.PI * i) / 6
    pts.push([x1 + Math.cos(t) * r, y1 + Math.sin(t) * r])
  }
  return wind(pts)
}

const circle = (cx: number, cy: number, r: number): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i < 24; i++) {
    const t = (Math.PI * 2 * i) / 24
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r])
  }
  return pts
}

const ellipse = (cx: number, cy: number, rx: number, ry: number): string => {
  const pts: Pt[] = []
  for (let i = 0; i < 20; i++) {
    const t = (Math.PI * 2 * i) / 20
    pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry])
  }
  return wind(pts)
}

/** The mech's head: a chamfered helmet with its visor slot cut out. */
const head = (x: number, y: number, s = 1): string[] => [
  rect(x, y, x + 5 * s, y + 4.4 * s, 1.1 * s),
  rect(x + 1 * s, y + 1.6 * s, x + 4 * s, y + 2.7 * s, 0, true)
]

/** The mech standing, feet at `foot`, centred on `cx` (shared by stand and decoy). */
const standing = (cx: number, top: number, s = 1): string[] => [
  ...head(cx - 2.5 * s, top, s),
  poly([cx - 3.6 * s, top + 5.4 * s], [cx + 3.6 * s, top + 5.4 * s], [cx + 2.6 * s, top + 11.6 * s], [cx - 2.6 * s, top + 11.6 * s]),
  cap(cx - 3.5 * s, top + 6.2 * s, cx - 5.2 * s, top + 11 * s, 2.2 * s),
  cap(cx + 3.5 * s, top + 6.2 * s, cx + 5.2 * s, top + 11 * s, 2.2 * s),
  cap(cx - 1.4 * s, top + 11.6 * s, cx - 1.8 * s, top + 18.6 * s, 2.6 * s),
  cap(cx + 1.4 * s, top + 11.6 * s, cx + 1.8 * s, top + 18.6 * s, 2.6 * s)
]

/** A chevron pointing up (`dir` -1) or down (1), centred on cx, cy. */
const chevron = (cx: number, cy: number, dir: 1 | -1, s = 1): string =>
  poly([cx - 3 * s, cy - 1.4 * s * dir], [cx, cy + 1.6 * s * dir], [cx + 3 * s, cy - 1.4 * s * dir],
    [cx + 3 * s, cy - 3.4 * s * dir], [cx, cy - 0.4 * s * dir], [cx - 3 * s, cy - 3.4 * s * dir])

export const ACTION_GLYPHS = {
  /**
   * Jump (#195): a gap jump — the mech mid-leap from one ledge to the next,
   * stretched out over spikes, its arc dashed in on either side.
   */
  'act-jump': [
    ...head(12.6, 2.4, 0.8),
    poly([11.4, 6.6], [16.2, 7.1], [15, 11.6], [10.9, 11]),
    cap(15.8, 7.8, 18.8, 6.2, 1.8),
    cap(11.6, 7.9, 8.8, 9.6, 1.8),
    cap(14.3, 11.3, 17.4, 13, 2.2), cap(17.4, 13, 18.8, 14.8, 2),
    cap(11.8, 11.2, 9.2, 13.2, 2.2), cap(9.2, 13.2, 7.2, 12.2, 2),
    rect(0.4, 16.6, 7.2, 23.2, 0.6), rect(1.4, 18.2, 6.2, 18.9, 0, true),
    rect(16.8, 16.6, 23.6, 23.2, 0.6), rect(17.8, 18.2, 22.6, 18.9, 0, true),
    poly([7.6, 23.2], [9.1, 19.6], [10.6, 23.2]), poly([10.6, 23.2], [12, 19.2], [13.4, 23.2]), poly([13.4, 23.2], [14.9, 19.6], [16.4, 23.2]),
    cap(3.4, 14.4, 4.4, 12.8, 1.1), cap(5.4, 11.4, 6.6, 10.2, 1.1),
    cap(20, 10.6, 20.9, 11.9, 1.1), cap(21.5, 13.2, 22, 14.6, 1.1)
  ],
  /**
   * Sneak (crouch): the cartoon sneak everyone knows — the mech hunched
   * forward on tiptoe, hands up, creeping, a trail of soft footprints behind
   * it. (It was crouched behind a low wall, and at button size the wall read
   * as a shield.)
   */
  'act-crouch': [
    ...head(14.6, 5.8, 0.88),
    poly([7.6, 10.4], [14.8, 9.2], [13.8, 14.8], [7.4, 14.6]),
    cap(14.2, 10.4, 17.4, 13.4, 2.1), cap(17.4, 13.4, 19.8, 11, 1.8),
    cap(11.2, 11.6, 13.8, 15.6, 2), cap(13.8, 15.6, 16.6, 14.6, 1.7),
    cap(12.2, 14.6, 16.6, 16.8, 2.7), cap(16.6, 16.8, 16, 20.8, 2.4), cap(16, 21, 18.8, 21.2, 1.8),
    cap(9, 14.6, 10.6, 18.6, 2.7), cap(10.6, 18.6, 6.6, 21.2, 2.3),
    ellipse(1.8, 21.4, 1.2, 0.65), ellipse(3.8, 23.2, 1.2, 0.65)
  ],
  /** Stand up: the mech upright, a chevron pointing up beside it. */
  'act-stand': [
    ...standing(9, 2.2, 1),
    chevron(19, 7, -1, 0.9),
    cap(19, 7.6, 19, 20.5, 1.6)
  ],
  /** Sprint: the mech leaning into a run, speed lines streaming behind it. */
  'act-sprint': [
    ...head(12.4, 1.6),
    poly([10.8, 7.1], [16.6, 7.4], [14.4, 13.4], [9.4, 12.8]),
    cap(15.6, 8.4, 19, 11.2, 2.1), cap(19, 11.2, 21, 9.4, 1.9),
    cap(11.2, 8.4, 7.8, 10.6, 2.1),
    cap(13, 13, 16.6, 16, 2.6), cap(16.6, 16, 15.8, 21.4, 2.4),
    cap(10.8, 13.1, 8.4, 17, 2.6), cap(8.4, 17, 4.6, 18.4, 2.4),
    cap(1.4, 6.2, 6.4, 6.2, 1.3), cap(0.9, 9.6, 5.4, 9.6, 1.3), cap(1.8, 13, 5.2, 13, 1.3)
  ],
  /** Hide box: a cardboard box with its flaps up, two eyes peering out of the slot. */
  'act-hide': [
    rect(2.8, 10.4, 21.2, 21.8, 0.6),
    poly([3, 10.4], [11.6, 10.4], [9.2, 5.8], [1.2, 7.6]),
    poly([12.4, 10.4], [21, 10.4], [22.8, 7.4], [14.6, 6]),
    rect(6.4, 12.6, 17.6, 15.8, 0.6, true),
    rect(8.6, 13.4, 10.6, 15.2, 0.5),
    rect(13.4, 13.4, 15.4, 15.2, 0.5),
    rect(4.6, 18.2, 19.4, 19.1, 0, true)
  ],
  /** Decoy: the projector puck on the floor and the mech's hologram standing in its beams. */
  'act-decoy': [
    ellipse(12, 21, 6.4, 1.9),
    cap(6.6, 19.6, 4.2, 4.2, 1),
    cap(17.4, 19.6, 19.8, 4.2, 1),
    ...standing(12, 1.6, 0.86),
    cap(2.4, 2.2, 2.4, 3.6, 1.1), cap(1.7, 2.9, 3.1, 2.9, 1.1),
    cap(21.6, 7.4, 21.6, 8.8, 1.1), cap(20.9, 8.1, 22.3, 8.1, 1.1)
  ],
  /** Shoot: a round leaving the barrel, speed lines streaming behind it. */
  'act-fire': [
    rect(4.2, 8.4, 6.2, 15.6, 0.4),
    rect(6.6, 9.2, 13.6, 14.8, 0.5),
    poly([13.6, 9.2], [16.4, 9.6], [18.8, 10.6], [20.4, 12], [18.8, 13.4], [16.4, 14.4], [13.6, 14.8]),
    rect(8.4, 10.6, 12.6, 11.4, 0, true),
    cap(2, 5.2, 9.6, 5.2, 1.5), cap(4.6, 18.8, 11.8, 18.8, 1.5),
    cap(21.2, 6.2, 22.6, 4.6, 1.3), cap(21.2, 17.8, 22.6, 19.4, 1.3), cap(22.2, 12, 23.4, 12, 1.3)
  ],
  /** The sniper's scope, to look through: its reticle, the cross with its mil dots. */
  'act-scope': [
    ellipse(12, 12, 10.2, 10.2), wind(circle(12, 12, 8.3), true),
    cap(12, 3.6, 12, 9.4, 1.5), cap(12, 14.6, 12, 20.4, 1.5), cap(3.6, 12, 9.4, 12, 1.5), cap(14.6, 12, 20.4, 12, 1.5),
    ellipse(12, 12, 1.2, 1.2),
    ellipse(12, 6.6, 0.8, 0.8), ellipse(17.4, 12, 0.8, 0.8)
  ],
  /** Out of the scope: the reticle struck through — the weapon comes down, nothing fired. */
  'act-unscope': [
    ellipse(12, 12, 10.2, 10.2), wind(circle(12, 12, 8.3), true),
    cap(12, 3.6, 12, 8.4, 1.5), cap(12, 15.6, 12, 20.4, 1.5), cap(3.6, 12, 8.4, 12, 1.5), cap(15.6, 12, 20.4, 12, 1.5),
    cap(5.4, 18.6, 18.6, 5.4, 2.6)
  ],
  /** Swap weapon: two arrows chasing each other round. */
  'act-swap': [
    cap(5, 9, 17, 9, 2.4), poly([16, 4.6], [21.4, 9], [16, 13.4]),
    cap(19, 15.6, 7, 15.6, 2.4), poly([8, 11.2], [2.6, 15.6], [8, 20])
  ]
} as const

export type ActionGlyphName = keyof typeof ACTION_GLYPHS
