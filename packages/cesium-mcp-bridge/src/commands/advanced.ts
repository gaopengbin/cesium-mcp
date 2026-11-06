import * as Cesium from 'cesium'
import type { LayerManager } from './layer.js'
import type { GeographicPosition, UpdateVectorCollectionParams, SetTilesetOptionsParams, SnapToGeometryParams, MeasureSnappedDistanceParams, SetClippingPolygonsParams } from '../types.js'

export function worldPosition(position: GeographicPosition): Cesium.Cartesian3 {
  if (!Array.isArray(position) || !Number.isFinite(position[0]) || Math.abs(position[0]) > 180 || !Number.isFinite(position[1]) || Math.abs(position[1]) > 90 || !Number.isFinite(position[2] ?? 0)) throw new Error('Invalid geographic position')
  return Cesium.Cartesian3.fromDegrees(position[0], position[1], position[2] ?? 0)
}

export function geographicPosition(position: Cesium.Cartesian3): GeographicPosition {
  const geo = Cesium.Cartographic.fromCartesian(position)
  if (!geo || !Number.isFinite(geo.height)) throw new Error('Invalid snapped position')
  return [Cesium.Math.toDegrees(geo.longitude), Cesium.Math.toDegrees(geo.latitude), geo.height]
}

const blendModes = { opaque: Cesium.BlendOption.OPAQUE, translucent: Cesium.BlendOption.TRANSLUCENT }

export function updateVectorCollection(viewer: Cesium.Viewer, manager: LayerManager, params: UpdateVectorCollectionParams) {
  const source = manager.getCesiumRefs(params.layerId)?.primitive as Cesium.GeoJsonPrimitive | undefined
  if (!source || !(source instanceof Cesium.GeoJsonPrimitive)) throw new Error('Batch edits require an owned GeoJSON primitive layer, not streamed server tiles')
  const collection = source[params.collection]
  if (!collection) throw new Error(`Layer has no ${params.collection} collection`)
  const offset = params.primitiveOffset ?? 0
  const count = params.primitiveCount ?? collection.primitiveCount - offset
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(count) || offset < 0 || count < 1 || offset + count > collection.primitiveCount) throw new Error('Invalid vector primitive range')
  if (params.blendOption !== undefined && !(params.blendOption in blendModes)) throw new Error('Invalid vector blend mode')
  let positions: Float64Array | undefined
  if (params.positions) {
    const constructors = { points: Cesium.BufferPoint, polylines: Cesium.BufferPolyline, polygons: Cesium.BufferPolygon }
    const view = new constructors[params.collection]()
    let vertices = 0
    for (let i = offset; i < offset + count; i++) vertices += (collection as any).get(i, view).vertexCount ?? 1
    if (params.positions.length !== vertices) throw new Error(`Vertex count must remain ${vertices}; topology cannot change in a batch position update`)
    const inverse = Cesium.Matrix4.inverse(collection.modelMatrix, new Cesium.Matrix4())
    positions = new Float64Array(params.positions.flatMap(position => {
      const local = Cesium.Matrix4.multiplyByPoint(inverse, worldPosition(position), new Cesium.Cartesian3())
      return [local.x, local.y, local.z]
    }))
  }
  if (positions) collection.setPositions(positions, offset, count)
  if (params.blendOption !== undefined) collection.blendOption = blendModes[params.blendOption]
  viewer.scene.requestRender()
  return { layerId: params.layerId, collection: params.collection, updatedPrimitives: positions ? count : 0, primitiveOffset: offset, blendOption: params.blendOption ?? (collection.blendOption === Cesium.BlendOption.OPAQUE ? 'opaque' : 'translucent') }
}

