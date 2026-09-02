import type { SpatialObject } from '../types.js'
import type {
  ObservationCoverage,
  ObservationReadiness,
  ObservationSensor,
  SpatialRegion,
  UnknownReason,
  WorldEvidence,
  WorldObservation,
} from './types.js'

export interface NormalizedImageBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export type VisualObjectVisibility = 'visible' | 'not-visible' | 'uncertain'

export interface VisualObjectGrounding {
  objectId: string
  visibility: VisualObjectVisibility
  confidence: number
  bbox?: NormalizedImageBoundingBox
}

export type VisualRegionOccupancy = 'occupied' | 'clear' | 'unknown'

export interface VisualRegionGrounding {
  regionId: string
  occupancy: VisualRegionOccupancy
  coverage: ObservationCoverage
  confidence: number
  bbox?: NormalizedImageBoundingBox
  blockingObjectIds?: string[]
}

export interface VisualGroundingReport {
  schemaVersion: 1
  imageDigest: string
  objects: VisualObjectGrounding[]
  regions: VisualRegionGrounding[]
  limitations: string[]
}

export interface CreateVisualGroundingObservationInput {
  observationId: string
  worldId: string
  worldRevision: number
  startedAt: string
  capturedAt: string
  completedAt: string
  changedDuringObservation: boolean
  readiness: ObservationReadiness
  sensor: ObservationSensor
  imageDigest: string
  artifactRef: string
  requestedObjectIds: readonly string[]
  requestedRegionIds: readonly string[]
  spatialObjects: readonly SpatialObject[]
  spatialRegions: readonly SpatialRegion[]
  report: unknown
  limitations?: readonly string[]
}

const digestPattern = /^sha256:[a-f\d]{64}$/i
const persistentArtifactRefPattern = /^(?:artifact|cas|ipfs):\/\/[^\s]+$/i

const reportKeys = [
  'schemaVersion',
  'imageDigest',
  'objects',
  'regions',
  'limitations',
] as const
const objectGroundingKeys = [
  'objectId',
  'visibility',
  'confidence',
  'bbox',
] as const
const regionGroundingKeys = [
  'regionId',
  'occupancy',
  'coverage',
  'confidence',
  'bbox',
  'blockingObjectIds',
] as const
const bboxKeys = ['x', 'y', 'width', 'height'] as const

/**
 * Converts a camera artifact and an untrusted visual-model report into
 * conservative world evidence. Negative visual evidence never proves that a
 * region is free.
 */
export function createVisualGroundingObservation(
  input: CreateVisualGroundingObservationInput,
): WorldObservation {
  validateObservationInput(input)

  const imageDigest = normalizeDigest(input.imageDigest, 'Image digest')
  const report = parseVisualGroundingReport(input.report)
  if (normalizeDigest(report.imageDigest, 'Report image digest') !== imageDigest) {
    throw new Error('Visual grounding report image digest does not match the captured artifact')
  }

  const objectsById = indexSpatialObjects(input.spatialObjects)
  const regionsById = indexSpatialRegions(input.spatialRegions)
  const requestedObjectIds = uniqueRequestedIds(
    input.requestedObjectIds,
    objectsById,
    'object',
  )
  const requestedRegionIds = uniqueRequestedIds(
    input.requestedRegionIds,
    regionsById,
    'region',
  )
  const requestedObjectIdSet = new Set(requestedObjectIds)
  const requestedRegionIdSet = new Set(requestedRegionIds)

  validateReportReferences(
    report,
    requestedObjectIdSet,
    requestedRegionIdSet,
    objectsById,
  )

  const evidence: WorldEvidence[] = [artifactEvidence(
    input,
    imageDigest,
    requestedRegionIds,
  )]
  const groundedObjects = new Map(report.objects.map(item => [item.objectId, item]))
  const groundedRegions = new Map(report.regions.map(item => [item.regionId, item]))

  for (const objectId of requestedObjectIds) {
    const grounding = groundedObjects.get(objectId)
    if (grounding?.visibility !== 'visible') continue
    const object = objectsById.get(objectId)!
    evidence.push({
      kind: 'object',
      evidenceId: deterministicEvidenceId(input, imageDigest, 'object', objectId),
      sensorId: input.sensor.sensorId,
      sampledAt: input.capturedAt,
      quality: 'approximate',
      confidence: grounding.confidence,
      basis: `Visual model grounded local object '${objectId}' at normalized bbox ${formatBbox(grounding.bbox!)}`,
      limitations: ['Visual recognition is approximate and does not replace geometric verification.'],
      object: cloneSpatialObject(object),
    })
  }

  for (const regionId of requestedRegionIds) {
    const grounding = groundedRegions.get(regionId)
    const region = regionsById.get(regionId)!
    evidence.push(regionEvidence(input, imageDigest, region, grounding))
  }

  const limitations = uniqueSorted([
    ...(input.limitations ?? []),
    ...report.limitations,
    'Visual absence, clear classification, and not-visible classifications do not prove free space.',
    ...(input.changedDuringObservation
      ? ['The world revision changed during visual observation.']
      : []),
    ...(input.readiness !== 'ready'
      ? [`Image readiness was ${input.readiness}; evidence must be treated conservatively.`]
      : []),
  ])

  return {
    schemaVersion: 1,
    observationId: input.observationId,
    worldId: input.worldId,
    worldRevision: input.worldRevision,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    changedDuringObservation: input.changedDuringObservation,
    readiness: input.readiness,
    sensors: [cloneSensor(input.sensor)],
    evidence,
    limitations,
  }
}

