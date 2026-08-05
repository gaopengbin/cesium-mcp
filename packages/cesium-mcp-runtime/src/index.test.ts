import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { isViewerRequest } from './index.js'

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

  it('should serve the viewer when session query parameters are present', () => {
    expect(isViewerRequest('GET', '/?session=e2e-next')).toBe(true)
    expect(isViewerRequest('GET', '/index.html?session=demo')).toBe(true)
    expect(isViewerRequest('GET', '/api/status?session=demo')).toBe(false)
    expect(isViewerRequest('POST', '/?session=demo')).toBe(false)
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
