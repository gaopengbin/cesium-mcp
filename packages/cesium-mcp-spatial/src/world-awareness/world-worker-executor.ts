export interface WorldWorkerRequestMessage<Input> {
  type: 'world-task-request'
  requestId: string
  input: Input
}

export interface WorldWorkerSuccessMessage<Output> {
  type: 'world-task-result'
  requestId: string
  ok: true
  output: Output
}

export interface WorldWorkerFailureMessage {
  type: 'world-task-result'
  requestId: string
  ok: false
  error: {
    name: string
    message: string
    stack?: string
  }
}

export type WorldWorkerResultMessage<Output> =
  | WorldWorkerSuccessMessage<Output>
  | WorldWorkerFailureMessage

export interface WorldWorkerEndpoint {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
  terminate(): void
}

export interface WorldWorkerExecutorOptions {
  createWorker(): WorldWorkerEndpoint
  createRequestId?: () => string
}

export interface RunWorldWorkerInputOptions {
  signal?: AbortSignal
  transfer?: Transferable[]
}

interface PendingWorldWorkerTask<Output> {
  resolve(output: Output): void
  reject(error: Error): void
  signal?: AbortSignal
  abort?: () => void
}

/**
 * Executes serializable world tasks in an owned Worker. Aborting one request
 * restarts the Worker because third-party decoders may not support cooperative
 * cancellation; all other pending requests are rejected rather than allowed to
 * commit against a stale world revision.
 */
export class WorldWorkerExecutor<Input, Output> {
  private readonly createWorker: () => WorldWorkerEndpoint
  private readonly createRequestId: () => string
  private readonly pending = new Map<string, PendingWorldWorkerTask<Output>>()
  private worker?: WorldWorkerEndpoint
  private disposed = false

  constructor(options: WorldWorkerExecutorOptions) {
    this.createWorker = options.createWorker
    this.createRequestId = options.createRequestId ?? defaultRequestId
  }

  run(input: Input, options: RunWorldWorkerInputOptions = {}): Promise<Output> {
    if (this.disposed) return Promise.reject(new Error('World Worker executor is disposed'))
    if (options.signal?.aborted) return Promise.reject(abortReason(options.signal))

    const requestId = this.createRequestId()
    if (!requestId) return Promise.reject(new Error('World Worker request ID is required'))
    if (this.pending.has(requestId)) {
      return Promise.reject(new Error(`Duplicate World Worker request ID: ${requestId}`))
    }

    const worker = this.ensureWorker()
    return new Promise<Output>((resolve, reject) => {
      const task: PendingWorldWorkerTask<Output> = {
        resolve,
        reject,
        ...(options.signal ? { signal: options.signal } : {}),
      }
      if (options.signal) {
        task.abort = () => this.restart(abortReason(options.signal!))
        options.signal.addEventListener('abort', task.abort, { once: true })
      }
      this.pending.set(requestId, task)
      const message: WorldWorkerRequestMessage<Input> = {
        type: 'world-task-request',
        requestId,
        input,
      }
      try {
        worker.postMessage(message, options.transfer)
      } catch (error) {
        this.restart(asError(error, 'World Worker postMessage failed'))
      }
    })
  }

  get pendingCount(): number {
    return this.pending.size
  }

  dispose(reason: Error = new Error('World Worker executor disposed')): void {
    if (this.disposed) return
    this.disposed = true
    this.stopWorker(reason)
  }

  private ensureWorker(): WorldWorkerEndpoint {
    if (this.worker) return this.worker
    const worker = this.createWorker()
    worker.onmessage = event => {
      if (this.worker !== worker) return
      this.handleMessage(event.data)
    }
    worker.onmessageerror = () => {
      if (this.worker === worker) this.restart(new Error('World Worker message could not be decoded'))
    }
    worker.onerror = event => {
      if (this.worker !== worker) return
      event.preventDefault?.()
      const location = event.filename
        ? ` (${event.filename}:${event.lineno}:${event.colno})`
        : ''
      this.restart(new Error(`${event.message || 'World Worker execution failed'}${location}`))
    }
    this.worker = worker
    return worker
  }

  private handleMessage(value: unknown): void {
    if (!isWorldWorkerResultMessage<Output>(value)) return
    const task = this.pending.get(value.requestId)
    if (!task) return
    this.pending.delete(value.requestId)
    removeAbortListener(task)
    if (value.ok) task.resolve(value.output)
    else task.reject(deserializeWorkerError(value.error))
  }

  private restart(reason: Error): void {
    this.stopWorker(reason)
  }

  private stopWorker(reason: Error): void {
    const worker = this.worker
    this.worker = undefined
    if (worker) {
      worker.onmessage = null
      worker.onmessageerror = null
      worker.onerror = null
      worker.terminate()
    }
    for (const task of this.pending.values()) {
      removeAbortListener(task)
      task.reject(reason)
    }
    this.pending.clear()
  }
}

export async function executeWorldWorkerMessage<Input, Output>(
  value: unknown,
  execute: (input: Input) => Promise<Output>,
): Promise<WorldWorkerResultMessage<Output> | undefined> {
  if (!isWorldWorkerRequestMessage<Input>(value)) return undefined
  try {
    return {
      type: 'world-task-result',
      requestId: value.requestId,
      ok: true,
      output: await execute(value.input),
    }
  } catch (error) {
    return {
      type: 'world-task-result',
      requestId: value.requestId,
      ok: false,
      error: serializeWorkerError(error),
    }
  }
}

function isWorldWorkerRequestMessage<Input>(value: unknown): value is WorldWorkerRequestMessage<Input> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WorldWorkerRequestMessage<Input>>
  return candidate.type === 'world-task-request'
    && typeof candidate.requestId === 'string'
    && candidate.requestId.length > 0
    && 'input' in candidate
}

function isWorldWorkerResultMessage<Output>(value: unknown): value is WorldWorkerResultMessage<Output> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as {
    type?: unknown
    requestId?: unknown
    ok?: unknown
    output?: unknown
    error?: Partial<WorldWorkerFailureMessage['error']>
  }
  if (
    candidate.type !== 'world-task-result'
    || typeof candidate.requestId !== 'string'
    || typeof candidate.ok !== 'boolean'
  ) return false
  if (candidate.ok) return 'output' in candidate
  return Boolean(candidate.error)
    && typeof candidate.error?.name === 'string'
    && typeof candidate.error.message === 'string'
}

function serializeWorkerError(error: unknown): WorldWorkerFailureMessage['error'] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    }
  }
  return {
    name: 'Error',
    message: String(error),
  }
}

function deserializeWorkerError(error: WorldWorkerFailureMessage['error']): Error {
  const result = new Error(error.message)
  result.name = error.name
  if (error.stack) result.stack = error.stack
  return result
}

function removeAbortListener<Output>(task: PendingWorldWorkerTask<Output>): void {
  if (task.signal && task.abort) task.signal.removeEventListener('abort', task.abort)
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('World Worker task was aborted')
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback)
}

let nextRequestId = 0

function defaultRequestId(): string {
  nextRequestId += 1
  return `world-worker-${nextRequestId}`
}
