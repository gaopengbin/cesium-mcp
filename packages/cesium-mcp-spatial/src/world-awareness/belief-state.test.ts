import { describe, expect, it } from 'vitest'
import type { SpatialObject } from '../types.js'
import {
  ageAgentBeliefState,
  applyWorldObservation,
  createAgentBeliefState,
  invalidateAgentBeliefState,
  spatialKnowledgeState,
} from './belief-state.js'
import type {
  AgentBeliefState,
  ObjectObservationEvidence,
  RegionObservationEvidence,
  SpatialRegion,
  WorldEvidence,
  WorldObservation,
} from './types.js'

const T0 = '2026-08-31T00:00:00.000Z'
const T1 = '2026-08-31T00:01:00.000Z'
const T2 = '2026-08-31T00:02:00.000Z'
const T3 = '2026-08-31T00:03:00.000Z'

function region(regionId: string, west = 86.7): SpatialRegion {
  return {
    regionId,
    footprint: {
      type: 'Polygon',
      coordinates: [[
        [west, 27.8],
        [west + 0.01, 27.8],
        [west + 0.01, 27.81],
        [west, 27.81],
        [west, 27.8],
      ]],
    },
    minHeight: 3_000,
    maxHeight: 8_000,
    properties: { role: 'corridor' },
  }
}

function belief(regions: readonly SpatialRegion[] = [region('corridor-a')]): AgentBeliefState {
  return createAgentBeliefState({
    beliefId: 'belief-1',
    worldId: 'world-1',
    createdAt: T0,
    regions,
  })
}

function regionEvidence(
  evidenceId: string,
  target: SpatialRegion,
  occupancy: RegionObservationEvidence['occupancy'],
  options: Partial<RegionObservationEvidence> = {},
): RegionObservationEvidence {
  return {
    kind: 'region-occupancy',
    evidenceId,
    sensorId: 'ray-1',
    sampledAt: T1,
    quality: 'exact',
    confidence: 0.9,
    basis: occupancy === 'occupied' ? 'positive-ray-hit' : 'cleared-volume',
    region: target,
    occupancy,
    coverage: 'complete',
    ...options,
  }
}

function spatialObject(objectId: string, observedAt = T1): SpatialObject {
  return {
    objectId,
    sourceType: 'entity',
    type: 'obstacle',
    name: 'Observed obstacle',
    geometry: { type: 'Point', coordinates: [86.705, 27.805, 5_000] },
    properties: { blocking: true },
    geometryQuality: 'exact',
    observedAt,
    revision: 1,
    provenance: { source: 'fixture', method: 'ray-hit' },
  }
}

function objectEvidence(
  evidenceId: string,
  object: SpatialObject,
  sampledAt = T1,
): ObjectObservationEvidence {
  return {
    kind: 'object',
    evidenceId,
    sensorId: 'ray-1',
    sampledAt,
    quality: 'exact',
    confidence: 0.95,
    basis: 'positive-ray-hit',
    object,
  }
}

function observation(input: {
  observationId: string
  worldRevision?: number
  sampledAt?: string
  readiness?: WorldObservation['readiness']
  changedDuringObservation?: boolean
  evidence: WorldEvidence[]
  worldId?: string
}): WorldObservation {
  const sampledAt = input.sampledAt ?? T1
  return {
    schemaVersion: 1,
    observationId: input.observationId,
    worldId: input.worldId ?? 'world-1',
    worldRevision: input.worldRevision ?? 1,
    startedAt: sampledAt,
    completedAt: sampledAt,
    changedDuringObservation: input.changedDuringObservation ?? false,
    readiness: input.readiness ?? 'ready',
    sensors: [{ sensorId: 'ray-1', kind: 'ray', rangeMeters: 15_000 }],
    evidence: input.evidence.map(item => ({ ...item, sampledAt })),
    limitations: [],
  }
}