/** Parses the exact JSON schema accepted from a visual model. */
export function parseVisualGroundingReport(value: unknown): VisualGroundingReport {
  const report = strictRecord(value, reportKeys, 'Visual grounding report')
  if (report.schemaVersion !== 1) {
    throw new Error('Visual grounding report schemaVersion must be 1')
  }
  const imageDigest = normalizeDigest(report.imageDigest, 'Report image digest')
  const objects = parseArray(report.objects, 'Visual grounding report objects')
    .map((item, index) => parseObjectGrounding(item, index))
  const regions = parseArray(report.regions, 'Visual grounding report regions')
    .map((item, index) => parseRegionGrounding(item, index))
  const limitations = parseStringArray(
    report.limitations,
    'Visual grounding report limitations',
  )

  assertUnique(objects.map(item => item.objectId), 'visual object grounding ID')
  assertUnique(regions.map(item => item.regionId), 'visual region grounding ID')

  return {
    schemaVersion: 1,
    imageDigest,
    objects: objects.sort((left, right) => left.objectId.localeCompare(right.objectId)),
    regions: regions.sort((left, right) => left.regionId.localeCompare(right.regionId)),
    limitations: uniqueSorted(limitations),
  }
}

function artifactEvidence(
  input: CreateVisualGroundingObservationInput,
  imageDigest: string,
  requestedRegionIds: readonly string[],
): Extract<WorldEvidence, { kind: 'artifact' }> {
  return {
    kind: 'artifact',
    evidenceId: deterministicEvidenceId(input, imageDigest, 'artifact', imageDigest),
    sensorId: input.sensor.sensorId,
    sampledAt: input.capturedAt,
    quality: 'exact',
    confidence: 1,
    basis: `Independent camera image captured with digest ${imageDigest}`,
    artifactType: 'image',
    artifactRef: input.artifactRef,
    relatedRegionIds: [...requestedRegionIds],
  }
}

function regionEvidence(
  input: CreateVisualGroundingObservationInput,
  imageDigest: string,
  region: SpatialRegion,
  grounding: VisualRegionGrounding | undefined,
): Extract<WorldEvidence, { kind: 'region-occupancy' }> {
  const regionId = region.regionId
  const evidenceId = deterministicEvidenceId(input, imageDigest, 'region', regionId)
  if (!grounding) {
    return {
      kind: 'region-occupancy',
      evidenceId,
      sensorId: input.sensor.sensorId,
      sampledAt: input.capturedAt,
      quality: 'unknown',
      confidence: 0,
      basis: `Visual model returned no grounding for requested region '${regionId}'`,
      limitations: ['A missing visual detection cannot prove that a region is free.'],
      region: cloneRegion(region),
      occupancy: 'unknown',
      coverage: 'partial',
      unknownReason: 'not-observed',
    }
  }

  if (grounding.occupancy === 'occupied') {
    return {
      kind: 'region-occupancy',
      evidenceId,
      sensorId: input.sensor.sensorId,
      sampledAt: input.capturedAt,
      quality: 'approximate',
      confidence: grounding.confidence,
      basis: grounding.bbox
        ? `Visual model reported occupied region '${regionId}' at normalized bbox ${formatBbox(grounding.bbox)}`
        : `Visual model reported occupied region '${regionId}'`,
      limitations: ['Positive visual occupancy remains approximate until geometrically verified.'],
      region: cloneRegion(region),
      occupancy: 'occupied',
      coverage: grounding.coverage,
      blockingObjectIds: [...(grounding.blockingObjectIds ?? [])],
    }
  }

  const isClear = grounding.occupancy === 'clear'
  return {
    kind: 'region-occupancy',
    evidenceId,
    sensorId: input.sensor.sensorId,
    sampledAt: input.capturedAt,
    quality: isClear ? 'approximate' : 'unknown',
    confidence: 0,
    basis: isClear
      ? `Visual model reported region '${regionId}' as clear; negative visual evidence was conservatively downgraded to unknown`
      : `Visual model could not determine occupancy for region '${regionId}'`,
    limitations: ['Negative visual evidence cannot prove that a region is free.'],
    region: cloneRegion(region),
    occupancy: 'unknown',
    coverage: grounding.coverage,
    unknownReason: isClear
      ? 'insufficient-coverage'
      : unknownReasonForCoverage(grounding.coverage),
  }
}

