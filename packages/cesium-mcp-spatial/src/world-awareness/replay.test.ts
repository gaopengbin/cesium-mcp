import { describe, expect, it } from 'vitest'
import {
  extractPolicyReplayObservationEvents,
  projectExactWorldAwarenessReplay,
  replayWorldAwarenessBeliefTrace,
  validateWorldAwarenessReplayTrace,
} from './replay.js'
import { applyWorldObservation } from './belief-state.js'
import {
  appendWorldAwarenessTraceEvent,
  completeWorldAwarenessTrace,
  createWorldAwarenessTrace,
  semanticTraceDigest,
} from './trace.js'
import type { WorldAwarenessTrace } from './trace.js'
import type {
  AgentBeliefState,
  SpatialRegion,
  WorldObservation,
} from './types.js'

const run = {
  runId: 'run-hidden-corridor-replay',
  scenarioId: 'hidden-corridor-short',
  scenarioVersion: 1,
  scenarioDigest: 'fixture:hidden-corridor-v1',
  seed: 11,
  strategyId: 'active-next-best-view',
  strategyVersion: '0.1.0',
  config: { observationBudget: 2 },
}

const region: SpatialRegion = {
  regionId: 'corridor-east',
  footprint: {
    type: 'Polygon',
    coordinates: [[
      [86.8, 27.8],
      [86.81, 27.8],
      [86.81, 27.81],
      [86.8, 27.81],
      [86.8, 27.8],
    ]],
  },
}

function initialBelief(): AgentBeliefState {
  return {
    schemaVersion: 1,
    beliefId: 'replay-belief',
    worldId: 'replay-world',
    revision: 0,
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
    objects: [],
    regions: [{
      region,
      occupancy: 'unknown',
      freshness: 'current',
      confidence: 0,
      blockingObjectIds: [],
      unknownReason: 'not-observed',
      evidence: [],
    }],
    appliedObservationIds: [],
    conflicts: [],
  }
}

function observation(): WorldObservation {
  return {
    schemaVersion: 1,
    observationId: 'observation-1',
    worldId: 'replay-world',
    worldRevision: 1,
    startedAt: '2026-08-31T00:00:01.000Z',
    completedAt: '2026-08-31T00:00:01.000Z',
    changedDuringObservation: false,
    readiness: 'ready',
    sensors: [{ sensorId: 'west-ridge-camera', kind: 'camera' }],
    evidence: [{
      evidenceId: 'evidence-1',
      sensorId: 'west-ridge-camera',
      sampledAt: '2026-08-31T00:00:01.000Z',
      quality: 'exact',
      confidence: 1,
      basis: 'complete-visual-and-ray-coverage',
      kind: 'region-occupancy',
      region,
      occupancy: 'occupied',
      coverage: 'complete',
      blockingObjectIds: ['rockfall-1'],
    }],
    limitations: [],
  }
}

function completedTrace(): WorldAwarenessTrace {
  const belief = initialBelief()
  const observed = observation()
  const update = applyWorldObservation(belief, observed)
  let trace = createWorldAwarenessTrace(run)
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 0,
    type: 'run.started',
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 10,
    type: 'belief.initialized',
    beliefRevisionAfter: 0,
    payload: { belief },
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 20,
    type: 'route.planned',
    beliefRevisionBefore: 0,
    payload: { routeId: 'direct-route', points: ['start', 'goal'] },
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 30,
    type: 'observation.selected',
    beliefRevisionBefore: 0,
    payload: { candidateId: 'view-west-ridge' },
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 100,
    type: 'observation.completed',
    beliefRevisionBefore: 0,
    payload: {
      observationId: 'observation-1',
      observation: observed,
    },
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 110,
    type: 'belief.updated',
    beliefRevisionBefore: 0,
    beliefRevisionAfter: 1,
    payload: {
      operation: 'observation',
      observationId: 'observation-1',
      diff: update.diff,
    },
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 120,
    type: 'route.planned',
    beliefRevisionBefore: 1,
    payload: { routeId: 'safe-west-route', points: ['start', 'west', 'goal'] },
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 130,
    type: 'action.started',
    payload: { routeId: 'safe-west-route' },
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 190,
    type: 'action.completed',
    payload: { routeId: 'safe-west-route', reachedGoal: true },
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 200,
    type: 'run.completed',
    beliefRevisionBefore: 1,
    payload: { outcome: 'goal-reached' },
  })
  return completeWorldAwarenessTrace(trace, 'goal-reached', {
    observationCount: 1,
    constraintViolationCount: 0,
  })
}

function resign(trace: WorldAwarenessTrace): void {
  const result = trace.result!
  const { traceDigest: _traceDigest, ...semanticResult } = result
  result.traceDigest = semanticTraceDigest({
    schemaVersion: trace.schemaVersion,
    run: trace.run,
    events: trace.events,
    result: semanticResult,
  })
}