describe('agent belief state', () => {
  it('initializes task regions as current unknowns without exposing world truth', () => {
    const left = region('left', 86.72)
    const right = region('right', 86.70)
    const state = belief([left, right])

    expect(state).toMatchObject({
      schemaVersion: 1,
      beliefId: 'belief-1',
      worldId: 'world-1',
      revision: 0,
      objects: [],
      appliedObservationIds: [],
    })
    expect(state.regions.map(item => item.region.regionId)).toEqual(['left', 'right'])
    expect(state.regions.every(item => (
      item.occupancy === 'unknown'
      && item.freshness === 'current'
      && item.confidence === 0
      && item.unknownReason === 'not-observed'
    ))).toBe(true)
    expect(spatialKnowledgeState(state.regions[0]!)).toBe('unknown')

    left.properties!.role = 'mutated-after-create'
    expect(state.regions[0]!.region.properties?.role).toBe('corridor')
  })

  it('accepts only ready, stable, complete evidence as free space', () => {
    const target = region('corridor-a')
    const safe = applyWorldObservation(belief(), observation({
      observationId: 'safe-free',
      evidence: [regionEvidence('free-1', target, 'free')],
    }))
    const partial = applyWorldObservation(belief(), observation({
      observationId: 'partial-free',
      readiness: 'partial',
      evidence: [regionEvidence('free-2', target, 'free')],
    }))
    const changed = applyWorldObservation(belief(), observation({
      observationId: 'changed-free',
      changedDuringObservation: true,
      evidence: [regionEvidence('free-3', target, 'free')],
    }))
    const rayOnly = applyWorldObservation(belief(), observation({
      observationId: 'ray-only-free',
      evidence: [regionEvidence('free-4', target, 'free', { coverage: 'partial' })],
    }))

    expect(safe.state.regions[0]).toMatchObject({
      occupancy: 'free',
      freshness: 'current',
      confidence: 0.9,
    })
    for (const result of [partial, changed, rayOnly]) {
      expect(result.state.regions[0]).toMatchObject({
        occupancy: 'unknown',
        unknownReason: 'insufficient-coverage',
        confidence: 0,
      })
      expect(result.diff.changes[0]).toMatchObject({
        change: 'updated',
        reason: 'unsafe-free-evidence-downgraded',
      })
    }
  })

  it('accepts a positive occupied hit from partial coverage', () => {
    const target = region('corridor-a')
    const result = applyWorldObservation(belief(), observation({
      observationId: 'occupied-hit',
      readiness: 'partial',
      evidence: [regionEvidence('occupied-1', target, 'occupied', {
        coverage: 'partial',
        blockingObjectIds: ['rock-1'],
      })],
    }))

    expect(result.state.regions[0]).toMatchObject({
      occupancy: 'occupied',
      freshness: 'current',
      blockingObjectIds: ['rock-1'],
    })
  })

  it('does not let unknown or older evidence erase a fresh known claim', () => {
    const target = region('corridor-a')
    const known = applyWorldObservation(belief(), observation({
      observationId: 'known',
      worldRevision: 2,
      sampledAt: T2,
      evidence: [regionEvidence('occupied-new', target, 'occupied', {
        blockingObjectIds: ['rock-1'],
      })],
    })).state
    const unknown = applyWorldObservation(known, observation({
      observationId: 'unknown-later',
      worldRevision: 3,
      sampledAt: T3,
      evidence: [regionEvidence('unknown-1', target, 'unknown', {
        coverage: 'occluded',
        unknownReason: 'occluded',
      })],
    }))
    const older = applyWorldObservation(unknown.state, observation({
      observationId: 'older-free',
      worldRevision: 1,
      sampledAt: T1,
      evidence: [regionEvidence('free-old', target, 'free')],
    }))

    expect(unknown.state.regions[0]).toMatchObject({
      occupancy: 'occupied',
      blockingObjectIds: ['rock-1'],
    })
    expect(unknown.diff.ignoredEvidenceIds).toEqual(['unknown-1'])
    expect(older.state.regions[0]!.occupancy).toBe('occupied')
    expect(older.diff.ignoredEvidenceIds).toEqual(['free-old'])
  })

  it('applies an observation once and increments belief revision once', () => {
    const target = region('corridor-a')
    const input = observation({
      observationId: 'observation-1',
      evidence: [
        regionEvidence('free-1', target, 'free'),
        objectEvidence('object-1', spatialObject('marker-1')),
      ],
    })
    const first = applyWorldObservation(belief(), input)
    const duplicate = applyWorldObservation(first.state, input)

    expect(first.state.revision).toBe(1)
    expect(first.state.appliedObservationIds).toEqual(['observation-1'])
    expect(first.diff.changes).toHaveLength(2)
    expect(duplicate.duplicate).toBe(true)
    expect(duplicate.state).toBe(first.state)
    expect(duplicate.state.revision).toBe(1)
    expect(duplicate.diff).toMatchObject({ fromRevision: 1, toRevision: 1 })
  })

  it('ages known claims to stale while preserving their occupancy', () => {
    const target = region('corridor-a')
    const observed = applyWorldObservation(belief(), observation({
      observationId: 'short-lived',
      evidence: [regionEvidence('free-1', target, 'free', { validUntil: T2 })],
    })).state

    const beforeExpiry = ageAgentBeliefState(observed, T1)
    const expired = ageAgentBeliefState(observed, T2)

    expect(beforeExpiry.state).toBe(observed)
    expect(expired.state).not.toBe(observed)
    expect(expired.state.regions[0]).toMatchObject({
      occupancy: 'free',
      freshness: 'stale',
    })
    expect(spatialKnowledgeState(expired.state.regions[0]!)).toBe('stale')
    expect(expired.state.revision).toBe(2)
  })

  it('revives stale claims with newer evidence and supports default validity', () => {
    const target = region('corridor-a')
    const observed = applyWorldObservation(belief(), observation({
      observationId: 'default-validity',
      evidence: [regionEvidence('free-1', target, 'free')],
    }), { defaultValidForMs: 60_000 }).state
    const stale = ageAgentBeliefState(observed, T2).state
    const revived = applyWorldObservation(stale, observation({
      observationId: 'fresh-evidence',
      worldRevision: 2,
      sampledAt: T3,
      evidence: [regionEvidence('free-2', target, 'free')],
    }))

    expect(observed.regions[0]!.validUntil).toBe(T2)
    expect(stale.regions[0]!.freshness).toBe('stale')
    expect(revived.state.regions[0]!.freshness).toBe('current')
    expect(revived.diff.changes).toContainEqual(expect.objectContaining({
      targetId: 'corridor-a',
      change: 'revived',
    }))
  })

  it('resolves same-version opposing occupancy conservatively as unknown', () => {
    const target = region('corridor-a')
    const free = applyWorldObservation(belief(), observation({
      observationId: 'free-view',
      evidence: [regionEvidence('free-1', target, 'free')],
    })).state
    const conflict = applyWorldObservation(free, observation({
      observationId: 'occupied-view',
      evidence: [regionEvidence('occupied-1', target, 'occupied', {
        blockingObjectIds: ['rock-1'],
      })],
    }))

    expect(conflict.state.regions[0]).toMatchObject({
      occupancy: 'unknown',
      freshness: 'current',
      confidence: 0,
      unknownReason: 'conflicting-evidence',
      blockingObjectIds: ['rock-1'],
    })
    expect(conflict.state.conflicts).toHaveLength(1)
    expect(conflict.state.conflicts[0]).toMatchObject({
      targetId: 'corridor-a',
      evidenceIds: ['free-1', 'occupied-1'],
      resolution: 'conservative-unknown',
    })
    expect(conflict.diff.changes[0]!.change).toBe('conflicted')
  })

  it('clears an active conflict when a newer reliable observation arrives', () => {
    const target = region('corridor-a')
    const free = applyWorldObservation(belief(), observation({
      observationId: 'free-view',
      evidence: [regionEvidence('free-1', target, 'free')],
    })).state
    const conflicted = applyWorldObservation(free, observation({
      observationId: 'occupied-view',
      evidence: [regionEvidence('occupied-1', target, 'occupied')],
    })).state
    const resolved = applyWorldObservation(conflicted, observation({
      observationId: 'newer-view',
      worldRevision: 2,
      sampledAt: T2,
      evidence: [regionEvidence('free-2', target, 'free')],
    }))

    expect(resolved.state.regions[0]!.occupancy).toBe('free')
    expect(resolved.state.conflicts).toEqual([])
  })

  it('tracks observed objects without inferring deletion from omission', () => {
    const firstObject = spatialObject('obstacle-b')
    const secondObject = spatialObject('obstacle-a')
    const observed = applyWorldObservation(belief(), observation({
      observationId: 'objects',
      evidence: [
        objectEvidence('object-b', firstObject),
        objectEvidence('object-a', secondObject),
      ],
    })).state
    const noObjects = applyWorldObservation(observed, observation({
      observationId: 'empty-observation',
      worldRevision: 2,
      sampledAt: T2,
      evidence: [],
    })).state

    expect(observed.objects.map(item => item.objectId)).toEqual(['obstacle-a', 'obstacle-b'])
    expect(noObjects.objects.map(item => item.objectId)).toEqual(['obstacle-a', 'obstacle-b'])
  })

  it('invalidates selected known claims without staling unknown regions', () => {
    const target = region('corridor-a')
    const observed = applyWorldObservation(belief([target, region('corridor-b', 86.72)]), observation({
      observationId: 'known-region',
      evidence: [
        regionEvidence('free-1', target, 'free'),
        objectEvidence('object-1', spatialObject('obstacle-1')),
      ],
    })).state
    const invalidated = invalidateAgentBeliefState(observed, {
      invalidatedAt: T2,
      reason: 'world-change-overlaps-task-area',
      regionIds: ['corridor-a', 'corridor-b'],
      objectIds: ['obstacle-1'],
    })

    expect(invalidated.state.regions.find(item => item.region.regionId === 'corridor-a'))
      .toMatchObject({ occupancy: 'free', freshness: 'stale' })
    expect(invalidated.state.regions.find(item => item.region.regionId === 'corridor-b'))
      .toMatchObject({ occupancy: 'unknown', freshness: 'current' })
    expect(invalidated.state.objects[0]!.freshness).toBe('stale')
    expect(invalidated.state.revision).toBe(observed.revision + 1)
  })

  it('rejects mismatched worlds, unknown sensors, and invalid confidence', () => {
    const target = region('corridor-a')
    expect(() => applyWorldObservation(belief(), observation({
      observationId: 'wrong-world',
      worldId: 'world-2',
      evidence: [],
    }))).toThrow('does not match')

    const unknownSensor = observation({
      observationId: 'unknown-sensor',
      evidence: [regionEvidence('free-1', target, 'free', { sensorId: 'missing' })],
    })
    expect(() => applyWorldObservation(belief(), unknownSensor)).toThrow('unknown sensor')

    const invalidConfidence = observation({
      observationId: 'invalid-confidence',
      evidence: [regionEvidence('free-2', target, 'free', { confidence: 1.1 })],
    })
    expect(() => applyWorldObservation(belief(), invalidConfidence)).toThrow('between 0 and 1')
  })

  it('does not mutate the input belief or observation', () => {
    const target = region('corridor-a')
    const initial = belief()
    const input = observation({
      observationId: 'immutable',
      evidence: [regionEvidence('occupied-1', target, 'occupied', {
        blockingObjectIds: ['rock-1'],
      })],
    })
    const initialJson = JSON.stringify(initial)
    const observationJson = JSON.stringify(input)

    const result = applyWorldObservation(initial, input)
    result.state.regions[0]!.blockingObjectIds.push('consumer-mutation')

    expect(JSON.stringify(initial)).toBe(initialJson)
    expect(JSON.stringify(input)).toBe(observationJson)
  })
})
