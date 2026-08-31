import {
  boundsContain,
  boundsIntersect,
  geometryBounds,
  geometryCentroid,
  haversineDistanceMeters,
  mergeBounds,
  pointInPolygon,
} from './geometry.js'
import type {
  SpatialBounds,
  SpatialContext,
  SpatialContextSummary,
  SpatialEvidenceQuality,
  SpatialObject,
  SpatialObjectQuery,
  SpatialRelation,
  SpatialRelationOptions,
  SpatialRelationResult,
} from './types.js'

function normalizedObject(object: SpatialObject): SpatialObject {
  const bbox = object.bbox ?? (object.geometry ? geometryBounds(object.geometry) : undefined)
  const centroid = object.centroid ?? (object.geometry ? geometryCentroid(object.geometry) : undefined)
  return {
    ...object,
    ...(bbox ? { bbox } : {}),
    ...(centroid ? { centroid } : {}),
  }
}

function relationQuality(
  subject: SpatialObject,
  object: SpatialObject,
  fallback: SpatialEvidenceQuality,
): SpatialEvidenceQuality {
  if (subject.geometryQuality === 'unknown' || object.geometryQuality === 'unknown') {
    return fallback === 'exact' ? 'derived' : fallback
  }
  if (subject.geometryQuality === 'exact' && object.geometryQuality === 'exact') return fallback
  return fallback === 'exact' ? 'derived' : fallback
}

export function createSpatialContext(
  initialObjects: readonly SpatialObject[] = [],
  now: () => Date = () => new Date(),
): SpatialContext {
  const objects = new Map<string, SpatialObject>()
  let revision = 0

  function replace(nextObjects: readonly SpatialObject[]): void {
    objects.clear()
    for (const object of nextObjects) objects.set(object.objectId, normalizedObject(object))
    revision += 1
  }

  function query(input: SpatialObjectQuery = {}): SpatialObject[] {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 500))
    const name = input.name?.toLocaleLowerCase()
    const results: SpatialObject[] = []
    for (const object of objects.values()) {
      if (name && !object.name?.toLocaleLowerCase().includes(name)) continue
      if (input.types && !input.types.includes(object.type)) continue
      if (input.sourceTypes && !input.sourceTypes.includes(object.sourceType)) continue
      if (input.layerId && object.layerId !== input.layerId) continue
      if (input.bbox && (!object.bbox || !boundsIntersect(object.bbox, input.bbox))) continue
      if (input.near) {
        if (!object.centroid) continue
        const distance = haversineDistanceMeters(
          object.centroid,
          [input.near.longitude, input.near.latitude],
        )
        if (distance > input.near.radiusMeters) continue
      }
      if (input.propertyEquals) {
        const matches = Object.entries(input.propertyEquals)
          .every(([key, value]) => Object.is(object.properties[key], value))
        if (!matches) continue
      }
      results.push(object)
      if (results.length >= limit) break
    }
    return results
  }

  function describe(): SpatialContextSummary {
    const countsBySource: Record<string, number> = {}
    const countsByType: Record<string, number> = {}
    let bounds: SpatialBounds | undefined
    for (const object of objects.values()) {
      countsBySource[object.sourceType] = (countsBySource[object.sourceType] ?? 0) + 1
      countsByType[object.type] = (countsByType[object.type] ?? 0) + 1
      bounds = mergeBounds(bounds, object.bbox)
    }
    return {
      objectCount: objects.size,
      countsBySource,
      countsByType,
      ...(bounds ? { bounds } : {}),
      revision,
    }
  }

  function relate(
    subjectId: string,
    objectId: string,
    relation: SpatialRelation,
    options: SpatialRelationOptions = {},
  ): SpatialRelationResult {
    const subject = objects.get(subjectId)
    const object = objects.get(objectId)
    if (!subject) throw new Error(`Spatial object not found: ${subjectId}`)
    if (!object) throw new Error(`Spatial object not found: ${objectId}`)

    let value: boolean | number | null = null
    let quality: SpatialEvidenceQuality = 'unknown'
    let basis = 'insufficient-geometry'
    let unit: 'meters' | undefined

    if (relation === 'distance' || relation === 'near') {
      if (subject.centroid && object.centroid) {
        const distance = haversineDistanceMeters(subject.centroid, object.centroid)
        const usesExactPoints = subject.geometry?.type === 'Point' &&
          object.geometry?.type === 'Point'
        value = relation === 'distance'
          ? distance
          : distance <= (options.nearThresholdMeters ?? 1000)
        unit = relation === 'distance' ? 'meters' : undefined
        quality = relationQuality(subject, object, usesExactPoints ? 'exact' : 'derived')
        basis = usesExactPoints
          ? 'geodesic-point'
          : 'geodesic-centroid'
      }
    } else if (subject.geometry?.type === 'Point' && object.geometry?.type === 'Polygon') {
      const contained = pointInPolygon(subject.geometry.coordinates, object.geometry)
      if (relation === 'within' || relation === 'intersects') value = contained
      else if (relation === 'contains') value = false
      quality = relationQuality(subject, object, 'exact')
      basis = 'point-in-polygon'
    } else if (subject.geometry?.type === 'Polygon' && object.geometry?.type === 'Point') {
      const contained = pointInPolygon(object.geometry.coordinates, subject.geometry)
      if (relation === 'contains' || relation === 'intersects') value = contained
      else if (relation === 'within') value = false
      quality = relationQuality(subject, object, 'exact')
      basis = 'point-in-polygon'
    } else if (subject.bbox && object.bbox) {
      const intersects = boundsIntersect(subject.bbox, object.bbox)
      const subjectWithinObject = boundsContain(object.bbox, subject.bbox)
      const subjectContainsObject = boundsContain(subject.bbox, object.bbox)
      if (relation === 'intersects') value = intersects
      if (relation === 'within') value = subjectWithinObject
      if (relation === 'contains') value = subjectContainsObject
      if (relation === 'overlaps') {
        value = intersects && !subjectWithinObject && !subjectContainsObject
      }
      quality = 'approximate'
      basis = 'bounding-box'
    }

    return {
      subjectId,
      objectId,
      relation,
      value,
      ...(unit ? { unit } : {}),
      quality,
      basis,
      subjectRevision: subject.revision,
      objectRevision: object.revision,
      observedAt: now().toISOString(),
    }
  }

  replace(initialObjects)

  return {
    replace,
    upsert(object) {
      objects.set(object.objectId, normalizedObject(object))
      revision += 1
    },
    remove(objectId) {
      const removed = objects.delete(objectId)
      if (removed) revision += 1
      return removed
    },
    get(objectId) {
      return objects.get(objectId)
    },
    list() {
      return [...objects.values()]
    },
    query,
    describe,
    relate,
  }
}
