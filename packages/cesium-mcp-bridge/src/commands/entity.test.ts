import { describe, it, expect, vi } from 'vitest'

vi.mock('cesium', () => ({
  Math: {
    toDegrees: (r: number) => r * (180 / Math.PI),
    toRadians: (d: number) => d * (Math.PI / 180),
  },
  JulianDate: { now: () => ({}) },
  Cartographic: {
    fromCartesian: (c: any) => ({
      longitude: c._lon * (Math.PI / 180),
      latitude: c._lat * (Math.PI / 180),
      height: c._h ?? 0,
    }),
  },
  Cartesian3: {
    fromDegrees: (lon: number, lat: number, h?: number) => ({ _lon: lon, _lat: lat, _h: h ?? 0 }),
  },
  Color: { fromCssColorString: () => ({}) },
  HorizontalOrigin: { CENTER: 0 },
  VerticalOrigin: { BOTTOM: 1 },
  HeightReference: { CLAMP_TO_GROUND: 1, NONE: 0 },
  LabelStyle: { FILL_AND_OUTLINE: 2 },
  NearFarScalar: class { constructor(..._: any[]) {} },
  DistanceDisplayCondition: class { constructor(..._: any[]) {} },
  ClampToGroundPolyline: class {},
  PolylineDashMaterialProperty: class { constructor() {} },
  ColorMaterialProperty: class { constructor() {} },
  default: {},
}))

import { computeFeatureCentroid, centroidOfCoords, batchAddEntities, queryEntities, getEntityProperties } from './entity.js'

// ==================== batchAddEntities ====================

describe('batchAddEntities', () => {
  function makeViewer() {
    return {} as any // viewer is not used directly by batchAddEntities
  }

  function makeHelpers() {
    let counter = 0
    const calls: { fn: string; params: any }[] = []
    const make = (name: string) => (params: any) => {
      calls.push({ fn: name, params })
      return { id: `entity-${counter++}` }
    }
    return {
      helpers: {
        addMarker: make('addMarker'),
        addPolyline: make('addPolyline'),
        addPolygon: make('addPolygon'),
        addModel: make('addModel'),
        addBillboard: make('addBillboard'),
        addBox: make('addBox'),
        addCylinder: make('addCylinder'),
        addEllipse: make('addEllipse'),
        addRectangle: make('addRectangle'),
        addWall: make('addWall'),
        addCorridor: make('addCorridor'),
      } as any,
      calls,
    }
  }

  it('should dispatch each entity to the correct helper', () => {
    const { helpers, calls } = makeHelpers()
    const result = batchAddEntities(makeViewer(), [
      { type: 'marker', longitude: 116.4, latitude: 39.9 },
      { type: 'polyline', coordinates: [[0, 0], [1, 1]] },
      { type: 'polygon', coordinates: [[0, 0], [1, 0], [1, 1]] },
    ] as any, helpers)

    expect(result.entityIds).toHaveLength(3)
    expect(result.errors).toHaveLength(0)
    expect(calls[0].fn).toBe('addMarker')
    expect(calls[1].fn).toBe('addPolyline')
    expect(calls[2].fn).toBe('addPolygon')
  })

  it('should collect errors without stopping', () => {
    const { helpers } = makeHelpers()
    helpers.addMarker = () => { throw new Error('fail marker') }
    const result = batchAddEntities(makeViewer(), [
      { type: 'marker', longitude: 0, latitude: 0 },
      { type: 'polyline', coordinates: [] },
    ] as any, helpers)

    expect(result.entityIds).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('fail marker')
  })

  it('should report error for unknown entity type', () => {
    const { helpers } = makeHelpers()
    const result = batchAddEntities(makeViewer(), [
      { type: 'unknown_type' as any },
    ], helpers)

    expect(result.entityIds).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Unknown type')
  })

  it('should handle empty entities array', () => {
    const { helpers } = makeHelpers()
    const result = batchAddEntities(makeViewer(), [], helpers)
    expect(result.entityIds).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })

  it('should dispatch all supported entity types', () => {
    const { helpers, calls } = makeHelpers()
    const types = ['marker', 'polyline', 'polygon', 'model', 'billboard', 'box', 'cylinder', 'ellipse', 'rectangle', 'wall', 'corridor']
    const entities = types.map(type => ({ type })) as any
    const result = batchAddEntities(makeViewer(), entities, helpers)

    expect(result.entityIds).toHaveLength(types.length)
    expect(result.errors).toHaveLength(0)
    const dispatchedFns = calls.map(c => c.fn)
    expect(dispatchedFns).toEqual([
      'addMarker', 'addPolyline', 'addPolygon', 'addModel', 'addBillboard',
      'addBox', 'addCylinder', 'addEllipse', 'addRectangle', 'addWall', 'addCorridor',
    ])
  })

  it('should strip type from params passed to helper', () => {
    const { helpers, calls } = makeHelpers()
    batchAddEntities(makeViewer(), [
      { type: 'marker', longitude: 100, latitude: 30, label: 'test' },
    ] as any, helpers)

    expect(calls[0].params).toEqual({ longitude: 100, latitude: 30, label: 'test' })
    expect(calls[0].params).not.toHaveProperty('type')
  })
})

