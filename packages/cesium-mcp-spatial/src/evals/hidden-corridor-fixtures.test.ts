import { describe, expect, it } from 'vitest'
import { validateAuthoritativeWorldState } from '../world-awareness/world-state.js'
import {
  createHiddenCorridorFixtures,
  HIDDEN_CORRIDOR_FIXTURES,
  HIDDEN_CORRIDOR_REGION_IDS,
} from './hidden-corridor-fixtures.js'
import type {
  HiddenCorridorFixture,
  HiddenCorridorCaseId,
} from './hidden-corridor-fixtures.js'

const expectedCaseIds: HiddenCorridorCaseId[] = [
  'short-corridor-blocked',
  'long-corridor-blocked',
  'both-corridors-free',
  'both-corridors-blocked',
  'split-view-one-observation',
  'split-view-two-observations',
  'partial-loading-retry',
  'revision-stales-belief',
]

function fixture(caseId: HiddenCorridorCaseId): HiddenCorridorFixture {
  return HIDDEN_CORRIDOR_FIXTURES.find(item => item.planner.caseId === caseId)!
}

function occupiedRegionIds(item: HiddenCorridorFixture, revision = 1): string[] {
  return item.oracle.worldStates
    .find(state => state.revision === revision)!
    .regions
    .filter(state => state.modeled && state.occupancy === 'occupied')
    .map(state => state.region.regionId)
}

function plannerDecisionSurface(item: HiddenCorridorFixture): unknown {
  return {
    cells: item.planner.cells,
    routes: item.planner.routes,
    evidence: item.planner.initialObservation.evidence,
    candidates: item.planner.observationCandidates,
    goal: item.planner.goal,
  }
}

