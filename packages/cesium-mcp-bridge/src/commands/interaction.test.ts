import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Cesium mock ---
const mockEntitiesAdd = vi.fn()
const mockRemoveById = vi.fn()
let mockGeodesicDist = 1068000 // ~1068 km (Beijing → Shanghai approx)
const mockSetEndPoints = vi.fn()

vi.mock('cesium', () => {
  const Color = {
    YELLOW: { withAlpha: (a: number) => ({ _color: 'yellow', _alpha: a }) },
    BLACK: {},
    fromCssColorString: (s: string) => ({ _css: s, withAlpha: (a: number) => ({ _css: s, _alpha: a }) }),
  }

  return {
    Cartographic: {
      fromDegrees: (lon: number, lat: number, alt?: number) => ({
        longitude: lon * (Math.PI / 180),
        latitude: lat * (Math.PI / 180),
        height: alt ?? 0,
      }),
      fromCartesian: (_c: any) => ({
        longitude: 116.4 * (Math.PI / 180),
        latitude: 39.9 * (Math.PI / 180),
        height: 0,
      }),
    },
    Cartesian3: {
      fromDegrees: (lon: number, lat: number, alt?: number) => ({ _lon: lon, _lat: lat, _h: alt ?? 0 }),
      fromRadians: (lon: number, lat: number, alt?: number) => ({
        _lonRad: lon, _latRad: lat, _h: alt ?? 0,
      }),
    },
    Cartesian2: class {
      constructor(public x: number, public y: number) {}
    },
    EllipsoidGeodesic: class {
      _dist = mockGeodesicDist
      setEndPoints = mockSetEndPoints
      get surfaceDistance() { return this._dist }
    },
    PolylineDashMaterialProperty: class {
      constructor(public opts: any) {}
    },
    PolygonHierarchy: class {
      constructor(public positions: any) {}
    },
    PolygonGeometry: class {
      constructor(public opts: any) {}
      static createGeometry() { return { indices: [] } }
    },
    BoundingSphere: {
      fromPoints: () => ({ center: { _lon: 116.4, _lat: 39.9, _h: 0 } }),
    },
    LabelStyle: { FILL_AND_OUTLINE: 2 },
    Color,
    ColorMaterialProperty: class {
      constructor(public color: any) {}
    },
    ConstantProperty: class {
      constructor(public value: any) {}
    },
    default: {},
  }
})

import { measure, highlight } from './interaction.js'

function makeViewer() {
  const entities: any[] = []
  mockEntitiesAdd.mockReset()
  mockRemoveById.mockReset()
  mockSetEndPoints.mockReset()
  mockEntitiesAdd.mockImplementation((e: any) => entities.push(e))

  return {
    entities: {
      add: mockEntitiesAdd,
      removeById: mockRemoveById,
      values: entities,
    },
  } as any
}

