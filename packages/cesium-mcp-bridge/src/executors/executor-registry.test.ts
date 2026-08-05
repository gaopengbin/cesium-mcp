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
  } as unknown as CesiumBridge
}

describe('default Bridge executor registry', () => {
  it('covers every view and camera contract exactly once', () => {
    const expected = [
      ...cesiumBrowserToolsetDefinitions.view.names,
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
})
