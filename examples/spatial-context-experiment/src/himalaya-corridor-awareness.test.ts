import { describe, expect, it } from 'vitest'

import { applyWorldObservation } from 'cesium-mcp-spatial'
import type {
  AgentBeliefState,
  OccupancyState,
  SpatialRegion,
  WorldObservation,
} from 'cesium-mcp-spatial'
import {
  applyHimalayaCorridorCertificateObservation,
  applyHimalayaCorridorRayObservation,
  createHimalayaCorridorCertificate,
  createInitialHimalayaCorridorBelief,
  HIMALAYA_LEFT_BYPASS_REGION,
  HIMALAYA_LEFT_BYPASS_REGION_ID,
  HIMALAYA_RIGHT_BYPASS_REGION,
  HIMALAYA_RIGHT_BYPASS_REGION_ID,
  planHimalayaCorridorRoute,
} from './himalaya-corridor-awareness.js'

const observedAt = '2026-09-02T02:00:00.000Z'

function initialBelief(): AgentBeliefState {
  return createInitialHimalayaCorridorBelief({
    beliefId: 'himalaya-corridor-belief',
    worldId: 'himalaya-flight-world',
    createdAt: observedAt,
  })
}

function observeRegion(
  belief: AgentBeliefState,
  region: SpatialRegion,
  occupancy: Exclude<OccupancyState, 'unknown'>,
  sequence: number,
): AgentBeliefState {
  const sampledAt = new Date(Date.parse(observedAt) + sequence * 1_000).toISOString()
  const observation: WorldObservation = {
    schemaVersion: 1,
    observationId: `himalaya-corridor-observation-${sequence}`,
    worldId: belief.worldId,
    worldRevision: 4,
    startedAt: sampledAt,
    completedAt: sampledAt,
    changedDuringObservation: false,
    readiness: 'ready',
    sensors: [{
      sensorId: 'himalaya-corridor-ray-bundle',
      kind: 'ray',
    }],
    evidence: [{
      kind: 'region-occupancy',
      evidenceId: `himalaya-corridor-evidence-${sequence}`,
      sensorId: 'himalaya-corridor-ray-bundle',
      sampledAt,
      quality: 'derived',
      confidence: 0.96,
      basis: 'runtime-corridor-ray-bundle',
      region,
      occupancy,
      coverage: 'complete',
      ...(occupancy === 'occupied'
        ? { blockingObjectIds: [`blocker:${region.regionId}`] }
        : {}),
    }],
    limitations: [],
  }

  return applyWorldObservation(belief, observation).state
}