describe('world awareness replay', () => {
  it('validates and exactly projects the final decision state', () => {
    const trace = completedTrace()

    expect(() => validateWorldAwarenessReplayTrace(trace)).not.toThrow()
    expect(projectExactWorldAwarenessReplay(trace)).toEqual({
      runId: 'run-hidden-corridor-replay',
      finalBeliefRevision: 1,
      selectedObservation: {
        eventId: 'run-hidden-corridor-replay:0003',
        sequence: 3,
        logicalTimeMs: 30,
        payload: { candidateId: 'view-west-ridge' },
      },
      route: {
        eventId: 'run-hidden-corridor-replay:0006',
        sequence: 6,
        logicalTimeMs: 120,
        payload: { routeId: 'safe-west-route', points: ['start', 'west', 'goal'] },
      },
      outcome: 'goal-reached',
    })
    expect(replayWorldAwarenessBeliefTrace(trace)).toEqual(
      applyWorldObservation(initialBelief(), observation()).state,
    )
  })

  it('extracts only environment observations needed for policy replay', () => {
    const trace = completedTrace()
    const observations = extractPolicyReplayObservationEvents(trace)

    expect(observations).toHaveLength(1)
    expect(observations[0]).toMatchObject({
      type: 'observation.completed',
      eventId: 'run-hidden-corridor-replay:0004',
      beliefRevisionBefore: 0,
      payload: {
        observationId: 'observation-1',
        observation: { schemaVersion: 1, observationId: 'observation-1' },
      },
    })

    observations[0]!.payload.observationId = 'changed-replay-copy'
    expect(trace.events[4]!.payload.observationId).toBe('observation-1')
  })

  it('rejects digest, sequence, event id, and logical-time corruption', () => {
    const digestTampered = structuredClone(completedTrace())
    digestTampered.result!.metrics.observationCount = 2
    expect(() => validateWorldAwarenessReplayTrace(digestTampered))
      .toThrow(/digest/i)

    const wrongSequence = structuredClone(completedTrace())
    wrongSequence.events[3]!.sequence = 9
    resign(wrongSequence)
    expect(() => validateWorldAwarenessReplayTrace(wrongSequence))
      .toThrow(/sequence/i)

    const wrongEventId = structuredClone(completedTrace())
    wrongEventId.events[3]!.eventId = 'another-run:0003'
    resign(wrongEventId)
    expect(() => validateWorldAwarenessReplayTrace(wrongEventId))
      .toThrow(/eventId/i)

    const reversedTime = structuredClone(completedTrace())
    reversedTime.events[4]!.logicalTimeMs = 1
    resign(reversedTime)
    expect(() => validateWorldAwarenessReplayTrace(reversedTime))
      .toThrow(/logicalTimeMs.*monotonic/i)
  })

  it('rejects disconnected or skipped belief revisions', () => {
    const disconnected = structuredClone(completedTrace())
    disconnected.events[5]!.beliefRevisionBefore = 4
    disconnected.events[5]!.beliefRevisionAfter = 5
    const disconnectedDiff = disconnected.events[5]!.payload.diff as {
      fromRevision: number
      toRevision: number
    }
    disconnectedDiff.fromRevision = 4
    disconnectedDiff.toRevision = 5
    resign(disconnected)
    expect(() => validateWorldAwarenessReplayTrace(disconnected))
      .toThrow(/belief revision.*continuous/i)

    const skipped = structuredClone(completedTrace())
    skipped.events[5]!.beliefRevisionAfter = 2
    const skippedDiff = skipped.events[5]!.payload.diff as { toRevision: number }
    skippedDiff.toRevision = 2
    resign(skipped)
    expect(() => validateWorldAwarenessReplayTrace(skipped))
      .toThrow(/exactly one/i)
  })

  it('rejects semantically invalid event order and replay payload linkage', () => {
    const missingStart = structuredClone(completedTrace())
    missingStart.events[0]!.type = 'route.planned'
    resign(missingStart)
    expect(() => validateWorldAwarenessReplayTrace(missingStart)).toThrow(/run\.started/i)

    const completionNotLast = structuredClone(completedTrace())
    completionNotLast.events.push({
      sequence: completionNotLast.events.length,
      eventId: `${run.runId}:${completionNotLast.events.length.toString().padStart(4, '0')}`,
      logicalTimeMs: 210,
      type: 'verification.completed',
      payload: {},
    })
    resign(completionNotLast)
    expect(() => validateWorldAwarenessReplayTrace(completionNotLast))
      .toThrow(/run\.completed.*last/i)

    const missingObservation = structuredClone(completedTrace())
    delete missingObservation.events[4]!.payload.observation
    resign(missingObservation)
    expect(() => validateWorldAwarenessReplayTrace(missingObservation))
      .toThrow(/WorldObservation/i)

    const badDiff = structuredClone(completedTrace())
    const diff = badDiff.events[5]!.payload.diff as { toRevision: number }
    diff.toRevision = 7
    resign(badDiff)
    expect(() => validateWorldAwarenessReplayTrace(badDiff))
      .toThrow(/diff.*revisions/i)

    const incompleteAction = structuredClone(completedTrace())
    incompleteAction.events[8]!.type = 'verification.completed'
    resign(incompleteAction)
    expect(() => validateWorldAwarenessReplayTrace(incompleteAction))
      .toThrow(/incomplete action/i)

    const missingOutcome = structuredClone(completedTrace())
    delete missingOutcome.events.at(-1)!.payload.outcome
    resign(missingOutcome)
    expect(() => validateWorldAwarenessReplayTrace(missingOutcome))
      .toThrow(/run\.completed.*outcome/i)
  })
})
