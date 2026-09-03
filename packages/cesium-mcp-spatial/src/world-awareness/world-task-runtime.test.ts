import { describe, expect, it } from 'vitest'

import {
  WorldTaskRuntime,
  WorldTaskSupersededError,
} from './world-task-runtime.js'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe('WorldTaskRuntime', () => {
  it('shares in-flight and completed work for the same task revision', async () => {
    const runtime = new WorldTaskRuntime({ yieldControl: async () => {} })
    const result = deferred<string>()
    let executionCount = 0
    const execute = async (): Promise<string> => {
      executionCount += 1
      return result.promise
    }

    const first = runtime.run({ taskKey: 'corridor', revision: 4, execute })
    const second = runtime.run({ taskKey: 'corridor', revision: 4, execute })
    result.resolve('safe-left')

    await expect(Promise.all([first, second])).resolves.toEqual(['safe-left', 'safe-left'])
    await expect(runtime.run({ taskKey: 'corridor', revision: 4, execute }))
      .resolves.toBe('safe-left')
    expect(executionCount).toBe(1)
    expect(runtime.snapshot()).toEqual([
      expect.objectContaining({
        taskKey: 'corridor',
        revision: 4,
        state: 'completed',
        consumerCount: 3,
      }),
    ])
  })

  it('supersedes an older revision and prevents its late result from committing', async () => {
    const runtime = new WorldTaskRuntime({ yieldControl: async () => {} })
    const oldResult = deferred<string>()
    const oldTask = runtime.run({
      taskKey: 'corridor',
      revision: 1,
      execute: async () => oldResult.promise,
    })
    const oldAssertion = expect(oldTask).rejects.toBeInstanceOf(WorldTaskSupersededError)
    const currentTask = runtime.run({
      taskKey: 'corridor',
      revision: 2,
      execute: async () => 'current',
    })
    oldResult.resolve('stale')

    await oldAssertion
    await expect(currentTask).resolves.toBe('current')
    expect(runtime.snapshot()).toEqual([
      expect.objectContaining({ taskKey: 'corridor', revision: 2, state: 'completed' }),
    ])
  })

  it('lets one consumer stop waiting without cancelling shared work', async () => {
    const runtime = new WorldTaskRuntime({ yieldControl: async () => {} })
    const result = deferred<string>()
    const controller = new AbortController()
    const first = runtime.run({
      taskKey: 'observer-frame',
      revision: 3,
      signal: controller.signal,
      execute: async () => result.promise,
    })
    const firstAssertion = expect(first).rejects.toThrow('consumer stopped')
    const second = runtime.run({
      taskKey: 'observer-frame',
      revision: 3,
      execute: async () => result.promise,
    })

    controller.abort(new Error('consumer stopped'))
    result.resolve('frame-ready')

    await firstAssertion
    await expect(second).resolves.toBe('frame-ready')
    expect(runtime.snapshot()[0]?.state).toBe('completed')
  })

  it('yields only after the configured cooperative frame budget is spent', async () => {
    let now = 0
    let yieldCount = 0
    const runtime = new WorldTaskRuntime({
      frameBudgetMs: 8,
      now: () => now,
      yieldControl: async () => {
        yieldCount += 1
      },
    })

    const count = await runtime.run({
      taskKey: 'geometry',
      revision: 1,
      execute: async (context) => {
        await context.checkpoint()
        now = 5
        await context.checkpoint()
        now = 9
        await context.checkpoint()
        return yieldCount
      },
    })

    expect(count).toBe(2)
  })

  it('invalidates cached work below a new world revision', async () => {
    const runtime = new WorldTaskRuntime({ yieldControl: async () => {} })
    await runtime.run({
      taskKey: 'world-snapshot',
      revision: 7,
      execute: async () => 'snapshot-7',
    })

    expect(runtime.invalidate('world-snapshot', 7)).toBe(false)
    expect(runtime.invalidate('world-snapshot', 8)).toBe(true)
    expect(runtime.snapshot()).toEqual([])
  })

  it('validates task identity and frame budget', async () => {
    expect(() => new WorldTaskRuntime({ frameBudgetMs: 0 })).toThrow('greater than zero')
    const runtime = new WorldTaskRuntime({ yieldControl: async () => {} })
    expect(() => runtime.run({
      taskKey: '',
      revision: 0,
      execute: async () => undefined,
    })).toThrow('key is required')
    expect(() => runtime.run({
      taskKey: 'invalid-revision',
      revision: -1,
      execute: async () => undefined,
    })).toThrow('non-negative integer')
  })
})