// ==================== queryEntities ====================

describe('queryEntities', () => {
  function makeEntity(overrides: {
    id: string
    name?: string
    type: string
    lon?: number
    lat?: number
    height?: number
  }) {
    const entity: any = {
      id: overrides.id,
      name: overrides.name,
    }
    // Set the type flag
    const typeMap: Record<string, string> = {
      marker: 'point', billboard: 'billboard', polyline: 'polyline',
      polygon: 'polygon', model: 'model', box: 'box', cylinder: 'cylinder',
      ellipse: 'ellipse', rectangle: 'rectangle', wall: 'wall', corridor: 'corridor', label: 'label',
    }
    const cesiumProp = typeMap[overrides.type]
    if (cesiumProp) entity[cesiumProp] = {}

    // Position
    if (overrides.lon != null) {
      entity.position = {
        getValue: () => ({
          _lon: overrides.lon,
          _lat: overrides.lat,
          _h: overrides.height ?? 0,
        }),
      }
    }
    return entity
  }

  function makeViewer(entities: any[]) {
    return { entities: { values: entities } } as any
  }

  it('should filter by entity type', () => {
    const viewer = makeViewer([
      makeEntity({ id: '1', type: 'marker' }),
      makeEntity({ id: '2', type: 'polyline' }),
      makeEntity({ id: '3', type: 'marker' }),
    ])
    const results = queryEntities(viewer, { type: 'marker' })
    expect(results).toHaveLength(2)
    expect(results.every(r => r.type === 'marker')).toBe(true)
  })

  it('should filter by name (fuzzy, case-insensitive)', () => {
    const viewer = makeViewer([
      makeEntity({ id: '1', type: 'marker', name: 'Beijing Station' }),
      makeEntity({ id: '2', type: 'marker', name: 'Shanghai Tower' }),
      makeEntity({ id: '3', type: 'polyline', name: 'beijing road' }),
    ])
    const results = queryEntities(viewer, { name: 'beijing' })
    expect(results).toHaveLength(2)
    expect(results.map(r => r.entityId).sort()).toEqual(['1', '3'])
  })

  it('should return all entities when no filters given', () => {
    const viewer = makeViewer([
      makeEntity({ id: '1', type: 'marker' }),
      makeEntity({ id: '2', type: 'polygon' }),
    ])
    const results = queryEntities(viewer, {})
    expect(results).toHaveLength(2)
  })

  it('should filter by bounding box', () => {
    const viewer = makeViewer([
      makeEntity({ id: 'inside', type: 'marker', lon: 116.4, lat: 39.9 }),
      makeEntity({ id: 'outside', type: 'marker', lon: 121.0, lat: 31.0 }),
    ])
    // bbox: [west, south, east, north] around Beijing
    const results = queryEntities(viewer, { bbox: [115, 39, 117, 41] })
    expect(results).toHaveLength(1)
    expect(results[0].entityId).toBe('inside')
  })

  it('should exclude entities without position when bbox filter is set', () => {
    const viewer = makeViewer([
      makeEntity({ id: 'nopos', type: 'marker' }), // no position
      makeEntity({ id: 'haspos', type: 'marker', lon: 116.4, lat: 39.9 }),
    ])
    const results = queryEntities(viewer, { bbox: [115, 39, 117, 41] })
    expect(results).toHaveLength(1)
    expect(results[0].entityId).toBe('haspos')
  })

  it('should return empty array for empty scene', () => {
    const results = queryEntities(makeViewer([]), {})
    expect(results).toHaveLength(0)
  })

  it('should include position in results when available', () => {
    const viewer = makeViewer([
      makeEntity({ id: '1', type: 'marker', lon: 116.4, lat: 39.9, height: 100 }),
    ])
    const results = queryEntities(viewer, {})
    expect(results[0].position).toBeDefined()
    expect(results[0].position!.longitude).toBeCloseTo(116.4, 1)
    expect(results[0].position!.latitude).toBeCloseTo(39.9, 1)
  })
})

