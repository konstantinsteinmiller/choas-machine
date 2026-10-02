/**
 * ─── Promotion manifest: the art that goes OUTSIDE the game ──────────────────
 *
 * The cover images a portal's submission form asks for, and the prompts they
 * are painted from. `tools/art-promotion.mjs` (`pnpm art:promotion`) reads
 * this file under plain Node, so it imports nothing from the game.
 *
 *   plate    a screenshot of the game's own models, staged for one SCENARIO
 *            and framed at one aspect (`art-sheets/promotion/<scenario>/`)
 *   master   the plate, painted (`art-sheets/promotion/painted/<scenario>/`)
 *   cut      every size of that aspect FAMILY, resized from its own master,
 *            with and without the logo (`src/assets/promotion/`)
 *
 * Four rules:
 *
 * 1. No text, no interface and no logo is PAINTED. The logo is laid over a
 *    finished cover by the tool, in a corner that is never the top left (a
 *    portal's own badge sits there, up to the middle of the image).
 * 2. A size is only ever cut from a master of its own aspect.
 * 3. The plate is the fallback: a family with no painting still ships.
 * 4. One scenario ships (`COVER_PICK`). The others stay in `art-sheets/` as
 *    the comparison they were painted for.
 */

export interface CoverSize {
  w: number
  h: number
  /** The formats this size is delivered in. */
  formats: ReadonlyArray<'jpg' | 'webp'>
  /** `both`: with and without the logo. `only`: with the logo only. */
  logo: 'both' | 'only'
}

export type CoverShape = 'landscape' | 'portrait' | 'square'

export interface CoverAspect {
  /** `16x9`: the id everything keys on, and the plate's file name. */
  id: string
  label: string
  /** The plate handed to the painter: the family's largest size, or an exact
   *  multiple of it. Its shape is what brings the return back at this aspect. */
  plate: { w: number; h: number }
  sizes: CoverSize[]
  shape: CoverShape
  /** What this shape of picture is, in the prompt's own words. */
  shot: string[]
}

const BOTH = ['jpg', 'webp'] as const

export const COVER_ASPECTS: CoverAspect[] = [
  {
    id: '1x1',
    label: '1:1 square',
    plate: { w: 1024, h: 1024 },
    sizes: [
      { w: 800, h: 800, formats: BOTH, logo: 'both' },
      { w: 628, h: 628, formats: ['jpg'], logo: 'only' },
      { w: 512, h: 512, formats: ['jpg'], logo: 'only' }
    ],
    shape: 'square',
    shot: [
      'A SQUARE TILE. This is the one that sits in a grid of forty other squares and',
      'has to win, shown as small as 250 pixels across. Crop in HARD: the two',
      'characters the picture is about fill most of the square, and there is no empty',
      'ground and no empty sky anywhere.'
    ]
  },
  {
    id: '16x9',
    label: '16:9 landscape',
    plate: { w: 1920, h: 1080 },
    sizes: [
      { w: 1920, h: 1080, formats: BOTH, logo: 'both' },
      { w: 800, h: 450, formats: ['webp'], logo: 'only' },
      { w: 400, h: 225, formats: ['jpg'], logo: 'only' }
    ],
    shape: 'landscape',
    shot: [
      'A WIDE LANDSCAPE SHOT: the hero image that runs full width on a game page, and',
      'also a thumbnail 400 pixels wide. The subject sits left of centre and is as big',
      'as the frame allows; the fortress and the sunset sky carry the right-hand side.'
    ]
  },
  {
    id: '9x16',
    label: '9:16 portrait',
    plate: { w: 1080, h: 1920 },
    sizes: [{ w: 1080, h: 1920, formats: ['jpg'], logo: 'both' }],
    shape: 'portrait',
    shot: [
      'A TALL PORTRAIT SHOT, the shape of a phone held upright. Build it as ONE',
      'vertical arrangement read from top to bottom, the subject stacked through the',
      'middle of the frame. Do not lay the landscape picture on its side: nothing that',
      'matters may sit in the left or right margin of a frame this narrow.'
    ]
  },
  {
    id: '2x3',
    label: '2:3 portrait',
    plate: { w: 1024, h: 1536 },
    sizes: [{ w: 800, h: 1200, formats: ['webp'], logo: 'both' }],
    shape: 'portrait',
    shot: [
      'A PORTRAIT POSTER, a little wider than a phone screen. The same vertical',
      'arrangement as the tall one, with enough width for the fortress wall and one',
      'watchtower behind the subject.'
    ]
  },
  {
    id: '16x10',
    label: '16:10 landscape',
    plate: { w: 1360, h: 850 },
    sizes: [{ w: 1360, h: 850, formats: ['jpg'], logo: 'only' }],
    shape: 'landscape',
    shot: [
      'A LANDSCAPE BANNER, a little taller than widescreen. The subject left of',
      'centre and large; the lower right corner calm.'
    ]
  },
  {
    id: '4x3',
    label: '4:3 landscape',
    plate: { w: 1024, h: 768 },
    sizes: [{ w: 512, h: 384, formats: ['jpg'], logo: 'only' }],
    shape: 'landscape',
    shot: [
      'A BOXY LANDSCAPE THUMBNAIL, shown small: 512 pixels wide at most. Fewer',
      'things, each one bigger. The two characters carry the whole image.'
    ]
  },
  {
    id: '3x2',
    label: '3:2 landscape',
    plate: { w: 1024, h: 680 },
    sizes: [{ w: 512, h: 340, formats: ['jpg'], logo: 'only' }],
    shape: 'landscape',
    shot: [
      'A SHALLOW LANDSCAPE THUMBNAIL, shown small: 512 pixels wide at most. Keep the',
      'subject on one horizontal band through the middle of the frame: the top and',
      'bottom edges of a strip this shallow are the first thing a portal crops.'
    ]
  }
]

