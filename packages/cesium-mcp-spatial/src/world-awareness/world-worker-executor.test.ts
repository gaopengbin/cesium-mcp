import { describe, expect, it } from 'vitest'

import {
  executeWorldWorkerMessage,
  WorldWorkerExecutor,
} from './world-worker-executor.js'
import type {
  WorldWorkerEndpoint,
  WorldWorkerRequestMessage,
  WorldWorkerResultMessage,
} from './world-worker-executor.js'

class FakeWorker implements WorldWorkerEndpoint {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  messages: unknown[] = []
  transferLists: Array<Transferable[] | undefined> = []
  terminated = false

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.messages.push(message)
    this.transferLists.push(transfer)
  }

  terminate(): void {
    this.terminated = true
  }

  respond<Output>(message: WorldWorkerResultMessage<Output>): void {
    this.onmessage?.({ data: message } as MessageEvent<unknown>)
  }

  fail(message: string): void {
    this.onerror?.({ message, preventDefault: () => {} } as ErrorEvent)
  }
}

function lastRequest<Input>(worker: FakeWorker): WorldWorkerRequestMessage<Input> {
  return worker.messages.at(-1) as WorldWorkerRequestMessage<Input>
}

describe('WorldWorkerExecutor', () => {
  it('correlates successful results and forwards transfer lists', async () => {
    const worker = new FakeWorker()
    const executor = new WorldWorkerExecutor<{ value: number }, number>({
      createWorker: () => worker,
      createRequestId: () => 'request-1',
    })
    const buffer = new ArrayBuffer(8)
    const result = executor.run({ value: 4 }, { transfer: [buffer] })

    expect(lastRequest<{ value: number }>(worker)).toEqual({
      type: 'world-task-request',
      requestId: 'request-1',
      input: { value: 4 },
    })
    expect(worker.transferLists).toEqual([[buffer]])
    worker.respond({
      type: 'world-task-result',
      requestId: 'request-1',
      ok: true,
      output: 8,
    })

    await expect(result).resolves.toBe(8)
    expect(executor.pendingCount).toBe(0)
  })

  it('reconstructs serialized Worker errors', async () => {
    const worker = new FakeWorker()
    const executor = new WorldWorkerExecutor<string, string>({
      createWorker: () => worker,
      createRequestId: () => 'request-error',
    })
    const result = executor.run('bad')
    worker.respond({
      type: 'world-task-result',
      requestId: 'request-error',
      ok: false,
      error: { name: 'RangeError', message: 'outside terrain extent' },
    })

    await expect(result).rejects.toMatchObject({
      name: 'RangeError',
      message: 'outside terrain extent',
    })
  })

  it('terminates stale decoder work on abort and recreates the Worker', async () => {
    const workers: FakeWorker[] = []
    let requestNumber = 0
    const executor = new WorldWorkerExecutor<number, number>({
      createWorker: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return worker
      },
      createRequestId: () => `request-${++requestNumber}`,
    })
    const controller = new AbortController()
    const stale = executor.run(1, { signal: controller.signal })
    const staleAssertion = expect(stale).rejects.toThrow('revision changed')

    controller.abort(new Error('revision changed'))
    await staleAssertion
    expect(workers[0]?.terminated).toBe(true)

    const current = executor.run(2)
    expect(workers).toHaveLength(2)
    workers[1]!.respond({
      type: 'world-task-result',
      requestId: 'request-2',
      ok: true,
      output: 4,
    })
    await expect(current).resolves.toBe(4)
  })

  it('rejects all pending requests when the owned Worker fails', async () => {
    const worker = new FakeWorker()
    let requestNumber = 0
    const executor = new WorldWorkerExecutor<number, number>({
      createWorker: () => worker,
      createRequestId: () => `request-${++requestNumber}`,
    })
    const first = executor.run(1)
    const second = executor.run(2)
    const firstAssertion = expect(first).rejects.toThrow('decoder crashed')
    const secondAssertion = expect(second).rejects.toThrow('decoder crashed')

    worker.fail('decoder crashed')

    await firstAssertion
    await secondAssertion
    expect(worker.terminated).toBe(true)
    expect(executor.pendingCount).toBe(0)
  })

  it('creates protocol responses and ignores unrelated messages', async () => {
    await expect(executeWorldWorkerMessage(
      { type: 'other' },
      async (value: number) => value * 2,
    )).resolves.toBeUndefined()

    await expect(executeWorldWorkerMessage(
      { type: 'world-task-request', requestId: 'ok', input: 3 },
      async (value: number) => value * 2,
    )).resolves.toEqual({
      type: 'world-task-result',
      requestId: 'ok',
      ok: true,
      output: 6,
    })

    const failure = await executeWorldWorkerMessage(
      { type: 'world-task-request', requestId: 'bad', input: 3 },
      async () => {
        throw new TypeError('bad input')
      },
    )
    expect(failure).toMatchObject({
      type: 'world-task-result',
      requestId: 'bad',
      ok: false,
      error: { name: 'TypeError', message: 'bad input' },
    })
  })
})
