import { CELL, VOID, WALK, cellHeight, findPath, heightAt, toCell, type MoveRule } from './grid'
import type { Fortress } from './fortress'

/**
 * Everything that must hold for a fortress to be playable, checked without a
 * renderer: a layout mistake (a patrol that cannot reach its next stop, a
 * ladder up nothing, a landing pad in the void) is a list of sentences here
 * instead of a guard walking into a wall in a playtest.
 */

/** The mech drops off anything; it climbs only by stairs, ladders and cables. */
const MECH: MoveRule = { up: WALK.up, down: 100 }

export const validateFortress = (f: Fortress): string[] => {
  const g = f.grid
  const problems: string[] = []
  const at = (x: number, z: number): string => `${toCell(x)},${toCell(z)}`

  if (heightAt(g, f.insert.x, f.insert.z) === VOID) problems.push('the insertion point is off the island')
  if (heightAt(g, f.extract.x, f.extract.z) === VOID) problems.push('the extraction point is off the island')

  for (const [i, p] of f.posts.entries()) {
    const name = `${p.kind} #${i} at ${at(p.x, p.z)}`
    if (heightAt(g, p.x, p.z) === VOID) {
      problems.push(`${name} stands off the island`)
      continue
    }
    if (p.kind === 'drone') {
      if (p.altitude < 3) problems.push(`${name} flies lower than a wall`)
      continue
    }
    // A walker's loop: every stop reachable from the one before, and back.
    const stops = p.route
    for (let k = 0; k < stops.length; k++) {
      const a = stops[k]!
      const b = stops[(k + 1) % stops.length]!
      if (heightAt(g, b.x, b.z) === VOID) {
        problems.push(`${name}: stop ${at(b.x, b.z)} is off the island`)
        continue
      }
      if (findPath(g, toCell(a.x), toCell(a.z), toCell(b.x), toCell(b.z)).length === 0) {
        problems.push(`${name}: no walkable way from ${at(a.x, a.z)} to ${at(b.x, b.z)}`)
      }
    }
  }

  for (const l of g.ladders) {
    const foot = cellHeight(g, l.cx, l.cz)
    const top = cellHeight(g, l.cx + l.dx, l.cz + l.dz)
    if (foot === VOID || top === VOID || top - foot < 1) problems.push(`ladder at ${l.cx},${l.cz} climbs nothing`)
  }
  for (const c of g.cables) {
    if (cellHeight(g, c.ax, c.az) === VOID || cellHeight(g, c.bx, c.bz) === VOID) {
      problems.push(`cable ${c.ax},${c.az} → ${c.bx},${c.bz} hangs off the island`)
    }
    if (Math.hypot(c.bx - c.ax, c.bz - c.az) * CELL > 60) problems.push(`cable ${c.ax},${c.az} → ${c.bx},${c.bz} is over 60 m`)
  }

  // The mech can get from where it lands to where it leaves. It may drop off
  // ledges; climbing back up is what ladders are for, and a base that needs
  // one to be finished is a design choice the layout must make explicitly.
  if (problems.length === 0 && !reachable(f, MECH)) {
    problems.push('the extraction point cannot be reached from the insertion point')
  }
  return problems
}

/**
 * Flood from the insertion cell under `rule`, also riding ladders (both ways)
 * and cables (both ways); true when the extraction cell is reached.
 */
const reachable = (f: Fortress, rule: MoveRule): boolean => {
  const g = f.grid
  const start = toCell(f.insert.z) * g.w + toCell(f.insert.x)
  const goal = toCell(f.extract.z) * g.w + toCell(f.extract.x)
  const seen = new Uint8Array(g.w * g.d)
  const queue = [start]
  seen[start] = 1
  const visit = (cx: number, cz: number): void => {
    if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.d) return
    const i = cz * g.w + cx
    if (seen[i] || g.h[i] === VOID) return
    seen[i] = 1
    queue.push(i)
  }
  while (queue.length > 0) {
    const cur = queue.pop()!
    if (cur === goal) return true
    const cx = cur % g.w
    const cz = Math.floor(cur / g.w)
    const h = g.h[cur]!
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nh = cellHeight(g, cx + dx, cz + dz)
      if (nh !== VOID && nh - h <= rule.up + 1e-6 && h - nh <= rule.down + 1e-6) visit(cx + dx, cz + dz)
    }
    for (const l of g.ladders) {
      if (l.cx === cx && l.cz === cz) visit(cx + l.dx, cz + l.dz)
      if (l.cx + l.dx === cx && l.cz + l.dz === cz) visit(l.cx, l.cz)
    }
    for (const c of g.cables) {
      if (c.ax === cx && c.az === cz) visit(c.bx, c.bz)
      if (c.bx === cx && c.bz === cz) visit(c.ax, c.az)
    }
  }
  return false
}
