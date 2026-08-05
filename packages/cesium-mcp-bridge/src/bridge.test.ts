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
})
