import * as Cesium from 'cesium'
import { describe, expect, it } from 'vitest'
import { createSpatialContext } from 'cesium-mcp-spatial'
import type { SpatialObject } from 'cesium-mcp-spatial'
import {
  advanceObserverStableFrameCount,
  analyzeObserverPixelBuffer,
  buildObserverFeatureCollection,
  cameraVectorSnapshotsEqual,
  collectManagedObserverImagery,
  resolveObserverTarget,
} from './observer-renderer.js'
import type { CameraVectorSnapshot } from './observer-renderer.js'

function object(overrides: Partial<SpatialObject>): SpatialObject {
  return {
    objectId: 'entity:scene:school',
    sourceType: 'geojson',
    type: 'school',
    name: '滨河学校',
    layerId: 'scene',
    resourceId: 'resource_scene',
    geometry: { type: 'Point', coordinates: [116.4, 39.9] },
    properties: {},
    geometryQuality: 'exact',
    observedAt: '2026-08-27T00:00:00.000Z',
    revision: 1,
    provenance: { source: 'scene', method: 'entity-position' },
    ...overrides,
  }
}

function cameraSnapshot(positionX: number): CameraVectorSnapshot {
  return {
    position: new Cesium.Cartesian3(positionX, 2, 3),
    direction: new Cesium.Cartesian3(0, 0, -1),
    up: new Cesium.Cartesian3(0, 1, 0),
    right: new Cesium.Cartesian3(1, 0, 0),
    transform: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY),
  }
}

describe('ObserverRenderer helpers', () => {
  it('resolves an object target and applies the detail preset', () => {
    const context = createSpatialContext([object({
      geometry: { type: 'Point', coordinates: [116.405, 39.9, 18] },
    })])

    expect(resolveObserverTarget({
      targetObjectId: 'entity:scene:school',
      preset: 'detail',
    }, context)).toEqual({
      targetObjectId: 'entity:scene:school',
      preset: 'detail',
      longitude: 116.405,
      latitude: 39.9,
      height: 18,
      range: 2200,
      heading: 225,
      pitch: -32,
    })
  })

  it('lets explicit camera values override a preset', () => {
    const context = createSpatialContext([object({})])

    expect(resolveObserverTarget({
      targetObjectId: 'entity:scene:school',
      preset: 'overview',
      range: 4800,
      heading: 180,
      targetHeight: 30,
    }, context)).toMatchObject({
      preset: 'overview',
      height: 30,
      range: 4800,
      heading: 180,
      pitch: -55,
    })
  })

  it('rejects unresolved object targets', () => {
    const context = createSpatialContext([object({
      objectId: 'layer:scene',
      geometry: undefined,
      centroid: undefined,
    })])

    expect(() => resolveObserverTarget({ targetObjectId: 'missing' }, context))
      .toThrow('Spatial object not found: missing')
    expect(() => resolveObserverTarget({ targetObjectId: 'layer:scene' }, context))
      .toThrow('Spatial object has no centroid: layer:scene')
  })

  it('mirrors only geometry-bearing spatial objects into GeoJSON', () => {
    const featureCollection = buildObserverFeatureCollection([
      object({}),
      object({
        objectId: 'layer:scene',
        sourceType: 'layer',
        type: 'geojson',
        geometry: undefined,
      }),
    ])

    expect(featureCollection.type).toBe('FeatureCollection')
    expect(featureCollection.features).toHaveLength(1)
    expect(featureCollection.features[0]).toMatchObject({
      id: 'entity:scene:school',
      geometry: { type: 'Point', coordinates: [116.4, 39.9] },
      properties: {
        semanticType: 'school',
        geometryQuality: 'exact',
        resourceId: 'resource_scene',
      },
    })
  })

  it('collects managed imagery state for the independent Viewer', () => {
    const imageryProvider = { id: 'nasa-gibs-provider' }
    const imageryLayer = {
      imageryProvider,
      show: true,
      alpha: 0.86,
      brightness: 1.1,
      contrast: 1.2,
      hue: 0.1,
      saturation: 0.9,
      gamma: 1.05,
    }
    const bridge = {
      layerManager: {
        layers: [{ id: 'nasa-gibs' }, { id: 'usgs-events' }],
        getCesiumRefs: (id: string) => id === 'nasa-gibs'
          ? { imageryLayer }
          : { dataSource: {} },
      },
    } as any

    expect(collectManagedObserverImagery(bridge)).toEqual([{
      imageryProvider,
      show: true,
      alpha: 0.86,
      brightness: 1.1,
      contrast: 1.2,
      hue: 0.1,
      saturation: 0.9,
      gamma: 1.05,
    }])
  })

  it('detects any application-camera mutation', () => {
    expect(cameraVectorSnapshotsEqual(cameraSnapshot(1), cameraSnapshot(1))).toBe(true)
    expect(cameraVectorSnapshotsEqual(cameraSnapshot(1), cameraSnapshot(2))).toBe(false)
  })

  it('rejects a uniformly dark observer frame', () => {
    const pixels = new Uint8ClampedArray([
      4, 11, 16, 255,
      4, 11, 16, 255,
      4, 11, 16, 255,
      4, 11, 16, 255,
    ])

    expect(analyzeObserverPixelBuffer(pixels)).toMatchObject({
      blank: true,
      opaquePixelCount: 4,
      colorBucketCount: 1,
    })
  })

  it('rejects a fully transparent observer frame', () => {
    expect(analyzeObserverPixelBuffer(new Uint8ClampedArray(16))).toMatchObject({
      blank: true,
      opaquePixelCount: 0,
    })
  })

  it('accepts an observer frame with meaningful color variation', () => {
    const pixels = new Uint8ClampedArray([
      4, 11, 16, 255,
      72, 217, 176, 255,
      57, 120, 139, 255,
      239, 106, 91, 255,
    ])

    expect(analyzeObserverPixelBuffer(pixels)).toMatchObject({
      blank: false,
      opaquePixelCount: 4,
    })
  })

  it('requires readiness to remain stable across consecutive frames', () => {
    const ready = {
      dataSourcesReady: true,
      globeTilesLoaded: true,
      frameHasContent: true,
    }

    expect(advanceObserverStableFrameCount(0, ready)).toBe(1)
    expect(advanceObserverStableFrameCount(1, ready)).toBe(2)
    expect(advanceObserverStableFrameCount(2, {
      ...ready,
      globeTilesLoaded: false,
    })).toBe(0)
  })
})
