import { describe, expect, it, vi } from 'vitest'
import {
  CesiumBridge,
  registerCesiumViewerWebMcp,
} from './viewer.js'
import type { WebMcpModelContext } from './index.js'

describe('registerCesiumViewerWebMcp', () => {
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