describe('measure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGeodesicDist = 1068000 // reset to default
  })

  // --- Validation ---
  it('should throw if fewer than 2 positions', () => {
    const viewer = makeViewer()
    expect(() => measure(viewer, { mode: 'distance', positions: [[116, 39]] }))
      .toThrow('At least 2 positions required')
  })

  it('should throw if area mode with fewer than 3 positions', () => {
    const viewer = makeViewer()
    expect(() => measure(viewer, { mode: 'area', positions: [[116, 39], [117, 40]] }))
      .toThrow('At least 3 positions required for area measurement')
  })

  // --- Distance mode ---
  it('should compute distance and return km unit for long distances', () => {
    const viewer = makeViewer()
    const result = measure(viewer, {
      mode: 'distance',
      positions: [[116.4, 39.9], [121.4, 31.2]],
    })
    expect(result.mode).toBe('distance')
    expect(result.unit).toBe('km')
    expect(result.value).toBe(+(mockGeodesicDist / 1000).toFixed(3))
    expect(result.segments).toHaveLength(1)
    expect(result.segments![0]).toBe(+mockGeodesicDist.toFixed(1))
  })

  it('should compute multi-segment distance', () => {
    const viewer = makeViewer()
    const result = measure(viewer, {
      mode: 'distance',
      positions: [[116, 39], [117, 40], [118, 41]],
    })
    expect(result.mode).toBe('distance')
    expect(result.segments).toHaveLength(2)
    // Each segment returns mockGeodesicDist, total = 2 * mockGeodesicDist
    const totalMeters = mockGeodesicDist * 2
    expect(result.value).toBe(+(totalMeters / 1000).toFixed(3))
    expect(result.unit).toBe('km')
  })

  it('should add polyline + label entities on map by default for distance', () => {
    const viewer = makeViewer()
    measure(viewer, {
      mode: 'distance',
      positions: [[116, 39], [117, 40]],
    })
    expect(mockEntitiesAdd).toHaveBeenCalledTimes(2) // polyline + label
    const polylineEntity = mockEntitiesAdd.mock.calls[0][0]
    expect(polylineEntity.polyline).toBeDefined()
    const labelEntity = mockEntitiesAdd.mock.calls[1][0]
    expect(labelEntity.label).toBeDefined()
  })

  it('should NOT add entities when showOnMap=false for distance', () => {
    const viewer = makeViewer()
    const result = measure(viewer, {
      mode: 'distance',
      positions: [[116, 39], [117, 40]],
      showOnMap: false,
    })
    expect(mockEntitiesAdd).not.toHaveBeenCalled()
    expect(result.mode).toBe('distance')
  })

  it('should use custom id for distance', () => {
    const viewer = makeViewer()
    const result = measure(viewer, {
      mode: 'distance',
      positions: [[116, 39], [117, 40]],
      id: 'my-dist',
    })
    expect(result.id).toBe('my-dist')
    const polylineEntity = mockEntitiesAdd.mock.calls[0][0]
    expect(polylineEntity.id).toBe('my-dist')
    const labelEntity = mockEntitiesAdd.mock.calls[1][0]
    expect(labelEntity.id).toBe('my-dist_label')
  })

  // --- Area mode ---
  it('should compute area and return result', () => {
    const viewer = makeViewer()
    const result = measure(viewer, {
      mode: 'area',
      positions: [[116, 39], [117, 39], [117, 40], [116, 40]],
    })
    expect(result.mode).toBe('area')
    expect(typeof result.value).toBe('number')
    expect(result.value).toBeGreaterThan(0)
    expect(result.unit).toMatch(/^(m²|km²)$/)
    expect(result.segments).toBeUndefined()
  })

  it('should add polygon + label entities for area by default', () => {
    const viewer = makeViewer()
    measure(viewer, {
      mode: 'area',
      positions: [[116, 39], [117, 39], [117, 40]],
    })
    expect(mockEntitiesAdd).toHaveBeenCalledTimes(2) // polygon + label
    const polygonEntity = mockEntitiesAdd.mock.calls[0][0]
    expect(polygonEntity.polygon).toBeDefined()
    const labelEntity = mockEntitiesAdd.mock.calls[1][0]
    expect(labelEntity.label).toBeDefined()
  })

  it('should NOT add entities when showOnMap=false for area', () => {
    const viewer = makeViewer()
    const result = measure(viewer, {
      mode: 'area',
      positions: [[116, 39], [117, 39], [117, 40]],
      showOnMap: false,
    })
    expect(mockEntitiesAdd).not.toHaveBeenCalled()
    expect(result.mode).toBe('area')
  })

  it('should use custom id for area', () => {
    const viewer = makeViewer()
    const result = measure(viewer, {
      mode: 'area',
      positions: [[116, 39], [117, 39], [117, 40]],
      id: 'my-area',
    })
    expect(result.id).toBe('my-area')
    const polygonEntity = mockEntitiesAdd.mock.calls[0][0]
    expect(polygonEntity.id).toBe('my-area')
  })

  // --- Short distance (m unit) ---
  it('should return m unit for short distances', () => {
    mockGeodesicDist = 500 // 500 meters
    const viewer = makeViewer()
    const result = measure(viewer, {
      mode: 'distance',
      positions: [[116.4, 39.9], [116.401, 39.901]],
      showOnMap: false,
    })
    expect(result.unit).toBe('m')
    expect(result.value).toBe(500)
  })

  // --- Area numerical validation ---
  it('should compute area in correct order of magnitude for 1°x1° rectangle', () => {
    const viewer = makeViewer()
    const result = measure(viewer, {
      mode: 'area',
      positions: [[116, 39], [117, 39], [117, 40], [116, 40]],
      showOnMap: false,
    })
    // 1°x1° at 39°N ≈ ~9500 km², value should be in thousands of km²
    expect(result.unit).toBe('km²')
    expect(result.value).toBeGreaterThan(5000)
    expect(result.value).toBeLessThan(15000)
  })

  // --- Small area (m² unit) ---
  it('should return m² unit for small areas', () => {
    const viewer = makeViewer()
    // ~0.001° polygon ≈ very small area
    const result = measure(viewer, {
      mode: 'area',
      positions: [[116, 39], [116.001, 39], [116.001, 39.001], [116, 39.001]],
      showOnMap: false,
    })
    // tiny polygon < 1km², should use m²
    expect(result.unit).toBe('m²')
    expect(result.value).toBeGreaterThan(0)
  })

  // --- Altitude parameter ---
  it('should accept positions with altitude', () => {
    const viewer = makeViewer()
    const result = measure(viewer, {
      mode: 'distance',
      positions: [[116.4, 39.9, 100], [121.4, 31.2, 200]],
      showOnMap: false,
    })
    expect(result.mode).toBe('distance')
    expect(result.value).toBeGreaterThan(0)
  })

  // --- removeById called before add (prevent ID collision) ---
  it('should call removeById before adding entities for distance', () => {
    const viewer = makeViewer()
    measure(viewer, {
      mode: 'distance',
      positions: [[116, 39], [117, 40]],
      id: 'reuse-dist',
    })
    expect(mockRemoveById).toHaveBeenCalledWith('reuse-dist')
    expect(mockRemoveById).toHaveBeenCalledWith('reuse-dist_label')
    // removeById called before add
    const removeOrder = mockRemoveById.mock.invocationCallOrder[0]
    const addOrder = mockEntitiesAdd.mock.invocationCallOrder[0]
    expect(removeOrder).toBeLessThan(addOrder!)
  })

  it('should call removeById before adding entities for area', () => {
    const viewer = makeViewer()
    measure(viewer, {
      mode: 'area',
      positions: [[116, 39], [117, 39], [117, 40]],
      id: 'reuse-area',
    })
    expect(mockRemoveById).toHaveBeenCalledWith('reuse-area')
    expect(mockRemoveById).toHaveBeenCalledWith('reuse-area_label')
  })
})

