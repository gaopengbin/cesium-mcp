import { describe, expect, it } from 'vitest'
import {
  applyWorldObservation,
  createAgentBeliefState,
} from '../world-awareness/belief-state.js'
import {
  extractPolicyReplayObservationEvents,
  projectExactWorldAwarenessReplay,
  replayWorldAwarenessBeliefTrace,
  validateWorldAwarenessReplayTrace,
} from '../world-awareness/replay.js'
import {
  HIDDEN_CORRIDOR_FIXTURES,
} from './hidden-corridor-fixtures.js'
import {
  buildHiddenCorridorTopology,
  createHiddenCorridorPolicyBelief,
  createHiddenCorridorPolicyContext,
  runHiddenCorridorCase,
  runHiddenCorridorEvaluation,
  selectHiddenCorridorObservation,
} from './hidden-corridor.js'

function initialBelief(index: number) {
  const fixture = HIDDEN_CORRIDOR_FIXTURES[index]!
  const empty = createAgentBeliefState({
    beliefId: `test-belief:${fixture.planner.caseId}`,
    worldId: fixture.planner.worldId,
    createdAt: fixture.planner.initialObservation.startedAt,
    regions: fixture.planner.cells.map(cell => cell.region),
  })
  return applyWorldObservation(empty, fixture.planner.initialObservation).state
}

