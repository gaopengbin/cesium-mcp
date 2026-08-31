import type {
  SpatialCoordinate,
  SpatialGeometry,
  SpatialObject,
} from '../types.js'
import type {
  AuthoritativeRegionState,
  AuthoritativeWorldState,
} from './types.js'

export interface CreateAuthoritativeWorldStateInput {
  worldId: string
  revision: number
  capturedAt: string
  objects?: readonly SpatialObject[]
  regions?: readonly AuthoritativeRegionState[]
}

const spatialSourceTypes = new Set([
  'entity',
  'layer',
  'geojson',
  'czml',
  'tileset-feature',
])

const evidenceQualities = new Set([
  'exact',
  'derived',
  'approximate',
  'unknown',
])

/**
 * Create one canonical snapshot of the world truth available to the runtime.
 * Caller-owned objects are defensively copied before any normalization.
 */
export function createAuthoritativeWorldState(
  input: CreateAuthoritativeWorldStateInput,
): AuthoritativeWorldState {
  const candidate: AuthoritativeWorldState = {
    schemaVersion: 1,
    worldId: input.worldId,
    revision: input.revision,
    capturedAt: input.capturedAt,
    objects: [...(input.objects ?? [])],
    regions: [...(input.regions ?? [])],
  }
  validateAuthoritativeWorldState(candidate)

  const objects = candidate.objects
    .map(object => cloneValue(object))
    .sort((left, right) => compareId(left.objectId, right.objectId))
  const regions = candidate.regions
    .map((state): AuthoritativeRegionState => {
      const cloned = cloneValue(state)
      if (!cloned.modeled) return cloned
      return {
        ...cloned,
        blockingObjectIds: [...cloned.blockingObjectIds].sort(compareId),
      }
    })
    .sort((left, right) => compareId(left.region.regionId, right.region.regionId))

  return {
    schemaVersion: 1,
    worldId: candidate.worldId,
    revision: candidate.revision,
    capturedAt: candidate.capturedAt,
    objects,
    regions,
  }
}

/**
 * Validate a world-truth snapshot without treating it as agent knowledge.
 * `modeled: false` means the truth source has no model for a region; it is not
 * the same state as an agent belief whose occupancy is `unknown`.
 */
export function validateAuthoritativeWorldState(value: unknown): AuthoritativeWorldState {
  const state = requireRecord(value, 'Authoritative world state')
  if (state.schemaVersion !== 1) {
    throw new Error('Authoritative world state schemaVersion must be 1')
  }
  requireNonEmptyString(state.worldId, 'worldId')
  requireNonNegativeInteger(state.revision, 'revision')
  requireTimestamp(state.capturedAt, 'capturedAt')

  if (!Array.isArray(state.objects)) {
    throw new Error('Authoritative world state objects must be an array')
  }
  if (!Array.isArray(state.regions)) {
    throw new Error('Authoritative world state regions must be an array')
  }

  const objectIds = new Set<string>()
  for (const [index, object] of state.objects.entries()) {
    validateSpatialObject(object, `objects[${index}]`)
    const objectId = (object as SpatialObject).objectId
    if (objectIds.has(objectId)) {
      throw new Error(`Duplicate objectId in authoritative world state: ${objectId}`)
    }
    objectIds.add(objectId)
  }

  const regionIds = new Set<string>()
  for (const [index, region] of state.regions.entries()) {
    validateAuthoritativeRegionState(region, `regions[${index}]`, objectIds)
    const regionId = (region as AuthoritativeRegionState).region.regionId
    if (regionIds.has(regionId)) {
      throw new Error(`Duplicate regionId in authoritative world state: ${regionId}`)
    }
    regionIds.add(regionId)
  }

  return value as AuthoritativeWorldState
}

function validateSpatialObject(value: unknown, path: string): void {
  const object = requireRecord(value, path)
  requireNonEmptyString(object.objectId, `${path}.objectId`)
  requireNonEmptyString(object.type, `${path}.type`)
  if (!spatialSourceTypes.has(String(object.sourceType))) {
    throw new Error(`${path}.sourceType is invalid`)
  }
  if (!evidenceQualities.has(String(object.geometryQuality))) {
    throw new Error(`${path}.geometryQuality is invalid`)
  }
  requireTimestamp(object.observedAt, `${path}.observedAt`)
  requireNonNegativeInteger(object.revision, `${path}.revision`)
  requireRecord(object.properties, `${path}.properties`)

  const provenance = requireRecord(object.provenance, `${path}.provenance`)
  requireNonEmptyString(provenance.source, `${path}.provenance.source`)
  requireNonEmptyString(provenance.method, `${path}.provenance.method`)

  if (object.geometry !== undefined) validateGeometry(object.geometry, `${path}.geometry`)
  if (object.centroid !== undefined) validateCoordinate(object.centroid, `${path}.centroid`)
  if (object.bbox !== undefined) {
    if (!Array.isArray(object.bbox) || object.bbox.length !== 4) {
      throw new Error(`${path}.bbox must contain four finite numbers`)
    }
    for (const coordinate of object.bbox) {
      if (!isFiniteNumber(coordinate)) {
        throw new Error(`${path}.bbox must contain four finite numbers`)
      }
    }
  }
}

