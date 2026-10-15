import { describe, it, expect } from 'vitest'
import { describeError, withRetry } from '@/utils/retry'

describe('withRetry', () => {
  it('retries a dropped load and returns the later success', async () => {
    let n = 0
    const v = await withRetry(async () => { if (++n < 3) throw new TypeError('NetworkError'); return 'ok' }, 3, 1)
    expect(v).toBe('ok')
    expect(n).toBe(3)
  })
  it('gives up after the bound and rethrows', async () => {
    let n = 0
    await expect(withRetry(async () => { n++; throw new TypeError('NetworkError') }, 2, 1)).rejects.toThrow('NetworkError')
    expect(n).toBe(2)
  })
  it('describeError keeps name and message readable', () => {
    expect(describeError(new ReferenceError('x'))).toMatchObject({ name: 'ReferenceError', message: 'x' })
  })
})
