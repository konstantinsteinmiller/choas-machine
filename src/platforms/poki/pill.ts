// ─── Poki's mobile pill: keep it off our HUD ─────────────────────────────────
//
// On mobile, poki.com draws its navigation "pill" over the game frame's LEFT
// edge. Measured on a live game page (2026-09-26, phone emulation, portrait and
// landscape alike): a 62×46 CSS-px tab at x = 0, 24 px from the top — Poki's
// default `movePill(0, 24)`. Poki's docs give only its size and the vertical
// control: `movePill(topPercent, topPx)`, 0 ≤ topPercent ≤ 50, and "you can't
// move the pill lower than 50% of the game area". The integrate-poki skill
// (Pitfall 10): if your top HUD sits there, move it.
//
// Ours does. During a mission the HP / energy bars sit exactly under the
// default spot, and in portrait the objective card sits right below them. So
// the pill moves to the first free slot down the left edge, below whatever it
// would cover. With a modal up there is no free slot (the frame spans the
// height), and in the hub nothing we draw is there — both keep Poki's default,
// which is where it covers least.
//
// Poki-only: imported by `pokiPlugin.ts`, which every other build swaps for
// its stub.

export const PILL = { width: 62, height: 46, defaultTop: 24, gap: 8, maxTopFraction: 0.5 } as const

export interface Box { left: number, top: number, right: number, bottom: number }

/** What the pill must not cover: the mission HUD's unit frame (top left,
 *  #145), and any open modal frame. Class names from UnitFrame / FModal. */
export const PILL_AVOID_SELECTOR = '.hud-layer .unit-frame, .f-modal__frame'

const inStrip = (b: Box): boolean => b.left < PILL.width + PILL.gap && b.right > 0 && b.bottom > b.top
const clashes = (top: number, b: Box): boolean =>
  b.top < top + PILL.height + PILL.gap && b.bottom + PILL.gap > top

/**
 * Where the pill's top goes, in CSS px from the top of the game area: Poki's
 * default unless something we draw is in its way, else the first slot just
 * below a blocker that is clear of all of them — never past Poki's own limit
 * (half the game area). No such slot: the default. Pure.
 */
export const pillTopPx = (avoid: readonly Box[], viewportHeight: number): number => {
  const strip = avoid.filter(inStrip)
  const limit = Math.floor(viewportHeight * PILL.maxTopFraction)
  const candidates = [PILL.defaultTop, ...strip.map((b) => Math.ceil(b.bottom + PILL.gap))]
    .filter((t) => t >= PILL.defaultTop && t <= limit)
    .sort((a, b) => a - b)
  for (const top of candidates) {
    if (!strip.some((b) => clashes(top, b))) return top
  }
  return PILL.defaultTop
}

/**
 * Keep the pill placed while the screen changes under it: once now, on every
 * resize / rotation, and on a slow tick (screens and modals come and go without
 * a resize). Calls `move` only when the answer changes. Returns a stop function.
 */
export const startPillPlacement = (
  move: (topPercent: number, topPx: number) => void,
  win: Window = window,
  everyMs = 750
): (() => void) => {
  let last: number | null = null
  const place = (): void => {
    let boxes: Box[]
    try {
      boxes = [...win.document.querySelectorAll(PILL_AVOID_SELECTOR)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
    } catch {
      return
    }
    const top = pillTopPx(boxes, win.innerHeight)
    if (top === last) return
    last = top
    move(0, top)
  }
  place()
  const timer = win.setInterval(place, everyMs)
  win.addEventListener('resize', place)
  win.addEventListener('orientationchange', place)
  return () => {
    win.clearInterval(timer)
    win.removeEventListener('resize', place)
    win.removeEventListener('orientationchange', place)
  }
}