describe('hidden corridor world-awareness harness', () => {
  it('builds a deterministic two-corridor topology from planner-visible data', () => {
    const topology = buildHiddenCorridorTopology(HIDDEN_CORRIDOR_FIXTURES[0]!.planner)
    expect(topology.nodeIds).toEqual([
      'start',
      'fork',
      'join',
      'goal',
      'short:1',
      'short:2',
      'long:1',
      'long:2',
      'long:3',
    ])
    expect(topology.edges.map(edge => edge.regionId)).toEqual([
      'corridor:entry',
      'corridor:short:1',
      'corridor:short:2',
      'corridor:short:3',
      'corridor:long:1',
      'corridor:long:2',
      'corridor:long:3',
      'corridor:long:4',
      'corridor:exit',
    ])
  })

  it('selects the same first observation when hidden truth differs', () => {
    const shortBlocked = HIDDEN_CORRIDOR_FIXTURES.find(item => (
      item.planner.caseId === 'short-corridor-blocked'
    ))!
    const longBlocked = HIDDEN_CORRIDOR_FIXTURES.find(item => (
      item.planner.caseId === 'long-corridor-blocked'
    ))!
    const shortContext = createHiddenCorridorPolicyContext(shortBlocked.planner)
    const longContext = createHiddenCorridorPolicyContext(longBlocked.planner)
    const shortBelief = createHiddenCorridorPolicyBelief(
      initialBelief(HIDDEN_CORRIDOR_FIXTURES.indexOf(shortBlocked)),
    )
    const longBelief = createHiddenCorridorPolicyBelief(
      initialBelief(HIDDEN_CORRIDOR_FIXTURES.indexOf(longBlocked)),
    )
    expect(shortContext).toEqual(longContext)
    expect(shortBelief).toEqual(longBelief)
    expect(JSON.stringify({ shortContext, shortBelief })).not.toContain(
      'short-corridor-blocked',
    )
    expect(JSON.stringify({ longContext, longBelief })).not.toContain(
      'long-corridor-blocked',
    )
    const shortDecision = selectHiddenCorridorObservation(
      shortContext,
      shortBelief,
      0,
    )
    const longDecision = selectHiddenCorridorObservation(
      longContext,
      longBelief,
      0,
    )
    expect(shortDecision.selectedCandidateId).toBe('shared-overlook')
    expect(longDecision.selectedCandidateId).toBe(shortDecision.selectedCandidateId)
    expect(shortDecision.scores).toEqual(longDecision.scores)
  })

  it('passes all eight active-perception cases without truth leakage or false free space', () => {
    const report = runHiddenCorridorEvaluation()
    expect(report.passed).toBe(true)
    expect(report.cases).toHaveLength(8)
    expect(report.summary).toMatchObject({
      activeCaseAccuracy: 1,
      activeConstraintViolations: 0,
      activeFalseFreeRate: 0,
      activeUnknownHonesty: 1,
      oracleCaseAccuracy: 1,
    })
    expect(report.summary.fixedCaseAccuracy).toBeLessThan(report.summary.activeCaseAccuracy)
    for (const item of report.cases) {
      const active = item.runs['active-next-best-view']
      expect(item.passed, item.caseId).toBe(true)
      expect(active.metrics.constraintViolationCount, item.caseId).toBe(0)
      expect(active.metrics.falseFreeRate, item.caseId).toBe(0)
      expect(active.metrics.unknownHonesty, item.caseId).toBe(1)
      expect(active.metrics.verificationAccuracy, item.caseId).toBe(true)
      expect(active.metrics.routeRegret, item.caseId).toBe(0)
      expect(active.metrics.nextBestViewRegret, item.caseId).toBe(0)
      expect(replayWorldAwarenessBeliefTrace(active.trace), item.caseId)
        .toEqual(active.finalBelief)
      for (const run of Object.values(item.runs)) {
        expect(() => validateWorldAwarenessReplayTrace(run.trace)).not.toThrow()
        expect(replayWorldAwarenessBeliefTrace(run.trace)).toEqual(run.finalBelief)
      }
    }
  })

  it('retries loading observations and replans after a world revision', () => {
    const partial = HIDDEN_CORRIDOR_FIXTURES.find(item => (
      item.planner.caseId === 'partial-loading-retry'
    ))!
    const revision = HIDDEN_CORRIDOR_FIXTURES.find(item => (
      item.planner.caseId === 'revision-stales-belief'
    ))!
    const partialRun = runHiddenCorridorCase(partial, 'active-next-best-view')
    const revisionRun = runHiddenCorridorCase(revision, 'active-next-best-view')

    expect(partialRun.selectedObservationCandidateIds).toEqual([
      'shared-overlook',
      'shared-overlook',
      'shared-overlook',
    ])
    expect(partialRun.outcome).toBe('goal-reached')
    expect(partialRun.metrics.movementCost).toBe(0.45)
    expect(partialRun.metrics.unknownHonestyCheckCount).toBeGreaterThan(0)
    expect(revisionRun.selectedObservationCandidateIds).toEqual([
      'shared-overlook',
      'short-overlook',
    ])
    expect(revisionRun.selectedCorridor).toBe('long')
    expect(revisionRun.metrics.replanSuccess).toBe(true)
    expect(revisionRun.routeHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ worldRevision: 1, status: 'planned', corridorId: 'short' }),
      expect.objectContaining({ worldRevision: 2, status: 'planned', corridorId: 'long' }),
    ]))
    const actionEvents = revisionRun.trace.events.filter(event => (
      event.type === 'action.started' || event.type === 'action.completed'
    ))
    expect(actionEvents.map(event => event.type)).toEqual([
      'action.started',
      'action.completed',
    ])
  })

  it('produces replayable deterministic traces', () => {
    const fixture = HIDDEN_CORRIDOR_FIXTURES[0]!
    const first = runHiddenCorridorCase(fixture, 'active-next-best-view')
    const second = runHiddenCorridorCase(fixture, 'active-next-best-view')

    expect(first.metrics.repeatabilityDigest).toBe(second.metrics.repeatabilityDigest)
    expect(first.trace).toEqual(second.trace)
    expect(() => validateWorldAwarenessReplayTrace(first.trace)).not.toThrow()
    const projection = projectExactWorldAwarenessReplay(first.trace)
    expect(projection.outcome).toBe('goal-reached')
    expect(projection.selectedObservation?.payload.candidateId).toBe('shared-overlook')
    expect(projection.route?.payload.status).toBe('planned')
    expect(projection.finalBeliefRevision).toBe(first.finalBelief.revision)
    expect(replayWorldAwarenessBeliefTrace(first.trace)).toEqual(first.finalBelief)
    const observations = extractPolicyReplayObservationEvents(first.trace)
    expect(observations).toHaveLength(2)
    expect(observations[1]?.payload.observation).toMatchObject({
      schemaVersion: 1,
      worldId: fixture.planner.worldId,
      readiness: 'ready',
    })
  })

  it('fails fast instead of looping when evaluator sensor attempts are missing', () => {
    const invalid = structuredClone(HIDDEN_CORRIDOR_FIXTURES[0]!)
    invalid.oracle.actualCandidateCoverage = []
    expect(() => runHiddenCorridorCase(invalid, 'active-next-best-view'))
      .toThrow(/lacks observation attempts/i)
  })
})