// ─── The logo over a finished cover ──────────────────────────────────────────

/**
 * Where the logo goes on a `-logo` cut: never the top left. The prompt tells
 * the painter which corner to keep calm (`corner`). Sizes are a share
 * of the cover's SHORT side, so the lockup weighs the same in every shape.
 */
export const LOGO_PLACEMENT: Record<CoverShape, { anchor: 'bottom-right' | 'top-right'; size: number; margin: number; corner: string }> = {
  landscape: { anchor: 'bottom-right', size: 0.46, margin: 0.045, corner: 'LOWER RIGHT' },
  square: { anchor: 'bottom-right', size: 0.3, margin: 0.035, corner: 'LOWER RIGHT' },
  // A portrait cover stacks its subject down the middle to the bottom edge:
  // the only free corner is the top right.
  portrait: { anchor: 'top-right', size: 0.4, margin: 0.05, corner: 'TOP RIGHT' }
}

/** `cover-1920x1080.jpg`, `cover-1920x1080-logo.jpg`. */
export const coverFile = (size: { w: number; h: number }, format: string, logo: boolean): string =>
  `cover-${size.w}x${size.h}${logo ? '-logo' : ''}.${format}`

/** Every file one family delivers. */
export const coverFiles = (a: CoverAspect): Array<{ size: CoverSize; format: string; logo: boolean; file: string }> =>
  a.sizes.flatMap(size => size.formats.flatMap(format =>
    (size.logo === 'both' ? [false, true] : [true]).map(logo => ({ size, format, logo, file: coverFile(size, format, logo) }))
  ))

export const plateStem = (a: CoverAspect): string => `cover-${a.id}`

// ─── The scenarios ───────────────────────────────────────────────────────────

export interface CoverScenario {
  id: string
  title: string
  /** WHAT IT IS: the half-second the picture shows. */
  what: string[]
  /** The hook, as marks a painter can check off. */
  hook: string[]
  /** The question the check list ends on. */
  check: string
}

