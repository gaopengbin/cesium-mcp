import { describe, expect, it, vi } from 'vitest'
import * as Cesium from 'cesium'
import { LayerManager } from './layer.js'
import { updateVectorCollection, setTilesetOptions, snapToGeometry, measureSnappedDistance, setClippingPolygons } from './advanced.js'

function setup() {
  const viewer = { scene: { requestRender: vi.fn(), canvas: { clientWidth: 1000, clientHeight: 750 }, snap: vi.fn(), globe: {}, context: { webgl2: true } } } as unknown as Cesium.Viewer
  return { viewer, manager: new LayerManager(viewer) }
}
describe('Cesium 1.147 geometry tools', () => {
  it('updates real owned vector buffers in one batch and rejects topology changes atomically', () => {
    const { viewer, manager } = setup()
    const primitive = Cesium.GeoJsonPrimitive.fromGeoJson({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[10, 20], [11, 21]] } }] })
    manager.setCesiumRefs('vectors', { primitive })
    expect(updateVectorCollection(viewer, manager, { layerId: 'vectors', collection: 'polylines', primitiveOffset: 0, primitiveCount: 1, positions: [[30, 40, 100], [31, 41, 200]], blendOption: 'opaque' })).toMatchObject({ updatedPrimitives: 1 })
    const line = primitive.polylines!.get(0, new Cesium.BufferPolyline()) as Cesium.BufferPolyline
    const before = Array.from(line.getPositions() as unknown as Float64Array)
    expect(before.slice(0, 3)).toEqual(Object.values(Cesium.Cartesian3.fromDegrees(30, 40, 100)))
    expect(primitive.polylines!.blendOption).toBe(Cesium.BlendOption.OPAQUE)
    expect(() => updateVectorCollection(viewer, manager, { layerId: 'vectors', collection: 'polylines', positions: [[1, 2, 3]], primitiveCount: 1, blendOption: 'translucent' })).toThrow(/vertex/i)
    expect(Array.from(line.getPositions() as unknown as Float64Array)).toEqual(before)
    expect(primitive.polylines!.blendOption).toBe(Cesium.BlendOption.OPAQUE)
  })
  it('configures native tileset cache, vector blending and point-cloud culling', () => {
    const { viewer, manager } = setup()
    const tileset = { pointCloudShading: {}, environmentMapManager: {} } as Cesium.Cesium3DTileset
    manager.setCesiumRefs('tiles', { tileset })
    setTilesetOptions(viewer, manager, { layerId: 'tiles', cacheBytes: 1024, maximumCacheOverflowBytes: 2048, vectorBlendOption: 'opaque', pointCloudBackFaceCulling: true })
    expect(tileset).toMatchObject({ cacheBytes: 1024, maximumCacheOverflowBytes: 2048, vectorBlendOption: Cesium.BlendOption.OPAQUE, pointCloudShading: { backFaceCulling: true } })
  })
  it('reports missing snaps without substituting approximate pick positions or measurements', () => {
    const { viewer } = setup()
    expect(snapToGeometry(viewer, { x: 10, y: 20 })).toEqual({ snapped: false })
    expect(() => measureSnappedDistance(viewer, { points: [[10, 20], [30, 40]] })).toThrow(/snap/i)
    vi.mocked(viewer.scene.snap).mockReturnValue({ position: Cesium.Cartesian3.fromDegrees(10, 20, 30), isEdge: true } as Cesium.SceneSnapResult)
    expect(snapToGeometry(viewer, { x: 10, y: 20 })).toMatchObject({ snapped: true, isEdge: true })
  })
  it('constructs clipping polygons with holes and clears only the requested target', () => {
    const { viewer, manager } = setup()
    setClippingPolygons(viewer, manager, { polygons: [{ positions: [[0, 0], [2, 0], [2, 2], [0, 2]], holes: [[[.5, .5], [1, .5], [1, 1]]] }] })
    expect(viewer.scene.globe.clippingPolygons!.length).toBe(1)
    setClippingPolygons(viewer, manager, { clear: true })
    expect(viewer.scene.globe.clippingPolygons).toBeUndefined()
  })
})
