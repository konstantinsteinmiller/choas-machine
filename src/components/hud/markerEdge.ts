/**
 * ─── Where an objective marker sits on screen ────────────────────────────────
 *
 * On screen, on the thing itself. Off it (or too near the edge, where the
 * HUD's corners are), it slides to the edge along the line from the screen's
 * centre toward the thing, and its arrow points that way. Behind the camera,
 * it goes to the side to turn to, at mid-height, the arrow pointing left or
 * right: it used to sink to the bottom edge and point down, which said nothing
 * about which way to turn (a playtester stood lost in the rocket room).
 */

export interface MarkerSpot { x: number; y: number; edge: boolean; angle: number }

/**
 * The marker's place for a projected point (`px`, `py`: 0 … 1 across the
 * screen; `behind` the camera), on a `w` × `h` host. Written into `out`
 * (the HUD ticker runs this every frame: no allocation).
 */
export const markerSpot = (px: number, py: number, behind: boolean, w: number, h: number, out: MarkerSpot): MarkerSpot => {
  // Keep it clear of the HUD's corners.
  const m = Math.min(w, h) * 0.13
  let x = px * w
  let y = py * h
  out.edge = behind || x < m || x > w - m || y < m || y > h - m
  if (out.edge) {
    let dx = x - w / 2
    let dy = y - h / 2
    // A point behind projects mirrored: the side it is really on is the other one.
    if (behind) { dx = (dx > 0 ? -1 : 1) * w; dy = 0 }
    const k = Math.min((w / 2 - m) / Math.max(1e-3, Math.abs(dx)), (h / 2 - m) / Math.max(1e-3, Math.abs(dy)))
    x = w / 2 + dx * k
    y = h / 2 + dy * k
    out.angle = Math.atan2(dy, dx)
  }
  out.x = x
  out.y = y
  return out
}
