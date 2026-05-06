export interface TimingResult {
  start: number
  end: number
  elapsedMs: number
}

export async function timer<T>(fn: () => T | Promise<T>): Promise<{ elapsedMs: number; result: T }> {
  const start = performance.now()
  const result = await fn()
  const elapsedMs = performance.now() - start
  return { elapsedMs, result }
}

export function timerSync<T>(fn: () => T): { elapsedMs: number; result: T } {
  const start = performance.now()
  const result = fn()
  const elapsedMs = performance.now() - start
  return { elapsedMs, result }
}