// ==================== Pure helpers ====================

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

// ==================== getEntityProperties ====================

describe('getEntityProperties', () => {
  function makeViewer(entities: any[]) {
    return {
      entities: {
        values: entities,
        getById: (id: string) => entities.find(e => e.id === id) ?? undefined,
      },
    } as any
  }

  function makeEntity(overrides: {
    id: string
    name?: string
    type: string
    lon?: number
    lat?: number
    height?: number
    customProps?: Record<string, unknown>
    graphicOverrides?: Record<string, any>
  }) {
    const entity: any = {
      id: overrides.id,
      name: overrides.name,
    }
    const typeMap: Record<string, string> = {
      marker: 'point', billboard: 'billboard', polyline: 'polyline',
      polygon: 'polygon', model: 'model', box: 'box', cylinder: 'cylinder',
      ellipse: 'ellipse', rectangle: 'rectangle', wall: 'wall', corridor: 'corridor', label: 'label',
    }
    const cesiumProp = typeMap[overrides.type]
    if (cesiumProp) {
      entity[cesiumProp] = overrides.graphicOverrides ?? {}
    }

    if (overrides.lon != null) {
      entity.position = {
        getValue: () => ({
          _lon: overrides.lon,
          _lat: overrides.lat,
          _h: overrides.height ?? 0,
        }),
      }
    }

    if (overrides.customProps) {
      entity.properties = {
        propertyNames: Object.keys(overrides.customProps),
      }
      for (const [k, v] of Object.entries(overrides.customProps)) {
        entity.properties[k] = { getValue: () => v }
      }
    }

    return entity
  }

  it('should throw for non-existent entity', () => {
    const viewer = makeViewer([])
    expect(() => getEntityProperties(viewer, { entityId: 'nope' })).toThrow('Entity not found: nope')
  })

  it('should return type and position for a marker', () => {
    const e = makeEntity({ id: 'm1', name: 'Test Marker', type: 'marker', lon: 116.4, lat: 39.9, height: 100 })
    const viewer = makeViewer([e])
    const result = getEntityProperties(viewer, { entityId: 'm1' })
    expect(result.entityId).toBe('m1')
    expect(result.name).toBe('Test Marker')
    expect(result.type).toBe('marker')
    expect(result.position).toBeDefined()
    expect(result.position!.longitude).toBeCloseTo(116.4, 1)
    expect(result.position!.latitude).toBeCloseTo(39.9, 1)
    expect(result.position!.height).toBeCloseTo(100, 0)
  })

  it('should return custom properties', () => {
    const e = makeEntity({ id: 'p1', type: 'polygon', customProps: { population: 1000000, city: 'Beijing' } })
    const viewer = makeViewer([e])
    const result = getEntityProperties(viewer, { entityId: 'p1' })
    expect(result.properties.population).toBe(1000000)
    expect(result.properties.city).toBe('Beijing')
  })

  it('should return empty properties when entity has none', () => {
    const e = makeEntity({ id: 'e1', type: 'polyline' })
    const viewer = makeViewer([e])
    const result = getEntityProperties(viewer, { entityId: 'e1' })
    expect(result.properties).toEqual({})
  })

  it('should detect polygon type', () => {
    const e = makeEntity({ id: 'pg1', type: 'polygon' })
    const viewer = makeViewer([e])
    const result = getEntityProperties(viewer, { entityId: 'pg1' })
    expect(result.type).toBe('polygon')
  })

  it('should detect model type', () => {
    const e = makeEntity({ id: 'md1', type: 'model' })
    const viewer = makeViewer([e])
    const result = getEntityProperties(viewer, { entityId: 'md1' })
    expect(result.type).toBe('model')
  })

  it('should handle entity without position', () => {
    const e = makeEntity({ id: 'np1', type: 'billboard' })
    const viewer = makeViewer([e])
    const result = getEntityProperties(viewer, { entityId: 'np1' })
    expect(result.position).toBeUndefined()
  })
})
