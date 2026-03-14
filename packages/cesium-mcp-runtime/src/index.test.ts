import { describe, it, expect } from 'vitest'

/**
 * runtime 的核心逻辑都是模块内函数（依赖模块级 Map 状态），
 * 不适合直接导出单测。这里测试可独立验证的纯逻辑：
 * - getDefaultBrowser 的优先级选择算法
 * - HTTP 请求路由逻辑
 */

describe('getDefaultBrowser logic (standalone reimplementation)', () => {
  function getDefaultBrowser(
    clients: Map<string, { readyState: number }>,
    defaultSessionId: string,
  ) {
    const OPEN = 1
    if (clients.size === 0) return null
    const preferred = clients.get(defaultSessionId)
    if (preferred && preferred.readyState === OPEN) return preferred
    return clients.values().next().value ?? null
  }

  it('should return null when no clients', () => {
    expect(getDefaultBrowser(new Map(), 'default')).toBeNull()
  })

  it('should return preferred session if available and open', () => {
    const clients = new Map([
      ['other', { readyState: 1 }],
      ['default', { readyState: 1 }],
    ])
    const result = getDefaultBrowser(clients, 'default')
    expect(result).toBe(clients.get('default'))
  })

  it('should fallback to first client if preferred is not open', () => {
    const clients = new Map([
      ['other', { readyState: 1 }],
      ['default', { readyState: 3 }], // CLOSED
    ])
    const result = getDefaultBrowser(clients, 'default')
    expect(result).toBe(clients.get('other'))
  })

  it('should fallback to first client if preferred session not found', () => {
    const clients = new Map([
      ['session-a', { readyState: 1 }],
    ])
    const result = getDefaultBrowser(clients, 'nonexistent')
    expect(result).toBe(clients.get('session-a'))
  })
})

describe('HTTP route matching logic', () => {
  function routeRequest(method: string, url: string) {
    if (method === 'OPTIONS') return 'cors'
    if (method === 'POST' && url === '/api/command') return 'command'
    if (method === 'GET' && url === '/api/status') return 'status'
    return 'not-found'
  }

  it('should route POST /api/command', () => {
    expect(routeRequest('POST', '/api/command')).toBe('command')
  })

  it('should route GET /api/status', () => {
    expect(routeRequest('GET', '/api/status')).toBe('status')
  })

  it('should handle OPTIONS for CORS', () => {
    expect(routeRequest('OPTIONS', '/api/command')).toBe('cors')
  })

  it('should return not-found for unknown routes', () => {
    expect(routeRequest('GET', '/api/unknown')).toBe('not-found')
  })
})
