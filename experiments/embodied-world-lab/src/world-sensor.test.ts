import { describe, expect, it } from 'vitest'

import type { EmbodiedStateObservation } from '../../../packages/cesium-mcp-spatial/src/index.js'
import {
  canDetectHazard,
  isGroundSupportHit,
  offsetGeoPoint,
  rayCircleClearanceMeters,
  senseEmbodiedWorld,
} from './world-sensor.js'
import type { CircularHazard, GeoPoint } from './world-sensor.js'

const origin: GeoPoint = { longitude: 86.7, latitude: 27.8, height: 3_400 }
const hazard: CircularHazard = {
  id: 'hazard-1',
  center: offsetGeoPoint(origin, 0, 60),
  radiusMeters: 10,
  sensorRangeMeters: 100,
}

function embodiment(headingRadians = 0): EmbodiedStateObservation {
  return {
    capturedAt: '2026-09-04T00:00:00.000Z',
    mode: 'character',
    positionEcef: { x: 1, y: 2, z: 3 },
    headingRadians,
    velocityEnu: { east: 1, north: 2, up: 0 },
    grounded: true,
    flying: false,
  }
}

describe('embodied world sensor', () => {
  it('reveals only hazards inside the bounded forward sensor', () => {
    expect(canDetectHazard(origin, 0, hazard)).toBe(true)
    expect(canDetectHazard(origin, Math.PI, hazard)).toBe(false)
  })

  it('reports the entry distance for a ray crossing a circular hazard', () => {
    expect(rayCircleClearanceMeters(origin, 0, hazard, 120)).toBeCloseTo(50, 0)
    expect(rayCircleClearanceMeters(origin, Math.PI / 2, hazard, 120)).toBe(120)
  })

  it('keeps an undiscovered hazard out of candidate clearance', () => {
    const result = senseEmbodiedWorld({
      revision: 0,
      position: origin,
      target: offsetGeoPoint(origin, 0, 150),
      embodiment: embodiment(Math.PI),
      hazard,
      hazardVisible: false,
      terrainHeightAt: () => 3_400,
      candidateDistanceMeters: 20,
    })

    expect(result.hazardDetected).toBe(false)
    expect(result.snapshot.hazardId).toBeUndefined()
    expect(result.snapshot.candidates[0].clearanceMeters).toBe(20)
  })

  it('marks unknown terrain as non-traversable instead of inventing free space', () => {
    const result = senseEmbodiedWorld({
      revision: 1,
      position: origin,
      target: offsetGeoPoint(origin, 0, 150),
      embodiment: embodiment(),
      hazard,
      hazardVisible: true,
      terrainHeightAt: () => undefined,
    })

    expect(result.snapshot.candidates.every(candidate => !candidate.terrainReady)).toBe(true)
    expect(result.snapshot.candidates.every(candidate => !candidate.traversable)).toBe(true)
  })

  it('caps candidate clearance with actor-space physics rays', () => {
    const result = senseEmbodiedWorld({
      revision: 1,
      position: origin,
      target: offsetGeoPoint(origin, 0, 150),
      embodiment: embodiment(),
      hazard,
      hazardVisible: false,
      terrainHeightAt: () => 3_400,
      candidateDistanceMeters: 30,
      actorRayClearanceMeters: { front: 7, left: 18, right: 30 },
    })

    expect(result.snapshot.candidates.map(candidate => candidate.clearanceMeters))
      .toEqual([7, 18, 30])
    expect(result.snapshot.candidates[0].traversable).toBe(false)
  })

  it('uses horizontal velocity for ground stopping distance evidence', () => {
    const result = senseEmbodiedWorld({
      revision: 1,
      position: origin,
      target: offsetGeoPoint(origin, 0, 150),
      embodiment: {
        ...embodiment(),
        velocityEnu: { east: 3, north: 4, up: -40 },
      },
      hazard,
      hazardVisible: false,
      terrainHeightAt: () => 3_400,
    })

    expect(result.snapshot.speedMetersPerSecond).toBe(5)
  })

  it('distinguishes terrain support hits from unexpected obstacles', () => {
    expect(isGroundSupportHit(1.5, Math.cos(Math.PI / 6))).toBe(true)
    expect(isGroundSupportHit(12, 1)).toBe(false)
    expect(isGroundSupportHit(1, Math.cos(Math.PI * 0.4))).toBe(false)
    expect(isGroundSupportHit(undefined, 1)).toBe(false)
  })
})
