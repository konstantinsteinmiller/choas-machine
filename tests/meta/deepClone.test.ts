import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { deepClone } from '@/utils/deepClone'

describe('deepClone', () => {
  it('copies nested data, Maps, Sets, Dates and typed arrays without sharing', () => {
    const src = { a: [1, { b: 2 }], m: new Map([['k', { x: 1 }]]), s: new Set([3]), d: new Date(5), f: new Float32Array([1, 2]) }
    const c = deepClone(src)
    expect(c).toEqual(src)
    c.a.push(9); (c.a[1] as { b: number }).b = 7; c.m.get('k')!.x = 4; c.s.add(8); c.f[0] = 0
    expect(src.a).toHaveLength(2)
    expect((src.a[1] as { b: number }).b).toBe(2)
    expect(src.m.get('k')!.x).toBe(1)
    expect(src.s.has(8)).toBe(false)
    expect(src.f[0]).toBe(1)
    expect(c.d).not.toBe(src.d)
  })
  it('keeps cycles', () => {
    const o: { self?: unknown } = {}
    o.self = o
    const c = deepClone(o)
    expect(c.self).toBe(c)
  })
})

// structuredClone is missing on Safari < 15.4 / Chrome < 98 (Poki error reports).
describe('no structuredClone in src', () => {
  it('src never calls structuredClone', () => {
    const hits: string[] = []
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|vue|js)$/.test(f) && /\bstructuredClone\s*\(/.test(readFileSync(p, 'utf8'))) hits.push(p)
      }
    }
    walk(join(__dirname, '../../src'))
    expect(hits).toEqual([])
  })
})
