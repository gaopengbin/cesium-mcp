import { describe, expect, it } from 'vitest'
import { cesiumBrowserToolContracts } from 'cesium-mcp-contracts'

import { createMcpInputSchema } from './mcp-schema.js'

describe('MCP SDK v2 JSON Schema adapter', () => {
  it('retains canonical defaults while validating input', async () => {
    const schema = createMcpInputSchema({
      type: 'object',
      properties: {
        height: { type: 'number', default: 50000 },
        duration: { type: 'number', default: 2 },
      },
      additionalProperties: false,
    })

    expect(await schema['~standard'].validate({})).toEqual({
      value: {
        height: 50000,
        duration: 2,
      },
    })
  })

  it('supports JSON Schema 2020-12 composition and local references', async () => {
    const schema = createMcpInputSchema({
      type: 'object',
      $defs: {
        coordinate: {
          type: 'number',
          minimum: -180,
          maximum: 180,
        },
      },
      properties: {
        longitude: { $ref: '#/$defs/coordinate' },
        mode: {
          anyOf: [
            { const: 'point' },
            { const: 'extent' },
          ],
        },
      },
      required: ['longitude', 'mode'],
      allOf: [{
        if: {
          properties: { mode: { const: 'point' } },
        },
        then: {
          properties: {
            longitude: { $ref: '#/$defs/coordinate' },
          },
        },
      }],
      additionalProperties: false,
    })

    expect(await schema['~standard'].validate({
      longitude: 116.39,
      mode: 'point',
    })).toEqual({
      value: {
        longitude: 116.39,
        mode: 'point',
      },
    })
    expect(await schema['~standard'].validate({
      longitude: 200,
      mode: 'point',
    })).toHaveProperty('issues')
  })

  it('compiles every canonical Cesium tool schema', async () => {
    for (const contract of cesiumBrowserToolContracts) {
      const schema = createMcpInputSchema(contract.inputSchema)
      expect(await schema['~standard'].validate({})).toBeDefined()
    }
  })
})
