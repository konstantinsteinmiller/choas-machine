/**
 * Deep copy of plain data — the subset of `structuredClone` the game uses.
 *
 * `structuredClone` is missing on Safari < 15.4, Chrome < 98 and old Android
 * WebViews; calling it there threw a ReferenceError in the middle of a
 * mission build (Poki error reports). This copies plain objects, arrays,
 * Map, Set, Date and typed arrays; like structuredClone it drops prototypes
 * and functions are copied by reference.
 */
export const deepClone = <T>(v: T, seen = new Map<unknown, unknown>()): T => {
  if (v === null || typeof v !== 'object') return v
  if (seen.has(v)) return seen.get(v) as T
  if (v instanceof Date) return new Date(v.getTime()) as T
  if (ArrayBuffer.isView(v)) return (v as unknown as { slice: () => unknown }).slice() as T
  if (v instanceof Map) {
    const out = new Map()
    seen.set(v, out)
    for (const [k, x] of v) out.set(deepClone(k, seen), deepClone(x, seen))
    return out as T
  }
  if (v instanceof Set) {
    const out = new Set()
    seen.set(v, out)
    for (const x of v) out.add(deepClone(x, seen))
    return out as T
  }
  if (Array.isArray(v)) {
    const out: unknown[] = []
    seen.set(v, out)
    for (const x of v) out.push(deepClone(x, seen))
    return out as T
  }
  const out: Record<string, unknown> = {}
  seen.set(v, out)
  for (const k of Object.keys(v)) out[k] = deepClone((v as Record<string, unknown>)[k], seen)
  return out as T
}