function parseObjectGrounding(value: unknown, index: number): VisualObjectGrounding {
  const label = `Visual object grounding at index ${index}`
  const item = strictRecord(value, objectGroundingKeys, label)
  const objectId = boundedNonEmptyString(item.objectId, `${label} objectId`)
  const visibility = enumValue(
    item.visibility,
    ['visible', 'not-visible', 'uncertain'] as const,
    `${label} visibility`,
  )
  const confidence = unitInterval(item.confidence, `${label} confidence`)
  const bbox = item.bbox === undefined ? undefined : parseBbox(item.bbox, `${label} bbox`)
  if (visibility === 'visible' && !bbox) {
    throw new Error(`${label} must include bbox when visibility is visible`)
  }
  if (visibility !== 'visible' && bbox) {
    throw new Error(`${label} must not include bbox unless visibility is visible`)
  }
  return {
    objectId,
    visibility,
    confidence,
    ...(bbox ? { bbox } : {}),
  }
}

function parseRegionGrounding(value: unknown, index: number): VisualRegionGrounding {
  const label = `Visual region grounding at index ${index}`
  const item = strictRecord(value, regionGroundingKeys, label)
  const regionId = boundedNonEmptyString(item.regionId, `${label} regionId`)
  const occupancy = enumValue(
    item.occupancy,
    ['occupied', 'clear', 'unknown'] as const,
    `${label} occupancy`,
  )
  const coverage = enumValue(
    item.coverage,
    ['complete', 'partial', 'occluded', 'unavailable'] as const,
    `${label} coverage`,
  )
  const confidence = unitInterval(item.confidence, `${label} confidence`)
  const bbox = item.bbox === undefined ? undefined : parseBbox(item.bbox, `${label} bbox`)
  const blockingObjectIds = item.blockingObjectIds === undefined
    ? undefined
    : parseStringArray(item.blockingObjectIds, `${label} blockingObjectIds`)
  if (blockingObjectIds) assertUnique(blockingObjectIds, `${label} blocking object ID`)
  if (occupancy !== 'occupied' && blockingObjectIds?.length) {
    throw new Error(`${label} blockingObjectIds are only valid for occupied regions`)
  }
  return {
    regionId,
    occupancy,
    coverage,
    confidence,
    ...(bbox ? { bbox } : {}),
    ...(blockingObjectIds ? { blockingObjectIds: [...blockingObjectIds].sort() } : {}),
  }
}

function validateObservationInput(input: CreateVisualGroundingObservationInput): void {
  boundedNonEmptyString(input.observationId, 'Observation ID')
  boundedNonEmptyString(input.worldId, 'World ID')
  if (!Number.isInteger(input.worldRevision) || input.worldRevision < 1) {
    throw new Error('World revision must be a positive integer')
  }
  const startedAt = isoTime(input.startedAt, 'Observation start time')
  const capturedAt = isoTime(input.capturedAt, 'Image capture time')
  const completedAt = isoTime(input.completedAt, 'Observation completion time')
  if (startedAt > capturedAt || capturedAt > completedAt) {
    throw new Error('Image capture time must be within the observation interval')
  }
  if (typeof input.changedDuringObservation !== 'boolean') {
    throw new Error('changedDuringObservation must be a boolean')
  }
  enumValue(
    input.readiness,
    ['ready', 'partial', 'loading', 'unknown'] as const,
    'Observation readiness',
  )
  if (input.sensor.kind !== 'camera') {
    throw new Error('Visual grounding requires a camera sensor')
  }
  boundedNonEmptyString(input.sensor.sensorId, 'Camera sensor ID')
  validateArtifactRef(input.artifactRef)
  normalizeDigest(input.imageDigest, 'Image digest')
  for (const limitation of input.limitations ?? []) {
    boundedNonEmptyString(limitation, 'Observation limitation', 1000)
  }
}

