import { afterEach, describe, expect, it } from 'vitest'
import type { McpHttpHandler } from '@modelcontextprotocol/server'

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
    }>
    const names = tools.map(tool => tool.name)
    const flyTo = tools.find(tool => tool.name === 'flyTo')

    expect(names).toContain('flyTo')
    expect(names).toContain('listSessions')
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
