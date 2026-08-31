import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpHttpHandler } from '@modelcontextprotocol/server'
import { cesiumBrowserToolContracts } from 'cesium-mcp-contracts'

import { createCesiumMcpHttpHandler } from './index.js'

const MODERN_VERSION = '2026-07-28'
const LEGACY_VERSION = '2025-11-25'

interface JsonRpcResponse {
  result?: Record<string, unknown>
  error?: Record<string, unknown>
}

const openHandlers: McpHttpHandler[] = []

function createHandler(): McpHttpHandler {
  const handler = createCesiumMcpHttpHandler()
  openHandlers.push(handler)
  return handler
}

async function postMcp(
  handler: McpHttpHandler,
  body: Record<string, unknown>,
  options: {
    url?: string
    modern?: boolean
    name?: string
  } = {},
): Promise<{ response: Response; payload: JsonRpcResponse }> {
  const method = String(body.method)
  const headers = new Headers({
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  })
  if (options.modern) {
    headers.set('MCP-Protocol-Version', MODERN_VERSION)
    headers.set('Mcp-Method', method)
    if (options.name) headers.set('Mcp-Name', options.name)
  }
  const response = await handler.fetch(new Request(
    options.url ?? 'http://test.local/mcp',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
  ))
  const text = await response.text()
  const dataLine = text
    .split(/\r?\n/)
    .find(line => line.startsWith('data:'))
  const payload = JSON.parse(dataLine ? dataLine.slice(5).trim() : text) as JsonRpcResponse
  return { response, payload }
}

function modernMeta(): Record<string, unknown> {
  return {
    'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
    'io.modelcontextprotocol/clientInfo': {
      name: 'cesium-mcp-runtime-test',
      version: '1.0.0',
    },
    'io.modelcontextprotocol/clientCapabilities': {},
  }
}

afterEach(async () => {
  await Promise.all(openHandlers.splice(0).map(handler => handler.close()))
  vi.unstubAllGlobals()
})

