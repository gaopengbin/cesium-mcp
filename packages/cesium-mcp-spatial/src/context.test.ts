import { describe, expect, it } from 'vitest'
import { createSpatialContext } from './context.js'
import type { SpatialObject } from './types.js'

const observedAt = '2026-08-27T00:00:00.000Z'

function fixtureObjects(): SpatialObject[] {
  return [
    {
      objectId: 'school_1',
      sourceType: 'geojson',
      type: 'school',
      name: 'Riverside School',
      geometry: { type: 'Point', coordinates: [116.4, 39.9] },
      properties: { students: 800 },
      geometryQuality: 'exact',
      observedAt,
      revision: 1,
      provenance: { source: 'fixture', method: 'geojson' },
    },
    {
      objectId: 'hospital_1',
      sourceType: 'entity',
      type: 'hospital',
      name: 'City Hospital',
      geometry: { type: 'Point', coordinates: [116.42, 39.91] },
      properties: { beds: 200 },
      geometryQuality: 'exact',
      observedAt,
      revision: 1,
      provenance: { source: 'fixture', method: 'entity' },
    },
    {
      objectId: 'flood_zone_1',
      sourceType: 'geojson',
      type: 'risk-zone',
      name: 'Flood Zone',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [116.39, 39.89],
          [116.41, 39.89],
          [116.41, 39.91],
          [116.39, 39.91],
          [116.39, 39.89],
        ]],
      },
      properties: { risk: 'high' },
      geometryQuality: 'exact',
      observedAt,
      revision: 2,
      provenance: { source: 'fixture', method: 'geojson' },
    },
  ]
}

describe('Spatial context', () => {
  it('describes and filters normalized scene objects', () => {
    const context = createSpatialContext(fixtureObjects())

    expect(context.describe()).toMatchObject({
      objectCount: 3,
      countsBySource: { geojson: 2, entity: 1 },
      countsByType: { school: 1, hospital: 1, 'risk-zone': 1 },
    })
    expect(context.query({ name: 'school' }).map(object => object.objectId))
      .toEqual(['school_1'])
    expect(context.query({
      propertyEquals: { risk: 'high' },
    }).map(object => object.objectId)).toEqual(['flood_zone_1'])
  })

  it('answers distance, near, and point-in-polygon relations with evidence', () => {
    const context = createSpatialContext(
      fixtureObjects(),
      () => new Date('2026-08-27T01:00:00.000Z'),
    )

    const within = context.relate('school_1', 'flood_zone_1', 'within')
    const distance = context.relate('school_1', 'hospital_1', 'distance')
    const near = context.relate('school_1', 'hospital_1', 'near', {
      nearThresholdMeters: 2500,
    })

    expect(within).toMatchObject({
      value: true,
      quality: 'exact',
      basis: 'point-in-polygon',
    })
    expect(distance.value).toBeGreaterThan(2000)
    expect(distance.value).toBeLessThan(2500)
    expect(distance).toMatchObject({ quality: 'exact', basis: 'geodesic-point', unit: 'meters' })
    expect(near.value).toBe(true)
  })

  it('marks bounding-box relations as approximate', () => {
    const objects = fixtureObjects()
    objects.push({
      objectId: 'road_1',
      sourceType: 'geojson',
      type: 'road',
      name: 'Evacuation Road',
      geometry: {
        type: 'LineString',
        coordinates: [[116.38, 39.9], [116.42, 39.9]],
      },
      properties: {},
      geometryQuality: 'exact',
      observedAt,
      revision: 1,
      provenance: { source: 'fixture', method: 'geojson' },
    })
    const context = createSpatialContext(objects)

    expect(context.relate('road_1', 'flood_zone_1', 'intersects')).toMatchObject({
      value: true,
      quality: 'approximate',
      basis: 'bounding-box',
    })
  })
})
