import { describe, it, expect } from 'vitest'
import { computeFeatureCentroid, centroidOfCoords } from './entity.js'

describe('centroidOfCoords', () => {
  it('should compute centroid of a coordinate array', () => {
    const result = centroidOfCoords([[0, 0], [10, 0], [10, 10], [0, 10]])
    expect(result).toEqual([5, 5])
  })

  it('should return null for empty array', () => {
    expect(centroidOfCoords([])).toBeNull()
  })

  it('should return null for null input', () => {
    expect(centroidOfCoords(null as any)).toBeNull()
  })

  it('should return the point itself for single coordinate', () => {
    expect(centroidOfCoords([[116.4, 39.9]])).toEqual([116.4, 39.9])
  })
})

describe('computeFeatureCentroid', () => {
  it('should handle Point geometry', () => {
    const feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [116.4, 39.9] },
    }
    expect(computeFeatureCentroid(feature)).toEqual([116.4, 39.9])
  })

  it('should handle LineString geometry', () => {
    const feature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[0, 0], [10, 10]],
      },
    }
    expect(computeFeatureCentroid(feature)).toEqual([5, 5])
  })

  it('should handle Polygon geometry (centroid of outer ring)', () => {
    const feature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      },
    }
    const result = computeFeatureCentroid(feature)
    expect(result![0]).toBeCloseTo(4, 0) // centroid of closed ring
    expect(result![1]).toBeCloseTo(4, 0)
  })

  it('should handle MultiPoint geometry', () => {
    const feature = {
      type: 'Feature',
      geometry: {
        type: 'MultiPoint',
        coordinates: [[0, 0], [10, 10]],
      },
    }
    expect(computeFeatureCentroid(feature)).toEqual([5, 5])
  })

  it('should handle MultiPolygon geometry', () => {
    const feature = {
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]],
      },
    }
    const result = computeFeatureCentroid(feature)
    expect(result).toBeTruthy()
  })

  it('should return null for null feature', () => {
    expect(computeFeatureCentroid(null)).toBeNull()
  })

  it('should return null for feature without geometry', () => {
    expect(computeFeatureCentroid({ type: 'Feature' })).toBeNull()
  })

  it('should return null for unknown geometry type', () => {
    const feature = {
      type: 'Feature',
      geometry: { type: 'GeometryCollection', geometries: [] },
    }
    expect(computeFeatureCentroid(feature)).toBeNull()
  })
})
