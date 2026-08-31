import {
  stableTraceJson,
  verifyWorldAwarenessTrace,
} from './trace.js'
import {
  applyWorldObservation,
  invalidateAgentBeliefState,
} from './belief-state.js'
import type {
  WorldAwarenessOutcome,
  WorldAwarenessTrace,
  WorldAwarenessTraceEvent,
  WorldAwarenessTraceEventType,
} from './trace.js'
import type {
  AgentBeliefState,
  BeliefInvalidation,
  BeliefStateDiff,
  WorldObservation,
} from './types.js'

export interface ExactReplayEventProjection {
  eventId: string
  sequence: number
  logicalTimeMs: number
  payload: Record<string, unknown>
}

export interface ExactWorldAwarenessReplayProjection {
  runId: string
  finalBeliefRevision?: number
  selectedObservation?: ExactReplayEventProjection
  route?: ExactReplayEventProjection
  outcome: WorldAwarenessOutcome
}

const traceEventTypes = new Set<WorldAwarenessTraceEventType>([
  'run.started',
  'world.revised',
  'belief.initialized',
  'route.candidates-generated',
  'route.planned',
  'observation.candidates-generated',
  'observation.candidate-scored',
  'observation.selected',
  'observation.completed',
  'belief.updated',
  'action.started',
  'action.completed',
  'verification.completed',
  'run.completed',
])

const outcomes = new Set<WorldAwarenessOutcome>([
  'goal-reached',
  'safe-abort',
  'violation',
  'budget-exhausted',
])

/** Validate all deterministic invariants required before replaying a trace. */
export function validateWorldAwarenessReplayTrace(trace: WorldAwarenessTrace): void {
  scanReplayTrace(trace)
}

/**
 * Rebuild the externally meaningful terminal projection from recorded events.
 * Replanning is represented by the latest route and observation selections.
 */
export function projectExactWorldAwarenessReplay(
  trace: WorldAwarenessTrace,
): ExactWorldAwarenessReplayProjection {
  const finalBeliefRevision = scanReplayTrace(trace)
  const selectedObservation = findLatestEvent(trace.events, 'observation.selected')
  const route = findLatestEvent(trace.events, 'route.planned')

  return {
    runId: trace.run.runId,
    ...(finalBeliefRevision === undefined ? {} : { finalBeliefRevision }),
    ...(selectedObservation
      ? { selectedObservation: projectEvent(selectedObservation) }
      : {}),
    ...(route ? { route: projectEvent(route) } : {}),
    outcome: trace.result!.outcome,
  }
}

/**
 * Extract environment evidence for policy replay without carrying over the
 * recorded policy's candidate scoring or selection decisions.
 */
export function extractPolicyReplayObservationEvents(
  trace: WorldAwarenessTrace,
): WorldAwarenessTraceEvent[] {
  scanReplayTrace(trace)
  return trace.events
    .filter(event => event.type === 'observation.completed')
    .map(event => structuredClone(event))
}

/** Re-apply recorded observations and invalidations to reconstruct final belief. */
export function replayWorldAwarenessBeliefTrace(
  trace: WorldAwarenessTrace,
): AgentBeliefState {
  const expectedFinalRevision = scanReplayTrace(trace)
  let belief: AgentBeliefState | undefined
  const observations = new Map<string, WorldObservation>()

  for (const event of trace.events) {
    if (event.type === 'belief.initialized') {
      belief = structuredClone(requireBeliefPayload(event))
      continue
    }
    if (event.type === 'observation.completed') {
      const observation = requireObservationPayload(event)
      observations.set(observation.observationId, structuredClone(observation))
      continue
    }
    if (event.type !== 'belief.updated') continue
    if (!belief) throw new Error('Replay belief must be initialized before updates')

    const operation = event.payload.operation
    const beforeRevision = belief.revision
    if (operation === 'observation') {
      const observationId = requireString(event.payload.observationId, 'observationId')
      const observation = observations.get(observationId)
      if (!observation) {
        throw new Error(`Replay observation '${observationId}' was not recorded before belief update`)
      }
      const result = applyWorldObservation(belief, observation)
      assertReplayDiff(event, result.diff)
      belief = result.state
    }
    else if (operation === 'invalidation') {
      const invalidation = requireInvalidationPayload(event)
      const result = invalidateAgentBeliefState(belief, invalidation)
      assertReplayDiff(event, result.diff)
      belief = result.state
    }
    else {
      throw new Error(`Replay belief update has unsupported operation: ${String(operation)}`)
    }
    if (
      event.beliefRevisionBefore !== beforeRevision
      || event.beliefRevisionAfter !== belief.revision
    ) {
      throw new Error(`Replay belief result does not match revisions at ${event.eventId}`)
    }
  }

  if (!belief) throw new Error('Replay trace does not contain an initialized belief')
  if (belief.revision !== expectedFinalRevision) {
    throw new Error('Replay final belief revision does not match trace')
  }
  return belief
}

