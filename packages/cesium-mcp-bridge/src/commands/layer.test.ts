import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCesium = vi.hoisted(() => {
  class MockColor {
    red: number
    green: number
    blue: number
    alpha: number

    constructor(red = 1, green = 1, blue = 1, alpha = 1) {
      this.red = red
      this.green = green
      this.blue = blue
      this.alpha = alpha
    }

    withAlpha(alpha: number) {
      return new MockColor(this.red, this.green, this.blue, alpha)
    }

    static fromCssColorString(value: string) {
      return parseColor(value)
    }

    static fromHsl(hue: number, saturation: number, lightness: number, alpha = 1) {
      return new MockColor(hue, saturation, lightness, alpha)
    }
  }

  Object.assign(MockColor, {
    WHITE: new MockColor(1, 1, 1, 1),
    BLACK: new MockColor(0, 0, 0, 1),
  })

  function parseColor(value: string) {
    const named: Record<string, [number, number, number]> = {
      white: [1, 1, 1],
      black: [0, 0, 0],
      red: [1, 0, 0],
      green: [0, 1, 0],
      blue: [0, 0, 1],
    }
    const normalized = value.trim().toLowerCase()
    const namedColor = named[normalized]
    if (namedColor) return new MockColor(namedColor[0], namedColor[1], namedColor[2], 1)
    const hex = normalized.match(/^#?([0-9a-f]{6})$/i)
    if (hex) {
      const n = Number.parseInt(hex[1]!, 16)
      return new MockColor(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1)
    }
    return new MockColor(0.2, 0.4, 0.6, 1)
  }

  class ConstantProperty {
    value: any
    constructor(value: any) {
      this.value = value
    }

    getValue() {
      return this.value
    }
  }

  class ColorMaterialProperty {
    color: any
    constructor(color: any) {
      this.color = color
    }
  }

  class LabelGraphics {
    constructor(options: Record<string, unknown>) {
      Object.assign(this, options)
    }
  }

  class Cartesian2 {
    x: number
    y: number
    constructor(x: number, y: number) {
      this.x = x
      this.y = y
    }
  }

  class BufferMaterial {
    color: any
    outlineColor: any
    outlineWidth: number
    size: number
    width: number
    constructor(options: Record<string, any> = {}) {
      this.color = options.color ?? new MockColor(1, 1, 1, 1)
      this.outlineColor = options.outlineColor ?? new MockColor(1, 1, 1, 1)
      this.outlineWidth = options.outlineWidth ?? 0
      this.size = options.size ?? 1
      this.width = options.width ?? 1
    }
  }

  class BufferElement {
    record: any

    bind(record: any) {
      this.record = record
    }

    getMaterial(result: any) {
      Object.assign(result, this.record.material)
      return result
    }

    setMaterial(material: any) {
      this.record.material = new BufferMaterial(material)
      this.record.setMaterialCalls++
    }
  }

  class BufferPoint extends BufferElement {}
  class BufferPolyline extends BufferElement {}
  class BufferPolygon extends BufferElement {}
  class BufferPointMaterial extends BufferMaterial {}
  class BufferPolylineMaterial extends BufferMaterial {}
  class BufferPolygonMaterial extends BufferMaterial {}

  const mockDsEntities: any[] = []
  const mockDataSource = {
    name: '',
    entities: { values: mockDsEntities },
  }
  const mockKmlDataSource = {
    name: '',
    entities: { values: [] as any[] },
  }
  const mockLoadCzml = vi.fn().mockResolvedValue(mockDataSource)
  const mockLoadKml = vi.fn().mockResolvedValue(mockKmlDataSource)
  const mockLoadGeoJson = vi.fn().mockResolvedValue(mockDataSource)

  return {
    MockColor,
    BufferMaterial,
    parseColor,
    mockDsEntities,
    mockDataSource,
    mockKmlDataSource,
    mockLoadCzml,
    mockLoadKml,
    mockLoadGeoJson,
    ConstantProperty,
    ColorMaterialProperty,
    LabelGraphics,
    Cartesian2,
    BufferPoint,
    BufferPolyline,
    BufferPolygon,
    BufferPointMaterial,
    BufferPolylineMaterial,
    BufferPolygonMaterial,
  }
})

const mockDsEntities = mockCesium.mockDsEntities
const mockDataSource = mockCesium.mockDataSource
const mockKmlDataSource = mockCesium.mockKmlDataSource
const mockLoadCzml = mockCesium.mockLoadCzml
const mockLoadKml = mockCesium.mockLoadKml

vi.mock('cesium', () => ({
  CzmlDataSource: { load: (...args: any[]) => mockCesium.mockLoadCzml(...args) },
  KmlDataSource: { load: (...args: any[]) => mockCesium.mockLoadKml(...args) },
  GeoJsonDataSource: { load: (...args: any[]) => mockCesium.mockLoadGeoJson(...args) },
  ConstantProperty: mockCesium.ConstantProperty,
  ColorMaterialProperty: mockCesium.ColorMaterialProperty,
  LabelGraphics: mockCesium.LabelGraphics,
  Cartesian2: mockCesium.Cartesian2,
  HeightReference: { CLAMP_TO_GROUND: 1 },
  VerticalOrigin: { BOTTOM: 1 },
  LabelStyle: { FILL_AND_OUTLINE: 1 },
  JulianDate: { now: () => 'now' },
  Color: mockCesium.MockColor,
  BufferPoint: mockCesium.BufferPoint,
  BufferPolyline: mockCesium.BufferPolyline,
  BufferPolygon: mockCesium.BufferPolygon,
  BufferPointMaterial: mockCesium.BufferPointMaterial,
  BufferPolylineMaterial: mockCesium.BufferPolylineMaterial,
  BufferPolygonMaterial: mockCesium.BufferPolygonMaterial,
  Cesium3DTileStyle: class { constructor(public style: Record<string, unknown>) {} },
  default: {},
}))

vi.mock('../utils', () => ({
  parseColor: mockCesium.parseColor,
}))

import { detectGeometryType, LayerManager } from './layer.js'

function makeViewer() {
  return {
    dataSources: {
      add: vi.fn(),
      remove: vi.fn(),
    },
    entities: { remove: vi.fn() },
    scene: {
      primitives: { remove: vi.fn() },
      camera: { _mock: true },
      canvas: { _mock: true },
      requestRender: vi.fn(),
    },
    imageryLayers: { remove: vi.fn(), addImageryProvider: vi.fn(), removeAll: vi.fn() },
    flyTo: vi.fn(),
  } as any
}

function registerLayer(mgr: LayerManager, id: string, color = '#3B82F6') {
  (mgr as any)._layers.push({
    id,
    name: id,
    type: 'test',
    visible: true,
    color,
  })
}

function propertyValue(value: unknown) {
  return {
    getValue: vi.fn(() => value),
  }
}

function makePrimitiveCollection(materials: Array<Record<string, unknown>>) {
  const records = materials.map(material => ({
    material: new mockCesium.BufferMaterial(material),
    setMaterialCalls: 0,
  }))
  return {
    primitiveCount: records.length,
    records,
    get: vi.fn((index: number, element: any) => {
      element.bind(records[index])
      return element
    }),
  }
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
    expect(layers[0]!.id).toBe('czml1')
    expect(layers[0]!.type).toBe('CZML')
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

describe('LayerManager.loadKml', () => {
  let viewer: any
  let mgr: LayerManager

  beforeEach(() => {
    viewer = makeViewer()
    mgr = new LayerManager(viewer)
    mockLoadKml.mockClear()
    mockKmlDataSource.entities.values.length = 0
    mockLoadKml.mockResolvedValue(mockKmlDataSource)
    mockKmlDataSource.name = ''
  })

  it('should load KML from url', async () => {
    const info = await mgr.loadKml({ url: 'https://example.com/data.kml' })
    expect(mockLoadKml).toHaveBeenCalledWith('https://example.com/data.kml', {
      camera: viewer.scene.camera,
      canvas: viewer.scene.canvas,
    })
    expect(viewer.dataSources.add).toHaveBeenCalledWith(mockKmlDataSource)
    expect(info.type).toBe('KML')
    expect(info.name).toBe('KML (data.kml)')
  })

  it('should load KML from inline data (Blob)', async () => {
    const kmlString = '<?xml version="1.0"?><kml><Document><Placemark><name>Test</name></Placemark></Document></kml>'
    const info = await mgr.loadKml({ data: kmlString, name: 'Inline KML' })
    const call = mockLoadKml.mock.calls[0]!
    expect(call[0]).toBeInstanceOf(Blob)
    expect(info.name).toBe('Inline KML')
  })

  it('should throw if neither data nor url provided', async () => {
    await expect(mgr.loadKml({})).rejects.toThrow('Either "url" or "data" must be provided')
  })

  it('should pass sourceUri and clampToGround options', async () => {
    await mgr.loadKml({ url: 'test.kml', sourceUri: 'https://example.com/', clampToGround: true })
    expect(mockLoadKml).toHaveBeenCalledWith('test.kml', {
      camera: viewer.scene.camera,
      canvas: viewer.scene.canvas,
      sourceUri: 'https://example.com/',
      clampToGround: true,
    })
  })

  it('should auto-generate id if not provided', async () => {
    const info = await mgr.loadKml({ url: 'test.kml' })
    expect(info.id).toMatch(/^kml_\d+$/)
  })

  it('should use provided id', async () => {
    const info = await mgr.loadKml({ id: 'my-kml', url: 'test.kml' })
    expect(info.id).toBe('my-kml')
  })

  it('should register in layers list', async () => {
    await mgr.loadKml({ id: 'kml1', url: 'test.kml' })
    const layers = mgr.listLayers()
    expect(layers).toHaveLength(1)
    expect(layers[0]!.id).toBe('kml1')
    expect(layers[0]!.type).toBe('KML')
  })

  it('should flyTo by default', async () => {
    await mgr.loadKml({ url: 'test.kml' })
    expect(viewer.flyTo).toHaveBeenCalledWith(mockKmlDataSource, { duration: 1.5 })
  })

  it('should skip flyTo when flyTo=false', async () => {
    await mgr.loadKml({ url: 'test.kml', flyTo: false })
    expect(viewer.flyTo).not.toHaveBeenCalled()
  })

  it('should be idempotent (remove existing before adding)', async () => {
    await mgr.loadKml({ id: 'kml1', url: 'test.kml' })
    await mgr.loadKml({ id: 'kml1', url: 'test2.kml' })
    const layers = mgr.listLayers()
    expect(layers).toHaveLength(1)
  })
})

describe('LayerManager.updateLayerStyle', () => {
  let viewer: any
  let mgr: LayerManager

  beforeEach(() => {
    viewer = makeViewer()
    mgr = new LayerManager(viewer)
  })

  it('should update imagery visual properties and reject invalid alpha', () => {
    const imageryLayer = { alpha: 1, brightness: 1, contrast: 1, hue: 0, saturation: 1, gamma: 1 }
    registerLayer(mgr, 'imagery')
    mgr.setCesiumRefs('imagery', { imageryLayer } as any)

    expect(mgr.updateLayerStyle({
      layerId: 'imagery',
      imageryStyle: { alpha: 0.4, brightness: 1.2, hue: 0.5 },
    })).toBe(true)
    expect(imageryLayer.alpha).toBe(0.4)
    expect(imageryLayer.brightness).toBe(1.2)
    expect(imageryLayer.hue).toBe(0.5)

    expect(mgr.updateLayerStyle({
      layerId: 'imagery',
      imageryStyle: { alpha: 2 },
    })).toBe(false)
    expect(imageryLayer.alpha).toBe(0.4)
  })

  it('should tint GeoJSON billboards without replacing image', () => {
    const image = { id: 'original-image' }
    const entity: any = { billboard: { image } }
    const dataSource = { entities: { values: [entity] } }
    registerLayer(mgr, 'geojson', '#3B82F6')
    mgr.setCesiumRefs('geojson', { dataSource, styleEntities: [entity] } as any)

    expect(mgr.updateLayerStyle({
      layerId: 'geojson',
      layerStyle: { color: '#FF0000', opacity: 0.5, pointSize: 12 },
    })).toBe(true)

    expect(entity.billboard.image).toBe(image)
    expect(entity.billboard.color.value.red).toBe(1)
    expect(entity.billboard.color.value.alpha).toBe(0.5)
    expect(entity.billboard.width.value).toBe(24)
    expect(entity.billboard.height.value).toBe(24)
  })

  it('should apply string category styles only to original GeoJSON entities', () => {
    const entity: any = {
      billboard: {},
      properties: { kind: propertyValue('hospital') },
    }
    const helperOutline = { polyline: { material: 'unchanged' } }
    const dataSource = { entities: { values: [entity, helperOutline] } }
    registerLayer(mgr, 'category')
    mgr.setCesiumRefs('category', {
      dataSource,
      styleEntities: [entity],
    } as any)

    expect(mgr.updateLayerStyle({
      layerId: 'category',
      layerStyle: { category: { field: 'kind' } },
    })).toBe(true)

    expect(entity.billboard.color.value.alpha).toBe(0.6)
    expect(helperOutline.polyline.material).toBe('unchanged')
  })

  it('should reject multiple thematic modes before mutating entities', () => {
    const color = { id: 'old-color' }
    const entity = { billboard: { color } }
    const dataSource = { entities: { values: [entity] } }
    registerLayer(mgr, 'geojson')
    mgr.setCesiumRefs('geojson', { dataSource, styleEntities: [entity] } as any)

    expect(mgr.updateLayerStyle({
      layerId: 'geojson',
      layerStyle: { randomColor: true, gradient: ['#000000', '#FFFFFF'] },
    })).toBe(false)
    expect(entity.billboard.color).toBe(color)
  })

  it('should reject thematic styles for CZML or KML data sources', () => {
    const entity = { billboard: {} }
    const dataSource = { entities: { values: [entity] } }
    registerLayer(mgr, 'czml')
    mgr.setCesiumRefs('czml', { dataSource } as any)

    expect(mgr.updateLayerStyle({
      layerId: 'czml',
      layerStyle: { randomColor: true },
    })).toBe(false)
  })

  it('should sync GeoJSON polygon helper outlines', () => {
    const polygonEntity: any = { polygon: {} }
    const outlineEntity: any = { polyline: { material: undefined, width: undefined } }
    const dataSource = { entities: { values: [polygonEntity, outlineEntity] } }
    registerLayer(mgr, 'polygon')
    mgr.setCesiumRefs('polygon', {
      dataSource,
      styleEntities: [polygonEntity],
      polygonOutlines: new Map([[polygonEntity, [outlineEntity]]]),
    } as any)

    expect(mgr.updateLayerStyle({
      layerId: 'polygon',
      layerStyle: { color: '#FF0000', opacity: 0.8, strokeWidth: 7 },
    })).toBe(true)

    expect(outlineEntity.polyline.width.value).toBe(7)
    expect(outlineEntity.polyline.material.color.red).toBe(1)
    expect(outlineEntity.polyline.material.color.alpha).toBe(0.8)
  })

  it('should update GeoJSON Primitive materials through public buffer APIs', () => {
    const pointCollection = makePrimitiveCollection([
      { color: mockCesium.parseColor('#112233'), size: 9 },
    ])
    const polylineCollection = makePrimitiveCollection([
      { color: mockCesium.parseColor('#445566'), width: 4 },
    ])
    const primitive = { points: pointCollection, polylines: polylineCollection }
    registerLayer(mgr, 'primitive')
    mgr.setCesiumRefs('primitive', { primitive } as any)

    expect(mgr.updateLayerStyle({
      layerId: 'primitive',
      primitiveStyle: { color: '#FF0000', opacity: 0.25, outlineWidth: 2 },
    })).toBe(true)

    expect(pointCollection.get).toHaveBeenCalledWith(0, expect.any(Object))
    expect(polylineCollection.get).toHaveBeenCalledWith(0, expect.any(Object))
    expect(pointCollection.records[0]!.material.color.red).toBe(1)
    expect(pointCollection.records[0]!.material.color.alpha).toBe(0.25)
    expect(pointCollection.records[0]!.material.size).toBe(9)
    expect(polylineCollection.records[0]!.material.width).toBe(4)
    expect(pointCollection.records[0]!.setMaterialCalls).toBe(1)
    expect(polylineCollection.records[0]!.setMaterialCalls).toBe(1)
    expect(viewer.scene.requestRender).toHaveBeenCalled()
  })

  it('should reject invalid primitive style before reading collections', () => {
    const pointCollection = makePrimitiveCollection([
      { color: mockCesium.parseColor('#112233'), size: 9 },
    ])
    registerLayer(mgr, 'primitive')
    mgr.setCesiumRefs('primitive', { primitive: { points: pointCollection } } as any)

    expect(mgr.updateLayerStyle({
      layerId: 'primitive',
      primitiveStyle: { outlineWidth: 300 },
    })).toBe(false)

    expect(pointCollection.get).not.toHaveBeenCalled()
    expect(pointCollection.records[0]!.setMaterialCalls).toBe(0)
  })
})

describe('LayerManager.clearAll', () => {
  let viewer: any
  let mgr: LayerManager

  beforeEach(() => {
    viewer = makeViewer()
    viewer.entities.values = []
    viewer.entities.removeAll = vi.fn()
    viewer.dataSources.removeAll = vi.fn()
    mgr = new LayerManager(viewer)
    mockLoadCzml.mockClear()
    mockLoadKml.mockClear()
    mockDsEntities.length = 0
    mockLoadCzml.mockResolvedValue(mockDataSource)
    mockLoadKml.mockResolvedValue(mockKmlDataSource)
  })

  it('should return zero counts on empty scene', () => {
    const result = mgr.clearAll()
    expect(result.removedLayers).toBe(0)
    expect(result.removedEntities).toBe(0)
  })

  it('should clear all layers after adding CZML and KML', async () => {
    await mgr.loadCzml({ id: 'czml1', url: 'test.czml' })
    await mgr.loadKml({ id: 'kml1', url: 'test.kml' })
    expect(mgr.listLayers()).toHaveLength(2)

    const result = mgr.clearAll()
    expect(result.removedLayers).toBe(2)
    expect(mgr.listLayers()).toHaveLength(0)
  })

  it('should call viewer.entities.removeAll and viewer.dataSources.removeAll', async () => {
    await mgr.loadCzml({ id: 'czml1', url: 'test.czml' })
    mgr.clearAll()
    expect(viewer.entities.removeAll).toHaveBeenCalled()
    expect(viewer.dataSources.removeAll).toHaveBeenCalledWith(true)
  })

  it('should be idempotent (calling twice is safe)', async () => {
    await mgr.loadCzml({ id: 'czml1', url: 'test.czml' })
    mgr.clearAll()
    const result = mgr.clearAll()
    expect(result.removedLayers).toBe(0)
    expect(result.removedEntities).toBe(0)
  })
})
