import * as Cesium from 'cesium'
import { validateCesiumToolOutput } from 'cesium-mcp-contracts'
import { describe, expect, it, vi } from 'vitest'
import type { CesiumBridge } from './bridge.js'
import { perceptionExecutors } from './executors/perception.js'
import { createBridgeSpatialSnapshot } from './spatial-context.js'
import type { EntityPropertiesResult, ExportSceneResult, LayerInfo } from './types.js'

const observedAt = '2026-08-27T08:00:00.000Z'
const view = {
  longitude: 116.4,
  latitude: 39.9,
  height: 5000,
  heading: 0,
  pitch: -45,
  roll: 0,
}

function testBridge(): CesiumBridge {
  const schoolEntity = { id: 'school_1' }
  const floodEntity = { id: 'flood_zone_1' }
  const floodOutlineEntity = { id: 'flood_zone_outline_1' }
  const layer: LayerInfo = {
    id: 'emergency-data',
    name: 'Emergency Data',
    type: 'mixed',
    visible: true,
    color: '#EF4444',
    dataRefId: 'resource_emergency',
  }
  const entities = [{ entityId: 'school_1', type: 'marker' }, {
    entityId: 'flood_zone_1',
    type: 'polygon',
  }, {
    entityId: 'flood_zone_outline_1',
    type: 'polyline',
  }]
  const scene: ExportSceneResult = {
    view,
    layers: [layer],
    entities,
    timestamp: observedAt,
  }
  const details: Record<string, EntityPropertiesResult> = {
    school_1: {
      entityId: 'school_1',
      name: 'Riverside School',
      type: 'marker',
      position: { longitude: 116.4, latitude: 39.9, height: 0 },
      properties: { semanticType: 'school', students: 800 },
      graphicProperties: { color: '#3B82F6' },
    },
    flood_zone_1: {
      entityId: 'flood_zone_1',
      name: 'Flood Zone',
      type: 'polygon',
      position: { longitude: 116.4, latitude: 39.9, height: 0 },
      properties: { semanticType: 'risk-zone', risk: 'high' },
      graphicProperties: {
        positions: [
          [116.39, 39.89, 0],
          [116.41, 39.89, 0],
          [116.41, 39.91, 0],
          [116.39, 39.91, 0],
        ],
      },
    },
    flood_zone_outline_1: {
      entityId: 'flood_zone_outline_1',
      type: 'polyline',
      properties: {},
      graphicProperties: {
        positions: [
          [116.39, 39.89, 0],
          [116.41, 39.89, 0],
        ],
      },
    },
  }

  class GeoJsonDataSourceFixture {
    entities = { values: [schoolEntity, floodEntity, floodOutlineEntity] }
  }

  return {
    exportScene: vi.fn().mockReturnValue(scene),
    getEntityProperties: vi.fn((params: { entityId: string }) => details[params.entityId]),
    layerManager: {
      getCesiumRefs: vi.fn().mockReturnValue({
        dataSource: new GeoJsonDataSourceFixture(),
        polygonOutlines: new Map([[floodEntity, [floodOutlineEntity]]]),
      }),
    },
    viewer: {
      dataSourceDisplay: { ready: true },
      terrainProvider: {},
      camera: {
        computeViewRectangle: vi.fn().mockReturnValue(
          Cesium.Rectangle.fromDegrees(116.38, 39.88, 116.42, 39.92),
        ),
      },
      scene: { globe: { ellipsoid: Cesium.Ellipsoid.WGS84, tilesLoaded: true } },
    },
    captureObserverView: vi.fn(),
  } as unknown as CesiumBridge
}

