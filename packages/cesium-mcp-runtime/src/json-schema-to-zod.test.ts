import { describe, expect, it } from 'vitest'
import { cesiumBrowserToolContracts } from 'cesium-mcp-contracts'
import {
  zodObjectFromJsonSchema,
  zodSchemaFromJsonSchema,
} from './json-schema-to-zod.js'

describe('JSON Schema to Zod adapter', () => {
  it('preserves required fields, defaults, constraints, and strict objects', () => {
    const schema = zodObjectFromJsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2 },
        count: { type: 'integer', minimum: 1, default: 3 },
      },
      required: ['name'],
      additionalProperties: false,
    })

    expect(schema.parse({ name: 'ok' })).toEqual({ name: 'ok', count: 3 })
    expect(schema.safeParse({ name: 'x' }).success).toBe(false)
    expect(schema.safeParse({ name: 'ok', extra: true }).success).toBe(false)
  })

  it('supports optional tuple items, unions, const values, and schema records', () => {
    const position = zodSchemaFromJsonSchema({
      type: 'array',
      prefixItems: [{ type: 'number' }, { type: 'number' }, { type: 'number' }],
      minItems: 2,
      maxItems: 3,
    })
    expect(position.parse([116.4, 39.9])).toEqual([116.4, 39.9])
    expect(position.parse([116.4, 39.9, 100])).toEqual([116.4, 39.9, 100])
    expect(position.safeParse([116.4]).success).toBe(false)

    const value = zodSchemaFromJsonSchema({
      oneOf: [
        { const: 'auto' },
        { type: ['number', 'null'] },
      ],
    })
    expect(value.parse('auto')).toBe('auto')
    expect(value.parse(2)).toBe(2)
    expect(value.parse(null)).toBeNull()

    const record = zodSchemaFromJsonSchema({
      type: 'object',
      additionalProperties: { type: 'string' },
    })
    expect(record.parse({ low: '#00f', high: '#f00' })).toEqual({ low: '#00f', high: '#f00' })
  })

  it('uses canonical defaults and relaxed optional Cesium graphics fields', () => {
    const byName = new Map(cesiumBrowserToolContracts.map(contract => [contract.name, contract]))

    expect(zodObjectFromJsonSchema(byName.get('flyTo')!.inputSchema).parse({
      longitude: 116.39,
      latitude: 39.9,
    })).toMatchObject({ height: 50000, heading: 0, pitch: -45, duration: 2 })

    expect(zodObjectFromJsonSchema(byName.get('addBillboard')!.inputSchema).safeParse({
      longitude: 116.39,
      latitude: 39.9,
      image: 'https://example.com/marker.png',
    }).success).toBe(true)

    expect(zodObjectFromJsonSchema(byName.get('addHeatmap')!.inputSchema).parse({
      data: {},
    })).toMatchObject({
      radius: 30,
      blur: 0.85,
      maxOpacity: 0.8,
      minOpacity: 0,
      resolution: 512,
    })
  })

  it('validates JSON Schema date-time strings', () => {
    const schema = zodSchemaFromJsonSchema({ type: 'string', format: 'date-time' })
    expect(schema.safeParse('2026-07-17T12:00:00Z').success).toBe(true)
    expect(schema.safeParse('tomorrow').success).toBe(false)
  })

  it('converts every canonical Cesium input schema', () => {
    for (const contract of cesiumBrowserToolContracts) {
      const schema = zodObjectFromJsonSchema(contract.inputSchema)
      expect(Object.keys(schema.shape).sort()).toEqual(
        Object.keys(contract.inputSchema.properties as Record<string, unknown>).sort(),
      )
    }
  })
})
