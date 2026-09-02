import { describe, expect, it } from 'vitest'
import type { SpatialObject } from '../types.js'
import {
  applyWorldObservation,
  createAgentBeliefState,
} from './belief-state.js'
import type { SpatialRegion } from './types.js'
import {
  createVisualGroundingObservation,
  parseVisualGroundingReport,
} from './visual-grounding.js'
import type { CreateVisualGroundingObservationInput } from './visual-grounding.js'

const imageDigest = `sha256:${'a'.repeat(64)}`
const startedAt = '2026-08-31T08:00:00.000Z'
const capturedAt = '2026-08-31T08:00:01.000Z'
const completedAt = '2026-08-31T08:00:02.000Z'

function region(regionId = 'corridor-left'): SpatialRegion {
  return {
    regionId,
    footprint: {
      type: 'Polygon',
      coordinates: [[
        [86.8, 27.8],
        [87, 27.8],
        [87, 28],
        [86.8, 28],
        [86.8, 27.8],
      ]],
    },
  }
}

function obstacle(objectId = 'rock-1'): SpatialObject {
  return {
    objectId,
    sourceType: 'entity',
    type: 'obstacle',
    name: 'Grounded rock',
    geometry: { type: 'Point', coordinates: [86.9, 27.9, 5100] },
    properties: { safetyClass: 'blocking' },
    geometryQuality: 'exact',
    observedAt: capturedAt,
    revision: 1,
    provenance: { source: 'local-spatial-context', method: 'entity' },
  }
}

function report(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    imageDigest,
    objects: [],
    regions: [],
    limitations: [],
    ...overrides,
  }
}

function input(
  overrides: Partial<CreateVisualGroundingObservationInput> = {},
): CreateVisualGroundingObservationInput {
  return {
    observationId: 'visual-observation-1',
    worldId: 'hidden-corridor',
    worldRevision: 7,
    startedAt,
    capturedAt,
    completedAt,
    changedDuringObservation: false,
    readiness: 'ready',
    sensor: {
      sensorId: 'independent-camera-1',
      kind: 'camera',
      pose: {
        position: [86.9, 27.9, 5300],
        headingDegrees: 45,
        pitchDegrees: -20,
      },
    },
    imageDigest,
    artifactRef: imageDigest,
    requestedObjectIds: [],
    requestedRegionIds: [],
    spatialObjects: [],
    spatialRegions: [],
    report: report(),
    ...overrides,
  }
}

