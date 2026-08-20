import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'
import { cesiumBrowserToolContracts } from '../packages/cesium-mcp-contracts/src/index.js'
import { getCesiumRuntimeToolMetadata } from '../packages/cesium-mcp-runtime/src/tool-manifest.js'
import { buildCesiumWebMcpTools } from '../packages/cesium-mcp-webmcp/src/index.js'
import {
  auditProviderToolSchema,
  auditProviderToolSurfaces,
} from './schema-provider-compatibility.mjs'

const functionContext: Record<string, any> = {}
functionContext.globalThis = functionContext
runInNewContext(
  readFileSync(new URL('../examples/browser-agent/function-tools.js', import.meta.url), 'utf8'),
  functionContext,
)

function canonicalTools() {
  return cesiumBrowserToolContracts.map(tool => ({
    name: tool.name,
    inputSchema: tool.inputSchema,
  }))
}

describe('provider schema compatibility gate', () => {
  it('accepts all 61 tools across Contracts, MCP, WebMCP, and Function Calling', () => {
    const canonical = canonicalTools()
    const runtime = cesiumBrowserToolContracts.map(tool => ({
      name: tool.name,
      inputSchema: getCesiumRuntimeToolMetadata(tool.name, 'en')!.inputSchema,
    }))
    const webMcp = buildCesiumWebMcpTools({ execute: vi.fn() }, { toolsets: 'all' })
      .map(tool => ({ name: tool.name, inputSchema: tool.inputSchema }))
    const functionCalling = functionContext.CesiumFunctionTools
      .toFunctionTools(cesiumBrowserToolContracts)
      .map((tool: any) => ({
        name: tool.function.name,
        inputSchema: tool.function.parameters,
      }))

    const surfaces = { canonical, runtime, webMcp, functionCalling }
    for (const tools of Object.values(surfaces)) {
      expect(tools.map(tool => tool.name)).toEqual(canonical.map(tool => tool.name))
    }
    expect(auditProviderToolSurfaces(surfaces)).toEqual([])
  })

  it('reports actionable provider-specific paths for incompatible schemas', () => {
    const issues = auditProviderToolSchema({
      surface: 'fixture',
      toolName: 'badTool',
      schema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              points: {
                type: 'array',
                prefixItems: [{ type: 'number' }],
              },
            },
          },
        ],
        $schema: 'https://json-schema.org/draft/2020-12/schema',
      },
    })

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'root-object', path: '$' }),
      expect.objectContaining({ rule: 'root-union', path: '$.oneOf' }),
      expect.objectContaining({ rule: 'schema-pointer', path: '$.$schema' }),
      expect.objectContaining({ rule: 'array-items', path: '$.oneOf[0].properties.points' }),
    ]))
  })
})