function validateReportReferences(
  report: VisualGroundingReport,
  requestedObjectIds: ReadonlySet<string>,
  requestedRegionIds: ReadonlySet<string>,
  objectsById: ReadonlyMap<string, SpatialObject>,
): void {
  const visiblyGroundedObjectIds = new Set(
    report.objects
      .filter(item => item.visibility === 'visible')
      .map(item => item.objectId),
  )
  for (const item of report.objects) {
    if (!requestedObjectIds.has(item.objectId) || !objectsById.has(item.objectId)) {
      throw new Error(`Visual grounding report references unknown or unrequested object ID: ${item.objectId}`)
    }
  }
  for (const item of report.regions) {
    if (!requestedRegionIds.has(item.regionId)) {
      throw new Error(`Visual grounding report references unknown or unrequested region ID: ${item.regionId}`)
    }
    for (const objectId of item.blockingObjectIds ?? []) {
      if (!requestedObjectIds.has(objectId) || !objectsById.has(objectId)) {
        throw new Error(`Visual grounding report references unknown blocking object ID: ${objectId}`)
      }
      if (!visiblyGroundedObjectIds.has(objectId)) {
        throw new Error(`Visual grounding report blocking object is not visibly grounded: ${objectId}`)
      }
    }
  }
}

function indexSpatialObjects(objects: readonly SpatialObject[]): Map<string, SpatialObject> {
  const result = new Map<string, SpatialObject>()
  for (const object of objects) {
    const objectId = boundedNonEmptyString(object.objectId, 'Local spatial object ID')
    if (result.has(objectId)) throw new Error(`Duplicate local spatial object ID: ${objectId}`)
    result.set(objectId, object)
  }
  return result
}

function indexSpatialRegions(regions: readonly SpatialRegion[]): Map<string, SpatialRegion> {
  const result = new Map<string, SpatialRegion>()
  for (const region of regions) {
    const regionId = boundedNonEmptyString(region.regionId, 'Local spatial region ID')
    if (result.has(regionId)) throw new Error(`Duplicate local spatial region ID: ${regionId}`)
    result.set(regionId, region)
  }
  return result
}

function uniqueRequestedIds<T>(
  ids: readonly string[],
  localValues: ReadonlyMap<string, T>,
  kind: 'object' | 'region',
): string[] {
  const normalized = ids.map(id => boundedNonEmptyString(id, `Requested ${kind} ID`))
  assertUnique(normalized, `requested ${kind} ID`)
  for (const id of normalized) {
    if (!localValues.has(id)) throw new Error(`Requested unknown ${kind} ID: ${id}`)
  }
  return [...normalized].sort()
}

function parseBbox(value: unknown, label: string): NormalizedImageBoundingBox {
  const bbox = strictRecord(value, bboxKeys, label)
  const x = unitInterval(bbox.x, `${label} x`)
  const y = unitInterval(bbox.y, `${label} y`)
  const width = unitInterval(bbox.width, `${label} width`, false)
  const height = unitInterval(bbox.height, `${label} height`, false)
  if (x + width > 1 + Number.EPSILON || y + height > 1 + Number.EPSILON) {
    throw new Error(`${label} must fit within normalized image coordinates`)
  }
  return { x, y, width, height }
}

function strictRecord<K extends string>(
  value: unknown,
  allowedKeys: readonly K[],
  label: string,
): Record<K, unknown> {
  if (!isPlainRecord(value)) throw new Error(`${label} must be a plain object`)
  const allowed = new Set<string>(allowedKeys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown field: ${key}`)
  }
  return value as Record<K, unknown>
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function parseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function parseStringArray(value: unknown, label: string): string[] {
  return parseArray(value, label).map((item, index) => (
    boundedNonEmptyString(item, `${label} at index ${index}`, 1000)
  ))
}

function boundedNonEmptyString(
  value: unknown,
  label: string,
  maximumLength = 256,
): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`)
  }
  if (value !== value.trim()) throw new Error(`${label} must not contain surrounding whitespace`)
  if (value.length > maximumLength) throw new Error(`${label} exceeds maximum length`)
  return value
}

