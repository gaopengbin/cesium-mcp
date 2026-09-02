import { describe, expect, it } from 'vitest'

import type {
  AgentBeliefState,
  BeliefRegion,
  SpatialRegion,
} from 'cesium-mcp-spatial'
import {
  FLIGHT_OBSERVATION_CANDIDATE_IDS,
  createFlightActivePerceptionGoal,
  createFlightObservationCandidates,
  selectFlightActivePerception,
} from './flight-active-perception.js'

const RISK_REGION_ID = 'himalaya-active-risk-envelope'
const OBSERVED_AT = '2026-09-02T00:00:00.000Z'

function spatialRegion(): SpatialRegion {
  return {
    regionId: RISK_REGION_ID,
    footprint: {
      type: 'Polygon',
      coordinates: [[
        [86.89, 27.93],
        [86.91, 27.93],
        [86.91, 27.95],
        [86.89, 27.95],
        [86.89, 27.93],
      ]],
    },
  }
}

function beliefRegion(
  occupancy: BeliefRegion['occupancy'] = 'unknown',
  confidence = occupancy === 'unknown' ? 0 : 1,
): BeliefRegion {
  return {
    region: spatialRegion(),
    occupancy,
    freshness: 'current',
    confidence,
    blockingObjectIds: [],
    ...(occupancy === 'unknown' ? { unknownReason: 'not-observed' as const } : {}),
    evidence: [],
  }
}

function belief(
  region = beliefRegion(),
  appliedObservationIds: string[] = [],
): AgentBeliefState {
  return {
    schemaVersion: 1,
    beliefId: 'himalaya-active-view-belief',
    worldId: 'himalaya-flight-world',
    revision: 1,
    createdAt: OBSERVED_AT,
    updatedAt: OBSERVED_AT,
    objects: [],
    regions: [region],
    appliedObservationIds,
    conflicts: [],
  }
}

const candidateInput = {
  riskEnvelopeRegionId: RISK_REGION_ID,
  target: [86.9, 27.94, 8_200] as [number, number, number],
  routeHeadingDegrees: 725,
}

describe('flight active perception', () => {
  it('creates a stable finite four-view candidate set and an explicit goal', () => {
    const first = createFlightObservationCandidates(candidateInput)
    const second = createFlightObservationCandidates(candidateInput)
    const goal = createFlightActivePerceptionGoal(RISK_REGION_ID)

    expect(first).toEqual(second)
    expect(first.map(candidate => candidate.candidateId))
      .toEqual(FLIGHT_OBSERVATION_CANDIDATE_IDS)
    expect(first).toHaveLength(4)
    expect(first.map(candidate => candidate.executionPose.azimuthFromTargetDegrees))
      .toEqual([185, 275, 95, 185])
    for (const candidate of first) {
      expect(candidate.predictedCoverage).toEqual([{
        regionId: RISK_REGION_ID,
        visibilityProbability: expect.any(Number),
      }])
      expect([
        candidate.movementCost,
        candidate.acquisitionCost,
        candidate.exposureRisk,
        candidate.readinessProbability,
        candidate.executionPose.relativeHeadingDegrees,
        candidate.executionPose.azimuthFromTargetDegrees,
        candidate.executionPose.pitchDegrees,
        candidate.executionPose.rangeMeters,
        ...candidate.executionPose.target,
      ].every(Number.isFinite)).toBe(true)
    }
    expect(goal).toMatchObject({
      relevantRegionIds: [RISK_REGION_ID],
      maximumObservationCount: 3,
      uncertaintyThreshold: 0.18,
    })
  })

  it.each([
    ['left', 'left-overlook'],
    ['right', 'right-overlook'],
  ] as const)(
    'selects the lower-exposure %s overlook for an unknown envelope',
    (lowerExposureSide, expectedCandidateId) => {
      const selection = selectFlightActivePerception({
        ...candidateInput,
        lowerExposureSide,
        belief: belief(),
        activeObservationCount: 0,
      })

      expect(selection.decision).toMatchObject({
        shouldObserve: true,
        selectedCandidateId: expectedCandidateId,
      })
      expect(selection.selectedCandidate?.candidateId).toBe(expectedCandidateId)
      expect(selection.selectedExecutionPose).toEqual(
        selection.selectedCandidate?.executionPose,
      )
    },
  )

  it('does not observe after the explicit active-camera budget is exhausted', () => {
    const selection = selectFlightActivePerception({
      ...candidateInput,
      belief: belief(),
      activeObservationCount: 3,
    })

    expect(selection.decision).toMatchObject({
      shouldObserve: false,
      reason: 'observation-budget-exhausted',
    })
    expect(selection.selectedCandidate).toBeUndefined()
  })

  it('does not observe a current known region with low uncertainty', () => {
    const selection = selectFlightActivePerception({
      ...candidateInput,
      belief: belief(beliefRegion('free', 0.99)),
      activeObservationCount: 0,
    })

    expect(selection.decision).toMatchObject({
      shouldObserve: false,
      reason: 'goal-uncertainty-within-threshold',
    })
  })

  it('uses the explicit camera count instead of applied evidence identifiers', () => {
    const evidenceHeavyBelief = belief(
      beliefRegion(),
      Array.from({ length: 12 }, (_, index) => `evidence:${index + 1}`),
    )
    const selection = selectFlightActivePerception({
      ...candidateInput,
      belief: evidenceHeavyBelief,
      activeObservationCount: 0,
      maximumObservationCount: 1,
      lowerExposureSide: 'left',
    })

    expect(selection.decision).toMatchObject({
      shouldObserve: true,
      selectedCandidateId: 'left-overlook',
    })
  })
})