describe('visual grounding', () => {
  it('keeps an image artifact as provenance without treating pixels as belief facts', () => {
    const observation = createVisualGroundingObservation(input())
    const belief = createAgentBeliefState({
      beliefId: 'agent-belief',
      worldId: 'hidden-corridor',
      createdAt: startedAt,
      regions: [],
    })
    const update = applyWorldObservation(belief, observation)

    expect(observation.evidence).toHaveLength(1)
    expect(observation.evidence[0]).toMatchObject({
      kind: 'artifact',
      artifactType: 'image',
      artifactRef: imageDigest,
    })
    expect(update.state.objects).toEqual([])
    expect(update.state.regions).toEqual([])
    expect(update.diff.changes).toEqual([])
    expect(update.diff.ignoredEvidenceIds).toEqual([
      observation.evidence[0]!.evidenceId,
    ])
    expect(JSON.stringify(observation)).not.toContain('base64')
  })

  it('grounds only local visible objects and conservatively updates occupied regions', () => {
    const localRegion = region()
    const localObject = obstacle()
    const observation = createVisualGroundingObservation(input({
      requestedObjectIds: [localObject.objectId],
      requestedRegionIds: [localRegion.regionId],
      spatialObjects: [localObject],
      spatialRegions: [localRegion],
      report: report({
        objects: [{
          objectId: localObject.objectId,
          visibility: 'visible',
          confidence: 0.93,
          bbox: { x: 0.2, y: 0.25, width: 0.1, height: 0.2 },
        }],
        regions: [{
          regionId: localRegion.regionId,
          occupancy: 'occupied',
          coverage: 'partial',
          confidence: 0.86,
          bbox: { x: 0.15, y: 0.2, width: 0.4, height: 0.5 },
          blockingObjectIds: [localObject.objectId],
        }],
      }),
    }))
    const belief = createAgentBeliefState({
      beliefId: 'agent-belief',
      worldId: 'hidden-corridor',
      createdAt: startedAt,
      regions: [localRegion],
    })
    const update = applyWorldObservation(belief, observation)

    expect(update.state.objects).toHaveLength(1)
    expect(update.state.objects[0]).toMatchObject({
      objectId: localObject.objectId,
      confidence: 0.93,
    })
    expect(update.state.objects[0]!.object).toEqual(localObject)
    expect(update.state.regions[0]).toMatchObject({
      occupancy: 'occupied',
      confidence: 0.86,
      blockingObjectIds: [localObject.objectId],
    })
  })

  it('downgrades clear and missing detections to unknown rather than free', () => {
    const clearRegion = region('clear-report')
    const missingRegion = region('missing-report')
    const notVisibleObject = obstacle('not-visible-object')
    const observation = createVisualGroundingObservation(input({
      requestedObjectIds: [notVisibleObject.objectId],
      requestedRegionIds: [missingRegion.regionId, clearRegion.regionId],
      spatialObjects: [notVisibleObject],
      spatialRegions: [clearRegion, missingRegion],
      report: report({
        objects: [{
          objectId: notVisibleObject.objectId,
          visibility: 'not-visible',
          confidence: 0.99,
        }],
        regions: [{
          regionId: clearRegion.regionId,
          occupancy: 'clear',
          coverage: 'complete',
          confidence: 0.99,
        }],
      }),
    }))
    const regionEvidence = observation.evidence.filter(evidence => (
      evidence.kind === 'region-occupancy'
    ))

    expect(regionEvidence).toHaveLength(2)
    expect(observation.evidence.some(evidence => evidence.kind === 'object')).toBe(false)
    expect(regionEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        region: expect.objectContaining({ regionId: clearRegion.regionId }),
        occupancy: 'unknown',
        unknownReason: 'insufficient-coverage',
      }),
      expect.objectContaining({
        region: expect.objectContaining({ regionId: missingRegion.regionId }),
        occupancy: 'unknown',
        unknownReason: 'not-observed',
      }),
    ]))

    const belief = createAgentBeliefState({
      beliefId: 'agent-belief',
      worldId: 'hidden-corridor',
      createdAt: startedAt,
      regions: [clearRegion, missingRegion],
    })
    const update = applyWorldObservation(belief, observation)
    expect(update.state.regions.every(item => item.occupancy === 'unknown')).toBe(true)
  })

  it('rejects unknown or unrequested object and region IDs', () => {
    const localObject = obstacle()
    const localRegion = region()

    expect(() => createVisualGroundingObservation(input({
      requestedObjectIds: [localObject.objectId],
      spatialObjects: [localObject],
      report: report({
        objects: [{
          objectId: 'hallucinated-object',
          visibility: 'visible',
          confidence: 0.8,
          bbox: { x: 0, y: 0, width: 0.2, height: 0.2 },
        }],
      }),
    }))).toThrow(/unknown or unrequested object ID/i)

    expect(() => createVisualGroundingObservation(input({
      requestedRegionIds: [localRegion.regionId],
      spatialRegions: [localRegion],
      report: report({
        regions: [{
          regionId: 'hallucinated-region',
          occupancy: 'occupied',
          coverage: 'partial',
          confidence: 0.8,
        }],
      }),
    }))).toThrow(/unknown or unrequested region ID/i)
  })

  it('strictly rejects invalid bbox, confidence, schema fields, and data URLs', () => {
    const localObject = obstacle()
    const visibleObject = {
      objectId: localObject.objectId,
      visibility: 'visible',
      confidence: 0.8,
      bbox: { x: 0.9, y: 0, width: 0.2, height: 0.2 },
    }

    expect(() => createVisualGroundingObservation(input({
      requestedObjectIds: [localObject.objectId],
      spatialObjects: [localObject],
      report: report({ objects: [visibleObject] }),
    }))).toThrow(/fit within normalized image coordinates/i)

    expect(() => parseVisualGroundingReport(report({
      objects: [{
        ...visibleObject,
        confidence: 1.01,
        bbox: { x: 0, y: 0, width: 0.2, height: 0.2 },
      }],
    }))).toThrow(/confidence.*between 0 and 1/i)

    expect(() => parseVisualGroundingReport({
      ...report(),
      rawImage: 'forbidden',
    })).toThrow(/unknown field: rawImage/i)

    expect(() => createVisualGroundingObservation(input({
      artifactRef: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    }))).toThrow(/data URL or base64/i)
  })

  it('preserves loading, partial, and revision-change state for belief downgrade', () => {
    const localRegion = region()
    const observation = createVisualGroundingObservation(input({
      readiness: 'loading',
      changedDuringObservation: true,
      requestedRegionIds: [localRegion.regionId],
      spatialRegions: [localRegion],
      report: report({
        regions: [{
          regionId: localRegion.regionId,
          occupancy: 'occupied',
          coverage: 'partial',
          confidence: 0.7,
        }],
      }),
    }))

    expect(observation).toMatchObject({
      readiness: 'loading',
      changedDuringObservation: true,
    })
    expect(observation.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'region-occupancy',
        coverage: 'partial',
      }),
    ]))
    expect(observation.limitations).toEqual(expect.arrayContaining([
      expect.stringMatching(/world revision changed/i),
      expect.stringMatching(/readiness was loading/i),
    ]))
  })

  it('produces deterministic evidence IDs and canonical ordering for identical input', () => {
    const localRegion = region()
    const localObject = obstacle()
    const shared = input({
      requestedObjectIds: [localObject.objectId],
      requestedRegionIds: [localRegion.regionId],
      spatialObjects: [localObject],
      spatialRegions: [localRegion],
      report: report({
        objects: [{
          objectId: localObject.objectId,
          visibility: 'visible',
          confidence: 0.9,
          bbox: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
        }],
        regions: [{
          regionId: localRegion.regionId,
          occupancy: 'occupied',
          coverage: 'partial',
          confidence: 0.8,
          blockingObjectIds: [localObject.objectId],
        }],
        limitations: ['Model-specific limitation'],
      }),
    })

    const first = createVisualGroundingObservation(shared)
    const second = createVisualGroundingObservation(shared)
    expect(second).toEqual(first)
    expect(new Set(first.evidence.map(item => item.evidenceId)).size)
      .toBe(first.evidence.length)
  })
})