function unitInterval(value: unknown, label: string, allowZero = true): number {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < (allowZero ? 0 : Number.MIN_VALUE)
    || value > 1
  ) {
    throw new Error(`${label} must be a finite number ${allowZero ? 'between 0 and 1' : 'greater than 0 and at most 1'}`)
  }
  return value
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  values: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new Error(`${label} must be one of: ${values.join(', ')}`)
  }
  return value as T[number]
}

function normalizeDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !digestPattern.test(value)) {
    throw new Error(`${label} must use sha256:<64 hexadecimal characters>`)
  }
  return value.toLowerCase()
}

function validateArtifactRef(value: unknown): asserts value is string {
  const artifactRef = boundedNonEmptyString(value, 'Artifact reference', 2048)
  if (/^data:/i.test(artifactRef) || /;base64,/i.test(artifactRef)) {
    throw new Error('Artifact reference must not contain a data URL or base64 image payload')
  }
  if (!digestPattern.test(artifactRef) && !persistentArtifactRefPattern.test(artifactRef)) {
    throw new Error('Artifact reference must be a SHA-256 digest or persistent artifact URI')
  }
}

function isoTime(value: unknown, label: string): number {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be an ISO timestamp`)
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO timestamp`)
  return timestamp
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`)
    seen.add(value)
  }
}

function deterministicEvidenceId(
  input: CreateVisualGroundingObservationInput,
  imageDigest: string,
  kind: 'artifact' | 'object' | 'region',
  targetId: string,
): string {
  return `visual:${kind}:${fnv1a([
    input.observationId,
    input.worldId,
    String(input.worldRevision),
    imageDigest,
    kind,
    targetId,
  ].join('|'))}`
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function unknownReasonForCoverage(coverage: ObservationCoverage): UnknownReason {
  if (coverage === 'occluded') return 'occluded'
  if (coverage === 'unavailable') return 'sensor-unavailable'
  if (coverage === 'partial') return 'insufficient-coverage'
  return 'not-observed'
}

function formatBbox(bbox: NormalizedImageBoundingBox): string {
  return `[${bbox.x},${bbox.y},${bbox.width},${bbox.height}]`
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

function cloneSensor(sensor: ObservationSensor): ObservationSensor {
  return {
    ...sensor,
    ...(sensor.pose
      ? {
          pose: {
            ...sensor.pose,
            position: [...sensor.pose.position] as typeof sensor.pose.position,
          },
        }
      : {}),
  }
}

function cloneRegion(region: SpatialRegion): SpatialRegion {
  return {
    regionId: region.regionId,
    footprint: {
      type: 'Polygon',
      coordinates: region.footprint.coordinates.map(ring => (
        ring.map(coordinate => [...coordinate] as typeof coordinate)
      )),
    },
    ...(region.minHeight !== undefined ? { minHeight: region.minHeight } : {}),
    ...(region.maxHeight !== undefined ? { maxHeight: region.maxHeight } : {}),
    ...(region.properties ? { properties: { ...region.properties } } : {}),
  }
}

function cloneSpatialObject(object: SpatialObject): SpatialObject {
  return {
    ...object,
    ...(object.geometry ? { geometry: cloneGeometry(object.geometry) } : {}),
    ...(object.centroid ? { centroid: [...object.centroid] as typeof object.centroid } : {}),
    ...(object.bbox ? { bbox: [...object.bbox] as typeof object.bbox } : {}),
    properties: { ...object.properties },
    provenance: { ...object.provenance },
  }
}

function cloneGeometry(
  geometry: NonNullable<SpatialObject['geometry']>,
): NonNullable<SpatialObject['geometry']> {
  if (geometry.type === 'Point') {
    return { type: 'Point', coordinates: [...geometry.coordinates] as typeof geometry.coordinates }
  }
  if (geometry.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: geometry.coordinates.map(coordinate => [...coordinate] as typeof coordinate),
    }
  }
  return {
    type: 'Polygon',
    coordinates: geometry.coordinates.map(ring => (
      ring.map(coordinate => [...coordinate] as typeof coordinate)
    )),
  }
}
