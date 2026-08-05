import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'

import { CesiumBridge } from './bridge.js'
import type { BridgeExecutor, CesiumBridgeOptions } from './bridge.js'

function makeBridge(options: CesiumBridgeOptions = {}) {
  return new CesiumBridge({} as never, options)
}

describe('CesiumBridge command boundary', () => {
  it('rejects invalid shared-contract input before dispatch', async () => {
    const bridge = makeBridge()
    const result = await bridge.execute({
      action: 'flyTo',
      params: { longitude: 181 },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid parameters for "flyTo"')
    expect(result.error).toContain('$.latitude')
    expect(result.error).toContain('$.longitude')
  })

  it('allows validation to be disabled as a compatibility escape hatch', async () => {
    const executor = vi.fn<BridgeExecutor>().mockResolvedValue({ success: true })
    const bridge = makeBridge({
      validateInputs: false,
      executors: { flyTo: executor },
    })

    const result = await bridge.execute({
      action: 'flyTo',
      params: { longitude: 181 },
    })

    expect(result.success).toBe(true)
    expect(executor).toHaveBeenCalledOnce()
  })

  it('supports one-command executor overrides without replacing the dispatcher', async () => {
    const executor = vi.fn<BridgeExecutor>().mockResolvedValue({
      success: true,
      data: { source: 'custom' },
    })
    const bridge = makeBridge({ executors: { flyTo: executor } })

    const result = await bridge.execute({
      action: 'flyTo',
      params: { longitude: 116.4, latitude: 39.9 },
    })

    expect(result).toEqual({ success: true, data: { source: 'custom' } })
    expect(executor).toHaveBeenCalledWith(
      { longitude: 116.4, latitude: 39.9 },
      bridge,
    )
  })

  it('dispatches built-in view commands through the default registry', async () => {
    const bridge = makeBridge()
    const setView = vi.spyOn(bridge, 'setView').mockImplementation(() => {})

    const result = await bridge.execute({
      action: 'setView',
      params: { longitude: 116.4, latitude: 39.9 },
    })

    expect(setView).toHaveBeenCalledWith({
      longitude: 116.4,
      latitude: 39.9,
    })
    expect(result).toEqual({ success: true, message: 'Camera view set' })
  })

  it('keeps the internal Ion token command outside shared tool contracts', async () => {
    const bridge = makeBridge()
    const previous = Cesium.Ion.defaultAccessToken

    try {
      const result = await bridge.execute({
        action: 'setIonToken',
        params: { token: 'test-token' },
      })

      expect(result).toEqual({
        success: true,
        message: 'Cesium Ion access token updated',
      })
      expect(Cesium.Ion.defaultAccessToken).toBe('test-token')
    } finally {
      Cesium.Ion.defaultAccessToken = previous
    }
  })

  it('returns the existing error shape for unknown commands', async () => {
    const bridge = makeBridge()

    const result = await bridge.execute({
      action: 'customUnknownCommand',
      params: {},
    })

    expect(result).toEqual({
      success: false,
      error: '未知指令: customUnknownCommand',
    })
  })

  it('disposes bridge-managed handlers idempotently', () => {
    const bridge = makeBridge()
    const handler = vi.fn()
    bridge.on('layerAdded', handler)

    bridge.dispose()
    bridge.dispose()
    ;(bridge as unknown as { _emit: (event: 'layerAdded', data: unknown) => void })
      ._emit('layerAdded', {})

    expect(handler).not.toHaveBeenCalled()
  })

  it('cancels viewer activity and rejects commands after disposal', async () => {
    const cancelFlight = vi.fn()
    const viewer = {
      camera: { cancelFlight },
      dataSources: { length: 0 },
      entities: { values: [] },
    }
    const executor = vi.fn<BridgeExecutor>().mockResolvedValue({ success: true })
    const bridge = new CesiumBridge(viewer as never, {
      executors: { flyTo: executor },
    })

    bridge.dispose()
    bridge.dispose()
    const result = await bridge.execute({
      action: 'flyTo',
      params: { longitude: 116.4, latitude: 39.9 },
    })

    expect(cancelFlight).toHaveBeenCalledOnce()
    expect(executor).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      error: 'CesiumBridge has been disposed',
    })
  })

  it('aborts a pending screenshot when disposed', async () => {
    const removeListener = vi.fn()
    const viewer = {
      camera: { cancelFlight: vi.fn() },
      dataSources: { length: 0 },
      entities: { values: [] },
      scene: {
        requestRender: vi.fn(),
        canvas: {
          toDataURL: () => 'data:image/png;base64,abc',
          width: 800,
          height: 600,
        },
        postRender: {
          addEventListener: vi.fn(() => removeListener),
        },
      },
    }
    const bridge = new CesiumBridge(viewer as never)

    const pendingScreenshot = bridge.screenshot()
    bridge.dispose()

    await expect(pendingScreenshot).rejects.toThrow('Screenshot cancelled')
    expect(removeListener).toHaveBeenCalledOnce()
  })

  it('isolates managed camera activity between Viewer instances', () => {
    const stopA = vi.fn()
    const stopB = vi.fn()
    const viewerA = {
      camera: { cancelFlight: vi.fn(), rotateRight: vi.fn() },
      clock: { onTick: { addEventListener: vi.fn(() => stopA) } },
    }
    const viewerB = {
      camera: { cancelFlight: vi.fn(), rotateRight: vi.fn() },
      clock: { onTick: { addEventListener: vi.fn(() => stopB) } },
    }
    const bridgeA = new CesiumBridge(viewerA as never)
    const bridgeB = new CesiumBridge(viewerB as never)

    bridgeA.startOrbit({ speed: 0.01 })
    bridgeB.startOrbit({ speed: 0.02 })
    bridgeA.dispose()

    expect(stopA).toHaveBeenCalledOnce()
    expect(stopB).not.toHaveBeenCalled()
    expect(viewerA.camera.cancelFlight).toHaveBeenCalledOnce()
    expect(viewerB.camera.cancelFlight).not.toHaveBeenCalled()

    bridgeB.stopOrbit()
    expect(stopB).toHaveBeenCalledOnce()
  })

  it('releases LayerManager bookkeeping without removing scene content', () => {
    const viewer = { camera: { cancelFlight: vi.fn() } }
    const bridge = new CesiumBridge(viewer as never)
    const entity = { id: 'marker-1' }
    bridge.layerManager.layers.push({
      id: 'marker_marker-1',
      name: 'Marker',
      type: 'marker',
      visible: true,
      color: '#3B82F6',
    })
    bridge.layerManager.setCesiumRefs('marker_marker-1', { entity } as never)

    bridge.dispose()

    expect(bridge.layerManager.layers).toEqual([])
    expect(bridge.layerManager.getCesiumRefs('marker_marker-1')).toBeUndefined()
  })
})