describe('MCP SDK v2 dual-era HTTP handler', () => {
  it('serves the 2026-07-28 server/discover exchange', async () => {
    const { response, payload } = await postMcp(createHandler(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: { _meta: modernMeta() },
    }, { modern: true })

    expect(response.status).toBe(200)
    expect(payload.error).toBeUndefined()
    expect(payload.result?.supportedVersions).toContain(MODERN_VERSION)
    expect(payload.result?._meta).toMatchObject({
      'io.modelcontextprotocol/serverInfo': {
        name: 'cesium-mcp-runtime',
      },
    })
  })

  it('keeps the 2025-era initialize handshake working', async () => {
    const { response, payload } = await postMcp(createHandler(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LEGACY_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'legacy-test-client',
          version: '1.0.0',
        },
      },
    })

    expect(response.status).toBe(200)
    expect(payload.error).toBeUndefined()
    expect(payload.result?.protocolVersion).toBe(LEGACY_VERSION)
    expect(payload.result?.serverInfo).toMatchObject({
      name: 'cesium-mcp-runtime',
    })
  })

  it('publishes canonical schemas through modern tools/list', async () => {
    const { payload } = await postMcp(createHandler(), {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: { _meta: modernMeta() },
    }, {
      modern: true,
      url: 'http://test.local/mcp?toolsets=view',
    })

    const tools = payload.result?.tools as Array<{
      name: string
      inputSchema: Record<string, unknown>
      outputSchema?: Record<string, unknown>
    }>
    const names = tools.map(tool => tool.name)
    const flyTo = tools.find(tool => tool.name === 'flyTo')

    expect(names).toContain('flyTo')
    expect(names).toContain('listSessions')
    expect(names).toContain('storeResource')
    expect(names).toContain('listResources')
    expect(names).toContain('deleteResource')
    expect(names).not.toContain('addMarker')
    expect(names).not.toContain('test_missing_capability')
    expect(names).not.toContain('test_streaming_elicitation')
    expect(names).not.toContain('test_logging_tool')
    expect(flyTo?.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        longitude: {
          type: 'number',
          minimum: -180,
          maximum: 180,
        },
        latitude: {
          type: 'number',
          minimum: -90,
          maximum: 90,
        },
        sessionId: {
          type: 'string',
        },
      },
    })
    expect(flyTo?.outputSchema).toEqual(
      cesiumBrowserToolContracts.find(contract => contract.name === 'flyTo')?.outputSchema,
    )
  })

  it('exposes perception and observer only through an explicit HTTP toolset selection', async () => {
    const request = {
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/list',
      params: { _meta: modernMeta() },
    }
    const regular = await postMcp(createHandler(), request, {
      modern: true,
      url: 'http://test.local/mcp',
    })
    const experimental = await postMcp(createHandler(), request, {
      modern: true,
      url: 'http://test.local/mcp?toolsets=perception,observer',
    })
    const regularNames = (regular.payload.result?.tools as Array<{ name: string }>)
      .map(tool => tool.name)
    const experimentalTools = experimental.payload.result?.tools as Array<{
      name: string
      inputSchema: Record<string, unknown>
    }>
    const experimentalNames = experimentalTools.map(tool => tool.name)
    const observer = experimentalTools.find(tool => tool.name === 'captureObserverView')

    expect(regularNames).not.toContain('describeScene')
    expect(regularNames).not.toContain('observeScene')
    expect(experimentalNames).toEqual(expect.arrayContaining([
      'observeScene',
      'describeScene',
      'querySpatialObjects',
      'getObjectContext',
      'querySpatialRelation',
      'getViewContext',
      'captureObserverView',
    ]))
    expect(experimentalNames).not.toContain('flyTo')
    expect(observer?.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        targetObjectId: { type: 'string' },
        preset: { enum: ['overview', 'detail', 'eye-level'] },
        sessionId: { type: 'string' },
      },
      oneOf: [
        { required: ['targetObjectId'] },
        { required: ['targetLongitude', 'targetLatitude'] },
      ],
    })
  })

  it('isolates stored resource metadata by browser session', async () => {
    const handler = createHandler()
    const geoJson = { type: 'FeatureCollection', features: [] }
    const stored = await postMcp(handler, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'storeResource',
        arguments: { kind: 'geojson', data: geoJson, sessionId: 'alpha' },
        _meta: modernMeta(),
      },
    }, { modern: true, name: 'storeResource' })

    expect(stored.payload.result?.structuredContent).toMatchObject({ kind: 'geojson' })

    const alpha = await postMcp(handler, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'listResources',
        arguments: { sessionId: 'alpha' },
        _meta: modernMeta(),
      },
    }, { modern: true, name: 'listResources' })
    const beta = await postMcp(handler, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'listResources',
        arguments: { sessionId: 'beta' },
        _meta: modernMeta(),
      },
    }, { modern: true, name: 'listResources' })

    expect(alpha.payload.result?.structuredContent).toMatchObject({
      resources: [expect.objectContaining({ kind: 'geojson' })],
    })
    expect(beta.payload.result?.structuredContent).toEqual({ resources: [] })
  })

  it('validates modern tool calls before reaching the browser bridge', async () => {
    const { response, payload } = await postMcp(createHandler(), {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'flyTo',
        arguments: {
          longitude: 999,
          latitude: 39.9,
        },
        _meta: modernMeta(),
      },
    }, {
      modern: true,
      name: 'flyTo',
    })

    expect(response.status).toBe(200)
    expect(payload.error).toBeUndefined()
    expect(payload.result).toMatchObject({
      isError: true,
    })
    expect(JSON.stringify(payload.result)).toContain('longitude')
  })

  it('returns canonical structured output while preserving text content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{
      lat: '39.9163',
      lon: '116.3972',
      display_name: 'Forbidden City, Beijing, China',
      boundingbox: ['39.91', '39.92', '116.39', '116.40'],
    }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    const { response, payload } = await postMcp(createHandler(), {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'geocode',
        arguments: { address: 'Forbidden City' },
        _meta: modernMeta(),
      },
    }, {
      modern: true,
      name: 'geocode',
    })

    expect(response.status).toBe(200)
    expect(payload.error).toBeUndefined()
    expect(payload.result?.structuredContent).toEqual({
      success: true,
      longitude: 116.3972,
      latitude: 39.9163,
      displayName: 'Forbidden City, Beijing, China',
      boundingBox: {
        south: 39.91,
        north: 39.92,
        west: 116.39,
        east: 116.4,
      },
    })
    expect(payload.result?.content).toEqual([{
      type: 'text',
      text: JSON.stringify(payload.result?.structuredContent),
    }])
  })

  it('rejects modern header/body method mismatches', async () => {
    const response = await createHandler().fetch(new Request(
      'http://test.local/mcp',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': MODERN_VERSION,
          'Mcp-Method': 'tools/list',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'server/discover',
          params: { _meta: modernMeta() },
        }),
      },
    ))
    const payload = await response.json() as JsonRpcResponse

    expect(response.status).toBe(400)
    expect(payload.error?.code).toBe(-32020)
  })
})
