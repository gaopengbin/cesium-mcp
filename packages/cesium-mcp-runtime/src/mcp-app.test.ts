import { describe, expect, it } from 'vitest'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'

import { buildMcpServer } from './index.js'
import { cesiumAppDomain, cesiumAppUri } from './mcp-app.js'
import { cesiumMapOrigins } from './mcp-app-policy.js'

async function withClient(run: (client: Client) => Promise<void>, publicMode = false) {
  const server = buildMcpServer({ toolsets: ['view', 'entity', 'layer'], publicMode })
  const client = new Client({ name: 'map-app-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    await run(client)
  } finally {
    await client.close()
    await server.close()
  }
}

describe('Cesium MCP App', () => {
  it('requires issued public capabilities for all commands, transport and session discovery', async () => {
    await withClient(async client => {
      const opened = await client.callTool({ name: 'openCesiumMap', arguments: {} })
      const sessionId = (opened.structuredContent as { sessionId: string }).sessionId
      expect(sessionId).toMatch(/^map-[A-Za-z0-9_-]{43}$/)
      for (const [name, args] of [
        ['getView', {}], ['getView', { sessionId: 'not-a-real-session' }],
        ['listSessions', {}], ['listSessions', { sessionId: 'not-a-real-session' }],
        ['connectCesiumMap', { sessionId: 'not-a-real-session' }],
        ['openCesiumMap', { sessionId: 'not-a-real-session' }],
      ] as const) {
        expect((await client.callTool({ name, arguments: args })).isError, name).toBe(true)
      }
      const other = await client.callTool({ name: 'openCesiumMap', arguments: {} })
      const otherId = (other.structuredContent as { sessionId: string }).sessionId
      const sessions = await client.callTool({ name: 'listSessions', arguments: { sessionId } })
      expect(JSON.stringify(sessions.content)).toContain(sessionId)
      expect(JSON.stringify(sessions.content)).not.toContain(otherId)
      const connected = await client.callTool({ name: 'connectCesiumMap', arguments: { sessionId } })
      const token = (connected.structuredContent as { token: string }).token
      const pending = client.callTool({ name: 'getView', arguments: { sessionId } })
      const exchange = await client.callTool({ name: 'exchangeCesiumMap', arguments: { sessionId, token } })
      const commands = (exchange.structuredContent as { commands: { id: string }[] }).commands
      await client.callTool({ name: 'exchangeCesiumMap', arguments: { sessionId, token, results: [{ id: commands[0].id, result: { success: true, data: { longitude: -74, latitude: 40.7, height: 80_000, heading: 0, pitch: -90, roll: 0 } } }] } })
      expect((await pending).isError).not.toBe(true)
      await client.callTool({ name: 'disconnectCesiumMap', arguments: { sessionId, token } })
      const { resources } = await client.listResources()
      expect(resources.map(resource => resource.uri)).not.toContain('cesium://scene/camera')
    }, true)
  })
  it('allows fetches and images for every built-in basemap provider', async () => {
    const presetModule = new URL('../../cesium-mcp-bridge/src/commands/basemap-presets.ts', import.meta.url).href
    const { BASEMAP_PRESETS } = await import(presetModule) as {
      BASEMAP_PRESETS: Record<string, { layers: (token: string) => { url: string; subdomains?: string[] }[] }>
    }
    await withClient(async client => {
      const { contents } = await client.readResource({ uri: cesiumAppUri })
      const csp = (contents[0]._meta as { ui: { csp: { connectDomains: string[]; resourceDomains: string[] } } }).ui.csp
      for (const preset of Object.values(BASEMAP_PRESETS)) {
        for (const layer of preset.layers('test-token')) {
          for (const subdomain of layer.subdomains ?? ['']) {
            const origin = new URL(layer.url.replace('{s}', subdomain)).origin
            expect(csp.connectDomains, origin).toContain(origin)
            expect(csp.resourceDomains, origin).toContain(origin)
          }
        }
      }
    })
  })
  it('routes commands and responses through the app bridge without a WebSocket', async () => {
    await withClient(async client => {
      const sessionId = 'app-bridge-roundtrip'
      const connected = await client.callTool({ name: 'connectCesiumMap', arguments: { sessionId } })
      expect(connected.isError).not.toBe(true)
      const token = (connected.structuredContent as Record<string, unknown>).token
      try {
        const command = client.callTool({ name: 'getView', arguments: { sessionId } })
        const polled = await client.callTool({ name: 'exchangeCesiumMap', arguments: { sessionId, token } })
        const commands = (polled.structuredContent as { commands: { id: string; method: string }[] }).commands
        expect(commands).toHaveLength(1)
        expect(commands[0].method).toBe('getView')
        const acknowledgement = await client.callTool({ name: 'exchangeCesiumMap', arguments: {
          sessionId, token, results: [{ id: commands[0].id, result: { success: true, data: { longitude: 116.397, latitude: 39.908, height: 70_000, heading: 0, pitch: -90, roll: 0 } } }],
        } })
        expect(acknowledgement.isError).not.toBe(true)
        const result = await command
        expect(result.isError, JSON.stringify(result.content)).not.toBe(true)
        expect(JSON.stringify(result.structuredContent)).toContain('116.397')
        const sessions = await client.callTool({ name: 'listSessions', arguments: {} })
        expect(JSON.stringify(sessions.content)).toContain(sessionId)
      } finally {
        await client.callTool({ name: 'disconnectCesiumMap', arguments: { sessionId, token } })
      }
      const disconnected = await client.callTool({ name: 'getView', arguments: { sessionId } })
      expect(disconnected.isError).toBe(true)
    })
  })

  it('isolates app sessions and rejects stale or mismatched connection tokens', async () => {
    await withClient(async client => {
      const a = await client.callTool({ name: 'connectCesiumMap', arguments: { sessionId: 'app-isolation-a' } })
      const b = await client.callTool({ name: 'connectCesiumMap', arguments: { sessionId: 'app-isolation-b' } })
      const tokenA = (a.structuredContent as Record<string, unknown>).token
      const tokenB = (b.structuredContent as Record<string, unknown>).token
      const wrong = await client.callTool({ name: 'exchangeCesiumMap', arguments: { sessionId: 'app-isolation-b', token: tokenA } })
      expect(wrong.isError).toBe(true)
      const pending = client.callTool({ name: 'getView', arguments: { sessionId: 'app-isolation-a' } })
      const queued = await client.callTool({ name: 'exchangeCesiumMap', arguments: { sessionId: 'app-isolation-a', token: tokenA } })
      expect((queued.structuredContent as { commands: unknown[] }).commands).toHaveLength(1)
      const other = await client.callTool({ name: 'exchangeCesiumMap', arguments: { sessionId: 'app-isolation-b', token: tokenB } })
      expect((other.structuredContent as { commands: unknown[] }).commands).toHaveLength(0)
      const replacement = await client.callTool({ name: 'connectCesiumMap', arguments: { sessionId: 'app-isolation-a' } })
      expect((await pending).isError).toBe(true)
      const stale = await client.callTool({ name: 'exchangeCesiumMap', arguments: { sessionId: 'app-isolation-a', token: tokenA } })
      expect(stale.isError).toBe(true)
      expect(JSON.stringify(stale.content)).toContain('Map connection was replaced')
      await client.callTool({ name: 'disconnectCesiumMap', arguments: {
        sessionId: 'app-isolation-a', token: (replacement.structuredContent as Record<string, unknown>).token,
      } })
      await client.callTool({ name: 'disconnectCesiumMap', arguments: { sessionId: 'app-isolation-b', token: tokenB } })
      const lost = await client.callTool({ name: 'exchangeCesiumMap', arguments: { sessionId: 'app-isolation-b', token: tokenB } })
      expect(lost.isError).toBe(true)
      expect(JSON.stringify(lost.content)).toContain('Map session is not connected;')
    })
  })

  it('advertises a standard UI resource with global and thread entrypoints', async () => {
    await withClient(async client => {
      const { tools } = await client.listTools()
      expect(tools.find(tool => tool.name === 'openCesiumMap')).toMatchObject({
        _meta: {
          ui: { resourceUri: cesiumAppUri },
          'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] },
        },
      })
      expect(tools.find(tool => tool.name === 'addMarker')?._meta).toMatchObject({
        ui: { visibility: ['model', 'app'] },
      })
      for (const name of ['connectCesiumMap', 'exchangeCesiumMap', 'disconnectCesiumMap']) {
        expect(tools.find(tool => tool.name === name)?._meta).toMatchObject({ ui: { visibility: ['app'] } })
      }
    })
  })

  it('allocates isolated sessions and allows an explicit session to be reopened', async () => {
    await withClient(async client => {
      const first = await client.callTool({ name: 'openCesiumMap', arguments: {} })
      const second = await client.callTool({ name: 'openCesiumMap', arguments: {} })
      const firstConnection = first.structuredContent as Record<string, unknown>
      const secondConnection = second.structuredContent as Record<string, unknown>
      expect(first.isError).not.toBe(true)
      expect(firstConnection.sessionId).toMatch(/^map-/)
      expect(secondConnection.sessionId).not.toBe(firstConnection.sessionId)
      expect(firstConnection.transport).toBe('mcp')
      const reopened = await client.callTool({
        name: 'openCesiumMap', arguments: { sessionId: firstConnection.sessionId },
      })
      expect((reopened.structuredContent as Record<string, unknown>).sessionId).toBe(firstConnection.sessionId)
    })
  })

  it('serves a self-contained map resource and its explicit network policy', async () => {
    await withClient(async client => {
      const { contents } = await client.readResource({ uri: cesiumAppUri })
      expect(contents[0]).toMatchObject({
        mimeType: 'text/html;profile=mcp-app',
        _meta: { ui: { csp: {
          connectDomains: cesiumMapOrigins,
          resourceDomains: [...cesiumMapOrigins, 'blob:'],
        } } },
      })
      expect('text' in contents[0] && contents[0].text).toContain('CESIUM_BASE_URL')
    })
  })

  it('requires a dedicated UI origin and permits loopback development origins', () => {
    expect(cesiumAppDomain()).toBeUndefined()
    expect(cesiumAppDomain('https://cesium-map.example/')).toBe('https://cesium-map.example')
    expect(cesiumAppDomain('http://127.0.0.1:19312')).toBe('http://127.0.0.1:19312')
    expect(() => cesiumAppDomain('http://maps.example')).toThrow('HTTPS')
    expect(() => cesiumAppDomain('https://user:secret@maps.example')).toThrow('origin')
    expect(() => cesiumAppDomain('https://maps.example/viewer')).toThrow('origin')
  })

  it('routes parameterless map handlers using each explicit browser session', async () => {
    await withClient(async client => {
      const results = await Promise.all([
        client.callTool({ name: 'getView', arguments: { sessionId: 'missing-map-a' } }),
        client.callTool({ name: 'listLayers', arguments: { sessionId: 'missing-map-b' } }),
      ])
      expect(results[0].isError).toBe(true)
      expect(results[1].isError).toBe(true)
      expect(JSON.stringify(results[0].content)).toContain('missing-map-a')
      expect(JSON.stringify(results[1].content)).toContain('missing-map-b')
    })
  })
})