export function setTilesetOptions(viewer: Cesium.Viewer, manager: LayerManager, params: SetTilesetOptionsParams) {
  const tileset = manager.getCesiumRefs(params.layerId)?.tileset
  if (!tileset) throw new Error('Managed 3D Tiles layer not found')
  for (const key of ['cacheBytes', 'maximumCacheOverflowBytes', 'maximumScreenSpaceError'] as const) {
    if (params[key] !== undefined && (!Number.isFinite(params[key]) || params[key]! < 0)) throw new Error(`Invalid ${key}`)
  }
  if (params.vectorBlendOption !== undefined && !(params.vectorBlendOption in blendModes)) throw new Error('Invalid vector blend mode')
  for (const key of ['cacheBytes', 'maximumCacheOverflowBytes', 'maximumScreenSpaceError'] as const) if (params[key] !== undefined) tileset[key] = params[key]!
  if (params.vectorBlendOption !== undefined) tileset.vectorBlendOption = blendModes[params.vectorBlendOption]
  if (params.pointCloudBackFaceCulling !== undefined) tileset.pointCloudShading.backFaceCulling = params.pointCloudBackFaceCulling
  if (params.dynamicEnvironmentMapEnabled !== undefined) tileset.environmentMapManager.enabled = params.dynamicEnvironmentMapEnabled
  viewer.scene.requestRender()
  return { layerId: params.layerId, cacheBytes: tileset.cacheBytes, maximumCacheOverflowBytes: tileset.maximumCacheOverflowBytes, maximumScreenSpaceError: tileset.maximumScreenSpaceError, vectorBlendOption: tileset.vectorBlendOption === Cesium.BlendOption.OPAQUE ? 'opaque' : 'translucent' }
}

function snap(viewer: Cesium.Viewer, params: SnapToGeometryParams) {
  const canvas = viewer.scene.canvas
  if (params.x < 0 || params.y < 0 || params.x >= canvas.clientWidth || params.y >= canvas.clientHeight) throw new Error('Snap pixel is outside the canvas (CSS pixels)')
  return viewer.scene.snap(new Cesium.Cartesian2(params.x, params.y), { width: params.width ?? 25 })
}

export function snapToGeometry(viewer: Cesium.Viewer, params: SnapToGeometryParams) {
  const hit = snap(viewer, params)
  if (!hit) return { snapped: false }
  return { snapped: true, isEdge: hit.isEdge, position: geographicPosition(hit.position), ...(hit.surfacePosition ? { surfacePosition: geographicPosition(hit.surfacePosition) } : {}) }
}

export function measureSnappedDistance(viewer: Cesium.Viewer, params: MeasureSnappedDistanceParams) {
  const hits = params.points.map(([x, y]) => snap(viewer, { x, y, width: params.width }))
  if (!hits[0] || !hits[1]) throw new Error('Both measurement points must snap to actual geometry; no approximate distance was produced')
  return { value: Cesium.Cartesian3.distance(hits[0].position, hits[1].position), unit: 'm', method: '3d-straight-line', positions: hits.map(hit => geographicPosition(hit!.position)), snapped: true }
}

export function setClippingPolygons(viewer: Cesium.Viewer, manager: LayerManager, params: SetClippingPolygonsParams) {
  const target = params.layerId ? manager.getCesiumRefs(params.layerId)?.tileset : viewer.scene.globe
  if (!target) throw new Error('Clipping target not found')
  if (!params.clear && !params.polygons?.length) throw new Error('Provide clipping polygons or clear=true')
  if (!params.clear && !Cesium.ClippingPolygonCollection.isSupported(viewer.scene)) throw new Error('Clipping polygons require WebGL 2')
  const polygons = params.clear ? undefined : new Cesium.ClippingPolygonCollection({ enabled: params.enabled ?? true, inverse: params.inverse ?? false, polygons: params.polygons!.map(polygon => new Cesium.ClippingPolygon({ positions: polygon.positions.map(worldPosition), holes: polygon.holes?.map(ring => ring.map(worldPosition)) })) })
  target.clippingPolygons = polygons!
  viewer.scene.requestRender()
  return { target: params.layerId ?? 'globe', polygons: polygons?.length ?? 0, cleared: !!params.clear, inverse: polygons?.inverse ?? false }
}
