import { describe, expect, it } from 'vitest'
import * as Cesium from 'cesium'
import { pickDrapedVectorFeature } from './vector-picking.js'

describe('draped vector picking', () => {
  it('honours polygon holes and draping targets', () => {
    const collection = new (Cesium as any).BufferPolygonCollection({ primitiveCountMax: 1, vertexCountMax: 8, holeCountMax: 1 })
    const positions = Cesium.Cartesian3.packArray([[87, 26], [89, 26], [89, 28], [87, 28], [87.9, 26.9], [88.1, 26.9], [88.1, 27.1], [87.9, 27.1]].map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon!, lat!)))
    collection.add({ positions, holes: [4], featureId: 2 })
    const feature = { name: 'Parcel' }
    const content = { _collections: [collection], _collectionFeatureTableIds: new Map([[collection, 0]]), getFeature: () => feature }
    const tileset = { show: true, heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN, _selectedTiles: [{ content }] } as unknown as Cesium.Cesium3DTileset
    let world = Cesium.Cartesian3.fromDegrees(88, 27, 2000)
    const scene = { pickPositionSupported: true, pickPosition: () => world, camera: { getPixelSize: () => 10 }, canvas: { clientWidth: 800, clientHeight: 600 } } as unknown as Cesium.Scene
    expect(pickDrapedVectorFeature(scene, Cesium.Cartesian2.ZERO, [tileset])).toBeUndefined()
    world = Cesium.Cartesian3.fromDegrees(88.5, 27, 2000)
    expect(pickDrapedVectorFeature(scene, Cesium.Cartesian2.ZERO, [tileset])).toBe(feature)
    expect(pickDrapedVectorFeature(scene, Cesium.Cartesian2.ZERO, [tileset], { content: { tileset: {} } })).toBeUndefined()
    collection.destroy()
  })
  it('finds only visible line features on the clicked receiving surface', () => {
    const collection = new (Cesium as any).BufferPolylineCollection({ primitiveCountMax: 2, vertexCountMax: 4 })
    const positions = Cesium.Cartesian3.packArray([Cesium.Cartesian3.fromDegrees(88, 27), Cesium.Cartesian3.fromDegrees(88.1, 27)])
    collection.add({ positions, featureId: 42 })
    const feature = { name: 'River' }
    const content = { _collections: [collection], _collectionFeatureTableIds: new Map([[collection, 3]]), getFeature: (id: number, table: number) => id === 42 && table === 3 ? feature : undefined }
    const tileset = { show: true, heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN, _selectedTiles: [{ content }] } as unknown as Cesium.Cesium3DTileset
    const scene = {
      pickPositionSupported: true,
      pickPosition: () => Cesium.Cartesian3.fromDegrees(88.05, 27, 2000),
      camera: { getPixelSize: () => 10 },
      canvas: { clientWidth: 800, clientHeight: 600 },
    } as unknown as Cesium.Scene
    expect(pickDrapedVectorFeature(scene, new Cesium.Cartesian2(400, 300), [tileset])).toBe(feature)
    collection.get(0, new (Cesium as any).BufferPolyline()).show = false
    expect(pickDrapedVectorFeature(scene, new Cesium.Cartesian2(400, 300), [tileset])).toBeUndefined()
    collection.destroy()
  })
})