function scanReplayTrace(trace: WorldAwarenessTrace): number | undefined {
  if (!trace || typeof trace !== 'object') throw new Error('Replay trace must be an object')
  if (trace.schemaVersion !== 1) throw new Error('Replay trace schemaVersion must be 1')
  if (!trace.run || typeof trace.run !== 'object' || !trace.run.runId.trim()) {
    throw new Error('Replay trace runId must not be empty')
  }
  if (!Array.isArray(trace.events)) throw new Error('Replay trace events must be an array')
  if (!trace.result) throw new Error('Replay trace must be completed and contain a digest')
  if (!outcomes.has(trace.result.outcome)) throw new Error('Replay trace outcome is invalid')

  let previousLogicalTimeMs = -1
  let beliefRevision: number | undefined
  let runStarted = false
  let beliefInitialized = false
  let runCompleted = false
  let actionOpen = false
  let completedActionCount = 0
  const recordedObservationIds = new Set<string>()

  for (const [index, event] of trace.events.entries()) {
    if (!event || typeof event !== 'object') {
      throw new Error(`Replay event at sequence ${index} must be an object`)
    }
    if (event.sequence !== index) {
      throw new Error(`Replay event sequence must be contiguous: expected ${index}`)
    }
    const expectedEventId = `${trace.run.runId}:${index.toString().padStart(4, '0')}`
    if (event.eventId !== expectedEventId) {
      throw new Error(`Replay eventId mismatch at sequence ${index}: expected ${expectedEventId}`)
    }
    if (!Number.isFinite(event.logicalTimeMs) || event.logicalTimeMs < 0) {
      throw new Error('Replay event logicalTimeMs must be a non-negative finite number')
    }
    if (event.logicalTimeMs < previousLogicalTimeMs) {
      throw new Error('Replay event logicalTimeMs must be monotonic')
    }
    previousLogicalTimeMs = event.logicalTimeMs
    if (!traceEventTypes.has(event.type)) {
      throw new Error(`Replay event type is invalid at sequence ${index}`)
    }
    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
      throw new Error(`Replay event payload must be an object at sequence ${index}`)
    }

    if (event.type === 'run.started') {
      if (index !== 0 || runStarted) throw new Error('Replay run.started must occur exactly once first')
      runStarted = true
    }
    else if (!runStarted) {
      throw new Error('Replay run.started must occur before all other events')
    }
    if (event.type === 'belief.initialized') {
      if (beliefInitialized) throw new Error('Replay belief.initialized must occur exactly once')
      const belief = requireBeliefPayload(event)
      if (belief.revision !== event.beliefRevisionAfter) {
        throw new Error('Replay initialized belief revision does not match event')
      }
      beliefInitialized = true
    }
    else if (
      event.type !== 'run.started'
      && !beliefInitialized
    ) {
      throw new Error('Replay belief.initialized must occur before operational events')
    }
    if (event.type === 'observation.completed') {
      const observation = requireObservationPayload(event)
      if (recordedObservationIds.has(observation.observationId)) {
        throw new Error(`Replay observation ID is duplicated: ${observation.observationId}`)
      }
      recordedObservationIds.add(observation.observationId)
    }
    if (event.type === 'belief.updated') {
      validateBeliefUpdatePayload(event, recordedObservationIds)
    }
    if (event.type === 'action.started') {
      if (actionOpen) throw new Error('Replay action.started cannot be nested')
      actionOpen = true
    }
    if (event.type === 'action.completed') {
      if (!actionOpen) throw new Error('Replay action.completed requires action.started')
      actionOpen = false
      completedActionCount += 1
    }
    if (event.type === 'run.completed') {
      if (runCompleted || index !== trace.events.length - 1) {
        throw new Error('Replay run.completed must occur exactly once last')
      }
      runCompleted = true
    }

    beliefRevision = validateBeliefRevisionTransition(event, beliefRevision)
  }

  if (!runStarted) throw new Error('Replay trace requires run.started')
  if (!beliefInitialized) throw new Error('Replay trace requires belief.initialized')
  if (!runCompleted) throw new Error('Replay trace requires run.completed')
  if (actionOpen) throw new Error('Replay trace contains an incomplete action')
  if (
    (trace.result.outcome === 'goal-reached' || trace.result.outcome === 'violation')
    && completedActionCount === 0
  ) {
    throw new Error(`Replay outcome '${trace.result.outcome}' requires a completed action`)
  }

  const completedEvent = findLatestEvent(trace.events, 'run.completed')
  const recordedOutcome = completedEvent?.payload.outcome
  if (typeof recordedOutcome !== 'string' || !outcomes.has(recordedOutcome as WorldAwarenessOutcome)) {
    throw new Error('Replay run.completed requires a valid outcome')
  }
  if (recordedOutcome !== trace.result.outcome) {
    throw new Error('Replay run.completed outcome does not match trace result')
  }
  if (!verifyWorldAwarenessTrace(trace)) throw new Error('Replay trace digest verification failed')
  return beliefRevision
}