// ==================== highlight ====================

describe('highlight', () => {
  function makeEntity(id: string, type: string) {
    const entity: any = { id }
    if (type === 'polygon') entity.polygon = { material: 'original-mat' }
    if (type === 'polyline') entity.polyline = { material: 'original-mat', width: 'original-width' }
    if (type === 'point') entity.point = { color: 'original-color', pixelSize: 'original-size' }
    if (type === 'billboard') entity.billboard = { color: 'original-color' }
    if (type === 'box') entity.box = { material: 'original-mat' }
    if (type === 'cylinder') entity.cylinder = { material: 'original-mat' }
    if (type === 'ellipse') entity.ellipse = { material: 'original-mat' }
    if (type === 'rectangle') entity.rectangle = { material: 'original-mat' }
    if (type === 'wall') entity.wall = { material: 'original-mat' }
    if (type === 'corridor') entity.corridor = { material: 'original-mat' }
    if (type === 'label') entity.label = { fillColor: 'original-fill' }
    if (type === 'model') entity.model = { silhouetteColor: 'original-sil-color', silhouetteSize: 'original-sil-size' }
    return entity
  }

  function makeLayerManager(entities: any[]) {
    return {
      getCesiumRefs: (id: string) => id === 'layer1' ? { dataSource: { entities: { values: entities } } } : undefined,
    } as any
  }

  function makeViewer(topEntities: any[] = [], dsEntities: any[][] = []) {
    return {
      entities: { values: topEntities },
      dataSources: {
        length: dsEntities.length,
        get: (i: number) => ({ entities: { values: dsEntities[i] } }),
      },
    } as any
  }

  it('should highlight all entities in a layer', () => {
    const entities = [makeEntity('e1', 'polygon'), makeEntity('e2', 'polyline')]
    const lm = makeLayerManager(entities)
    const viewer = makeViewer()
    highlight(viewer, lm, { layerId: 'layer1', color: '#FF0000' })
    // polygon material should be changed
    expect(entities[0].polygon.material).not.toBe('original-mat')
    // polyline material should be changed
    expect(entities[1].polyline.material).not.toBe('original-mat')
  })

  it('should highlight single entity by featureIndex', () => {
    const entities = [makeEntity('e1', 'polygon'), makeEntity('e2', 'polygon')]
    const lm = makeLayerManager(entities)
    const viewer = makeViewer()
    highlight(viewer, lm, { layerId: 'layer1', featureIndex: 0 })
    expect(entities[0].polygon.material).not.toBe('original-mat')
    expect(entities[1].polygon.material).toBe('original-mat') // untouched
  })

  it('should restore original style on clear with layerId', () => {
    const entities = [makeEntity('e1', 'polygon')]
    const lm = makeLayerManager(entities)
    const viewer = makeViewer()
    const originalMat = entities[0].polygon.material
    highlight(viewer, lm, { layerId: 'layer1' })
    expect(entities[0].polygon.material).not.toBe(originalMat)
    // clear
    highlight(viewer, lm, { layerId: 'layer1', clear: true })
    expect(entities[0].polygon.material).toBe(originalMat)
  })

  it('should restore original style on global clear (no layerId)', () => {
    const entities = [makeEntity('e1', 'polygon')]
    const lm = makeLayerManager(entities)
    const viewer = makeViewer([], [entities.map(e => e)]) // put entities in a DataSource
    // Also register in layerManager for highlighting
    const originalMat = entities[0].polygon.material
    highlight(viewer, lm, { layerId: 'layer1' })
    expect(entities[0].polygon.material).not.toBe(originalMat)
    // Global clear
    highlight(viewer, lm, { clear: true })
    expect(entities[0].polygon.material).toBe(originalMat)
  })

  it('should handle highlight and clear for billboard entities', () => {
    const entities = [makeEntity('bb1', 'billboard')]
    const lm = makeLayerManager(entities)
    const viewer = makeViewer()
    const origColor = entities[0].billboard.color
    highlight(viewer, lm, { layerId: 'layer1' })
    expect(entities[0].billboard.color).not.toBe(origColor)
    highlight(viewer, lm, { layerId: 'layer1', clear: true })
    expect(entities[0].billboard.color).toBe(origColor)
  })

  it('should handle highlight and clear for box entities', () => {
    const entities = [makeEntity('box1', 'box')]
    const lm = makeLayerManager(entities)
    const viewer = makeViewer()
    const origMat = entities[0].box.material
    highlight(viewer, lm, { layerId: 'layer1' })
    expect(entities[0].box.material).not.toBe(origMat)
    highlight(viewer, lm, { layerId: 'layer1', clear: true })
    expect(entities[0].box.material).toBe(origMat)
  })

  it('should not re-backup if already highlighted', () => {
    const entities = [makeEntity('e1', 'polygon')]
    const lm = makeLayerManager(entities)
    const viewer = makeViewer()
    const originalMat = entities[0].polygon.material
    highlight(viewer, lm, { layerId: 'layer1', color: '#FF0000' })
    const firstHighlight = entities[0].polygon.material
    // Highlight again with different color
    highlight(viewer, lm, { layerId: 'layer1', color: '#00FF00' })
    expect(entities[0].polygon.material).not.toBe(firstHighlight)
    // Clear should restore original, not the first highlight
    highlight(viewer, lm, { layerId: 'layer1', clear: true })
    expect(entities[0].polygon.material).toBe(originalMat)
  })

  it('should do nothing when layerId is not found', () => {
    const lm = { getCesiumRefs: () => undefined } as any
    const viewer = makeViewer()
    // Should not throw
    highlight(viewer, lm, { layerId: 'nonexistent' })
  })

  it('should do nothing for highlight without layerId and without clear', () => {
    const lm = { getCesiumRefs: () => undefined } as any
    const viewer = makeViewer()
    // Should not throw
    highlight(viewer, lm, {})
  })
})