/** Who is in every picture, so a cover of this game shows this game's cast. */
const CAST = [
  'THE CAST, exactly as the plate shows them:',
  '· THE MECH (the player): a small, cute robot about as tall as a person. A big',
  '  boxy lilac head whose face is a dark visor screen with TWO glowing hot-pink',
  '  rectangular eyes, cyan ear caps, a short antenna with a pink bulb, round',
  '  lilac shoulder balls, a compact lilac body with a round cyan light in the',
  '  chest and dark joints. Toy-like, friendly, a little menacing.',
  '· THE GUARDS: short cartoon soldiers with oversized heads, round teal helmets,',
  '  teal uniforms, dot eyes, a rifle. THE COMMANDER is one of them in a red coat',
  '  and a red peaked cap with gold trim.',
  '· NOBODY ELSE up close. The only large figures are the ones the plate shows.',
  '  Anyone added for atmosphere is tiny and far away on a wall or a tower.',
  '· THE FORTRESS: chunky violet walls with glowing pink and cyan trim lines,',
  '  square watchtowers with cyan ladders, blue cover blocks, a checkered violet',
  '  floor, floating rock islands and flat pink clouds in a pink-to-violet dusk sky.'
]

export const COVER_SCENARIOS: CoverScenario[] = [
  {
    id: 'ambush',
    title: 'The blade, a breath before',
    what: [
      'The instant before a stealth takedown. The mech has dropped silently behind a',
      'guard and looms over his shoulder, a glowing cyan energy blade raised from its',
      'forearm. The guard faces the viewer and has JUST sensed it: his eyes are huge',
      'and sliding sideways, a bead of sweat flies off his helmet, his mouth is a',
      'small wobbly line. Funny dread, never horror, no wound and no blood. He is an',
      'ordinary guard: round TEAL helmet, plain teal uniform, no armour, no red coat.',
      'The blade is a straight, solid bar of cyan light, not lightning.'
    ],
    hook: [
      '· TWO FACES, ENORMOUS. The guard\'s panicked face in the foreground and the',
      '  mech\'s visor with its two pink eyes right behind and above it together',
      '  fill at least half the frame.',
      '· THE MOMENT IS THE ONE BEFORE. The blade is raised and has NOT come down.',
      '· THE BRIGHTEST THING IS THE BLADE: its cyan glow rims the guard\'s helmet and',
      '  the mech\'s shoulder, against the warm pink sky. Nothing else in the picture',
      '  is as bright.'
    ],
    check: 'Is it clear in one glance that the robot is about to strike a guard who has only just noticed?'
  },
  {
    id: 'scope',
    title: 'One shot',
    what: [
      'A sniper\'s moment. The mech in extreme close-up, crouched on a fortress wall,',
      'sighting down a long silenced rifle that comes toward the viewer and off the',
      'lower corner of the frame. Its dark visor fills the upper half of the picture',
      'and REFLECTS the target: the red-coated Commander, tiny and bright, standing',
      'in a searchlight. One held breath before the shot.'
    ],
    hook: [
      '· ONE FACE, ENORMOUS: the mech\'s visor is the picture. Its two pink eyes are',
      '  narrowed to hard lines, and the small red figure reflected between them is',
      '  the sharpest thing in the frame.',
      '· THE MOMENT IS THE ONE BEFORE. No muzzle flash. One finger on the trigger.',
      '· EVERYTHING POINTS AT IT: the rifle barrel, the wall top and the pink trim',
      '  lines all converge on the visor.'
    ],
    check: 'Is it clear in one glance that this robot is a sniper about to take one shot at one target?'
  },
  {
    id: 'chaos',
    title: 'When the alarm goes',
    what: [
      'The loud half of the game. The mech charges straight at the viewer, mid-stride,',
      'a spinning minigun on one arm spraying a fan of bright tracers and brass, a',
      'rocket streaking away over its shoulder. Behind it guards tumble through the',
      'air in cartoon somersaults, a watchtower is bursting in a pink-and-orange',
      'fireball, and red alarm beacons sweep the smoke.'
    ],
    hook: [
      '· ONE SUBJECT, ENORMOUS: the mech fills the middle of the frame from knee to',
      '  antenna, leaning into the run, its pink eyes blazing.',
      '· MAXIMUM CONTRAST AT THE MUZZLE: white-hot flash against the dark visor.',
      '· EVERYTHING FLIES OUTWARD from the mech: tracers, casings, debris, guards.'
    ],
    check: 'Is it clear in one glance that this small robot is tearing through a whole fortress?'
  },
  {
    id: 'goliath',
    title: 'Small mech, big tank',
    what: [
      'David and Goliath. In the foreground, seen from behind and a little to one',
      'side, the small mech stands its ground with a rocket launcher on its shoulder.',
      'Towering over it and filling the rest of the frame is the Goliath: a huge',
      'armoured tank with a round turret, a cannon as wide as the mech is tall, its',
      'muzzle beginning to glow, searchlights pinning the mech in white light.'
    ],
    hook: [
      '· THE SIZE GAP IS THE HOOK: the tank is at least five times the mech and',
      '  crops off the top of the frame; the mech is small, sharp and bright.',
      '· THE MOMENT IS THE ONE BEFORE: the cannon is charging and has NOT fired; the',
      '  mech\'s rocket has not left the tube.',
      '· MAXIMUM CONTRAST BETWEEN THE TWO: the glowing cannon mouth and the cyan',
      '  light of the mech\'s rocket are the two brightest points, facing each other.'
    ],
    check: 'Is it clear in one glance that a tiny robot is facing down a giant tank?'
  }
]