function requireBeliefPayload(event: WorldAwarenessTraceEvent): AgentBeliefState {
  const belief = event.payload.belief
  if (!belief || typeof belief !== 'object' || Array.isArray(belief)) {
    throw new Error('Replay belief.initialized payload requires belief state')
  }
  const candidate = belief as AgentBeliefState
  if (
    candidate.schemaVersion !== 1
    || !candidate.beliefId?.trim()
    || !candidate.worldId?.trim()
    || !Number.isInteger(candidate.revision)
    || !Array.isArray(candidate.objects)
    || !Array.isArray(candidate.regions)
    || !Array.isArray(candidate.appliedObservationIds)
    || !Array.isArray(candidate.conflicts)
  ) {
    throw new Error('Replay initialized belief payload is invalid')
  }
  return candidate
}

function requireObservationPayload(event: WorldAwarenessTraceEvent): WorldObservation {
  const observation = event.payload.observation
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    throw new Error('Replay observation.completed payload requires a WorldObservation')
  }
  const candidate = observation as WorldObservation
  if (
    candidate.schemaVersion !== 1
    || !candidate.observationId?.trim()
    || !candidate.worldId?.trim()
    || !Number.isInteger(candidate.worldRevision)
    || !Array.isArray(candidate.sensors)
    || !Array.isArray(candidate.evidence)
    || !Array.isArray(candidate.limitations)
  ) {
    throw new Error('Replay WorldObservation payload is invalid')
  }
  if (event.payload.observationId !== candidate.observationId) {
    throw new Error('Replay observationId does not match WorldObservation payload')
  }
  return candidate
}

