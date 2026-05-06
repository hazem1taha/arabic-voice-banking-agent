import { describe, it, expect } from '@jest/globals'
import { timer } from '../../src/lib/timer.js'

describe('timer', () => {
  it('measures async elapsed time', async () => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const { elapsedMs, result } = await timer(async () => {
      await delay(50)
      return 'done'
    })
    expect(result).toBe('done')
    expect(elapsedMs).toBeGreaterThanOrEqual(45)
  })

  it('measures sync elapsed time', () => {
    const { elapsedMs, result } = timer(() => {
      let sum = 0
      for (let i = 0; i < 1000; i++) sum += i
      return sum
    })
    expect(result).toBe(499500)
    expect(elapsedMs).toBeGreaterThanOrEqual(0)
  })
})