describe('Hidden Corridor fixtures', () => {
  it('defines eight fixed, uniquely identified, deterministic cases', () => {
    const first = createHiddenCorridorFixtures()
    const second = createHiddenCorridorFixtures()

    expect(first.map(item => item.planner.caseId)).toEqual(expectedCaseIds)
    expect(new Set(first.map(item => item.planner.seed)).size).toBe(8)
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first[0]!.planner.cells).not.toBe(second[0]!.planner.cells)
  })

  it('keeps routes, cells, observations, and candidate coverage internally aligned', () => {
    for (const item of HIDDEN_CORRIDOR_FIXTURES) {
      const regionIds = item.planner.cells.map(cell => cell.region.regionId)
      const regionIdSet = new Set(regionIds)
      const candidateIds = item.planner.observationCandidates
        .map(candidate => candidate.candidateId)

      expect(item.planner.cells).toHaveLength(9)
      expect(regionIdSet.size).toBe(9)
      expect(item.planner.routes.map(route => route.corridorId)).toEqual(['short', 'long'])
      expect(item.planner.routes.flatMap(route => route.cellIds)
        .every(regionId => regionIdSet.has(regionId))).toBe(true)
      for (const route of item.planner.routes) {
        const traversalCost = route.cellIds.reduce((total, regionId) => (
          total + item.planner.cells.find(cell => cell.cellId === regionId)!.traversalCost
        ), 0)
        expect(route.baseCost).toBeCloseTo(traversalCost)
      }
      expect(item.planner.initialObservation).toMatchObject({
        worldId: item.planner.worldId,
        worldRevision: item.planner.initialWorldRevision,
        readiness: 'ready',
      })
      expect(new Set(candidateIds).size).toBe(candidateIds.length)
      expect(item.planner.observationCandidates
        .flatMap(candidate => candidate.predictedCoverage)
        .every(coverage => regionIdSet.has(coverage.regionId))).toBe(true)
      expect(item.oracle.actualCandidateCoverage.map(coverage => coverage.candidateId).sort())
        .toEqual([...candidateIds].sort())

      for (const actual of item.oracle.actualCandidateCoverage) {
        expect(actual.attempts.map(attempt => attempt.attempt))
          .toEqual(actual.attempts.map((_attempt, index) => index + 1))
        expect(actual.attempts.flatMap(attempt => attempt.regions)
          .every(region => regionIdSet.has(region.regionId))).toBe(true)
      }
    }
  })

  it('stores authoritative truth exclusively in the evaluator-only oracle', () => {
    const forbiddenPlannerKeys = [
      'worldStates',
      'actualCandidateCoverage',
      'revisionEvents',
      'expectedOutcome',
    ]

    for (const item of HIDDEN_CORRIDOR_FIXTURES) {
      const planner = item.planner as unknown as Record<string, unknown>
      for (const key of forbiddenPlannerKeys) expect(planner).not.toHaveProperty(key)
      for (const candidate of item.planner.observationCandidates) {
        expect(candidate).not.toHaveProperty('actualCoverage')
        expect(candidate).not.toHaveProperty('truth')
      }

      for (const worldState of item.oracle.worldStates) {
        expect(validateAuthoritativeWorldState(worldState)).toEqual(worldState)
        expect(worldState.worldId).toBe(item.planner.worldId)
      }
    }
  })

  it('does not leak which of two otherwise identical corridors is blocked', () => {
    const shortBlocked = fixture('short-corridor-blocked')
    const longBlocked = fixture('long-corridor-blocked')

    expect(plannerDecisionSurface(shortBlocked)).toEqual(plannerDecisionSurface(longBlocked))
    expect(occupiedRegionIds(shortBlocked)).toEqual([HIDDEN_CORRIDOR_REGION_IDS.shortTwo])
    expect(occupiedRegionIds(longBlocked)).toEqual([HIDDEN_CORRIDOR_REGION_IDS.longThree])
  })

  it('encodes the four route-truth outcomes', () => {
    expect(fixture('short-corridor-blocked').oracle.expectedOutcome)
      .toMatchObject({ outcome: 'goal-reached', safeCorridor: 'long' })
    expect(fixture('long-corridor-blocked').oracle.expectedOutcome)
      .toMatchObject({ outcome: 'goal-reached', safeCorridor: 'short' })
    expect(fixture('both-corridors-free').oracle.expectedOutcome)
      .toMatchObject({ outcome: 'goal-reached', safeCorridor: 'short' })
    expect(fixture('both-corridors-blocked').oracle.expectedOutcome)
      .toEqual({
        outcome: 'safe-abort',
        safeCorridor: null,
        activeObservationCandidateIds: ['shared-overlook'],
      })
  })

  it('distinguishes one-round and two-round split observations', () => {
    expect(fixture('split-view-one-observation').oracle.expectedOutcome)
      .toMatchObject({ activeObservationCandidateIds: ['short-overlook'] })
    expect(fixture('split-view-two-observations').oracle.expectedOutcome)
      .toMatchObject({
        activeObservationCandidateIds: ['short-overlook', 'long-overlook'],
      })
  })

  it('models loading, partial coverage, and a deterministic ready retry', () => {
    const item = fixture('partial-loading-retry')
    const attempts = item.oracle.actualCandidateCoverage
      .find(coverage => coverage.candidateId === 'shared-overlook')!
      .attempts

    expect(item.planner.goal.maximumObservationCount).toBe(3)
    expect(attempts.map(attempt => attempt.readiness))
      .toEqual(['loading', 'partial', 'ready'])
    expect(attempts.map(attempt => attempt.logicalTimeMs))
      .toEqual([1_000, 2_000, 3_000])
    expect(attempts[0]!.regions.every(region => region.coverage === 'unavailable'))
      .toBe(true)
    expect(attempts[1]!.regions.some(region => region.coverage === 'partial'))
      .toBe(true)
    expect(attempts[2]!.regions.every(region => region.coverage === 'complete'))
      .toBe(true)
  })

  it('makes an earlier belief stale after a deterministic world revision', () => {
    const item = fixture('revision-stales-belief')
    const event = item.oracle.revisionEvents[0]!

    expect(item.oracle.worldStates.map(state => state.revision)).toEqual([1, 2])
    expect(event).toMatchObject({
      afterObservationCount: 1,
      fromWorldRevision: 1,
      toWorldRevision: 2,
      changedRegionIds: [HIDDEN_CORRIDOR_REGION_IDS.shortTwo],
      staleRegionIds: [HIDDEN_CORRIDOR_REGION_IDS.shortTwo],
    })
    expect(occupiedRegionIds(item, 1)).toEqual([])
    expect(occupiedRegionIds(item, 2)).toEqual([HIDDEN_CORRIDOR_REGION_IDS.shortTwo])
    expect(item.oracle.actualCandidateCoverage
      .find(coverage => coverage.candidateId === 'shared-overlook')!
      .attempts.map(attempt => attempt.worldRevision)).toEqual([1, 2])
  })
})