/**
 * The scenario that ships. Chosen after all four were painted once at 1:1 and
 * compared at 250 px against each other and against their own plates: see
 * `art-sheets/promotion/COMPARE.md` (written by the tool) and `art-todo.md`.
 */
export const COVER_PICK = 'ambush'

// ─── The prompt ──────────────────────────────────────────────────────────────

const DELIVERABLE = (a: CoverAspect): string[] => [
  'WHAT COMES BACK',
  `ONE finished piece of cover art, ${a.plate.w} x ${a.plate.h} pixels, exactly`,
  `${a.label}, filled edge to edge. One single image and nothing else: not a`,
  'sheet of options, not a grid, not two versions side by side, not a mock-up of a',
  'store page or a phone, not a poster or a card with a border, a margin or',
  'rounded corners. The painting runs all the way to all four edges, square-cornered.'
]

const EXCLUSIONS = [
  'WHAT IS NOT IN IT',
  '· NO TEXT ANYWHERE. No title, no game name, no tagline, no caption, no number,',
  '  no word on a sign or a banner, no signature, no watermark. Every portal',
  '  typesets the game\'s name over this art itself, and a painted title crosses',
  '  theirs.',
  '· NO LOGO and no wordmark. The logo is laid over the finished picture',
  '  afterwards, in one corner.',
  '· NO USER INTERFACE of any kind: no buttons, no health bar, no ammo counter, no',
  '  crosshair, no scope overlay, no exclamation or question marks over heads, no',
  '  arrows, no HUD panel, no phone or browser frame.',
  '· No border, no frame, no rounded corners, no letterboxing. The art IS the',
  '  whole rectangle.'
]

const READ_THE_PLATE = [
  'READ THE ATTACHED PLATE',
  'The LAST attached image is a BLOCKING PLATE: a screenshot of the game\'s own',
  '3D models, placed where they belong. It is not a painting to copy. Take from',
  'it, exactly:',
  '· WHO IS IN IT: these characters, with these shapes and these colours. A player',
  '  spends an hour looking at them; different characters are a different game.',
  '· WHERE THINGS ARE: each character stays roughly where the plate puts it, at',
  '  roughly that size.',
  '· THE WORLD: the violet fortress with pink and cyan trim under a pink dusk sky.',
  'Change everything else. The plate is stiff, flatly lit and has no atmosphere:',
  'that is what you are being asked to fix. Give the characters the poses and the',
  'faces described above, throw real light and real shadow, add the glow, the',
  'dust, the depth. Faceted low-poly edges become smooth, rounded, toy-like forms.',
  'If another image is attached before it, that one is the LOOK to aim for',
  '(colour, softness, charm), not content: nothing in it appears in the picture.'
]

