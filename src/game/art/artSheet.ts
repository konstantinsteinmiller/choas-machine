/**
 * ─── Art manifest: what in the game a painting can replace ───────────────────
 *
 * The game is built from code: meshes in `models/`, colours in `palette.ts`.
 * What it takes as a drop-in BITMAP is short, and this is the whole list. Each
 * entry names the file the game looks for (`assets/overrides.ts` lists the
 * folder at build time, so a file that is not there is never requested) and
 * owns the prompt it is painted from.
 *
 *   pnpm art:prompts               writes art-sheets/PROMPTS-textures.md and
 *                                  art-sheets/sheet-index.json
 *   pnpm art:prompts --references  also shoots each reference from the game's
 *                                  own procedural drawing (needs a browser)
 *   pnpm art:desk                  the desk: copy a prompt, drop the return
 *   pnpm slice-sheets              cuts every painting in art-sheets/painted/
 *                                  into its drop-in file
 *
 * Covers and store art are a separate manifest: `promotionSheet.ts`.
 *
 * Importable from plain Node (no `.vue`, no `import.meta.env`): the tools read
 * it through `tools/ts-resolve.mjs`.
 */

export interface ArtSheet {
  /** `texture-floor`: the reference's and the painting's file stem. */
  stem: string
  title: string
  /** Path under `public/` the game picks the drop-in up from. */
  target: string
  /** The drop-in's size in pixels (square). */
  size: number
  /** WHAT IT IS, in the prompt's words. */
  what: string[]
}

export const ART_SHEETS: ArtSheet[] = [
  {
    stem: 'texture-floor',
    title: 'Floor detail map',
    target: 'images/textures/floor.webp',
    size: 512,
    what: [
      'ONE floor plate of a futuristic fortress, seen from directly above: a square',
      'metal plate with a bevelled rim, a rounded inset panel in the middle and a',
      'rivet in each corner. It is laid edge to edge over the whole ground, one copy',
      'per two-metre square, so its four edges must meet their own opposite edges',
      'without a visible seam.'
    ]
  },
  {
    stem: 'texture-wall',
    title: 'Wall detail map',
    target: 'images/textures/wall.webp',
    size: 512,
    what: [
      'ONE wall panel of a futuristic fortress, seen flat from the front: a seam down',
      'the left edge, a horizontal band a little above the middle, a small vent grille',
      'in the upper third and a rounded panel in the lower third. It repeats side by',
      'side along every wall, so its left and right edges must meet without a seam.',
      'The top of the image is the top of the wall.'
    ]
  }
]

/** The reference PNG a sheet is painted from, under `art-sheets/`. */
export const referenceFile = (s: ArtSheet): string => `${s.stem}.png`

const promptFor = (s: ArtSheet): string => [
  'WHAT COMES BACK',
  `ONE square greyscale image, ${s.size} x ${s.size} pixels, filled edge to edge:`,
  'a tileable surface detail map. One image and nothing else: not a sheet of',
  'options, not a 3D render of a room, not a material ball, no border.',
  '',
  'WHAT IS NOT IN IT',
  '· NO COLOUR. Greyscale only. The game tints this map itself, per area, so any',
  '  hue painted here fights that tint.',
  '· No text, no numbers, no symbols, no logos, no warning stripes with letters.',
  '· No perspective, no cast shadow from outside the tile, no lighting from one',
  '  side: light it evenly, as if from straight in front.',
  '',
  'WHAT IT IS',
  ...s.what,
  '',
  'READ THE ATTACHED REFERENCE',
  'The attached image is the map the game draws today, at the same layout. Keep',
  'its LAYOUT exactly: what sits where, and how big. Improve its FINISH: soft',
  'bevels, fine panel lines, a few small scuffs and bolts, subtle brushed-metal',
  'grain. Chunky and toy-like, not gritty: this is a cute low-poly world.',
  '',
  'VALUES',
  'Mostly light: between 65 % and 95 % white, with the seams and recesses as the',
  'only darker lines (never below 40 % white). The map is MULTIPLIED over a',
  'coloured surface, so a dark map makes a dark, muddy fortress.',
  '',
  'CHECK BEFORE YOU ANSWER',
  '· Is it greyscale, with no tint at all?',
  '· Would it tile: do the opposite edges match?',
  '· Is it evenly lit, with no letters or numbers anywhere?',
  '',
  'OUTPUT',
  `One image, ${s.size} x ${s.size} pixels, aspect ratio exactly 1:1, PNG if you`,
  'can, JPEG otherwise.'
].join('\n')

/**
 * The prompt documents, by file name. The heading shape is the Art Desk's:
 * `## <title>  (<reference>.png → <target>)`, one fenced block under each.
 */
export const promptDocs = (): Record<string, string> => ({
  'PROMPTS-textures.md': [
    '# Texture prompts: one detail map per generation',
    '',
    'Generated from `src/game/art/artSheet.ts`. Do not hand-edit; run',
    '`pnpm art:prompts` instead.',
    '',
    'Attach the reference named in the heading, paste the block, save the return',
    'in `art-sheets/painted/` under the reference\'s name, and run',
    '`pnpm slice-sheets`. `pnpm art:desk` does all of that from one page.',
    '',
    ...ART_SHEETS.map(s => [
      `## ${s.title}  (${referenceFile(s)} → ${s.target})`,
      '',
      '```text',
      promptFor(s),
      '```',
      ''
    ].join('\n'))
  ].join('\n')
})

/** `art-sheets/sheet-index.json`: which painting becomes which file. */
export const sheetIndex = (): { sheets: Array<{ files: { clean: string }; cells: Array<{ id: string; label: string; target: string; size: number }> }> } => ({
  sheets: ART_SHEETS.map(s => ({
    files: { clean: referenceFile(s) },
    cells: [{ id: s.stem, label: s.title, target: s.target, size: s.size }]
  }))
})
