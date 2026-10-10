import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Cesium from 'cesium'
import type { Viewer, Cesium3DTileset } from 'cesium'
import { LayerManager } from './layer.js'

describe('vector layer lifecycle', () => {
  afterEach(() => vi.restoreAllMocks())
  const create = () => new LayerManager({ scene: { primitives: { remove: () => true } } } as unknown as Viewer)
  it('rejects invalid XYZ URLs before making requests', async () => {
    await expect(create().loadVectorTiles({ source: 'mvt', url: 'https://example.com/tiles.pbf' })).rejects.toThrow('must include')
  })
  it('rejects high zoom global and oversized regional hierarchies', async () => {
    await expect(create().loadVectorTiles({ source: 'mvt', url: 'https://example.com/{z}/{x}/{y}', maxZoom: 14 })).rejects.toThrow('bounded extent')
    await expect(create().loadVectorTiles({ source: 'mvt', url: 'https://example.com/{z}/{x}/{y}', maxZoom: 18, extent: [-170, -80, 170, 80] })).rejects.toThrow('too large')
  })
  it('rejects unsupported query templates', async () => {
    await expect(create().loadVectorTiles({ source: 'mvt', url: 'https://example.com/tile?z={z}&x={x}&y={y}' })).rejects.toThrow('path order')
  })
  it('passes draping targets and the receiving scene to MVT', async () => {
    const provider = { tileset: {}, destroy: vi.fn() }
    const fromUrl = vi.spyOn((Cesium as any).MVTDataProvider, 'fromUrl').mockResolvedValue(provider)
    const scene = { primitives: { add: vi.fn(), remove: vi.fn() } }
    const manager = new LayerManager({ scene } as unknown as Viewer)
    await manager.loadVectorTiles({ source: 'mvt', url: 'https://example.com/{z}/{x}/{y}', clampTarget: 'ground', flyTo: false })
    expect(fromUrl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ scene, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND }))
    expect(scene.primitives.add).toHaveBeenCalledWith(provider)
  })
  it('preserves an existing layer and destroys a failed replacement', async () => {
    const provider = { tileset: {}, destroy: vi.fn() }
    vi.spyOn((Cesium as any).MVTDataProvider, 'fromUrl').mockResolvedValue(provider)
    const manager = create()
    manager.layers.push({ id: 'rivers', name: 'Existing', type: 'mvt', visible: true, color: 'blue' })
    await expect(manager.loadVectorTiles({ source: 'mvt', id: 'rivers', url: 'https://example.com/{z}/{x}/{y}', tileStyle: { color: "color('bad" } })).rejects.toThrow()
    expect(manager.layers[0]?.name).toBe('Existing')
    expect(provider.destroy).toHaveBeenCalledOnce()
  })
  it('cancels pending MVT loads and destroys late providers without replacing the layer', async () => {
    const provider = { tileset: {}, destroy: vi.fn() }
    let resolveProvider!: (value: typeof provider) => void
    vi.spyOn((Cesium as any).MVTDataProvider, 'fromUrl').mockImplementation(() => new Promise(resolve => { resolveProvider = resolve }))
    const manager = create()
    manager.layers.push({ id: 'rivers', name: 'Existing', type: 'mvt', visible: true, color: 'blue' })
    const controller = new AbortController()
    const loading = manager.loadVectorTiles({ source: 'mvt', id: 'rivers', url: 'https://example.com/{z}/{x}/{y}', flyTo: false }, controller.signal)
    controller.abort(new Error('Cancelled'))
    await expect(loading).rejects.toThrow('Cancelled')
    resolveProvider(provider)
    await Promise.resolve()
    expect(provider.destroy).toHaveBeenCalledOnce()
    expect(manager.layers[0]?.name).toBe('Existing')
  })
  it('returns independent snapshots and clears selection when removing a layer', () => {
    const manager = create()
    const tileset = {} as Cesium3DTileset
    manager.layers.push({ id: 'rivers', name: 'Rivers', type: '3D Tiles', visible: true, color: 'blue' })
    manager.setCesiumRefs('rivers', { tileset })
    manager.selectTileFeature({ tileset, getPropertyIds: () => ['name'], getProperty: () => 'Brahmaputra' })
    const snapshot = manager.getSelectedTileFeature()!
    snapshot.properties.name = 'Changed'
    expect(manager.getSelectedTileFeature()?.properties.name).toBe('Brahmaputra')
    manager.removeLayer('rivers')
    expect(manager.getSelectedTileFeature()).toBeNull()
  })
  it('reads attributes from a loaded child tile and returns the actual tile style', () => {
    const manager = create()
    manager.layers.push({ id: 'rivers', name: 'Rivers', type: 'mvt', visible: true, color: 'blue' })
    manager.setCesiumRefs('rivers', { tileset: {
      style: { style: { color: "color('#ff8800')", lineWidth: '7' } },
      root: { children: [{ children: [], content: { featuresLength: 1, getFeature: () => ({ getPropertyIds: () => ['name'], getProperty: () => 'Brahmaputra' }) } }] },
    } as unknown as Cesium3DTileset })
    const schema = manager.getLayerSchema({ layerId: 'rivers' })
    expect(schema.fields).toContainEqual({ name: 'name', type: 'string', sample: 'Brahmaputra' })
    expect(schema.metadata?.tileStyle).toEqual({ color: "color('#ff8800')", lineWidth: '7' })
  })
  it('preserves existing tile expressions and accepts false and zero when restyling', () => {
    const manager = new LayerManager({ scene: { requestRender: () => {} } } as unknown as Viewer)
    const tileset = { style: { style: { color: "color('blue')", lineWidth: 5 } } } as Cesium3DTileset
    manager.layers.push({ id: 'rivers', name: 'Rivers', type: 'mvt', visible: true, color: 'blue' })
    manager.setCesiumRefs('rivers', { tileset })
    expect(manager.updateLayerStyle({ layerId: 'rivers', tileStyle: { show: false, pointSize: 0 } })).toBe(true)
    expect(tileset.style!.style).toMatchObject({ color: "color('blue')", lineWidth: '5', show: 'false', pointSize: '0' })
    expect(tileset.style!.show.evaluate(undefined as never)).toBe(false)
    expect(tileset.style!.pointSize.evaluate(undefined as never)).toBe(0)
  })
  it('finishes surface rebaking frames and releases the render listener', () => {
    const scene = { requestRender: vi.fn(), postRender: new Cesium.Event() }
    const manager = new LayerManager({ scene } as unknown as Viewer)
    const tileset = { style: new Cesium.Cesium3DTileStyle({ color: "color('blue')" }), heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN } as Cesium3DTileset
    manager.layers.push({ id: 'rivers', name: 'Rivers', type: 'mvt', visible: true, color: 'blue' })
    manager.setCesiumRefs('rivers', { tileset })
    manager.refreshVectorStyles()
    for (let i = 0; i < 4; i++) scene.postRender.raiseEvent()
    expect(scene.requestRender).toHaveBeenCalledTimes(3)
    expect(scene.postRender.numberOfListeners).toBe(0)
    manager.refreshVectorStyles()
    manager.dispose()
    expect(scene.postRender.numberOfListeners).toBe(0)
  })
})