function validateBeliefUpdatePayload(
  event: WorldAwarenessTraceEvent,
  recordedObservationIds: ReadonlySet<string>,
): void {
  const diff = event.payload.diff as BeliefStateDiff | undefined
  if (!diff || typeof diff !== 'object') {
    throw new Error('Replay belief.updated payload requires a belief diff')
  }
  if (
    diff.fromRevision !== event.beliefRevisionBefore
    || diff.toRevision !== event.beliefRevisionAfter
  ) {
    throw new Error('Replay belief diff does not match event revisions')
  }
  if (event.payload.operation === 'observation') {
    const observationId = requireString(event.payload.observationId, 'observationId')
    if (!recordedObservationIds.has(observationId)) {
      throw new Error(`Replay belief update references unrecorded observation: ${observationId}`)
    }
    if (diff.observationId !== observationId) {
      throw new Error('Replay belief diff observationId does not match update payload')
    }
    return
  }
  if (event.payload.operation === 'invalidation') {
    requireInvalidationPayload(event)
    return
  }
  throw new Error('Replay belief.updated payload requires a supported operation')
}

function requireInvalidationPayload(event: WorldAwarenessTraceEvent): BeliefInvalidation {
  const invalidation = event.payload.invalidation
  if (!invalidation || typeof invalidation !== 'object' || Array.isArray(invalidation)) {
    throw new Error('Replay invalidation update requires invalidation payload')
  }
  const candidate = invalidation as BeliefInvalidation
  if (!candidate.invalidatedAt?.trim() || !candidate.reason?.trim()) {
    throw new Error('Replay invalidation payload is invalid')
  }
  if (candidate.regionIds !== undefined && !Array.isArray(candidate.regionIds)) {
    throw new Error('Replay invalidation regionIds must be an array')
  }
  if (candidate.objectIds !== undefined && !Array.isArray(candidate.objectIds)) {
    throw new Error('Replay invalidation objectIds must be an array')
  }
  return candidate
}

function assertReplayDiff(
  event: WorldAwarenessTraceEvent,
  actual: BeliefStateDiff,
): void {
  if (stableTraceJson(event.payload.diff) !== stableTraceJson(actual)) {
    throw new Error(`Replay belief diff does not reproduce at ${event.eventId}`)
  }
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Replay ${name} must be a non-empty string`)
  }
  return value
}

function validateBeliefRevisionTransition(
  event: WorldAwarenessTraceEvent,
  currentRevision: number | undefined,
): number | undefined {
  const before = event.beliefRevisionBefore
  const after = event.beliefRevisionAfter
  if (before !== undefined) requireRevision(before, `${event.eventId}.beliefRevisionBefore`)
  if (after !== undefined) requireRevision(after, `${event.eventId}.beliefRevisionAfter`)

  if (event.type === 'belief.initialized') {
    if (before !== undefined) {
      throw new Error('belief.initialized must not define beliefRevisionBefore')
    }
    if (after === undefined) {
      throw new Error('belief.initialized must define beliefRevisionAfter')
    }
    if (currentRevision !== undefined) {
      throw new Error('Belief revision must remain continuous: belief was already initialized')
    }
    return after
  }

  if (before !== undefined) {
    if (currentRevision === undefined || before !== currentRevision) {
      throw new Error(
        `Belief revision must remain continuous at ${event.eventId}: expected ${String(currentRevision)}`,
      )
    }
  }

  if (event.type === 'belief.updated') {
    if (before === undefined || after === undefined) {
      throw new Error('belief.updated must define both belief revisions')
    }
    if (after !== before + 1) {
      throw new Error('belief.updated must advance the belief revision by exactly one')
    }
    return after
  }

  if (after !== undefined) {
    if (currentRevision === undefined || after !== currentRevision || before !== after) {
      throw new Error(
        `Belief revision must remain continuous at ${event.eventId}; only belief.updated may advance it`,
      )
    }
    return after
  }
  return currentRevision
}

function requireRevision(value: number, path: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative integer`)
  }
}

function findLatestEvent(
  events: readonly WorldAwarenessTraceEvent[],
  type: WorldAwarenessTraceEventType,
): WorldAwarenessTraceEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === type) return event
  }
  return undefined
}

function projectEvent(event: WorldAwarenessTraceEvent): ExactReplayEventProjection {
  return {
    eventId: event.eventId,
    sequence: event.sequence,
    logicalTimeMs: event.logicalTimeMs,
    payload: structuredClone(event.payload),
  }
}
