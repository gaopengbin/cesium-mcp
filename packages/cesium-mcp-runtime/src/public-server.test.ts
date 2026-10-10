import { once } from 'node:events'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { describe, expect, it } from 'vitest'
import { createPublicMapServer } from './public-server.js'

describe('public HTTP boundary', () => {
  it('serves a real MCP client without exposing local control routes or implicit maps', async () => {
    const server = createPublicMapServer().listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const client = new Client({ name: 'public-boundary-test', version: '1.0.0' })
    try {
      expect((await fetch(`${base}/health`)).status).toBe(200)
      expect((await fetch(`${base}/api/status`)).status).toBe(404)
      expect((await fetch(`${base}/api/command`, { method: 'POST' })).status).toBe(404)
      expect((await fetch(`${base}/mcp`, { headers: { Origin: 'https://untrusted.example' } })).status).toBe(403)
      const rejectedHost = await new Promise<number | undefined>((resolve, reject) => {
        const req = request(`${base}/mcp`, { headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode) })
        req.on('error', reject)
        req.end()
      })
      expect(rejectedHost).toBe(403)
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)))
      const opened = await client.callTool({ name: 'openCesiumMap', arguments: {} })
      const sessionId = (opened.structuredContent as { sessionId: string }).sessionId
      expect(sessionId).toMatch(/^map-[A-Za-z0-9_-]{43}$/)
      expect((await client.callTool({ name: 'getView', arguments: {} })).isError).toBe(true)
      const { tools } = await client.listTools()
      expect(tools.find(tool => tool.name === 'getView')?.inputSchema.required).toContain('sessionId')
    } finally {
      await client.close()
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
