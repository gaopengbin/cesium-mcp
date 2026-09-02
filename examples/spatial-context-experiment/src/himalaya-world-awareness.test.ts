import { describe, expect, it } from 'vitest'

import type { HimalayaFlightDecisionRequest } from './himalaya-flight.js'
import {
  applyHimalayaVisualGrounding,
  createHimalayaVisualResources,
  HIMALAYA_RISK_ENVELOPE_ID,
  HIMALAYA_WORLD_REVISION,
} from './himalaya-world-awareness.js'

const digest = 'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'

function decisionRequest(cycle = 1): HimalayaFlightDecisionRequest {
  const secondOffset = (cycle - 1) * 5
  const at = (second: number): string => new Date(
    Date.parse('2026-09-02T01:00:00.000Z') + (second + secondOffset) * 1_000,
  ).toISOString()
  return {
    requestId: `flight-run-1:awareness-${cycle}`,
    runId: 'flight-run-1',
    cycle,
    cycleKind: cycle === 1 ? 'detect' : 'verify',
    planRevision: 1,
    requestedAt: at(0),
    progress: 0.34,
    sample: {
      longitude: 86.86,
      latitude: 27.9,
      terrainHeight: 6200,
      distanceMeters: 10000,
      flightHeight: 7400,
      clearanceMeters: 1200,
      naiveFlightHeight: 7000,
      naiveClearanceMeters: 800,
    },
    sensor: {
      sampledAt: at(0),
      rangeMeters: 15000,
      readings: [],
    },
    safetySuggestion: {
      direction: 'left',
      obstacleType: 'no-fly-zone',
      obstacleId: 'himalaya-flight-dynamic-no-fly-zone',
      obstacleDistanceMeters: 8000,
      leftClearanceMeters: 12000,
      rightClearanceMeters: 6000,
    },
    obstacle: {
      objectId: 'himalaya-flight-dynamic-no-fly-zone',
      longitude: 86.9,
      latitude: 27.94,
      height: 7600,
      horizontalRadiusMeters: 3800,
      verticalRadiusMeters: 2600,
    },
    visualFrame: {
      dataUrl: 'data:image/jpeg;base64,aGVsbG8=',
      width: 2,
      height: 2,
      startedAt: at(1),
      capturedAt: at(2),
      completedAt: at(3),
      readiness: 'ready',
      changedDuringObservation: false,
      sensor: {
        sensorId: 'himalaya-independent-camera',
        kind: 'camera',
      },
    },
  }
}

function result(
  occupancy: 'occupied' | 'clear' | 'unknown',
  objectVisibility: 'visible' | 'not-visible' | 'uncertain' = (
    occupancy === 'occupied' ? 'visible' : 'not-visible'
  ),
) {
  const occupied = occupancy === 'occupied'
  return {
    model: '@cf/meta/llama-4-scout-17b-16e-instruct',
    imageDigest: digest,
    artifactRef: digest,
    report: {
      schemaVersion: 1 as const,
      imageDigest: digest,
      objects: [{
        objectId: 'himalaya-flight-dynamic-no-fly-zone',
        visibility: objectVisibility,
        confidence: objectVisibility === 'visible' ? 0.92 : 0.7,
        ...(objectVisibility === 'visible'
          ? { bbox: { x: 0.3, y: 0.2, width: 0.4, height: 0.5 } }
          : {}),
      }],
      regions: [{
        regionId: HIMALAYA_RISK_ENVELOPE_ID,
        occupancy,
        coverage: 'partial' as const,
        confidence: occupied ? 0.88 : 0.6,
        ...(occupied
          ? { blockingObjectIds: ['himalaya-flight-dynamic-no-fly-zone'] }
          : {}),
      }],
      limitations: [],
    },
  }
}

