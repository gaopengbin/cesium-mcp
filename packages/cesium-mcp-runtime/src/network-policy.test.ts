import { describe, expect, it } from 'vitest'
import { createNetworkPolicy, checkNetworkRequest } from './network-policy.js'

describe('runtime network policy', () => {
  const local = createNetworkPolicy({})
  const request = (headers: Record<string, string>, method = 'POST', url = '/mcp') => ({ headers, method, url })

  it('binds to loopback and accepts local clients with or without Origin', () => {
    expect(local.host).toBe('127.0.0.1')
    expect(checkNetworkRequest(request({ host: 'localhost:9100' }), local)).toBeNull()
    expect(checkNetworkRequest(request({ host: '127.0.0.1:9100', origin: 'http://localhost:5173' }), local)).toBeNull()
  })

  it.each(['evil.example', 'localhost.evil.example', 'localhost:9100@evil.example', ''])('rejects invalid Host %s', host => {
    expect(checkNetworkRequest(request({ host }), local)?.status).toBe(403)
  })

  it.each(['https://evil.example', 'null', 'file:///', 'http://localhost:5173/path'])('rejects invalid Origin %s before dispatch', origin => {
    expect(checkNetworkRequest(request({ host: 'localhost:9100', origin }), local)?.status).toBe(403)
  })

  it('requires a token for non-loopback binding', () => {
    expect(() => createNetworkPolicy({ CESIUM_HOST: '0.0.0.0' })).toThrow('CESIUM_AUTH_TOKEN')
    expect(() => createNetworkPolicy({ CESIUM_ALLOWED_HOSTS: '*' })).toThrow()
    expect(() => createNetworkPolicy({ CESIUM_ALLOWED_ORIGINS: '*' })).toThrow()
  })

  it('rejects malformed request URLs without throwing', () => {
    expect(checkNetworkRequest(request({ host: 'localhost:9100' }, 'GET', '//['), local)?.status).toBe(400)
  })

  const remote = createNetworkPolicy({
    CESIUM_HOST: '0.0.0.0',
    CESIUM_AUTH_TOKEN: 'test-token',
    CESIUM_ALLOWED_HOSTS: 'maps.example',
    CESIUM_ALLOWED_ORIGINS: 'https://maps.example',
  })

  it('requires credentials for HTTP APIs and rejects query-string tokens', () => {
    expect(checkNetworkRequest(request({ host: 'maps.example' }), remote)?.status).toBe(401)
    expect(checkNetworkRequest(request({ host: 'maps.example' }, 'GET', '/api/status?token=test-token'), remote)?.status).toBe(401)
    expect(checkNetworkRequest(request({ host: 'maps.example', authorization: 'Bearer test-token' }), remote)).toBeNull()
    expect(checkNetworkRequest(request({ host: 'maps.example', authorization: 'Bearer wrong-token' }), remote)?.status).toBe(401)
  })

  it('allows preflight and public viewer assets, without exempting WebSocket upgrades', () => {
    expect(checkNetworkRequest(request({ host: 'maps.example', origin: 'https://maps.example' }, 'OPTIONS'), remote)).toBeNull()
    expect(checkNetworkRequest(request({ host: 'maps.example' }, 'GET', '/'), remote)).toBeNull()
    expect(checkNetworkRequest(request({ host: 'maps.example' }, 'GET', '/bridge.js'), remote)).toBeNull()
    expect(checkNetworkRequest(request({ host: 'maps.example' }, 'GET', '/'), remote, true)?.status).toBe(401)
    expect(checkNetworkRequest(request({ host: 'maps.example', origin: 'https://evil.example', authorization: 'Bearer test-token' }), remote)?.status).toBe(403)
  })

  it('accepts WebSocket credentials via subprotocol only on upgrades', () => {
    const headers = { host: 'maps.example', origin: 'https://maps.example', 'sec-websocket-protocol': `cesium-mcp, cesium-token.${Buffer.from('test-token').toString('base64url')}` }
    expect(checkNetworkRequest(request(headers, 'GET', '/?session=demo'), remote, true)).toBeNull()
    expect(checkNetworkRequest(request(headers), remote)?.status).toBe(401)
  })
})