const CLICKABLE = (a: CoverAspect): string[] => [
  'WHAT MAKES IT CLICKABLE: this is the whole job',
  'This image is seen about 250 pixels wide, for a fifth of a second, in a grid of',
  'forty other games. Everything here is about winning THAT look.',
  '· THREE PLANES OF DEPTH: the characters crisp in front, the fortress yard',
  '  softer behind them, towers and sky far away. NOTHING large in front of the',
  '  characters: no blurred block, wall or object across the bottom of the frame.',
  '· A QUIET EDGE AND A BRIGHT CENTRE: the corners darken toward deep violet.',
  `· THE ${LOGO_PLACEMENT[a.shape].corner} CORNER IS CALM: plain sky or plain ground, no face, no`,
  '  weapon, nothing that matters, across a third of the width. A logo is placed',
  '  there afterwards. Do not paint one.',
  '· THE TOP LEFT CORNER carries nothing that matters either: a portal lays its',
  '  own badge over it.',
  '· NOTHING IMPORTANT IN THE OUTER EIGHTH of the frame, on any side.'
]

const STYLE = [
  'STYLE',
  'A polished, stylised 3D-illustration look, as from a modern animated film\'s',
  'key art: chunky, rounded, toy-like forms with soft bevels; smooth gradient',
  'shading with a crisp rim light; a thin dark outline only where it helps the',
  'silhouette. Cute and a little dangerous. Not photoreal, not gritty, not pixel',
  'art, not flat vector.',
  '',
  'COLOUR',
  'The game\'s own palette and no other: lilac and deep violet, hot pink, cyan,',
  'with warm peach in the sky and one small red accent for the Commander.',
  'Saturated, glowing, synthwave dusk. No brown, no military green, no grey',
  'realism, no teal-and-orange film grade.'
]

/** A ready-to-paste prompt for one scenario at one aspect. */
export const promptForCover = (s: CoverScenario, a: CoverAspect): string => [
  ...DELIVERABLE(a),
  '',
  ...EXCLUSIONS,
  '',
  'WHAT IT IS',
  'Cover art for Chaos Machine, a casual stealth-action game: a small mech',
  'infiltrates a neon fortress, quietly at first, loudly when the alarm goes.',
  ...s.what,
  '',
  ...a.shot,
  '',
  ...CAST,
  '',
  ...READ_THE_PLATE,
  '',
  ...CLICKABLE(a),
  ...s.hook,
  '',
  ...STYLE,
  '',
  'CHECK BEFORE YOU ANSWER',
  '· Is there a single letter, digit, symbol over a head, or logo anywhere? There',
  '  must not be one.',
  '· Is there a button, a bar, a crosshair or a frame anywhere? There must not be.',
  '· Does the painting reach all four edges?',
  `· Are the ${LOGO_PLACEMENT[a.shape].corner.toLowerCase()} and the top left corners free of anything that matters?`,
  `· ${s.check}`,
  '',
  'OUTPUT',
  `One image, ${a.plate.w} x ${a.plate.h} pixels, aspect ratio exactly ${a.label},`,
  'PNG if you can, JPEG otherwise. No text, no logo, no interface, no border.'
].join('\n')

/** `art-sheets/promotion/PROMPTS-PROMOTION.md`: the hand route, and the record
 *  of what the automated one sends. One folder down from the sheets the Art
 *  Desk scans, so the desk never turns a cover into a slicing job. */
export const promotionPromptDoc = (): string => [
  '# Promotion prompts: one cover per generation',
  '',
  'Generated from `src/game/art/promotionSheet.ts`. Do not hand-edit; run',
  '`pnpm art:promotion --doc` instead.',
  '',
  'Attach `game-and-feel-reference.jpg` first and the plate named in the heading',
  'LAST (the painter takes its shape from the last image), paste the block, and',
  'save the return as',
  '`art-sheets/promotion/painted/<scenario>/cover-<aspect>.jpg`. Then',
  '`pnpm art:promotion --no-generate` cuts every size and compresses it.',
  '',
  `The scenario that ships is **${COVER_PICK}** (\`COVER_PICK\`).`,
  '',
  ...COVER_SCENARIOS.flatMap(s => COVER_ASPECTS.map(a => [
    `## ${s.id} / ${a.id}: ${s.title}, ${a.label}  (${s.id}/${plateStem(a)}.png)`,
    '',
    `Cuts ${coverFiles(a).map(f => f.file).join(', ')}.`,
    '',
    '```text',
    promptForCover(s, a),
    '```',
    ''
  ].join('\n')))
].join('\n')
