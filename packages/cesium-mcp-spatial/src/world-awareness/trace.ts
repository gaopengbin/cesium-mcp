export type WorldAwarenessOutcome =
  | 'goal-reached'
  | 'safe-abort'
  | 'violation'
  | 'budget-exhausted'

export type WorldAwarenessTraceEventType =
  | 'run.started'
  | 'world.revised'
  | 'belief.initialized'
  | 'route.candidates-generated'
  | 'route.planned'
  | 'observation.candidates-generated'
  | 'observation.candidate-scored'
  | 'observation.selected'
  | 'observation.completed'
  | 'belief.updated'
  | 'action.started'
  | 'action.completed'
  | 'verification.completed'
  | 'run.completed'

export interface WorldAwarenessRunDescriptor {
  runId: string
  scenarioId: string
  scenarioVersion: number
  scenarioDigest: string
  seed: number
  strategyId: string
  strategyVersion: string
  config: Record<string, unknown>
}

export interface WorldAwarenessTraceEvent {
  sequence: number
  eventId: string
  logicalTimeMs: number
  type: WorldAwarenessTraceEventType
  beliefRevisionBefore?: number
  beliefRevisionAfter?: number
  causedBy?: string[]
  payload: Record<string, unknown>
}

export interface WorldAwarenessTraceResult {
  outcome: WorldAwarenessOutcome
  metrics: Record<string, number | string | boolean>
  traceDigest: string
}

export interface WorldAwarenessTrace {
  schemaVersion: 1
  run: WorldAwarenessRunDescriptor
  events: WorldAwarenessTraceEvent[]
  result?: WorldAwarenessTraceResult
}

export interface AppendTraceEventInput {
  logicalTimeMs: number
  type: WorldAwarenessTraceEventType
  beliefRevisionBefore?: number
  beliefRevisionAfter?: number
  causedBy?: string[]
  payload?: Record<string, unknown>
}

function compareValues(left: unknown, right: unknown): number {
  return String(left).localeCompare(String(right))
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareValues(left, right))
      .map(([key, item]) => [key, stableValue(item)]),
  )
}

export function stableTraceJson(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

export function semanticTraceDigest(value: unknown): string {
  const input = stableTraceJson(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function assertNonEmpty(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} must not be empty`)
}

function validateRun(run: WorldAwarenessRunDescriptor): void {
  assertNonEmpty(run.runId, 'runId')
  assertNonEmpty(run.scenarioId, 'scenarioId')
  assertNonEmpty(run.scenarioDigest, 'scenarioDigest')
  assertNonEmpty(run.strategyId, 'strategyId')
  assertNonEmpty(run.strategyVersion, 'strategyVersion')
  if (!Number.isInteger(run.scenarioVersion) || run.scenarioVersion < 1) {
    throw new Error('scenarioVersion must be a positive integer')
  }
  if (!Number.isInteger(run.seed)) throw new Error('seed must be an integer')
}

export function createWorldAwarenessTrace(
  run: WorldAwarenessRunDescriptor,
): WorldAwarenessTrace {
  validateRun(run)
  return {
    schemaVersion: 1,
    run: structuredClone(run),
    events: [],
  }
}

export function appendWorldAwarenessTraceEvent(
  trace: WorldAwarenessTrace,
  input: AppendTraceEventInput,
): WorldAwarenessTrace {
  if (trace.result) throw new Error('Cannot append events to a completed trace')
  if (!Number.isFinite(input.logicalTimeMs) || input.logicalTimeMs < 0) {
    throw new Error('logicalTimeMs must be a non-negative finite number')
  }
  const previous = trace.events.at(-1)
  if (previous && input.logicalTimeMs < previous.logicalTimeMs) {
    throw new Error('logicalTimeMs must be monotonic')
  }
  const sequence = trace.events.length
  const event: WorldAwarenessTraceEvent = {
    sequence,
    eventId: `${trace.run.runId}:${sequence.toString().padStart(4, '0')}`,
    logicalTimeMs: input.logicalTimeMs,
    type: input.type,
    ...(input.beliefRevisionBefore === undefined
      ? {}
      : { beliefRevisionBefore: input.beliefRevisionBefore }),
    ...(input.beliefRevisionAfter === undefined
      ? {}
      : { beliefRevisionAfter: input.beliefRevisionAfter }),
    ...(input.causedBy ? { causedBy: [...input.causedBy] } : {}),
    payload: structuredClone(input.payload ?? {}),
  }
  return {
    ...trace,
    run: structuredClone(trace.run),
    events: [...trace.events.map(item => structuredClone(item)), event],
  }
}

export function completeWorldAwarenessTrace(
  trace: WorldAwarenessTrace,
  outcome: WorldAwarenessOutcome,
  metrics: Record<string, number | string | boolean>,
): WorldAwarenessTrace {
  if (trace.result) throw new Error('Trace is already completed')
  const semanticResult = {
    outcome,
    metrics: structuredClone(metrics),
  }
  const digest = semanticTraceDigest({
    schemaVersion: trace.schemaVersion,
    run: trace.run,
    events: trace.events,
    result: semanticResult,
  })
  return {
    ...trace,
    run: structuredClone(trace.run),
    events: trace.events.map(item => structuredClone(item)),
    result: {
      ...semanticResult,
      traceDigest: digest,
    },
  }
}

export function verifyWorldAwarenessTrace(trace: WorldAwarenessTrace): boolean {
  if (!trace.result) return false
  const { traceDigest, ...semanticResult } = trace.result
  return semanticTraceDigest({
    schemaVersion: trace.schemaVersion,
    run: trace.run,
    events: trace.events,
    result: semanticResult,
  }) === traceDigest
}