describe('Himalaya visual world-awareness update', () => {
  it('updates the corridor to occupied only from positive grounded evidence', () => {
    const update = applyHimalayaVisualGrounding(decisionRequest(), result('occupied'))

    expect(update.positivelyGroundedObstacle).toBe(true)
    expect(update.corridor.occupancy).toBe('occupied')
    expect(update.corridor.blockingObjectIds).toEqual([
      'himalaya-flight-dynamic-no-fly-zone',
    ])
    expect(update.belief.objects[0]?.objectId).toBe(
      'himalaya-flight-dynamic-no-fly-zone',
    )
  })

  it('never turns a visual clear classification into free space', () => {
    const update = applyHimalayaVisualGrounding(decisionRequest(), result('clear'))

    expect(update.positivelyGroundedObstacle).toBe(false)
    expect(update.corridor.occupancy).toBe('unknown')
    expect(update.corridor.unknownReason).toBe('insufficient-coverage')
  })

  it('keeps missing or uncertain visual evidence unknown', () => {
    const update = applyHimalayaVisualGrounding(decisionRequest(), result('unknown'))

    expect(update.positivelyGroundedObstacle).toBe(false)
    expect(update.corridor.occupancy).toBe('unknown')
  })

  it('fuses a visible obstacle with a matching forward ray into occupied belief', () => {
    const request = decisionRequest()
    request.sensor.readings = [{
      headingOffsetDegrees: 0,
      pitchDegrees: -2,
      hitType: 'no-fly-zone',
      hitDistanceMeters: 8_000,
      objectId: 'himalaya-flight-dynamic-no-fly-zone',
    }]

    const update = applyHimalayaVisualGrounding(request, result('unknown', 'visible'))

    expect(update.rayCorroborated).toBe(true)
    expect(update.positivelyGroundedObstacle).toBe(true)
    expect(update.corridor).toMatchObject({
      occupancy: 'occupied',
      freshness: 'current',
      blockingObjectIds: ['himalaya-flight-dynamic-no-fly-zone'],
    })
    expect(update.fusionObservation?.evidence[0]).toMatchObject({
      kind: 'region-occupancy',
      basis: 'positive-forward-ray-hit-corroborated-by-visual-object-grounding',
    })
  })

  it('does not fuse a visually missing obstacle from ray evidence alone', () => {
    const request = decisionRequest()
    request.sensor.readings = [{
      headingOffsetDegrees: 0,
      pitchDegrees: -2,
      hitType: 'no-fly-zone',
      hitDistanceMeters: 8_000,
      objectId: 'himalaya-flight-dynamic-no-fly-zone',
    }]

    const update = applyHimalayaVisualGrounding(request, result('unknown'))

    expect(update.rayCorroborated).toBe(false)
    expect(update.positivelyGroundedObstacle).toBe(false)
    expect(update.corridor.occupancy).toBe('unknown')
  })

  it('accumulates multiple observations in one run without resetting belief', () => {
    const firstRequest = decisionRequest(1)
    firstRequest.sensor.readings = [{
      headingOffsetDegrees: 0,
      pitchDegrees: -2,
      hitType: 'no-fly-zone',
      hitDistanceMeters: 8_000,
      objectId: 'himalaya-flight-dynamic-no-fly-zone',
    }]
    const first = applyHimalayaVisualGrounding(
      firstRequest,
      result('unknown', 'visible'),
    )
    const second = applyHimalayaVisualGrounding(
      decisionRequest(2),
      result('clear'),
      first.belief,
    )

    expect(first.belief.revision).toBe(2)
    expect(second.belief.revision).toBe(3)
    expect(second.belief.beliefId).toBe(first.belief.beliefId)
    expect(second.belief.appliedObservationIds).toEqual([
      'flight-run-1:awareness-1',
      'flight-run-1:awareness-1:visual-ray-fusion',
      'flight-run-1:awareness-2',
    ])
    expect(second.positivelyGroundedObstacle).toBe(false)
    expect(second.corridor.occupancy).toBe('occupied')
    expect(JSON.stringify(second.belief)).not.toContain('data:image')
    expect(JSON.stringify(second.belief)).not.toContain('aGVsbG8=')
  })

  it('keeps world evidence revisions independent from flight plan revisions', () => {
    const firstRequest = decisionRequest(1)
    firstRequest.planRevision = 3
    firstRequest.sensor.readings = [{
      headingOffsetDegrees: 0,
      pitchDegrees: -2,
      hitType: 'no-fly-zone',
      hitDistanceMeters: 8_000,
      objectId: 'himalaya-flight-dynamic-no-fly-zone',
    }]
    const resources = createHimalayaVisualResources(firstRequest)
    const first = applyHimalayaVisualGrounding(
      firstRequest,
      result('unknown', 'visible'),
    )
    const secondRequest = decisionRequest(2)
    secondRequest.planRevision = 9
    const second = applyHimalayaVisualGrounding(
      secondRequest,
      result('clear'),
      first.belief,
    )

    expect(resources.object.revision).toBe(HIMALAYA_WORLD_REVISION)
    expect(first.observation.worldRevision).toBe(HIMALAYA_WORLD_REVISION)
    expect(first.fusionObservation?.worldRevision).toBe(HIMALAYA_WORLD_REVISION)
    expect(second.observation.worldRevision).toBe(HIMALAYA_WORLD_REVISION)
    expect(second.corridor.lastWorldRevision).toBe(HIMALAYA_WORLD_REVISION)
    expect(second.belief.appliedObservationIds).toContain(
      'flight-run-1:awareness-2',
    )
  })

  it('ages earlier occupied evidence instead of treating it as permanently current', () => {
    const firstRequest = decisionRequest(1)
    firstRequest.sensor.readings = [{
      headingOffsetDegrees: 0,
      pitchDegrees: -2,
      hitType: 'no-fly-zone',
      hitDistanceMeters: 8_000,
      objectId: 'himalaya-flight-dynamic-no-fly-zone',
    }]
    const first = applyHimalayaVisualGrounding(
      firstRequest,
      result('unknown', 'visible'),
    )
    const laterRequest = decisionRequest(10)
    const later = applyHimalayaVisualGrounding(
      laterRequest,
      result('unknown'),
      first.belief,
    )

    expect(later.positivelyGroundedObstacle).toBe(false)
    expect(later.corridor).toMatchObject({
      occupancy: 'occupied',
      freshness: 'stale',
    })
  })
})
