import { describe, expect, it } from 'vitest'

import {
  beliefRegionUncertainty,
  binaryEntropy,
  calculateGoalUncertainty,
  decideActivePerception,
  rankObservationCandidates,
  scoreObservationCandidate,
  shouldObserve,
} from './active-perception.js'
import type {
  ActivePerceptionGoal,
  AgentBeliefState,
  BeliefRegion,
  ObservationCandidate,
  SpatialRegion,
} from './types.js'

const observedAt = '2026-08-31T00:00:00.000Z'

function spatialRegion(regionId: string): SpatialRegion {
  return {
    regionId,
    footprint: {
      type: 'Polygon',
      coordinates: [[
        [116, 39],
        [116.01, 39],
        [116.01, 39.01],
        [116, 39.01],
        [116, 39],
      ]],
    },
  }
}

function beliefRegion(
  regionId: string,
  occupancy: BeliefRegion['occupancy'] = 'unknown',
  options: { confidence?: number; freshness?: BeliefRegion['freshness'] } = {},
): BeliefRegion {
  return {
    region: spatialRegion(regionId),
    occupancy,
    freshness: options.freshness ?? 'current',
    confidence: options.confidence ?? (occupancy === 'unknown' ? 0 : 1),
    blockingObjectIds: [],
    ...(occupancy === 'unknown' ? { unknownReason: 'not-observed' as const } : {}),
    evidence: [],
  }
}

function belief(
  regions: BeliefRegion[],
  appliedObservationIds: string[] = [],
): AgentBeliefState {
  return {
    schemaVersion: 1,
    beliefId: 'hidden-corridor-belief',
    worldId: 'hidden-corridor-world',
    revision: 1,
    createdAt: observedAt,
    updatedAt: observedAt,
    objects: [],
    regions,
    appliedObservationIds,
    conflicts: [],
  }
}

function goal(
  relevantRegionIds: string[],
  overrides: Partial<ActivePerceptionGoal> = {},
): ActivePerceptionGoal {
  return {
    goalId: 'reach-hidden-corridor-exit',
    relevantRegionIds,
    maximumObservationCount: 2,
    uncertaintyThreshold: 0.1,
    ...overrides,
  }
}

function candidate(
  candidateId: string,
  coverage: Array<[string, number]>,
  overrides: Partial<ObservationCandidate> = {},
): ObservationCandidate {
  return {
    candidateId,
    sensor: {
      sensorId: `${candidateId}-camera`,
      kind: 'camera',
    },
    predictedCoverage: coverage.map(([regionId, visibilityProbability]) => ({
      regionId,
      visibilityProbability,
    })),
    movementCost: 0,
    acquisitionCost: 0,
    exposureRisk: 0,
    readinessProbability: 1,
    ...overrides,
  }
}

