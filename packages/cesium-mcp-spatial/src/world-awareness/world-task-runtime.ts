export type WorldTaskState = 'running' | 'completed'

export interface WorldTaskContext {
  readonly taskKey: string
  readonly revision: number
  readonly signal: AbortSignal
  checkpoint(force?: boolean): Promise<void>
  throwIfAborted(): void
}

export interface RunWorldTaskInput<T> {
  taskKey: string
  revision: number
  execute(context: WorldTaskContext): Promise<T>
  signal?: AbortSignal
}

export interface WorldTaskRuntimeOptions {
  frameBudgetMs?: number
  now?: () => number
  yieldControl?: () => Promise<void>
}

export interface WorldTaskSnapshot {
  taskKey: string
  revision: number
  state: WorldTaskState
  startedAtMs: number
  completedAtMs?: number
  consumerCount: number
}

interface WorldTaskEntry<T> {
  taskKey: string
  revision: number
  state: WorldTaskState
  startedAtMs: number
  completedAtMs?: number
  consumerCount: number
  controller: AbortController
  promise: Promise<T>
}

const DEFAULT_FRAME_BUDGET_MS = 8

export class WorldTaskSupersededError extends Error {
  readonly taskKey: string
  readonly taskRevision: number
  readonly currentRevision: number

  constructor(taskKey: string, taskRevision: number, currentRevision: number) {
    super(
      `World task ${taskKey} revision ${taskRevision} was superseded by revision ${currentRevision}`,
    )
    this.name = 'WorldTaskSupersededError'
    this.taskKey = taskKey
    this.taskRevision = taskRevision
    this.currentRevision = currentRevision
  }
}

/**
 * Coordinates revision-bound background work without coupling the core to a
 * renderer or domain. Callers keep rendering from the latest committed state;
 * expensive jobs cooperatively yield through context.checkpoint().
 */
export class WorldTaskRuntime {
  private readonly frameBudgetMs: number
  private readonly now: () => number
  private readonly yieldControl: () => Promise<void>
  private readonly tasks = new Map<string, WorldTaskEntry<unknown>>()

  constructor(options: WorldTaskRuntimeOptions = {}) {
    const frameBudgetMs = options.frameBudgetMs ?? DEFAULT_FRAME_BUDGET_MS
    if (!Number.isFinite(frameBudgetMs) || frameBudgetMs <= 0) {
      throw new RangeError('World task frame budget must be greater than zero')
    }
    this.frameBudgetMs = frameBudgetMs
    this.now = options.now ?? defaultNow
    this.yieldControl = options.yieldControl ?? defaultYieldControl
  }

  run<T>(input: RunWorldTaskInput<T>): Promise<T> {
    validateTaskInput(input)
    if (input.signal?.aborted) return Promise.reject(abortReason(input.signal))

    const existing = this.tasks.get(input.taskKey)
    if (existing) {
      if (input.revision < existing.revision) {
        return Promise.reject(new WorldTaskSupersededError(
          input.taskKey,
          input.revision,
          existing.revision,
        ))
      }
      if (input.revision === existing.revision) {
        existing.consumerCount += 1
        return waitForConsumer(existing.promise as Promise<T>, input.signal)
      }
      this.removeTask(existing, new WorldTaskSupersededError(
        input.taskKey,
        existing.revision,
        input.revision,
      ))
    }

    const controller = new AbortController()
    const startedAtMs = this.now()
    let sliceStartedAtMs = startedAtMs
    const context: WorldTaskContext = {
      taskKey: input.taskKey,
      revision: input.revision,
      signal: controller.signal,
      checkpoint: async (force = false) => {
        throwIfAborted(controller.signal)
        const elapsedMs = this.now() - sliceStartedAtMs
        if (!force && elapsedMs < this.frameBudgetMs) return
        await this.yieldControl()
        sliceStartedAtMs = this.now()
        throwIfAborted(controller.signal)
      },
      throwIfAborted: () => throwIfAborted(controller.signal),
    }
    const promise = Promise.resolve()
      .then(async () => {
        await context.checkpoint(true)
        const value = await input.execute(context)
        context.throwIfAborted()
        if (this.tasks.get(input.taskKey)?.controller !== controller) {
          const currentRevision = this.tasks.get(input.taskKey)?.revision ?? input.revision + 1
          throw new WorldTaskSupersededError(input.taskKey, input.revision, currentRevision)
        }
        return value
      })
      .then(
        (value) => {
          const current = this.tasks.get(input.taskKey)
          if (current?.controller === controller) {
            current.state = 'completed'
            current.completedAtMs = this.now()
          }
          return value
        },
        (error: unknown) => {
          if (this.tasks.get(input.taskKey)?.controller === controller) {
            this.tasks.delete(input.taskKey)
          }
          throw error
        },
      )
    const entry: WorldTaskEntry<T> = {
      taskKey: input.taskKey,
      revision: input.revision,
      state: 'running',
      startedAtMs,
      consumerCount: 1,
      controller,
      promise,
    }
    this.tasks.set(input.taskKey, entry as WorldTaskEntry<unknown>)
    return waitForConsumer(promise, input.signal)
  }

  invalidate(taskKey: string, minimumRevision?: number): boolean {
    const entry = this.tasks.get(taskKey)
    if (!entry) return false
    if (minimumRevision !== undefined && entry.revision >= minimumRevision) return false
    const nextRevision = minimumRevision ?? entry.revision + 1
    this.removeTask(entry, new WorldTaskSupersededError(
      taskKey,
      entry.revision,
      nextRevision,
    ))
    return true
  }

  clear(reason: Error = new Error('World task runtime cleared')): void {
    for (const entry of this.tasks.values()) entry.controller.abort(reason)
    this.tasks.clear()
  }

  snapshot(): WorldTaskSnapshot[] {
    return [...this.tasks.values()]
      .map(entry => ({
        taskKey: entry.taskKey,
        revision: entry.revision,
        state: entry.state,
        startedAtMs: entry.startedAtMs,
        ...(entry.completedAtMs !== undefined ? { completedAtMs: entry.completedAtMs } : {}),
        consumerCount: entry.consumerCount,
      }))
      .sort((left, right) => left.taskKey.localeCompare(right.taskKey))
  }

  private removeTask(entry: WorldTaskEntry<unknown>, reason: Error): void {
    entry.controller.abort(reason)
    if (this.tasks.get(entry.taskKey) === entry) this.tasks.delete(entry.taskKey)
  }
}

function validateTaskInput<T>(input: RunWorldTaskInput<T>): void {
  if (!input.taskKey.trim()) throw new Error('World task key is required')
  if (!Number.isInteger(input.revision) || input.revision < 0) {
    throw new RangeError('World task revision must be a non-negative integer')
  }
}

function waitForConsumer<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort)
      reject(abortReason(signal))
    }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal)
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('World task was aborted')
}

function defaultNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function defaultYieldControl(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise(resolve => requestAnimationFrame(() => resolve()))
  }
  return new Promise(resolve => setTimeout(resolve, 0))
}
