import * as Cesium from 'cesium'
import {
  createSpatialContext,
  haversineDistanceMeters,
} from 'cesium-mcp-spatial'
import type {
  SpatialBounds,
  SpatialContext,
  SpatialCoordinate,
  SpatialEvidenceQuality,
  SpatialGeometry,
  SpatialObject,
} from 'cesium-mcp-spatial'
import type { CesiumBridge } from './bridge.js'
import type {
  EntityPropertiesResult,
  LayerInfo,
  SceneReadinessResult,
  ViewState,
} from './types.js'

export interface BridgeSpatialSnapshot {
  context: SpatialContext
  view: ViewState
  viewBounds?: SpatialBounds
  viewQuality: SpatialEvidenceQuality
  viewBasis: string
  observedAt: string
  snapshotRevision: number
  readiness: SceneReadinessResult
}

export interface NearbySpatialObject {
  object: SpatialObject
  distanceMeters: number
}

interface SnapshotRevisionState {
  fingerprint: string
  revision: number
}

const snapshotRevisionByBridge = new WeakMap<CesiumBridge, SnapshotRevisionState>()

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function coordinate(value: unknown): SpatialCoordinate | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined
  if (!finiteNumber(value[0]) || !finiteNumber(value[1])) return undefined
  if (finiteNumber(value[2])) return [value[0], value[1], value[2]]
  return [value[0], value[1]]
}

function coordinates(value: unknown): SpatialCoordinate[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parsed = value.map(coordinate)
  if (parsed.some(item => !item)) return undefined
  return parsed as SpatialCoordinate[]
}

function sameCoordinate(left: SpatialCoordinate, right: SpatialCoordinate): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2]
}

function geometryFromEntity(
  entity: EntityPropertiesResult,
): { geometry?: SpatialGeometry; quality: SpatialEvidenceQuality; method: string } {
  const positions = coordinates(entity.graphicProperties.positions)
  if (positions && positions.length > 0) {
    if (entity.type === 'polygon' && positions.length >= 3) {
      const ring = [...positions]
      if (!sameCoordinate(ring[0]!, ring[ring.length - 1]!)) ring.push([...ring[0]!] as SpatialCoordinate)
      return {
        geometry: { type: 'Polygon', coordinates: [ring] },
        quality: 'exact',
        method: 'entity-polygon-positions',
      }
    }
    if (positions.length >= 2) {
      return {
        geometry: { type: 'LineString', coordinates: positions },
        quality: 'exact',
        method: 'entity-linear-positions',
      }
    }
  }

  const rectangle = entity.graphicProperties.coordinates
  if (rectangle && typeof rectangle === 'object') {
    const { west, south, east, north } = rectangle as Record<string, unknown>
    if ([west, south, east, north].every(finiteNumber)) {
      const ring: SpatialCoordinate[] = [
        [west as number, south as number],
        [east as number, south as number],
        [east as number, north as number],
        [west as number, north as number],
        [west as number, south as number],
      ]
      return {
        geometry: { type: 'Polygon', coordinates: [ring] },
        quality: 'exact',
        method: 'entity-rectangle-coordinates',
      }
    }
  }

  if (entity.position) {
    const point: SpatialCoordinate = [
      entity.position.longitude,
      entity.position.latitude,
      entity.position.height,
    ]
    const pointTypes = new Set(['marker', 'billboard', 'label', 'model'])
    return {
      geometry: { type: 'Point', coordinates: point },
      quality: pointTypes.has(entity.type) ? 'exact' : 'derived',
      method: pointTypes.has(entity.type)
        ? 'entity-position'
        : 'entity-derived-centroid',
    }
  }

  return { quality: 'unknown', method: 'entity-geometry-unavailable' }
}