function validateAuthoritativeRegionState(
  value: unknown,
  path: string,
  objectIds: ReadonlySet<string>,
): void {
  const state = requireRecord(value, path)
  validateSpatialRegion(state.region, `${path}.region`)
  requireNonNegativeInteger(state.revision, `${path}.revision`)
  requireTimestamp(state.changedAt, `${path}.changedAt`)

  if (state.modeled === true) {
    if (state.occupancy !== 'free' && state.occupancy !== 'occupied') {
      throw new Error(`${path} with modeled=true must use free or occupied occupancy`)
    }
    if ('reason' in state) {
      throw new Error(`${path} with modeled=true must not define an unmodeled reason`)
    }
    if (!Array.isArray(state.blockingObjectIds)) {
      throw new Error(`${path}.blockingObjectIds must be an array`)
    }

    const blockingIds = new Set<string>()
    for (const [index, objectId] of state.blockingObjectIds.entries()) {
      requireNonEmptyString(objectId, `${path}.blockingObjectIds[${index}]`)
      if (blockingIds.has(objectId)) {
        throw new Error(`${path}.blockingObjectIds contains duplicate objectId: ${objectId}`)
      }
      if (!objectIds.has(objectId)) {
        throw new Error(`${path} references unknown blocking object: ${objectId}`)
      }
      blockingIds.add(objectId)
    }
    if (state.occupancy === 'free' && state.blockingObjectIds.length > 0) {
      throw new Error(`${path} with free occupancy cannot define blockingObjectIds`)
    }
    return
  }

  if (state.modeled === false) {
    requireNonEmptyString(state.reason, `${path}.reason`)
    if ('occupancy' in state) {
      throw new Error(`${path} with modeled=false must not define occupancy`)
    }
    if ('blockingObjectIds' in state) {
      throw new Error(`${path} with modeled=false must not define blockingObjectIds`)
    }
    return
  }

  throw new Error(`${path}.modeled must be true or false`)
}

function validateSpatialRegion(value: unknown, path: string): void {
  const region = requireRecord(value, path)
  requireNonEmptyString(region.regionId, `${path}.regionId`)
  validateGeometry(region.footprint, `${path}.footprint`, 'Polygon')
  if (region.minHeight !== undefined && !isFiniteNumber(region.minHeight)) {
    throw new Error(`${path}.minHeight must be finite`)
  }
  if (region.maxHeight !== undefined && !isFiniteNumber(region.maxHeight)) {
    throw new Error(`${path}.maxHeight must be finite`)
  }
  if (
    isFiniteNumber(region.minHeight)
    && isFiniteNumber(region.maxHeight)
    && region.minHeight > region.maxHeight
  ) {
    throw new Error(`${path}.minHeight must not exceed maxHeight`)
  }
  if (region.properties !== undefined) requireRecord(region.properties, `${path}.properties`)
}

function validateGeometry(
  value: unknown,
  path: string,
  requiredType?: SpatialGeometry['type'],
): void {
  const geometry = requireRecord(value, path)
  if (requiredType && geometry.type !== requiredType) {
    throw new Error(`${path}.type must be ${requiredType}`)
  }

  if (geometry.type === 'Point') {
    validateCoordinate(geometry.coordinates, `${path}.coordinates`)
    return
  }
  if (geometry.type === 'LineString') {
    validateCoordinateList(geometry.coordinates, `${path}.coordinates`, 2)
    return
  }
  if (geometry.type === 'Polygon') {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new Error(`${path}.coordinates must contain at least one polygon ring`)
    }
    for (const [index, ring] of geometry.coordinates.entries()) {
      validateCoordinateList(ring, `${path}.coordinates[${index}]`, 4)
    }
    return
  }
  throw new Error(`${path}.type is invalid`)
}

function validateCoordinateList(value: unknown, path: string, minimum: number): void {
  if (!Array.isArray(value) || value.length < minimum) {
    throw new Error(`${path} must contain at least ${minimum} coordinates`)
  }
  for (const [index, coordinate] of value.entries()) {
    validateCoordinate(coordinate, `${path}[${index}]`)
  }
}

function validateCoordinate(value: unknown, path: string): asserts value is SpatialCoordinate {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) {
    throw new Error(`${path} must be a two- or three-dimensional coordinate`)
  }
  if (!value.every(isFiniteNumber)) {
    throw new Error(`${path} must contain finite numbers`)
  }
  const longitude = value[0]!
  const latitude = value[1]!
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new Error(`${path} longitude or latitude is out of range`)
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`)
  }
}

function requireNonNegativeInteger(value: unknown, path: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${path} must be a non-negative integer`)
  }
}

function requireTimestamp(value: unknown, path: string): asserts value is string {
  requireNonEmptyString(value, path)
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${path} must be a valid timestamp`)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function compareId(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function cloneValue<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (!value || typeof value !== 'object') return value
  const existing = seen.get(value)
  if (existing) return existing as T
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (Array.isArray(value)) {
    const cloned: unknown[] = []
    seen.set(value, cloned)
    for (const item of value) cloned.push(cloneValue(item, seen))
    return cloned as T
  }

  const cloned: Record<string, unknown> = {}
  seen.set(value, cloned)
  for (const [key, nested] of Object.entries(value)) {
    cloned[key] = cloneValue(nested, seen)
  }
  return cloned as T
}
