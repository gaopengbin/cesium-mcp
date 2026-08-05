import { cesiumBrowserToolsetDefinitions } from 'cesium-mcp-contracts'
import { describe, expect, it, vi } from 'vitest'

import type { CesiumBridge } from '../bridge.js'
import {
  createDefaultBridgeExecutors,
  defaultBridgeExecutorNames,
} from './executor-registry.js'

function bridgeStub() {
  return {
    flyTo: vi.fn().mockResolvedValue(undefined),
    setView: vi.fn(),
    getView: vi.fn().mockReturnValue({
      longitude: 116.4,
      latitude: 39.9,
      height: 1000,
      heading: 0,
      pitch: -45,
      roll: 0,
    }),
    zoomToExtent: vi.fn().mockResolvedValue(undefined),
    saveViewpoint: vi.fn().mockReturnValue({ name: 'home' }),
    loadViewpoint: vi.fn().mockReturnValue({ name: 'home' }),
    listViewpoints: vi.fn().mockReturnValue([]),
    exportScene: vi.fn().mockReturnValue({ timestamp: '2026-08-05T00:00:00.000Z' }),
    lookAtTransform: vi.fn(),
    startOrbit: vi.fn(),
    stopOrbit: vi.fn(),
    setCameraOptions: vi.fn(),
    addMarker: vi.fn().mockReturnValue({ id: 'marker-1' }),
    addLabel: vi.fn().mockReturnValue(2),
    addModel: vi.fn().mockReturnValue({ id: 'model-1' }),
    addPolygon: vi.fn().mockReturnValue({ id: 'polygon-1' }),
    addPolyline: vi.fn().mockReturnValue({ id: 'polyline-1' }),
    updateEntity: vi.fn().mockReturnValue(true),
    removeEntity: vi.fn().mockReturnValue(true),
    batchAddEntities: vi.fn().mockReturnValue({ entityIds: ['marker-1'] }),
    queryEntities: vi.fn().mockReturnValue([{ entityId: 'marker-1' }]),
    getEntityProperties: vi.fn().mockReturnValue({ entityId: 'marker-1' }),
    addGeoJsonLayer: vi.fn().mockResolvedValue({ id: 'layer-1', name: 'Cities' }),
    addGeoJsonPrimitive: vi.fn().mockResolvedValue({ id: 'layer-2', name: 'Roads' }),
    listLayers: vi.fn().mockReturnValue([{ id: 'layer-1' }]),
    getLayerSchema: vi.fn().mockReturnValue({
      layerName: 'Cities',
      fields: ['name'],
      entityCount: 1,
    }),
    removeLayer: vi.fn(),
    clearAll: vi.fn().mockReturnValue({ removedLayers: 1, removedEntities: 2 }),
    setLayerVisibility: vi.fn(),
    updateLayerStyle: vi.fn().mockReturnValue(true),
    setBasemap: vi.fn().mockReturnValue('dark'),
  } as unknown as CesiumBridge
}

describe('default Bridge executor registry', () => {
  it('covers every migrated domain contract exactly once', () => {
    const expected = [
      ...cesiumBrowserToolsetDefinitions.view.names,
      ...cesiumBrowserToolsetDefinitions.entity.names,
      ...cesiumBrowserToolsetDefinitions.layer.names,
      ...cesiumBrowserToolsetDefinitions.camera.names,
    ]

    expect(defaultBridgeExecutorNames).toEqual(expected)
    expect(Object.keys(createDefaultBridgeExecutors())).toEqual(expected)
    expect(new Set(defaultBridgeExecutorNames).size).toBe(expected.length)
  })

  it('preserves the existing view command result shape', async () => {
    const bridge = bridgeStub()
    const executors = createDefaultBridgeExecutors()

    const flyTo = await executors.flyTo!(
      { longitude: 116.4, latitude: 39.9 },
      bridge,
    )
    const getView = await executors.getView!({}, bridge)

    expect(flyTo).toEqual({
      success: true,
      message: 'Camera flew to target position',
    })
    expect(getView).toEqual({
      success: true,
      data: {
        longitude: 116.4,
        latitude: 39.9,
        height: 1000,
        heading: 0,
        pitch: -45,
        roll: 0,
      },
      message: 'Current view state retrieved',
    })
  })

  it('preserves camera command dispatch through Bridge methods', async () => {
    const bridge = bridgeStub()
    const executors = createDefaultBridgeExecutors()

    const result = await executors.startOrbit!(
      { longitude: 116.4, latitude: 39.9 },
      bridge,
    )

    expect(bridge.startOrbit).toHaveBeenCalledWith({
      longitude: 116.4,
      latitude: 39.9,
    })
    expect(result).toEqual({ success: true, message: 'Orbit started' })
  })

  it('preserves entity result IDs and query result shapes', async () => {
    const bridge = bridgeStub()
    const executors = createDefaultBridgeExecutors()

    const added = await executors.addMarker!(
      { longitude: 116.4, latitude: 39.9 },
      bridge,
    )
    const queried = await executors.queryEntities!({}, bridge)

    expect(added).toEqual({
      success: true,
      data: { entityId: 'marker-1' },
      message: 'Marker added',
    })
    expect(queried).toEqual({
      success: true,
      data: { entities: [{ entityId: 'marker-1' }] },
      message: '1 entities found',
    })
  })

  it('preserves layer load and clear result shapes', async () => {
    const bridge = bridgeStub()
    const executors = createDefaultBridgeExecutors()

    const loaded = await executors.addGeoJsonLayer!(
      { name: 'Cities', data: { type: 'FeatureCollection', features: [] } },
      bridge,
    )
    const cleared = await executors.clearAll!({}, bridge)

    expect(loaded).toEqual({
      success: true,
      data: { id: 'layer-1', name: 'Cities' },
      message: "GeoJSON layer 'Cities' added",
    })
    expect(cleared).toEqual({
      success: true,
      data: { removedLayers: 1, removedEntities: 2 },
      message: 'Cleared 1 layers and 2 entities',
    })
  })
})
