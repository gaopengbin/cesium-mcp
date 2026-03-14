import { describe, it, expect } from 'vitest'
import { detectGeometryType } from './layer.js'

describe('detectGeometryType', () => {
  it('should detect Point geometry', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{ geometry: { type: 'Point' } }],
    }
    expect(detectGeometryType(geojson)).toBe('点')
  })

  it('should detect MultiPoint geometry', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{ geometry: { type: 'MultiPoint' } }],
    }
    expect(detectGeometryType(geojson)).toBe('点')
  })

  it('should detect LineString geometry', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{ geometry: { type: 'LineString' } }],
    }
    expect(detectGeometryType(geojson)).toBe('线')
  })

  it('should detect Polygon geometry', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{ geometry: { type: 'Polygon' } }],
    }
    expect(detectGeometryType(geojson)).toBe('面')
  })

  it('should return 未知 for empty features', () => {
    expect(detectGeometryType({ features: [] })).toBe('未知')
  })

  it('should return 未知 for no features property', () => {
    expect(detectGeometryType({})).toBe('未知')
  })
})
