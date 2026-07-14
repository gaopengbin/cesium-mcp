import { describe, expect, it, vi } from 'vitest'
import {
  cesiumBrowserToolContracts,
  cesiumCoreToolContracts,
  registerCesiumWebMcp,
  registerWebMcpTools,
} from './index.js'
import type { WebMcpModelContext } from './index.js'

function createModelContext(): WebMcpModelContext & { registered: Array<{ tool: any; options: any }> } {
  const registered: Array<{ tool: any; options: any }> = []
  return {
    registered,
    async registerTool(tool, options) {
      registered.push({ tool, options })
    },
  }
}

describe('registerCesiumWebMcp', () => {
  it('registers the shared core contracts and forwards execution', async () => {
    const modelContext = createModelContext()
    const execute = vi.fn().mockResolvedValue({ success: true })

    const registration = await registerCesiumWebMcp({ execute }, {
      modelContext,
      exposedTo: ['https://agent.example'],
    })

    expect(registration.registered).toEqual(cesiumCoreToolContracts.map(tool => tool.name))
    expect(modelContext.registered).toHaveLength(15)
    expect(modelContext.registered[0]?.tool).toMatchObject({
      name: 'flyTo',
      inputSchema: cesiumCoreToolContracts[0]?.inputSchema,
      outputSchema: cesiumCoreToolContracts[0]?.outputSchema,
    })
    expect(modelContext.registered[0]?.options.exposedTo).toEqual(['https://agent.example'])

    const addMarker = modelContext.registered.find(item => item.tool.name === 'addMarker')!.tool
    await addMarker.execute({ longitude: 116.4, latitude: 39.9 })
    expect(execute).toHaveBeenCalledWith({
      action: 'addMarker',
      params: { longitude: 116.4, latitude: 39.9 },
    })
  })

  it('uses one abort signal to unregister every tool', async () => {
    const modelContext = createModelContext()
    const registration = await registerCesiumWebMcp({ execute: vi.fn() }, { modelContext })
    const signals = modelContext.registered.map(item => item.options.signal)

    expect(new Set(signals).size).toBe(1)
    registration.unregister()
    expect(signals[0].aborted).toBe(true)
  })

  it('registers all browser-safe contracts or selected toolsets on demand', async () => {
    const allContext = createModelContext()
    const allRegistration = await registerCesiumWebMcp(
      { execute: vi.fn() },
      { modelContext: allContext, toolsets: 'all' },
    )
    expect(allRegistration.registered).toEqual(cesiumBrowserToolContracts.map(tool => tool.name))
    expect(allContext.registered).toHaveLength(61)

    const selectedContext = createModelContext()
    const selectedRegistration = await registerCesiumWebMcp(
      { execute: vi.fn() },
      { modelContext: selectedContext, toolsets: ['camera', 'trajectory'] },
    )
    expect(selectedRegistration.registered).toEqual([
      'lookAtTransform',
      'startOrbit',
      'stopOrbit',
      'setCameraOptions',
      'playTrajectory',
    ])

    const bridgeContext = createModelContext()
    const bridgeRegistration = await registerCesiumWebMcp(
      { execute: vi.fn() },
      { modelContext: bridgeContext, toolsets: 'all', excludeTools: ['geocode'] },
    )
    expect(bridgeRegistration.registered).toHaveLength(60)
    expect(bridgeRegistration.registered).not.toContain('geocode')
  })

  it('rolls back earlier registrations when one registration fails', async () => {
    let callCount = 0
    let signal: AbortSignal | undefined
    const modelContext: WebMcpModelContext = {
      async registerTool(_tool, options) {
        signal = options?.signal
        callCount += 1
        if (callCount === 2) throw new Error('registration failed')
      },
    }

    await expect(registerCesiumWebMcp({ execute: vi.fn() }, { modelContext }))
      .rejects.toThrow('registration failed')
    expect(signal?.aborted).toBe(true)
  })

  it('fails clearly when native WebMCP is unavailable', async () => {
    await expect(registerCesiumWebMcp({ execute: vi.fn() }, { document: {} }))
      .rejects.toThrow('WebMCP is not available')
  })

  it('rejects duplicate names before registration', async () => {
    const modelContext = createModelContext()
    const tool = cesiumCoreToolContracts[0]!
    await expect(registerWebMcpTools({ execute: vi.fn() }, [tool, tool], { modelContext }))
      .rejects.toThrow('Duplicate WebMCP tool name: flyTo')
    expect(modelContext.registered).toHaveLength(0)
  })
})
