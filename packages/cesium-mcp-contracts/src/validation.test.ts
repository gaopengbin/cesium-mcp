import { describe, expect, it } from 'vitest'

import {
  validateCesiumToolInput,
  validateCesiumToolOutput,
} from './validation.js'

describe('validateCesiumToolInput', () => {
  it('accepts valid input for a known tool', () => {
    expect(validateCesiumToolInput('flyTo', {
      longitude: 116.4,
      latitude: 39.9,
    })).toEqual({
      knownTool: true,
      valid: true,
      issues: [],
    })
  })

  it('reports required, range, and additional-property violations', () => {
    const result = validateCesiumToolInput('flyTo', {
      longitude: 181,
      unexpected: true,
    })

    expect(result.knownTool).toBe(true)
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.latitude' }),
      expect.objectContaining({ path: '$.longitude' }),
      expect.objectContaining({ path: '$.unexpected' }),
    ]))
  })

  it('validates nested oneOf schemas', () => {
    const valid = validateCesiumToolInput('addGeoJsonLayer', {
      data: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [116.4, 39.9] },
        }],
      },
    })
    const invalid = validateCesiumToolInput('addGeoJsonLayer', {
      data: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: ['east', 'north'] },
        }],
      },
    })

    expect(valid.valid).toBe(true)
    expect(invalid.valid).toBe(false)
    expect(invalid.issues.some(issue => issue.path.includes('coordinates'))).toBe(true)
  })

  it('leaves runtime-only and custom tools to their owning adapter', () => {
    expect(validateCesiumToolInput('customTool', {})).toEqual({
      knownTool: false,
      valid: true,
      issues: [],
    })
  })
})

describe('validateCesiumToolOutput', () => {
  it('accepts a valid structured result for a known tool', () => {
    expect(validateCesiumToolOutput('getView', {
      success: true,
      data: {
        longitude: 116.4,
        latitude: 39.9,
        height: 1000,
        heading: 0,
        pitch: -45,
        roll: 0,
      },
    })).toEqual({
      knownTool: true,
      valid: true,
      issues: [],
    })
  })

  it('reports required and additional-property violations', () => {
    const result = validateCesiumToolOutput('screenshot', {
      success: true,
      data: {
        dataUrl: 'not-a-png-data-url',
        width: 800,
        unexpected: true,
      },
    })

    expect(result.knownTool).toBe(true)
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.data.dataUrl' }),
      expect.objectContaining({ path: '$.data.height' }),
      expect.objectContaining({ path: '$.data.unexpected' }),
    ]))
  })

  it('leaves runtime-only and custom tool output to their owning adapter', () => {
    expect(validateCesiumToolOutput('customTool', { anything: true })).toEqual({
      knownTool: false,
      valid: true,
      issues: [],
    })
  })
})
