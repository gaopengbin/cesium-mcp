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

import { measure } from './interaction.js'

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
