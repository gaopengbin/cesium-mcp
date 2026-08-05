import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'
import { cesiumBrowserToolContracts } from '../../packages/cesium-mcp-contracts/src/index.js'
import { defaultBridgeExecutorNames } from '../../packages/cesium-mcp-bridge/src/executors/executor-registry.js'
import { getCesiumRuntimeToolMetadata } from '../../packages/cesium-mcp-runtime/src/tool-manifest.js'
import {
  registerCesiumWebMcp,
  type WebMcpModelContext,
} from '../../packages/cesium-mcp-webmcp/src/index.js'

const context: Record<string, any> = {}
context.globalThis = context
runInNewContext(
  readFileSync(new URL('./function-tools.js', import.meta.url), 'utf8'),
  context,
)

function canonicalProjection() {
  return cesiumBrowserToolContracts.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }))
}

describe('cross-entry Cesium tool contract parity', () => {
  it('keeps MCP, WebMCP, and Function Calling on one canonical tool surface', async () => {
    const canonical = canonicalProjection()

    const runtime = cesiumBrowserToolContracts.map((tool) => {
      const metadata = getCesiumRuntimeToolMetadata(tool.name, 'en')!
      return {
        name: tool.name,
        description: metadata.description,
        inputSchema: metadata.inputSchema,
      }
    })

    const registered: Array<{ tool: any }> = []
    const modelContext: WebMcpModelContext = {
      async registerTool(tool) {
        registered.push({ tool })
      },
    }
    const execute = vi.fn().mockResolvedValue({ success: true })
    await registerCesiumWebMcp({ execute }, {
      modelContext,
      toolsets: 'all',
    })
    const webMcp = registered.map(({ tool }) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }))

    const functionCalling = context.CesiumFunctionTools
      .toFunctionTools(cesiumBrowserToolContracts)
      .map((tool: any) => ({
        name: tool.function.name,
        description: tool.function.description,
        inputSchema: tool.function.parameters,
      }))

    expect(runtime).toEqual(canonical)
    expect(webMcp).toEqual(canonical)
    expect(functionCalling).toEqual(canonical)
    expect(defaultBridgeExecutorNames).toEqual(
      canonical.map(tool => tool.name).filter(name => name !== 'geocode'),
    )
  })

  it('routes WebMCP execution with the canonical action and unchanged input', async () => {
    const registered: any[] = []
    const execute = vi.fn().mockResolvedValue({ success: true })
    await registerCesiumWebMcp({ execute }, {
      modelContext: {
        async registerTool(tool) {
          registered.push(tool)
        },
      },
      toolsets: 'all',
    })

    const input = { longitude: 116.4, latitude: 39.9 }
    await registered.find(tool => tool.name === 'flyTo').execute(input)

    expect(execute).toHaveBeenCalledWith({ action: 'flyTo', params: input })
    expect(context.CesiumFunctionTools.toBridgeCommand('flyTo', input)).toEqual({
      action: 'flyTo',
      params: input,
    })
  })
})