describe('Himalaya belief-only corridor planning', () => {
  it('creates an initial belief with two unknown bypass regions', () => {
    const belief = initialBelief()

    expect(belief.revision).toBe(0)
    expect(belief.regions).toHaveLength(2)
    expect(belief.regions.map(region => ({
      regionId: region.region.regionId,
      occupancy: region.occupancy,
    }))).toEqual([
      { regionId: HIMALAYA_LEFT_BYPASS_REGION_ID, occupancy: 'unknown' },
      { regionId: HIMALAYA_RIGHT_BYPASS_REGION_ID, occupancy: 'unknown' },
    ])
  })

  it('selects the right bypass when left is occupied and right is free', () => {
    let belief = initialBelief()
    belief = observeRegion(belief, HIMALAYA_LEFT_BYPASS_REGION, 'occupied', 1)
    belief = observeRegion(belief, HIMALAYA_RIGHT_BYPASS_REGION, 'free', 2)

    const result = planHimalayaCorridorRoute(belief)

    expect(result).toMatchObject({
      status: 'planned',
      shouldProceed: true,
      beliefRevision: belief.revision,
      nodeIds: ['current', 'right-bypass', 'rejoin'],
    })
    expect(result.segments.every(segment => (
      segment.regionId === HIMALAYA_RIGHT_BYPASS_REGION_ID
      && segment.occupancy === 'free'
    ))).toBe(true)
  })

  it('selects the left bypass when right is occupied and left is free', () => {
    let belief = initialBelief()
    belief = observeRegion(belief, HIMALAYA_LEFT_BYPASS_REGION, 'free', 1)
    belief = observeRegion(belief, HIMALAYA_RIGHT_BYPASS_REGION, 'occupied', 2)

    const result = planHimalayaCorridorRoute(belief)

    expect(result).toMatchObject({
      status: 'planned',
      shouldProceed: true,
      beliefRevision: belief.revision,
      nodeIds: ['current', 'left-bypass', 'rejoin'],
    })
    expect(result.segments.every(segment => (
      segment.regionId === HIMALAYA_LEFT_BYPASS_REGION_ID
      && segment.occupancy === 'free'
    ))).toBe(true)
  })

  it('returns no safe route while both bypass regions remain unknown', () => {
    const belief = initialBelief()

    const result = planHimalayaCorridorRoute(belief)

    expect(result).toMatchObject({
      status: 'no-safe-route',
      shouldProceed: false,
      reason: 'no-traversable-route',
      beliefRevision: belief.revision,
      nodeIds: ['current'],
      segments: [],
    })
    expect(result.blockedEdges).toHaveLength(4)
    expect(result.blockedEdges.every(edge => edge.reason === 'unknown-rejected')).toBe(true)
  })

  it('does not accept a plan or world revision as a route-planning input', () => {
    let belief = initialBelief()
    belief = observeRegion(belief, HIMALAYA_LEFT_BYPASS_REGION, 'free', 1)
    belief = observeRegion(belief, HIMALAYA_RIGHT_BYPASS_REGION, 'occupied', 2)

    const result = planHimalayaCorridorRoute(belief)

    expect(result.beliefRevision).toBe(2)
    expect(Object.keys(result)).not.toContain('worldRevision')
    expect(Object.keys(result)).not.toContain('planRevision')
  })

  it('keeps sparse side-ray misses unknown even when the scene is ready', () => {
    const update = applyHimalayaCorridorRayObservation(initialBelief(), {
      observationId: 'preferred-left-ray-fan',
      worldRevision: 2,
      sampledAt: observedAt,
      sceneReady: true,
      preferredSide: 'left',
      rangeMeters: 15_000,
      readings: [
        { headingOffsetDegrees: -30, hitType: 'terrain', hitDistanceMeters: 12_000 },
        { headingOffsetDegrees: -16, hitType: 'none' },
        { headingOffsetDegrees: 16, hitType: 'none' },
        { headingOffsetDegrees: 30, hitType: 'none' },
      ],
    })

    expect(update.establishedFreeCorridor).toBe(false)
    expect(update.belief.regions.find(region => (
      region.region.regionId === HIMALAYA_LEFT_BYPASS_REGION_ID
    ))).toMatchObject({
      occupancy: 'unknown',
      freshness: 'current',
      unknownReason: 'insufficient-coverage',
    })
    expect(update.belief.regions.find(region => (
      region.region.regionId === HIMALAYA_RIGHT_BYPASS_REGION_ID
    ))).toMatchObject({ occupancy: 'unknown' })
    expect(planHimalayaCorridorRoute(update.belief).shouldProceed).toBe(false)
  })

  it('keeps the preferred bypass unknown when scene coverage is not ready', () => {
    const update = applyHimalayaCorridorRayObservation(initialBelief(), {
      observationId: 'loading-right-ray-fan',
      worldRevision: 2,
      sampledAt: observedAt,
      sceneReady: false,
      preferredSide: 'right',
      rangeMeters: 15_000,
      readings: [
        { headingOffsetDegrees: 16, hitType: 'none' },
        { headingOffsetDegrees: 30, hitType: 'none' },
      ],
    })

    expect(update.establishedFreeCorridor).toBe(false)
    expect(update.belief.regions.find(region => (
      region.region.regionId === HIMALAYA_RIGHT_BYPASS_REGION_ID
    ))).toMatchObject({
      occupancy: 'unknown',
      unknownReason: 'insufficient-coverage',
    })
    expect(planHimalayaCorridorRoute(update.belief).shouldProceed).toBe(false)
  })

  it('uses a complete certificate for the exact executable trajectory', () => {
    const certificate = createHimalayaCorridorCertificate({
      trajectoryId: 'left-executable-trajectory-r1',
      direction: 'left',
      sampledAt: observedAt,
      sceneReady: true,
      requiredTerrainClearanceMeters: 1_200,
      requiredNoFlyZoneMarginMeters: 1_200,
      maximumSampleSpacingMeters: 225,
      samples: [
        {
          progress: 0.3,
          longitude: 86.89,
          latitude: 27.90,
          terrainHeight: 6_000,
          flightHeight: 7_400,
          noFlyZoneBoundaryClearanceMeters: 1_380,
          sceneBlocked: false,
        },
        {
          progress: 0.31,
          longitude: 86.891,
          latitude: 27.901,
          terrainHeight: 6_020,
          flightHeight: 7_420,
          noFlyZoneBoundaryClearanceMeters: 1_350,
          distanceFromPreviousMeters: 170,
          sceneBlocked: false,
        },
      ],
    })
    const update = applyHimalayaCorridorCertificateObservation(initialBelief(), {
      observationId: 'left-executable-trajectory-certificate',
      worldRevision: 2,
      certificate,
    })

    expect(certificate).toMatchObject({
      status: 'free',
      complete: true,
      sampleCount: 2,
      minimumTerrainClearanceMeters: 1_400,
      minimumNoFlyZoneBoundaryClearanceMeters: 1_350,
    })
    expect(update.establishedFreeCorridor).toBe(true)
    expect(update.belief.regions.find(region => (
      region.region.regionId === HIMALAYA_LEFT_BYPASS_REGION_ID
    ))).toMatchObject({
      occupancy: 'free',
      freshness: 'current',
      region: {
        properties: {
          trajectoryId: 'left-executable-trajectory-r1',
          purpose: 'sampled-executable-flight-trajectory',
        },
      },
    })
    expect(planHimalayaCorridorRoute(update.belief)).toMatchObject({
      shouldProceed: true,
      nodeIds: ['current', 'left-bypass', 'rejoin'],
    })
  })

  it('keeps a candidate unknown when any DEM sample is unavailable', () => {
    const certificate = createHimalayaCorridorCertificate({
      trajectoryId: 'right-incomplete-terrain-r1',
      direction: 'right',
      sampledAt: observedAt,
      sceneReady: true,
      requiredTerrainClearanceMeters: 1_200,
      requiredNoFlyZoneMarginMeters: 1_200,
      maximumSampleSpacingMeters: 225,
      samples: [
        {
          progress: 0.3,
          longitude: 86.89,
          latitude: 27.90,
          flightHeight: 7_400,
          noFlyZoneBoundaryClearanceMeters: 1_380,
          sceneBlocked: false,
        },
        {
          progress: 0.31,
          longitude: 86.891,
          latitude: 27.901,
          terrainHeight: 6_020,
          flightHeight: 7_420,
          noFlyZoneBoundaryClearanceMeters: 1_350,
          distanceFromPreviousMeters: 170,
          sceneBlocked: false,
        },
      ],
    })
    const update = applyHimalayaCorridorCertificateObservation(initialBelief(), {
      observationId: 'right-incomplete-terrain-certificate',
      worldRevision: 2,
      certificate,
    })

    expect(certificate).toMatchObject({ status: 'unknown', complete: false })
    expect(certificate.reasons).toContain(
      'Loaded DEM height was unavailable for at least one trajectory sample.',
    )
    expect(update.establishedFreeCorridor).toBe(false)
    expect(planHimalayaCorridorRoute(update.belief).shouldProceed).toBe(false)
  })

  it('accepts sub-meter floating-point noise at an exact clearance boundary', () => {
    const certificate = createHimalayaCorridorCertificate({
      trajectoryId: 'left-floating-point-boundary-r1',
      direction: 'left',
      sampledAt: observedAt,
      sceneReady: true,
      requiredTerrainClearanceMeters: 1_200,
      requiredNoFlyZoneMarginMeters: 1_200,
      maximumSampleSpacingMeters: 225,
      samples: [
        {
          progress: 0.3,
          longitude: 86.89,
          latitude: 27.90,
          terrainHeight: 6_200.000_000_2,
          flightHeight: 7_400,
          noFlyZoneBoundaryClearanceMeters: 1_199.999_999_8,
          sceneBlocked: false,
        },
        {
          progress: 0.31,
          longitude: 86.891,
          latitude: 27.901,
          terrainHeight: 6_220.000_000_2,
          flightHeight: 7_420,
          noFlyZoneBoundaryClearanceMeters: 1_200,
          distanceFromPreviousMeters: 170,
          sceneBlocked: false,
        },
      ],
    })

    expect(certificate).toMatchObject({ status: 'free', complete: true })
    expect(certificate.reasons).toHaveLength(1)
    expect(certificate.reasons[0]).toContain('completed')
  })

  it('enforces the declared vertical uncertainty allowance as part of terrain clearance', () => {
    const certificate = createHimalayaCorridorCertificate({
      trajectoryId: 'left-vertical-uncertainty-r1',
      direction: 'left',
      sampledAt: observedAt,
      sceneReady: true,
      requiredTerrainClearanceMeters: 1_200,
      requiredNoFlyZoneMarginMeters: 1_200,
      maximumSampleSpacingMeters: 225,
      terrainSampling: {
        source: 'loaded-test-terrain',
        longitudinalSpacingMeters: 30,
        lateralSpacingMeters: 30,
        verticalUncertaintyMeters: 120,
      },
      samples: [
        {
          progress: 0.3,
          longitude: 86.89,
          latitude: 27.90,
          terrainHeight: 6_000,
          flightHeight: 7_250,
          noFlyZoneBoundaryClearanceMeters: 1_500,
          sceneBlocked: false,
        },
        {
          progress: 0.31,
          longitude: 86.891,
          latitude: 27.901,
          terrainHeight: 6_020,
          flightHeight: 7_270,
          noFlyZoneBoundaryClearanceMeters: 1_500,
          distanceFromPreviousMeters: 170,
          sceneBlocked: false,
        },
      ],
    })

    expect(certificate).toMatchObject({
      status: 'unknown',
      complete: false,
      requiredTerrainClearanceMeters: 1_320,
      minimumTerrainClearanceMeters: 1_250,
    })
    expect(certificate.reasons).toContain(
      'Terrain clearance was below 1320 m, including the declared vertical uncertainty allowance.',
    )
  })

  it('never turns negative physical clearance into free space', () => {
    const certificate = createHimalayaCorridorCertificate({
      trajectoryId: 'left-negative-clearance-r1',
      direction: 'left',
      sampledAt: observedAt,
      sceneReady: true,
      requiredTerrainClearanceMeters: 0,
      requiredNoFlyZoneMarginMeters: 0,
      maximumSampleSpacingMeters: 225,
      samples: [
        {
          progress: 0.3,
          longitude: 86.89,
          latitude: 27.90,
          terrainHeight: 7_400.1,
          flightHeight: 7_400,
          noFlyZoneBoundaryClearanceMeters: 20,
          sceneBlocked: false,
        },
        {
          progress: 0.31,
          longitude: 86.891,
          latitude: 27.901,
          terrainHeight: 7_420,
          flightHeight: 7_420,
          noFlyZoneBoundaryClearanceMeters: 20,
          distanceFromPreviousMeters: 170,
          sceneBlocked: false,
        },
      ],
    })

    expect(certificate).toMatchObject({ status: 'occupied', complete: false })
    expect(certificate.reasons).toContain('The sampled trajectory entered terrain.')
  })

  it('marks a positive side-ray obstacle as partial occupied evidence', () => {
    const update = applyHimalayaCorridorRayObservation(initialBelief(), {
      observationId: 'blocked-right-ray-fan',
      worldRevision: 2,
      sampledAt: observedAt,
      sceneReady: true,
      preferredSide: 'right',
      rangeMeters: 15_000,
      readings: [
        { headingOffsetDegrees: 16, hitType: 'scene', hitDistanceMeters: 3_200 },
        { headingOffsetDegrees: 30, hitType: 'none' },
      ],
    })

    expect(update.establishedFreeCorridor).toBe(false)
    expect(update.belief.regions.find(region => (
      region.region.regionId === HIMALAYA_RIGHT_BYPASS_REGION_ID
    ))).toMatchObject({ occupancy: 'occupied', freshness: 'current' })
  })
})