describe('Bridge spatial context', () => {
  it('grounds managed layers and entities with provenance', () => {
    const bridge = testBridge()
    const snapshot = createBridgeSpatialSnapshot(bridge)
    const school = snapshot.context.get('entity:emergency-data:school_1')

    expect(snapshot.context.describe()).toMatchObject({
      objectCount: 3,
      countsBySource: { layer: 1, geojson: 2 },
    })
    expect(school).toMatchObject({
      type: 'school',
      layerId: 'emergency-data',
      resourceId: 'resource_emergency',
      geometryQuality: 'exact',
      provenance: { source: 'emergency-data', method: 'entity-position' },
    })
    expect(snapshot.context.relate(
      'entity:emergency-data:school_1',
      'entity:emergency-data:flood_zone_1',
      'within',
    )).toMatchObject({ value: true, quality: 'exact', basis: 'point-in-polygon' })
    expect(snapshot.viewBounds?.[0]).toBeCloseTo(116.38)
    expect(snapshot.viewBounds?.[1]).toBeCloseTo(39.88)
    expect(snapshot.viewBounds?.[2]).toBeCloseTo(116.42)
    expect(snapshot.viewBounds?.[3]).toBeCloseTo(39.92)
    expect(snapshot.readiness).toMatchObject({
      state: 'ready',
      dataSourcesReady: true,
      globeTilesLoaded: true,
    })
    expect(createBridgeSpatialSnapshot(bridge).snapshotRevision).toBe(1)
  })

  it('returns contract-valid perception tool results', async () => {
    const bridge = testBridge()
    const described = await perceptionExecutors.describeScene(
      { includeObjects: true },
      bridge,
    )
    const queried = await perceptionExecutors.querySpatialObjects(
      { types: ['school'] },
      bridge,
    )
    const related = await perceptionExecutors.querySpatialRelation(
      {
        subjectId: 'entity:emergency-data:school_1',
        objectId: 'entity:emergency-data:flood_zone_1',
        relation: 'within',
      },
      bridge,
    )
    const contextualized = await perceptionExecutors.getObjectContext(
      {
        objectId: 'entity:emergency-data:school_1',
        nearbyRadiusMeters: 5000,
      },
      bridge,
    )
    const visible = await perceptionExecutors.getViewContext({}, bridge)
    const observed = await perceptionExecutors.observeScene({
      scope: 'view',
      imageMode: 'never',
      includeObjects: true,
    }, bridge)

    expect(described.success).toBe(true)
    expect(queried).toMatchObject({
      success: true,
      data: { total: 1 },
    })
    expect(related).toMatchObject({ success: true, data: { value: true } })
    expect(contextualized).toMatchObject({
      success: true,
      data: {
        object: { type: 'school' },
        nearby: [{ object: { type: 'risk-zone' } }],
      },
    })
    expect(visible).toMatchObject({
      success: true,
      data: { quality: 'derived', basis: 'camera-compute-view-rectangle' },
    })
    expect(observed).toMatchObject({
      success: true,
      data: {
        scope: 'view',
        readiness: { state: 'ready' },
        visual: { mode: 'never', status: 'skipped', reason: 'image-mode-never' },
        freshness: { snapshotRevision: 1, changedDuringObservation: false },
        quality: 'derived',
        basis: 'managed-scene-snapshot',
      },
    })
    expect(validateCesiumToolOutput('describeScene', described).valid).toBe(true)
    expect(validateCesiumToolOutput('querySpatialObjects', queried).valid).toBe(true)
    expect(validateCesiumToolOutput('querySpatialRelation', related).valid).toBe(true)
    expect(validateCesiumToolOutput('getObjectContext', contextualized).valid).toBe(true)
    expect(validateCesiumToolOutput('getViewContext', visible).valid).toBe(true)
    expect(validateCesiumToolOutput('observeScene', observed).valid).toBe(true)
  })

  it('returns partial structured evidence when visual capture is unavailable', async () => {
    const bridge = testBridge()
    ;(bridge.viewer.scene.globe as unknown as { tilesLoaded: boolean }).tilesLoaded = false
    vi.mocked(bridge.captureObserverView).mockRejectedValue(new Error('observer still loading'))

    const observed = await perceptionExecutors.observeScene({
      imageMode: 'always',
      targetObjectId: 'entity:emergency-data:school_1',
    }, bridge)

    expect(observed).toMatchObject({
      success: true,
      data: {
        readiness: {
          state: 'partial',
          pendingReasons: ['globe-or-imagery-tiles-loading'],
        },
        visual: {
          mode: 'always',
          status: 'unavailable',
          reason: 'observer still loading',
        },
        quality: 'unknown',
        basis: 'scene-readiness-partial',
      },
    })
    expect(validateCesiumToolOutput('observeScene', observed).valid).toBe(true)
  })

  it('does not report ready when a required readiness probe is unavailable', () => {
    const bridge = testBridge()
    ;(bridge.viewer.scene.globe as unknown as { tilesLoaded?: boolean }).tilesLoaded = undefined

    expect(createBridgeSpatialSnapshot(bridge).readiness).toMatchObject({
      state: 'partial',
      dataSourcesReady: true,
      globeTilesLoaded: null,
      pendingReasons: ['globe-tile-readiness-unavailable'],
    })
  })

  it('returns contract-valid captured evidence through the unified observation', async () => {
    const bridge = testBridge()
    vi.mocked(bridge.captureObserverView).mockResolvedValue({
      dataUrl: `data:image/png;base64,${'a'.repeat(32)}`,
      width: 1024,
      height: 576,
      camera: view,
      target: {
        targetObjectId: 'entity:emergency-data:school_1',
        preset: 'detail',
        longitude: 116.4,
        latitude: 39.9,
        height: 0,
        range: 3500,
        heading: 225,
        pitch: -35,
      },
      observedAt,
      bounds: [116.38, 39.88, 116.42, 39.92],
      visibleObjectIds: ['entity:emergency-data:school_1'],
      objectCount: 1,
      quality: 'derived',
      basis: 'observer-viewer-spatial-snapshot',
      readiness: {
        state: 'ready',
        framesRendered: 8,
        stableFrameCount: 3,
        dataSourcesReady: true,
        globeTilesLoaded: true,
        frameHasContent: true,
      },
      userCameraUnchanged: true,
      limitations: ['Managed geometry only.'],
    })

    const observed = await perceptionExecutors.observeScene({
      imageMode: 'always',
      targetObjectId: 'entity:emergency-data:school_1',
    }, bridge)

    expect(observed).toMatchObject({
      success: true,
      data: {
        visual: {
          mode: 'always',
          status: 'captured',
          reason: 'image-mode-always',
          evidence: {
            readiness: { state: 'ready' },
            userCameraUnchanged: true,
          },
        },
        freshness: { changedDuringObservation: false },
        quality: 'derived',
        basis: 'managed-scene-plus-independent-observer',
      },
    })
    expect(validateCesiumToolOutput('observeScene', observed).valid).toBe(true)
  })
})
