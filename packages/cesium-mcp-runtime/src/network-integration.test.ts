import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { get } from 'node:http'
import { createRuntimeHttpServer } from './index.js'
import { createNetworkPolicy } from './network-policy.js'

describe('HTTP and WebSocket access control', () => {
  const server = createRuntimeHttpServer(createNetworkPolicy({ CESIUM_AUTH_TOKEN: 'test-secret' }))
  let baseUrl: string
  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    baseUrl = `http://127.0.0.1:${address.port}`
  })
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it.each(['/api/command', '/api/relay', '/mcp', '/proxy?url=http://localhost'])('rejects untrusted Origin on %s before dispatch', async path => {
    const response = await fetch(baseUrl + path, {
      method: 'POST', headers: { Origin: 'https://untrusted.example', Authorization: 'Bearer test-secret' }, body: '{}',
    })
    expect(response.status).toBe(403)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
  })

  it('rejects unauthenticated clients and rebound hosts', async () => {
    expect((await fetch(baseUrl + '/api/status')).status).toBe(401)
    const status = await new Promise<number | undefined>((resolve, reject) => {
      get(baseUrl + '/api/status', { headers: { Host: 'rebound.example', Authorization: 'Bearer test-secret' } }, response => {
        response.resume()
        resolve(response.statusCode)
      }).on('error', reject)
    })
    expect(status).toBe(403)
  })

  it('allows an authenticated local command and authorized preflight', async () => {
    const response = await fetch(baseUrl + '/api/command', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: [] }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, sent: 0, total: 0 })
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    const preflight = await fetch(baseUrl + '/mcp', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization')
  })

  it('keeps the viewer public without embedding its connection secret', async () => {
    const html = await (await fetch(baseUrl + '/?session=test')).text()
    expect(html).toContain('Connection token')
    expect(html).not.toContain('test-secret')
    expect(html).toContain('location.host')
  })

  it('rejects an untrusted WebSocket and accepts an authenticated local one', async () => {
    const url = baseUrl.replace('http:', 'ws:') + '/?session=network-test'
    const rejection = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(url, { origin: 'https://untrusted.example' })
      ws.once('open', () => { ws.close(); reject(new Error('Untrusted WebSocket was accepted')) })
      ws.once('unexpected-response', (_req, res) => { res.resume(); ws.terminate(); resolve(res.statusCode!) })
      ws.on('error', () => {})
    })
    expect(rejection).toBe(403)
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, ['cesium-mcp', `cesium-token.${Buffer.from('test-secret').toString('base64url')}`], { origin: baseUrl })
      ws.once('open', () => { expect(ws.protocol).toBe('cesium-mcp'); ws.close() })
      ws.once('close', () => resolve())
      ws.once('error', reject)
    })
  })
})
