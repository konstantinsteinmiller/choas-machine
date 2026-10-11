/**
 * ─── Where an attention arrow comes from ─────────────────────────────────────
 *
 * Shared by the training's door nudge (`TrainingNudge`) and the new-button
 * arrow (`RevealArrow`). The arrow comes from the middle of the screen if that
 * way is clear, else the nearest angle that is: the whole arrow on screen, and
 * not lying across any other control (the thumb cluster is packed). Its tip
 * stops on the button's rim.
 */

export interface ArrowAim { left: string; top: string; '--angle': string }

/** The arrow's drawn width at this viewport (`AttentionArrow`'s `--w`). */
export const arrowWidth = (): number => Math.min(96, Math.max(57.6, 0.16 * Math.min(window.innerWidth, window.innerHeight)))

/** The other controls an arrow to `exceptId` must not lie across. */
export const otherControls = (exceptId: string | undefined): DOMRect[] =>
  [...document.querySelectorAll('[data-testid^="btn-"], [data-testid="look-stick"]')]
    .filter(e => e.getAttribute('data-testid') !== exceptId)
    .map(e => e.getBoundingClientRect())
    .filter(r => r.width > 0)

export const aimArrow = (r: DOMRect, others: DOMRect[]): ArrowAim => {
  const W = window.innerWidth
  const H = window.innerHeight
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const base = Math.atan2(H / 2 - cy, W / 2 - cx)
  const rim = Math.min(r.width, r.height) / 2 + 4
  const w = arrowWidth()
  const len = w * 1.33 + 16
  const clear = (a: number): boolean => {
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const px = cx + ux * (rim + len * t)
      const py = cy + uy * (rim + len * t)
      if (px < w / 2 || px > W - w / 2 || py < w / 2 || py > H - w / 2) return false
      if (t > 0.05 && others.some(o => px > o.left - w * 0.3 && px < o.right + w * 0.3 && py > o.top - w * 0.3 && py < o.bottom + w * 0.3)) return false
    }
    return true
  }
  let from = base
  for (const d of [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 120, -120]) {
    const a = base + (d * Math.PI) / 180
    if (clear(a)) { from = a; break }
  }
  // The arrow is drawn pointing down (+y); turned clockwise by θ it points along -from.
  const vx = -Math.cos(from)
  const vy = -Math.sin(from)
  return { left: `${cx - vx * rim}px`, top: `${cy - vy * rim}px`, '--angle': `${Math.atan2(-vx, vy)}rad` }
}
