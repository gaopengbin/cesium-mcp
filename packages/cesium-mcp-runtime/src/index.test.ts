import { describe, it, expect } from 'vitest'
import { z } from 'zod'

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

describe('sendToBrowser sessionId routing (standalone reimplementation)', () => {
  const OPEN = 1
  const CLOSED = 3

  /** Reimplements the sessionId extraction + routing logic from sendToBrowser */
  function resolveTarget(
    params: Record<string, unknown>,
    clients: Map<string, { readyState: number }>,
    defaultSessionId: string,
  ): { ws: { readyState: number } | null; cleanParams: Record<string, unknown> } {
    const { sessionId, ...cleanParams } = params as { sessionId?: string; [k: string]: unknown }

    function getDefaultBrowser() {
      if (clients.size === 0) return null
      const preferred = clients.get(defaultSessionId)
      if (preferred && preferred.readyState === OPEN) return preferred
      return clients.values().next().value ?? null
    }

    const ws = sessionId
      ? (clients.get(sessionId) ?? getDefaultBrowser())
      : getDefaultBrowser()

    return { ws, cleanParams }
  }

  it('should strip sessionId from params', () => {
    const clients = new Map([['default', { readyState: OPEN }]])
    const { cleanParams } = resolveTarget({ longitude: 116, latitude: 39, sessionId: 'abc' }, clients, 'default')
    expect(cleanParams).toEqual({ longitude: 116, latitude: 39 })
    expect(cleanParams).not.toHaveProperty('sessionId')
  })

  it('should route to specified sessionId when provided', () => {
    const clients = new Map([
      ['default', { readyState: OPEN }],
      ['session-b', { readyState: OPEN }],
    ])
    const { ws } = resolveTarget({ sessionId: 'session-b' }, clients, 'default')
    expect(ws).toBe(clients.get('session-b'))
  })

  it('should fallback to default when specified sessionId not found', () => {
    const clients = new Map([['default', { readyState: OPEN }]])
    const { ws } = resolveTarget({ sessionId: 'nonexistent' }, clients, 'default')
    expect(ws).toBe(clients.get('default'))
  })

  it('should use default browser when sessionId not provided', () => {
    const clients = new Map([
      ['default', { readyState: OPEN }],
      ['session-b', { readyState: OPEN }],
    ])
    const { ws } = resolveTarget({ longitude: 116 }, clients, 'default')
    expect(ws).toBe(clients.get('default'))
  })

  it('should return null when no clients and sessionId provided', () => {
    const { ws } = resolveTarget({ sessionId: 'abc' }, new Map(), 'default')
    expect(ws).toBeNull()
  })

  it('should pass through params without sessionId field unchanged', () => {
    const clients = new Map([['default', { readyState: OPEN }]])
    const original = { longitude: 116, latitude: 39, height: 5000 }
    const { cleanParams } = resolveTarget(original, clients, 'default')
    expect(cleanParams).toEqual({ longitude: 116, latitude: 39, height: 5000 })
  })

  it('should route to sessionId even when that session is closed (fallback to default)', () => {
    const clients = new Map([
      ['default', { readyState: OPEN }],
      ['session-b', { readyState: CLOSED }],
    ])
    // session-b exists but is found in map → returns it (caller checks readyState)
    const { ws } = resolveTarget({ sessionId: 'session-b' }, clients, 'default')
    expect(ws).toBe(clients.get('session-b'))
  })
})

describe('updateLayerStyle schema constraints (standalone reimplementation)', () => {
  const choroplethStyleSchema = z.object({
    field: z.string().min(1),
    breaks: z.array(z.number()).min(2),
    colors: z.array(z.string()).min(1),
  }).superRefine((value, ctx) => {
    if (value.colors.length !== value.breaks.length - 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['colors'],
        message: 'colors length must equal breaks length minus one',
      })
    }
    for (let i = 1; i < value.breaks.length; i++) {
      if (value.breaks[i]! <= value.breaks[i - 1]!) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['breaks', i],
          message: 'breaks must be strictly ascending',
        })
      }
    }
  })

  const layerStyleSchema = z.object({
    color: z.string().optional(),
    opacity: z.number().min(0).max(1).optional(),
    strokeWidth: z.number().min(0).optional(),
    pointSize: z.number().min(0).optional(),
    randomColor: z.boolean().optional(),
    gradient: z.tuple([z.string(), z.string()]).optional(),
    choropleth: choroplethStyleSchema.optional(),
    category: z.object({
      field: z.string().min(1),
      colors: z.array(z.string()).min(1).optional(),
    }).optional(),
  }).superRefine((value, ctx) => {
    const enabled = [
      value.choropleth !== undefined,
      value.category !== undefined,
      value.randomColor === true,
      value.gradient !== undefined,
    ].filter(Boolean).length
    if (enabled > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only one thematic style is allowed',
      })
    }
  })

  const imageryStyleSchema = z.object({
    alpha: z.number().min(0).max(1).optional(),
    brightness: z.number().optional(),
    contrast: z.number().optional(),
    hue: z.number().optional(),
    saturation: z.number().optional(),
    gamma: z.number().optional(),
  }).refine(value => Object.values(value).some(v => v !== undefined))

  const primitiveStyleSchema = z.object({
    color: z.string().optional(),
    opacity: z.number().min(0).max(1).optional(),
    outlineColor: z.string().optional(),
    outlineWidth: z.number().min(0).max(255).optional(),
    pointSize: z.number().min(0).max(255).optional(),
    lineWidth: z.number().min(0).max(255).optional(),
  }).refine(value => Object.values(value).some(v => v !== undefined))

  it('should accept one GeoJSON thematic style', () => {
    expect(layerStyleSchema.safeParse({
      category: { field: 'kind', colors: ['#FF0000'] },
    }).success).toBe(true)
  })

  it('should reject multiple GeoJSON thematic styles', () => {
    expect(layerStyleSchema.safeParse({
      randomColor: true,
      gradient: ['#000000', '#FFFFFF'],
    }).success).toBe(false)
  })

  it('should validate choropleth breaks and color count', () => {
    expect(layerStyleSchema.safeParse({
      choropleth: { field: 'value', breaks: [0, 10, 20], colors: ['#00FF00', '#FF0000'] },
    }).success).toBe(true)
    expect(layerStyleSchema.safeParse({
      choropleth: { field: 'value', breaks: [0, 20, 10], colors: ['#00FF00', '#FF0000'] },
    }).success).toBe(false)
    expect(layerStyleSchema.safeParse({
      choropleth: { field: 'value', breaks: [0, 10, 20], colors: ['#00FF00'] },
    }).success).toBe(false)
  })

  it('should reject empty imagery and primitive style objects', () => {
    expect(imageryStyleSchema.safeParse({}).success).toBe(false)
    expect(primitiveStyleSchema.safeParse({}).success).toBe(false)
  })
})
