import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDsEntities: any[] = []
const mockDataSource = {
  name: '',
  entities: { values: mockDsEntities },
}
const mockLoadCzml = vi.fn().mockResolvedValue(mockDataSource)

vi.mock('cesium', () => ({
  CzmlDataSource: { load: (...args: any[]) => mockLoadCzml(...args) },
  GeoJsonDataSource: { load: vi.fn() },
  ConstantProperty: class { value: any; constructor(v: any) { this.value = v } },
  HeightReference: { CLAMP_TO_GROUND: 1 },
  Color: { fromCssColorString: (s: string) => ({ _css: s }) },
  default: {},
}))

vi.mock('../utils', () => ({
  parseColor: (s: string) => ({ _css: s }),
}))

import { detectGeometryType, LayerManager } from './layer.js'

function makeViewer() {
  return {
    dataSources: {
      add: vi.fn(),
      remove: vi.fn(),
    },
    entities: { remove: vi.fn() },
    scene: { primitives: { remove: vi.fn() } },
    imageryLayers: { remove: vi.fn() },
    flyTo: vi.fn(),
  } as any
}

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

describe('LayerManager.loadCzml', () => {
  let viewer: any
  let mgr: LayerManager

  beforeEach(() => {
    viewer = makeViewer()
    mgr = new LayerManager(viewer)
    mockLoadCzml.mockClear()
    mockDsEntities.length = 0
    mockLoadCzml.mockResolvedValue(mockDataSource)
    mockDataSource.name = ''
  })

  it('should load CZML from url', async () => {
    const info = await mgr.loadCzml({ url: 'https://example.com/data.czml' })
    expect(mockLoadCzml).toHaveBeenCalledWith('https://example.com/data.czml', {})
    expect(viewer.dataSources.add).toHaveBeenCalledWith(mockDataSource)
    expect(info.type).toBe('CZML')
    expect(info.name).toBe('CZML (data.czml)')
  })

  it('should load CZML from inline data', async () => {
    const czmlPackets = [
      { id: 'document', name: 'test', version: '1.0' },
      { id: 'point1', position: { cartographicDegrees: [116, 40, 0] } },
    ]
    const info = await mgr.loadCzml({ data: czmlPackets, name: 'Test CZML' })
    expect(mockLoadCzml).toHaveBeenCalledWith(czmlPackets, {})
    expect(info.name).toBe('Test CZML')
  })

  it('should throw if neither data nor url provided', async () => {
    await expect(mgr.loadCzml({})).rejects.toThrow('Either "data" or "url" must be provided')
  })

  it('should pass sourceUri option', async () => {
    await mgr.loadCzml({ url: 'test.czml', sourceUri: 'https://example.com/' })
    expect(mockLoadCzml).toHaveBeenCalledWith('test.czml', { sourceUri: 'https://example.com/' })
  })

  it('should auto-generate id if not provided', async () => {
    const info = await mgr.loadCzml({ url: 'test.czml' })
    expect(info.id).toMatch(/^czml_\d+$/)
  })

  it('should use provided id', async () => {
    const info = await mgr.loadCzml({ id: 'my-czml', url: 'test.czml' })
    expect(info.id).toBe('my-czml')
  })

  it('should register in layers list', async () => {
    await mgr.loadCzml({ id: 'czml1', url: 'test.czml' })
    const layers = mgr.listLayers()
    expect(layers).toHaveLength(1)
    expect(layers[0].id).toBe('czml1')
    expect(layers[0].type).toBe('CZML')
  })

  it('should flyTo by default', async () => {
    await mgr.loadCzml({ url: 'test.czml' })
    expect(viewer.flyTo).toHaveBeenCalledWith(mockDataSource, { duration: 1.5 })
  })

  it('should skip flyTo when flyTo=false', async () => {
    await mgr.loadCzml({ url: 'test.czml', flyTo: false })
    expect(viewer.flyTo).not.toHaveBeenCalled()
  })

  it('should be idempotent (remove existing before adding)', async () => {
    await mgr.loadCzml({ id: 'czml1', url: 'test.czml' })
    await mgr.loadCzml({ id: 'czml1', url: 'test2.czml' })
    const layers = mgr.listLayers()
    expect(layers).toHaveLength(1)
  })
})