describe('active perception scoring', () => {
  it('uses binary entropy for occupancy uncertainty', () => {
    expect(binaryEntropy(0)).toBe(0)
    expect(binaryEntropy(0.5)).toBe(1)
    expect(binaryEntropy(1)).toBe(0)
    expect(binaryEntropy(0.25)).toBeCloseTo(0.811278, 6)
    expect(() => binaryEntropy(-0.1)).toThrow('between 0 and 1')
    expect(() => binaryEntropy(Number.NaN)).toThrow('between 0 and 1')
  })

  it('weights expected information gain by task relevance and visibility', () => {
    const state = belief([
      beliefRegion('north-hidden'),
      beliefRegion('south-hidden'),
    ])
    const task = goal(['north-hidden', 'south-hidden'], {
      regionWeights: { 'north-hidden': 3, 'south-hidden': 1 },
    })
    const score = scoreObservationCandidate(
      state,
      task,
      candidate('ridge-overlook', [['north-hidden', 1], ['south-hidden', 0.5]]),
    )

    expect(score.valid).toBe(true)
    expect(score.expectedInformationGain).toBeCloseTo(0.875)
    expect(score.routeDisambiguation).toBeCloseTo(0.875)
    expect(score.coveredUnknownRegionIds).toEqual(['north-hidden', 'south-hidden'])
  })

  it('does not request observation when all relevant regions are current and known', () => {
    const state = belief([
      beliefRegion('north-hidden', 'free'),
      beliefRegion('south-hidden', 'occupied'),
    ])
    const task = goal(['north-hidden', 'south-hidden'])
    const knownOnlyScore = scoreObservationCandidate(
      state,
      task,
      candidate('known-overlook', [['north-hidden', 1], ['south-hidden', 1]]),
    )

    expect(beliefRegionUncertainty(state.regions[0])).toBe(0)
    expect(calculateGoalUncertainty(state, task)).toBe(0)
    expect(knownOnlyScore.valid).toBe(false)
    expect(knownOnlyScore.reasons).toContain('no-expected-information-gain')
    expect(shouldObserve(state, task)).toBe(false)
    expect(decideActivePerception(state, task, [
      candidate('known-overlook', [['north-hidden', 1], ['south-hidden', 1]]),
    ])).toMatchObject({
      shouldObserve: false,
      reason: 'goal-uncertainty-within-threshold',
    })
  })

  it('prefers lower movement, acquisition, and exposure costs for equal evidence', () => {
    const state = belief([beliefRegion('blind-sector')])
    const task = goal(['blind-sector'])
    const safer = candidate('safer', [['blind-sector', 1]], {
      movementCost: 0.1,
      acquisitionCost: 0.1,
      exposureRisk: 0.1,
    })
    const costly = candidate('costly', [['blind-sector', 1]], {
      movementCost: 0.8,
      acquisitionCost: 0.7,
      exposureRisk: 0.9,
    })
    const scores = rankObservationCandidates(state, task, [costly, safer])

    expect(scores.map(score => score.candidateId)).toEqual(['safer', 'costly'])
    expect(scores[0]!.score).toBeGreaterThan(scores[1]!.score)
    expect(decideActivePerception(state, task, [costly, safer]).selectedCandidateId)
      .toBe('safer')
  })

  it('rejects invalid or irrelevant candidates and respects the observation budget', () => {
    const state = belief([beliefRegion('blind-sector')], ['observation:1', 'observation:2'])
    const task = goal(['blind-sector'])
    const invalid = candidate('invalid', [['blind-sector', 1]], {
      movementCost: -1,
      readinessProbability: 1.2,
    })
    const irrelevant = candidate('irrelevant', [['other-region', 1]])
    const scores = rankObservationCandidates(state, task, [invalid, irrelevant])

    expect(scores.every(score => !score.valid)).toBe(true)
    expect(scores.find(score => score.candidateId === 'invalid')?.reasons)
      .toEqual(expect.arrayContaining([
        'invalid-movement-cost',
        'invalid-readiness-probability',
      ]))
    expect(scores.find(score => score.candidateId === 'irrelevant')?.reasons)
      .toContain('no-relevant-coverage')
    expect(shouldObserve(state, task)).toBe(false)
    expect(decideActivePerception(state, task, [invalid, irrelevant])).toMatchObject({
      shouldObserve: false,
      reason: 'observation-budget-exhausted',
    })
  })

  it('uses a deterministic tie-break and never inspects candidate truth metadata', () => {
    const state = belief([beliefRegion('blind-sector')])
    const task = goal(['blind-sector'])
    const tiedB = candidate('b-overlook', [['blind-sector', 1]])
    const tiedA = candidate('a-overlook', [['blind-sector', 1]])
    for (const item of [tiedA, tiedB]) {
      Object.defineProperty(item, 'properties', {
        configurable: true,
        get() {
          throw new Error('active perception attempted to read hidden truth')
        },
      })
      Object.defineProperty(item, 'truth', {
        configurable: true,
        get() {
          throw new Error('active perception attempted to read hidden truth')
        },
      })
    }

    const first = decideActivePerception(state, task, [tiedB, tiedA])
    const second = decideActivePerception(state, task, [tiedA, tiedB])
    expect(first.selectedCandidateId).toBe('a-overlook')
    expect(second.selectedCandidateId).toBe('a-overlook')
    expect(first.scores.map(score => score.candidateId))
      .toEqual(second.scores.map(score => score.candidateId))
  })

  it('declines an observation whose risk and costs outweigh its expected value', () => {
    const state = belief([beliefRegion('blind-sector')])
    const task = goal(['blind-sector'])
    const unsafe = candidate('unsafe-overlook', [['blind-sector', 0.05]], {
      movementCost: 1,
      acquisitionCost: 1,
      exposureRisk: 1,
      readinessProbability: 0.5,
    })

    expect(decideActivePerception(state, task, [unsafe])).toMatchObject({
      shouldObserve: false,
      reason: 'no-positive-utility-candidate',
    })
  })
})
