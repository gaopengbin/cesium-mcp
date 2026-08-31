import { describe, expect, it } from 'vitest'
import {
  appendWorldAwarenessTraceEvent,
  completeWorldAwarenessTrace,
  createWorldAwarenessTrace,
  semanticTraceDigest,
  stableTraceJson,
  verifyWorldAwarenessTrace,
} from './trace.js'

const run = {
  runId: 'run-hidden-corridor-01',
  scenarioId: 'hidden-corridor-short',
  scenarioVersion: 1,
  scenarioDigest: 'fixture:short-v1',
  seed: 7,
  strategyId: 'active-next-best-view',
  strategyVersion: '0.1.0',
  config: { observationBudget: 2 },
}

describe('world awareness trace', () => {
  it('creates deterministic semantic digests independent of key order', () => {
    expect(stableTraceJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableTraceJson({ a: { c: 3, d: 4 }, b: 2 }),
    )
    expect(semanticTraceDigest({ b: 2, a: 1 })).toBe(
      semanticTraceDigest({ a: 1, b: 2 }),
    )
  })

  it('assigns stable event identifiers and preserves monotonic logical time', () => {
    let trace = createWorldAwarenessTrace(run)
    trace = appendWorldAwarenessTraceEvent(trace, {
      logicalTimeMs: 0,
      type: 'run.started',
    })
    trace = appendWorldAwarenessTraceEvent(trace, {
      logicalTimeMs: 100,
      type: 'belief.initialized',
      beliefRevisionAfter: 0,
    })

    expect(trace.events.map(event => event.eventId)).toEqual([
      'run-hidden-corridor-01:0000',
      'run-hidden-corridor-01:0001',
    ])
    expect(() => appendWorldAwarenessTraceEvent(trace, {
      logicalTimeMs: 99,
      type: 'route.planned',
    })).toThrow('logicalTimeMs must be monotonic')
  })

  it('completes and verifies an immutable trace', () => {
    const initial = createWorldAwarenessTrace(run)
    const withEvent = appendWorldAwarenessTraceEvent(initial, {
      logicalTimeMs: 0,
      type: 'run.started',
      payload: { strategy: 'active-next-best-view' },
    })
    const completed = completeWorldAwarenessTrace(withEvent, 'goal-reached', {
      constraintViolationCount: 0,
      taskCorrectness: true,
    })

    expect(initial.events).toEqual([])
    expect(withEvent.result).toBeUndefined()
    expect(verifyWorldAwarenessTrace(completed)).toBe(true)
    expect(completed.result?.traceDigest).toMatch(/^fnv1a32:/)

    const tampered = structuredClone(completed)
    tampered.events[0]!.payload.strategy = 'oracle'
    expect(verifyWorldAwarenessTrace(tampered)).toBe(false)
  })

  it('rejects events after completion', () => {
    const completed = completeWorldAwarenessTrace(
      createWorldAwarenessTrace(run),
      'safe-abort',
      {},
    )
    expect(() => appendWorldAwarenessTraceEvent(completed, {
      logicalTimeMs: 1,
      type: 'run.completed',
    })).toThrow('Cannot append events to a completed trace')
  })
})
