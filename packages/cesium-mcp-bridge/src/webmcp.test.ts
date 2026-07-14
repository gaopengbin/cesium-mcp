import { describe, expect, it, vi } from 'vitest'
import { registerWebMcpTools } from './webmcp.js'
import type { WebMcpModelContext, WebMcpToolDefinition } from './webmcp.js'

const tools: WebMcpToolDefinition[] = [
  {
    name: 'getView',
    title: 'Get View',
    description: 'Read the current camera view',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'flyTo',
    description: 'Fly to a location',
    inputSchema: {
      type: 'object',
      properties: { longitude: { type: 'number' }, latitude: { type: 'number' } },
      required: ['longitude', 'latitude'],
    },
  },
]

function createModelContext(): WebMcpModelContext & { registered: Array<{ tool: any; options: any }> } {
  const registered: Array<{ tool: any; options: any }> = []
  return {
    registered,
    async registerTool(tool, options) {
      registered.push({ tool, options })
    },
  }
}

describe('registerWebMcpTools', () => {
  it('registers tools and forwards execution to the bridge', async () => {
    const modelContext = createModelContext()
    const execute = vi.fn().mockResolvedValue({ success: true, data: { longitude: 10 } })

    const registration = await registerWebMcpTools({ execute }, tools, {
      modelContext,
      exposedTo: ['https://agent.example'],
    })

    expect(registration.registered).toEqual(['getView', 'flyTo'])
    expect(modelContext.registered).toHaveLength(2)
    expect(modelContext.registered[0]?.tool).toMatchObject({
      name: 'getView',
      title: 'Get View',
      description: 'Read the current camera view',
      annotations: { readOnlyHint: true },
    })
    expect(modelContext.registered[0]?.options.exposedTo).toEqual(['https://agent.example'])

    const result = await modelContext.registered[1]?.tool.execute({ longitude: 116.4, latitude: 39.9 })
    expect(execute).toHaveBeenCalledWith({
      action: 'flyTo',
      params: { longitude: 116.4, latitude: 39.9 },
    })
    expect(result).toEqual({ success: true, data: { longitude: 10 } })
  })

  it('uses one abort signal to unregister all tools', async () => {
    const modelContext = createModelContext()
    const registration = await registerWebMcpTools({ execute: vi.fn() }, tools, { modelContext })

    const signals = modelContext.registered.map(item => item.options.signal)
    expect(signals[0]).toBe(signals[1])
    expect(signals[0].aborted).toBe(false)

    registration.unregister()
    expect(signals[0].aborted).toBe(true)
  })

  it('rolls back already registered tools when registration fails', async () => {
    let callCount = 0
    let signal: AbortSignal | undefined
    const modelContext: WebMcpModelContext = {
      async registerTool(_tool, options) {
        signal = options?.signal
        callCount += 1
        if (callCount === 2) throw new Error('registration failed')
      },
    }

    await expect(registerWebMcpTools({ execute: vi.fn() }, tools, { modelContext }))
      .rejects.toThrow('registration failed')
    expect(signal?.aborted).toBe(true)
  })

  it('fails clearly when WebMCP is unavailable', async () => {
    await expect(registerWebMcpTools({ execute: vi.fn() }, tools, { document: {} }))
      .rejects.toThrow('WebMCP is not available')
  })

  it('rejects duplicate tool names before registering anything', async () => {
    const modelContext = createModelContext()
    await expect(registerWebMcpTools({ execute: vi.fn() }, [tools[0]!, tools[0]!], { modelContext }))
      .rejects.toThrow('Duplicate WebMCP tool name: getView')
    expect(modelContext.registered).toHaveLength(0)
  })
})
