import { BoundingSphere, Cartesian3 } from 'cesium'
import type { TerrainProvider, Viewer } from 'cesium'
import { describe, expect, it } from 'vitest'

import type { TerrainAwareFlightSample } from 'cesium-mcp-spatial'
import { createHimalayaCorridorCertificate } from './himalaya-corridor-awareness.js'
import {
  rebaseFlightCorridorCandidate,
  waitForLiveTrajectoryRebase,
} from './himalaya-flight.js'
import type {
  HimalayaFlightCorridorCandidate,
} from './himalaya-flight.js'

function flightSample(
  longitude: number,
  progressDistanceMeters: number,
): TerrainAwareFlightSample {
  return {
    longitude,
    latitude: 0,
    terrainHeight: 0,
    flightHeight: 2_000,
    clearanceMeters: 2_000,
    distanceMeters: progressDistanceMeters,
    naiveFlightHeight: 2_000,
    naiveClearanceMeters: 2_000,
  }
}

function readyViewer(): Viewer {
  return {
    scene: {
      globe: {
        tilesLoaded: true,
        getHeight: () => 0,
      },
      primitives: {
        length: 0,
        get: () => undefined,
      },
    },
    dataSourceDisplay: {
      ready: true,
    },
  } as unknown as Viewer
}

function corridorCandidate(): HimalayaFlightCorridorCandidate {
  const first = flightSample(0.02, 2_200)
  const second = flightSample(0.021, 2_310)
  return {
    trajectoryId: 'stale-right-candidate',
    direction: 'right',
    maneuver: {
      direction: 'right',
      obstacleType: 'no-fly-zone',
      obstacleDistanceMeters: 4_000,
      leftClearanceMeters: 8_000,
      rightClearanceMeters: 8_000,
      startProgress: 0.2,
      startOffsetMeters: 0,
      peakProgress: 0.31,
      endProgress: 0.6,
      maximumOffsetMeters: 6_500,
    },
    certificate: createHimalayaCorridorCertificate({
      trajectoryId: 'stale-right-candidate',
      direction: 'right',
      sampledAt: '2026-09-02T04:00:00.000Z',
      sceneReady: true,
      samples: [
        {
          progress: 0.31,
          longitude: first.longitude,
          latitude: first.latitude,
          terrainHeight: 0,
          flightHeight: first.flightHeight,
          noFlyZoneBoundaryClearanceMeters: 2_000,
          sceneBlocked: false,
        },
        {
          progress: 0.32,
          longitude: second.longitude,
          latitude: second.latitude,
          terrainHeight: 0,
          flightHeight: second.flightHeight,
          noFlyZoneBoundaryClearanceMeters: 2_000,
          distanceFromPreviousMeters: 110,
          sceneBlocked: false,
        },
      ],
      requiredTerrainClearanceMeters: 1_200,
      requiredNoFlyZoneMarginMeters: 1_200,
      maximumSampleSpacingMeters: 180,
    }),
    samples: [
      {
        progress: 0.31,
        sample: first,
        corridorTerrainHeightMeters: 0,
      },
      {
        progress: 0.32,
        sample: second,
        corridorTerrainHeightMeters: 0,
      },
    ],
  }
}

describe('live flight corridor rebasing', () => {
  it('rejects an opposite candidate when the live handoff segment crosses the no-fly zone', async () => {
    const currentSample = flightSample(0, 0)
    const result = await rebaseFlightCorridorCandidate({
      candidate: corridorCandidate(),
      viewer: readyViewer(),
      terrainProvider: {} as TerrainProvider,
      terrainHeightSampler: async (_terrainProvider, cartographics) => (
        cartographics.map(() => 0)
      ),
      progress: 0.3,
      startSample: currentSample,
      requiredTerrainClearanceMeters: 1_200,
      noFlyZoneSphere: new BoundingSphere(
        Cartesian3.fromDegrees(0.01, 0, 2_000),
        500,
      ),
      sceneVolumeExclusions: [],
      trajectoryId: 'live-right-candidate',
    })

    expect(result.trajectoryId).toBe('live-right-candidate')
    expect(result.samples[0]).toMatchObject({
      progress: 0.3,
      sample: currentSample,
    })
    expect(result.samples.length).toBeGreaterThan(3)
    expect(result.certificate.maximumSampleSpacingMeters).toBeLessThanOrEqual(180)
    expect(result.certificate.minimumNoFlyZoneBoundaryClearanceMeters).toBeLessThan(0)
    expect(result.certificate).toMatchObject({
      status: 'occupied',
      complete: false,
    })
  })

  it('rejects a spatially clear but dynamically excessive live handoff', async () => {
    const result = await rebaseFlightCorridorCandidate({
      candidate: corridorCandidate(),
      viewer: readyViewer(),
      terrainProvider: {} as TerrainProvider,
      terrainHeightSampler: async (_terrainProvider, cartographics) => (
        cartographics.map(() => 0)
      ),
      progress: 0.3,
      startSample: flightSample(0, 0),
      requiredTerrainClearanceMeters: 1_200,
      noFlyZoneSphere: new BoundingSphere(
        Cartesian3.fromDegrees(1, 0, 2_000),
        500,
      ),
      sceneVolumeExclusions: [],
      trajectoryId: 'dynamically-excessive-right-candidate',
    })

    expect(result.certificate.minimumNoFlyZoneBoundaryClearanceMeters).toBeGreaterThan(1_200)
    expect(result.certificate).toMatchObject({
      status: 'unknown',
      complete: false,
      kinematicHandoff: {
        maximumDistanceMeters: 1_000,
      },
    })
    expect(result.certificate.reasons).toContain(
      'Live trajectory handoff distance exceeded 1000 m.',
    )
  })

  it('abandons a stalled live terrain rebase instead of freezing the flight indefinitely', async () => {
    await expect(waitForLiveTrajectoryRebase(
      new Promise<never>(() => undefined),
      new AbortController().signal,
      5,
    )).rejects.toThrow('Live trajectory rebase exceeded 5 ms')
  })
})
