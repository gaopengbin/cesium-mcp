import { describe, expect, it, vi } from 'vitest'
import {
  CesiumBridge,
  registerCesiumViewerWebMcp,
} from './viewer.js'
import type { WebMcpModelContext } from './index.js'

describe('registerCesiumViewerWebMcp', () => {
  it('cancels an active camera flight when its owner is disposed', async () => {
    let execute!: (input: Record<string, unknown>) => unknown
    const cancelFlight = vi.fn()
    const registration = await registerCesiumViewerWebMcp({
      camera: { flyToBoundingSphere: vi.fn(), cancelFlight },
    } as any, {
      toolsets: ['view'],
      modelContext: { async registerTool(tool) { if (tool.name === 'flyTo') execute = tool.execute } },
    })
    const pending = execute({ longitude: 0, latitude: 0, duration: 30 })
    registration.dispose()
    expect(registration.signal.aborted).toBe(true)
    await expect(pending).resolves.toMatchObject({ success: false })
    expect(cancelFlight).toHaveBeenCalled()
    await expect(execute({ longitude: 0, latitude: 0 })).rejects.toThrow('closed')
  })

  it('lets in-flight execution complete after unregistering, then releases its Bridge', async () => {
    let execute!: (input: Record<string, unknown>) => unknown
    let finish!: (value: { success: boolean }) => void
    const registration = await registerCesiumViewerWebMcp({ camera: { cancelFlight: vi.fn() } } as any, {
      toolsets: ['view'],
      modelContext: { async registerTool(tool) { if (tool.name === 'flyTo') execute = tool.execute } },
      bridgeOptions: { executors: { flyTo: () => new Promise(resolve => { finish = resolve }) } },
    })
    const dispose = vi.spyOn(registration.bridge, 'dispose')
    const pending = execute({ longitude: 0, latitude: 0 })
    registration.unregister()
    expect(registration.signal.aborted).toBe(true)
    expect(dispose).not.toHaveBeenCalled()
    finish({ success: true })
    await expect(pending).resolves.toEqual({ success: true })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('creates and owns the Bridge behind a one-package Viewer API', async () => {
    const registered: string[] = []
    const modelContext: WebMcpModelContext = {
      async registerTool(tool) {
        registered.push(tool.name)
      },
    }
    const viewer = {
      camera: { cancelFlight: vi.fn() },
    } as any

    const registration = await registerCesiumViewerWebMcp(viewer, {
      modelContext,
      toolsets: ['camera'],
    })

    expect(registration.bridge).toBeInstanceOf(CesiumBridge)
    expect(registered).toEqual([
      'lookAtTransform',
      'startOrbit',
      'stopOrbit',
      'setCameraOptions',
    ])

    const dispose = vi.spyOn(registration.bridge, 'dispose')
    registration.unregister()
    expect(registration.signal.aborted).toBe(true)
    expect(dispose).toHaveBeenCalledOnce()
  })
})