function semanticType(entity: EntityPropertiesResult): string {
  for (const key of ['semanticType', 'category', 'class', 'kind']) {
    const value = entity.properties[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return entity.type
}

function sourceTypeForLayer(
  bridge: CesiumBridge,
  layer: LayerInfo | undefined,
): SpatialObject['sourceType'] {
  if (!layer) return 'entity'
  const refs = bridge.layerManager.getCesiumRefs(layer.id)
  const constructorName = refs?.dataSource?.constructor?.name.toLocaleLowerCase() ?? ''
  if (constructorName.includes('geojson')) return 'geojson'
  if (constructorName.includes('czml')) return 'czml'
  return 'entity'
}

function buildEntityLayerMap(
  bridge: CesiumBridge,
  layers: readonly LayerInfo[],
): Map<string, LayerInfo> {
  const result = new Map<string, LayerInfo>()
  const record = (entity: Cesium.Entity | undefined, layer: LayerInfo) => {
    if (entity?.id) result.set(entity.id, layer)
  }

  for (const layer of layers) {
    const refs = bridge.layerManager.getCesiumRefs(layer.id)
    if (!refs) continue
    record(refs.entity, layer)
    record(refs.movingEntity, layer)
    record(refs.trailEntity, layer)
    for (const entity of refs.labelEntities ?? []) record(entity, layer)
    for (const entity of refs.styleEntities ?? []) record(entity, layer)
    for (const entity of refs.dataSource?.entities.values ?? []) record(entity, layer)
  }
  return result
}

function buildAuxiliaryEntityIds(
  bridge: CesiumBridge,
  layers: readonly LayerInfo[],
): Set<string> {
  const result = new Set<string>()
  for (const layer of layers) {
    const outlines = bridge.layerManager.getCesiumRefs(layer.id)?.polygonOutlines
    if (!outlines) continue
    for (const entities of outlines.values()) {
      for (const entity of entities) result.add(entity.id)
    }
  }
  return result
}

function objectId(prefix: string, ...parts: string[]): string {
  return [prefix, ...parts.map(part => encodeURIComponent(part))].join(':')
}

function sceneReadiness(
  bridge: CesiumBridge,
  layers: readonly LayerInfo[],
): SceneReadinessResult {
  const dataSourcesReady = typeof bridge.viewer.dataSourceDisplay?.ready === 'boolean'
    ? bridge.viewer.dataSourceDisplay.ready
    : null
  const globeTilesLoaded = typeof bridge.viewer.scene.globe?.tilesLoaded === 'boolean'
    ? bridge.viewer.scene.globe.tilesLoaded
    : null
  const terrainProvider = bridge.viewer.terrainProvider?.constructor?.name ?? 'unknown'
  const managedTilesets = layers.flatMap((layer) => {
    const tileset = bridge.layerManager.getCesiumRefs(layer.id)?.tileset
    if (!tileset) return []
    return [{
      layerId: layer.id,
      name: layer.name,
      visible: layer.visible,
      tilesLoaded: typeof tileset.tilesLoaded === 'boolean' ? tileset.tilesLoaded : null,
    }]
  })
  const signals = [
    dataSourcesReady,
    globeTilesLoaded,
    ...managedTilesets
      .filter(tileset => tileset.visible)
      .map(tileset => tileset.tilesLoaded),
  ].filter((value): value is boolean => value !== null)
  const hasUnknownSignal = dataSourcesReady === null
    || globeTilesLoaded === null
    || managedTilesets.some(tileset => tileset.visible && tileset.tilesLoaded === null)
  const pendingReasons: string[] = []
  if (dataSourcesReady === false) pendingReasons.push('data-sources-loading')
  if (dataSourcesReady === null) pendingReasons.push('data-source-readiness-unavailable')
  if (globeTilesLoaded === false) pendingReasons.push('globe-or-imagery-tiles-loading')
  if (globeTilesLoaded === null) pendingReasons.push('globe-tile-readiness-unavailable')
  for (const tileset of managedTilesets) {
    if (tileset.visible && tileset.tilesLoaded === false) {
      pendingReasons.push(`tileset-loading:${tileset.layerId}`)
    }
    if (tileset.visible && tileset.tilesLoaded === null) {
      pendingReasons.push(`tileset-readiness-unavailable:${tileset.layerId}`)
    }
  }
  if (signals.length === 0) pendingReasons.push('readiness-probes-unavailable')

  let state: SceneReadinessResult['state']
  if (signals.length === 0) state = 'unknown'
  else if (signals.every(Boolean) && !hasUnknownSignal) state = 'ready'
  else if (signals.every(value => !value)) state = 'loading'
  else state = 'partial'

  return {
    state,
    dataSourcesReady,
    globeTilesLoaded,
    terrainProvider,
    managedTilesets,
    pendingReasons,
  }
}

function snapshotFingerprint(objects: readonly SpatialObject[]): string {
  const stableObjects = [...objects]
    .sort((left, right) => left.objectId.localeCompare(right.objectId))
    .map(({ observedAt: _observedAt, revision: _revision, ...object }) => object)
  try {
    return JSON.stringify(stableObjects)
  } catch {
    return stableObjects.map(object => object.objectId).join('|')
  }
}

function snapshotRevision(
  bridge: CesiumBridge,
  objects: readonly SpatialObject[],
): number {
  const fingerprint = snapshotFingerprint(objects)
  const previous = snapshotRevisionByBridge.get(bridge)
  if (previous?.fingerprint === fingerprint) return previous.revision
  const revision = (previous?.revision ?? 0) + 1
  snapshotRevisionByBridge.set(bridge, { fingerprint, revision })
  return revision
}

function viewRectangle(
  bridge: CesiumBridge,
): Pick<BridgeSpatialSnapshot, 'viewBounds' | 'viewQuality' | 'viewBasis'> {
  try {
    const rectangle = bridge.viewer.camera.computeViewRectangle(
      bridge.viewer.scene.globe?.ellipsoid,
    )
    if (!rectangle) {
      return {
        viewQuality: 'unknown',
        viewBasis: 'camera-view-rectangle-unavailable',
      }
    }
    const west = Cesium.Math.toDegrees(rectangle.west)
    const south = Cesium.Math.toDegrees(rectangle.south)
    const east = Cesium.Math.toDegrees(rectangle.east)
    const north = Cesium.Math.toDegrees(rectangle.north)
    if (east < west) {
      return {
        viewQuality: 'approximate',
        viewBasis: 'camera-view-crosses-antimeridian',
      }
    }
    return {
      viewBounds: [west, south, east, north],
      viewQuality: 'derived',
      viewBasis: 'camera-compute-view-rectangle',
    }
  } catch {
    return {
      viewQuality: 'unknown',
      viewBasis: 'camera-view-rectangle-error',
    }
  }
}

export function createBridgeSpatialSnapshot(bridge: CesiumBridge): BridgeSpatialSnapshot {
  const scene = bridge.exportScene()
  const layerByEntity = buildEntityLayerMap(bridge, scene.layers)
  const auxiliaryEntityIds = buildAuxiliaryEntityIds(bridge, scene.layers)
  const objects: SpatialObject[] = []

  for (const layer of scene.layers) {
    objects.push({
      objectId: objectId('layer', layer.id),
      sourceType: 'layer',
      type: layer.type,
      name: layer.name,
      layerId: layer.id,
      ...(layer.dataRefId ? { resourceId: layer.dataRefId } : {}),
      properties: {
        visible: layer.visible,
        color: layer.color,
      },
      geometryQuality: 'unknown',
      observedAt: scene.timestamp,
      revision: 0,
      provenance: {
        source: 'cesium-bridge',
        method: 'layer-manager',
      },
    })
  }

  for (const entity of scene.entities) {
    if (auxiliaryEntityIds.has(entity.entityId)) continue
    let details: EntityPropertiesResult
    try {
      details = bridge.getEntityProperties({ entityId: entity.entityId })
    } catch {
      continue
    }
    const layer = layerByEntity.get(entity.entityId)
    const extracted = geometryFromEntity(details)
    objects.push({
      objectId: objectId('entity', layer?.id ?? 'viewer', entity.entityId),
      sourceType: sourceTypeForLayer(bridge, layer),
      type: semanticType(details),
      ...(typeof details.name === 'string' ? { name: details.name } : {}),
      ...(layer ? { layerId: layer.id } : {}),
      ...(layer?.dataRefId ? { resourceId: layer.dataRefId } : {}),
      ...(extracted.geometry ? { geometry: extracted.geometry } : {}),
      properties: {
        ...details.properties,
        cesiumType: details.type,
        graphic: details.graphicProperties,
        ...(details.description ? { description: details.description } : {}),
      },
      geometryQuality: extracted.quality,
      observedAt: scene.timestamp,
      revision: 0,
      provenance: {
        source: layer?.id ?? 'viewer.entities',
        method: extracted.method,
      },
    })
  }

  const revision = snapshotRevision(bridge, objects)
  const context = createSpatialContext(objects.map(object => ({
    ...object,
    revision,
  })))
  return {
    context,
    view: scene.view,
    observedAt: scene.timestamp,
    snapshotRevision: revision,
    readiness: sceneReadiness(bridge, scene.layers),
    ...viewRectangle(bridge),
  }
}

export function nearbySpatialObjects(
  context: SpatialContext,
  object: SpatialObject,
  radiusMeters: number,
  limit: number,
): NearbySpatialObject[] {
  if (!object.centroid || limit <= 0) return []
  return context.query({
    near: {
      longitude: object.centroid[0],
      latitude: object.centroid[1],
      radiusMeters,
    },
    limit: 500,
  })
    .filter(candidate => candidate.objectId !== object.objectId && candidate.centroid)
    .map(candidate => ({
      object: candidate,
      distanceMeters: haversineDistanceMeters(object.centroid!, candidate.centroid!),
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, limit)
}
