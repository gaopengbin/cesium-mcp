import type { SpatialObject } from '../types.js'
import type {
  AgentBeliefState,
  ApplyWorldObservationOptions,
  BeliefChange,
  BeliefConflict,
  BeliefInvalidation,
  BeliefObject,
  BeliefRegion,
  BeliefStateDiff,
  BeliefUpdateResult,
  CreateAgentBeliefStateInput,
  EvidenceReference,
  ObservationEvidenceBase,
  RegionObservationEvidence,
  SpatialKnowledgeState,
  SpatialRegion,
  UnknownReason,
  WorldObservation,
} from './types.js'

interface MutableUpdateState {
  objects: Map<string, BeliefObject>
  regions: Map<string, BeliefRegion>
  conflicts: BeliefConflict[]
  changes: BeliefChange[]
  ignoredEvidenceIds: string[]
}

export function spatialKnowledgeState(region: BeliefRegion): SpatialKnowledgeState {
  return region.freshness === 'stale' ? 'stale' : region.occupancy
}

export function createAgentBeliefState(
  input: CreateAgentBeliefStateInput,
): AgentBeliefState {
  assertNonEmpty(input.beliefId, 'Belief ID')
  assertNonEmpty(input.worldId, 'World ID')
  assertIsoTime(input.createdAt, 'Belief creation time')

  const regionIds = new Set<string>()
  const regions = input.regions.map((region) => {
    validateRegion(region)
    if (regionIds.has(region.regionId)) {
      throw new Error(`Duplicate belief region ID: ${region.regionId}`)
    }
    regionIds.add(region.regionId)
    return initialBeliefRegion(region)
  }).sort(compareBeliefRegions)

  return {
    schemaVersion: 1,
    beliefId: input.beliefId,
    worldId: input.worldId,
    revision: 0,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    objects: [],
    regions,
    appliedObservationIds: [],
    conflicts: [],
  }
}

export function applyWorldObservation(
  state: AgentBeliefState,
  observation: WorldObservation,
  options: ApplyWorldObservationOptions = {},
): BeliefUpdateResult {
  validateBeliefStateIdentity(state)
  validateObservation(observation)
  validateApplyOptions(options)
  if (observation.worldId !== state.worldId) {
    throw new Error(
      `Observation world '${observation.worldId}' does not match belief world '${state.worldId}'`,
    )
  }

  if (state.appliedObservationIds.includes(observation.observationId)) {
    return unchangedResult(state, observation.observationId, true)
  }

  const update = mutableUpdateState(state)
  ageMutableState(update, observation.completedAt)

  for (const evidence of observation.evidence) {
    if (evidence.kind === 'artifact') {
      update.ignoredEvidenceIds.push(evidence.evidenceId)
      continue
    }
    if (evidence.kind === 'object') {
      applyObjectEvidence(update, observation, evidence, options)
      continue
    }
    applyRegionEvidence(update, observation, evidence, options)
  }

  const nextRevision = state.revision + 1
  const nextState: AgentBeliefState = {
    schemaVersion: 1,
    beliefId: state.beliefId,
    worldId: state.worldId,
    revision: nextRevision,
    createdAt: state.createdAt,
    updatedAt: laterIsoTime(state.updatedAt, observation.completedAt),
    latestWorldRevisionObserved: Math.max(
      state.latestWorldRevisionObserved ?? 0,
      observation.worldRevision,
    ),
    objects: [...update.objects.values()].sort(compareBeliefObjects),
    regions: [...update.regions.values()].sort(compareBeliefRegions),
    appliedObservationIds: [
      ...state.appliedObservationIds,
      observation.observationId,
    ],
    conflicts: [...update.conflicts].sort(compareConflicts),
  }

  return {
    state: nextState,
    diff: {
      fromRevision: state.revision,
      toRevision: nextRevision,
      observationId: observation.observationId,
      changes: update.changes,
      ignoredEvidenceIds: uniqueSorted(update.ignoredEvidenceIds),
    },
    duplicate: false,
  }
}

export function ageAgentBeliefState(
  state: AgentBeliefState,
  at: string,
): BeliefUpdateResult {
  validateBeliefStateIdentity(state)
  assertIsoTime(at, 'Belief aging time')
  const update = mutableUpdateState(state)
  ageMutableState(update, at)
  if (update.changes.length === 0) return unchangedResult(state, undefined, false)
  return changedStateResult(state, update, at)
}

export function invalidateAgentBeliefState(
  state: AgentBeliefState,
  invalidation: BeliefInvalidation,
): BeliefUpdateResult {
  validateBeliefStateIdentity(state)
  assertIsoTime(invalidation.invalidatedAt, 'Belief invalidation time')
  assertNonEmpty(invalidation.reason, 'Belief invalidation reason')

  const update = mutableUpdateState(state)
  const regionIds = invalidation.regionIds
    ? new Set(invalidation.regionIds)
    : new Set(update.regions.keys())
  const objectIds = invalidation.objectIds
    ? new Set(invalidation.objectIds)
    : new Set(update.objects.keys())

  for (const regionId of [...regionIds].sort()) {
    const region = update.regions.get(regionId)
    if (!region) {
      update.changes.push({
        targetType: 'region',
        targetId: regionId,
        change: 'ignored',
        reason: 'region-not-found',
      })
      continue
    }
    if (region.occupancy === 'unknown' || region.freshness === 'stale') continue
    region.freshness = 'stale'
    update.changes.push({
      targetType: 'region',
      targetId: regionId,
      change: 'staled',
      reason: invalidation.reason,
    })
  }

  for (const objectId of [...objectIds].sort()) {
    const object = update.objects.get(objectId)
    if (!object) {
      update.changes.push({
        targetType: 'object',
        targetId: objectId,
        change: 'ignored',
        reason: 'object-not-found',
      })
      continue
    }
    if (object.freshness === 'stale') continue
    object.freshness = 'stale'
    update.changes.push({
      targetType: 'object',
      targetId: objectId,
      change: 'staled',
      reason: invalidation.reason,
    })
  }

  if (!hasStateChanges(update.changes)) {
    return {
      state,
      diff: {
        fromRevision: state.revision,
        toRevision: state.revision,
        changes: update.changes,
        ignoredEvidenceIds: [],
      },
      duplicate: false,
    }
  }
  return changedStateResult(state, update, invalidation.invalidatedAt)
}

function applyObjectEvidence(
  update: MutableUpdateState,
  observation: WorldObservation,
  evidence: Extract<WorldObservation['evidence'][number], { kind: 'object' }>,
  options: ApplyWorldObservationOptions,
): void {
  const objectId = evidence.object.objectId
  const existing = update.objects.get(objectId)
  const order = compareEvidenceOrder(
    observation.worldRevision,
    evidence.sampledAt,
    existing?.lastWorldRevision,
    existing?.lastObservedAt,
  )
  if (order < 0) {
    ignoreEvidence(update, 'object', objectId, evidence.evidenceId, 'older-evidence')
    return
  }

  const validUntil = evidenceValidUntil(evidence, options)
  const freshness = isExpired(validUntil, observation.completedAt) ? 'stale' : 'current'
  const reference = evidenceReference(observation, evidence)
  const next: BeliefObject = {
    objectId,
    object: cloneSpatialObject(evidence.object),
    confidence: order === 0 && existing
      ? Math.max(existing.confidence, evidence.confidence)
      : evidence.confidence,
    freshness,
    lastObservedAt: evidence.sampledAt,
    lastWorldRevision: observation.worldRevision,
    ...(validUntil ? { validUntil } : {}),
    evidence: appendEvidence(existing?.evidence ?? [], reference),
  }
  update.objects.set(objectId, next)
  update.changes.push({
    targetType: 'object',
    targetId: objectId,
    change: !existing
      ? 'added'
      : existing.freshness === 'stale' && freshness === 'current'
        ? 'revived'
        : 'updated',
  })
}

function applyRegionEvidence(
  update: MutableUpdateState,
  observation: WorldObservation,
  evidence: RegionObservationEvidence,
  options: ApplyWorldObservationOptions,
): void {
  const regionId = evidence.region.regionId
  const existing = update.regions.get(regionId)
  const normalized = normalizedRegionEvidence(observation, evidence)
  const order = compareEvidenceOrder(
    observation.worldRevision,
    evidence.sampledAt,
    existing?.lastWorldRevision,
    existing?.lastObservedAt,
  )
  if (order < 0) {
    ignoreEvidence(update, 'region', regionId, evidence.evidenceId, 'older-evidence')
    return
  }

  if (normalized.occupancy === 'unknown' && existing?.occupancy !== 'unknown') {
    ignoreEvidence(
      update,
      'region',
      regionId,
      evidence.evidenceId,
      normalized.reason ?? 'unknown-does-not-erase-known-state',
    )
    return
  }

  const reference = evidenceReference(observation, evidence)
  const validUntil = evidenceValidUntil(evidence, options)
  const sameOrderConflict = order === 0
    && existing
    && existing.occupancy !== 'unknown'
    && normalized.occupancy !== 'unknown'
    && existing.occupancy !== normalized.occupancy
  const unresolvedConflict = order === 0
    && existing?.occupancy === 'unknown'
    && existing.unknownReason === 'conflicting-evidence'
    && normalized.occupancy !== 'unknown'

  if (sameOrderConflict || unresolvedConflict) {
    const evidenceIds = uniqueSorted([
      ...(existing?.evidence.map(item => item.evidenceId) ?? []),
      evidence.evidenceId,
    ])
    update.regions.set(regionId, {
      region: cloneRegion(evidence.region),
      occupancy: 'unknown',
      freshness: 'current',
      confidence: 0,
      lastObservedAt: evidence.sampledAt,
      lastWorldRevision: observation.worldRevision,
      ...(validUntil ? { validUntil } : {}),
      blockingObjectIds: uniqueSorted([
        ...(existing?.blockingObjectIds ?? []),
        ...(evidence.blockingObjectIds ?? []),
      ]),
      unknownReason: 'conflicting-evidence',
      evidence: appendEvidence(existing?.evidence ?? [], reference),
    })
    replaceRegionConflict(update, {
      conflictId: `conflict:region:${regionId}:${observation.worldRevision}:${evidence.sampledAt}`,
      targetType: 'region',
      targetId: regionId,
      detectedAt: observation.completedAt,
      evidenceIds,
      resolution: 'conservative-unknown',
    })
    update.changes.push({
      targetType: 'region',
      targetId: regionId,
      change: 'conflicted',
      reason: 'same-version-opposing-occupancy',
    })
    return
  }

  const freshness = normalized.occupancy !== 'unknown'
    && isExpired(validUntil, observation.completedAt)
    ? 'stale'
    : 'current'
  const confidence = normalized.occupancy === 'unknown'
    ? 0
    : order === 0 && existing?.occupancy === normalized.occupancy
      ? Math.max(existing.confidence, evidence.confidence)
      : evidence.confidence
  const next: BeliefRegion = {
    region: cloneRegion(evidence.region),
    occupancy: normalized.occupancy,
    freshness,
    confidence,
    lastObservedAt: evidence.sampledAt,
    lastWorldRevision: observation.worldRevision,
    ...(validUntil ? { validUntil } : {}),
    blockingObjectIds: normalized.occupancy === 'occupied'
      ? uniqueSorted(evidence.blockingObjectIds ?? [])
      : [],
    ...(normalized.occupancy === 'unknown'
      ? { unknownReason: normalized.unknownReason }
      : {}),
    evidence: appendEvidence(existing?.evidence ?? [], reference),
  }
  update.regions.set(regionId, next)
  if (normalized.occupancy !== 'unknown' && order > 0) {
    removeRegionConflict(update, regionId)
  }
  update.changes.push({
    targetType: 'region',
    targetId: regionId,
    change: !existing
      ? 'added'
      : existing.freshness === 'stale' && freshness === 'current'
        ? 'revived'
        : 'updated',
    ...(normalized.reason ? { reason: normalized.reason } : {}),
  })
}

function normalizedRegionEvidence(
  observation: WorldObservation,
  evidence: RegionObservationEvidence,
): {
    occupancy: RegionObservationEvidence['occupancy']
    unknownReason?: UnknownReason
    reason?: string
  } {
  if (evidence.occupancy === 'free') {
    if (
      observation.readiness !== 'ready'
      || observation.changedDuringObservation
      || evidence.coverage !== 'complete'
    ) {
      return {
        occupancy: 'unknown',
        unknownReason: 'insufficient-coverage',
        reason: 'unsafe-free-evidence-downgraded',
      }
    }
    return { occupancy: 'free' }
  }
  if (evidence.occupancy === 'occupied') {
    if (evidence.coverage === 'unavailable') {
      return {
        occupancy: 'unknown',
        unknownReason: 'sensor-unavailable',
        reason: 'unavailable-occupied-evidence-downgraded',
      }
    }
    return { occupancy: 'occupied' }
  }
  return {
    occupancy: 'unknown',
    unknownReason: evidence.unknownReason ?? unknownReasonForCoverage(evidence.coverage),
  }
}

function unknownReasonForCoverage(
  coverage: RegionObservationEvidence['coverage'],
): UnknownReason {
  if (coverage === 'occluded') return 'occluded'
  if (coverage === 'unavailable') return 'sensor-unavailable'
  if (coverage === 'partial') return 'insufficient-coverage'
  return 'not-observed'
}

function ageMutableState(update: MutableUpdateState, at: string): void {
  const atTime = assertIsoTime(at, 'Belief aging time')
  for (const region of update.regions.values()) {
    if (
      region.occupancy !== 'unknown'
      && region.freshness === 'current'
      && region.validUntil
      && assertIsoTime(region.validUntil, 'Belief region validity time') <= atTime
    ) {
      region.freshness = 'stale'
      update.changes.push({
        targetType: 'region',
        targetId: region.region.regionId,
        change: 'staled',
        reason: 'evidence-expired',
      })
    }
  }
  for (const object of update.objects.values()) {
    if (
      object.freshness === 'current'
      && object.validUntil
      && assertIsoTime(object.validUntil, 'Belief object validity time') <= atTime
    ) {
      object.freshness = 'stale'
      update.changes.push({
        targetType: 'object',
        targetId: object.objectId,
        change: 'staled',
        reason: 'evidence-expired',
      })
    }
  }
}

function changedStateResult(
  state: AgentBeliefState,
  update: MutableUpdateState,
  updatedAt: string,
): BeliefUpdateResult {
  const nextRevision = state.revision + 1
  return {
    state: {
      ...state,
      revision: nextRevision,
      updatedAt: laterIsoTime(state.updatedAt, updatedAt),
      objects: [...update.objects.values()].sort(compareBeliefObjects),
      regions: [...update.regions.values()].sort(compareBeliefRegions),
      conflicts: [...update.conflicts].sort(compareConflicts),
      appliedObservationIds: [...state.appliedObservationIds],
    },
    diff: {
      fromRevision: state.revision,
      toRevision: nextRevision,
      changes: update.changes,
      ignoredEvidenceIds: uniqueSorted(update.ignoredEvidenceIds),
    },
    duplicate: false,
  }
}

function unchangedResult(
  state: AgentBeliefState,
  observationId: string | undefined,
  duplicate: boolean,
): BeliefUpdateResult {
  const diff: BeliefStateDiff = {
    fromRevision: state.revision,
    toRevision: state.revision,
    ...(observationId ? { observationId } : {}),
    changes: [],
    ignoredEvidenceIds: [],
  }
  return { state, diff, duplicate }
}

function mutableUpdateState(state: AgentBeliefState): MutableUpdateState {
  return {
    objects: new Map(state.objects.map(object => [object.objectId, cloneBeliefObject(object)])),
    regions: new Map(state.regions.map(region => [region.region.regionId, cloneBeliefRegion(region)])),
    conflicts: state.conflicts.map(cloneConflict),
    changes: [],
    ignoredEvidenceIds: [],
  }
}

function initialBeliefRegion(region: SpatialRegion): BeliefRegion {
  return {
    region: cloneRegion(region),
    occupancy: 'unknown',
    freshness: 'current',
    confidence: 0,
    blockingObjectIds: [],
    unknownReason: 'not-observed',
    evidence: [],
  }
}

function evidenceReference(
  observation: WorldObservation,
  evidence: ObservationEvidenceBase,
): EvidenceReference {
  return {
    observationId: observation.observationId,
    evidenceId: evidence.evidenceId,
    worldRevision: observation.worldRevision,
    sampledAt: evidence.sampledAt,
  }
}

function appendEvidence(
  existing: readonly EvidenceReference[],
  reference: EvidenceReference,
): EvidenceReference[] {
  if (existing.some(item => (
    item.observationId === reference.observationId
    && item.evidenceId === reference.evidenceId
  ))) return existing.map(cloneEvidenceReference)
  return [...existing.map(cloneEvidenceReference), reference]
}

function evidenceValidUntil(
  evidence: ObservationEvidenceBase,
  options: ApplyWorldObservationOptions,
): string | undefined {
  if (evidence.validUntil) return evidence.validUntil
  if (options.defaultValidForMs === undefined) return undefined
  return new Date(
    assertIsoTime(evidence.sampledAt, 'Evidence sample time') + options.defaultValidForMs,
  ).toISOString()
}

function compareEvidenceOrder(
  worldRevision: number,
  sampledAt: string,
  existingWorldRevision: number | undefined,
  existingObservedAt: string | undefined,
): number {
  if (existingWorldRevision === undefined || existingObservedAt === undefined) return 1
  if (worldRevision !== existingWorldRevision) {
    return worldRevision > existingWorldRevision ? 1 : -1
  }
  const sampledTime = assertIsoTime(sampledAt, 'Evidence sample time')
  const existingTime = assertIsoTime(existingObservedAt, 'Existing evidence sample time')
  if (sampledTime === existingTime) return 0
  return sampledTime > existingTime ? 1 : -1
}

function ignoreEvidence(
  update: MutableUpdateState,
  targetType: BeliefChange['targetType'],
  targetId: string,
  evidenceId: string,
  reason: string,
): void {
  update.ignoredEvidenceIds.push(evidenceId)
  update.changes.push({
    targetType,
    targetId,
    change: 'ignored',
    reason,
  })
}

function replaceRegionConflict(
  update: MutableUpdateState,
  conflict: BeliefConflict,
): void {
  removeRegionConflict(update, conflict.targetId)
  update.conflicts.push(conflict)
}

function removeRegionConflict(update: MutableUpdateState, regionId: string): void {
  update.conflicts = update.conflicts.filter(conflict => !(
    conflict.targetType === 'region' && conflict.targetId === regionId
  ))
}

function hasStateChanges(changes: readonly BeliefChange[]): boolean {
  return changes.some(change => change.change !== 'ignored')
}

function validateBeliefStateIdentity(state: AgentBeliefState): void {
  assertNonEmpty(state.beliefId, 'Belief ID')
  assertNonEmpty(state.worldId, 'World ID')
  assertIsoTime(state.createdAt, 'Belief creation time')
  assertIsoTime(state.updatedAt, 'Belief update time')
}

function validateObservation(observation: WorldObservation): void {
  assertNonEmpty(observation.observationId, 'Observation ID')
  assertNonEmpty(observation.worldId, 'Observation world ID')
  if (!Number.isInteger(observation.worldRevision) || observation.worldRevision < 1) {
    throw new Error('Observation world revision must be a positive integer')
  }
  const startedAt = assertIsoTime(observation.startedAt, 'Observation start time')
  const completedAt = assertIsoTime(observation.completedAt, 'Observation completion time')
  if (startedAt > completedAt) {
    throw new Error('Observation start time must not be after completion time')
  }

  const sensorIds = new Set<string>()
  for (const sensor of observation.sensors) {
    assertNonEmpty(sensor.sensorId, 'Observation sensor ID')
    if (sensorIds.has(sensor.sensorId)) {
      throw new Error(`Duplicate observation sensor ID: ${sensor.sensorId}`)
    }
    sensorIds.add(sensor.sensorId)
    for (const [label, value] of [
      ['sensor range', sensor.rangeMeters],
      ['horizontal field of view', sensor.horizontalFieldOfViewDegrees],
      ['vertical field of view', sensor.verticalFieldOfViewDegrees],
    ] as const) {
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
        throw new Error(`Observation ${label} must be a positive finite number`)
      }
    }
  }

  const evidenceIds = new Set<string>()
  for (const evidence of observation.evidence) {
    assertNonEmpty(evidence.evidenceId, 'Observation evidence ID')
    if (evidenceIds.has(evidence.evidenceId)) {
      throw new Error(`Duplicate observation evidence ID: ${evidence.evidenceId}`)
    }
    evidenceIds.add(evidence.evidenceId)
    if (!sensorIds.has(evidence.sensorId)) {
      throw new Error(`Observation evidence references unknown sensor: ${evidence.sensorId}`)
    }
    const sampledAt = assertIsoTime(evidence.sampledAt, 'Evidence sample time')
    if (sampledAt < startedAt || sampledAt > completedAt) {
      throw new Error('Evidence sample time must be within the observation interval')
    }
    if (!Number.isFinite(evidence.confidence) || evidence.confidence < 0 || evidence.confidence > 1) {
      throw new Error('Evidence confidence must be between 0 and 1')
    }
    assertNonEmpty(evidence.basis, 'Evidence basis')
    if (evidence.validUntil) {
      const validUntil = assertIsoTime(evidence.validUntil, 'Evidence validity time')
      if (validUntil < sampledAt) {
        throw new Error('Evidence validity time must not be before its sample time')
      }
    }
    if (evidence.kind === 'region-occupancy') validateRegion(evidence.region)
    if (evidence.kind === 'object') assertNonEmpty(evidence.object.objectId, 'Spatial object ID')
    if (evidence.kind === 'artifact') assertNonEmpty(evidence.artifactRef, 'Artifact reference')
  }
}

function validateApplyOptions(options: ApplyWorldObservationOptions): void {
  if (
    options.defaultValidForMs !== undefined
    && (!Number.isFinite(options.defaultValidForMs) || options.defaultValidForMs <= 0)
  ) {
    throw new Error('Default evidence validity must be a positive finite duration')
  }
}

function validateRegion(region: SpatialRegion): void {
  assertNonEmpty(region.regionId, 'Spatial region ID')
  if (region.footprint.coordinates.length === 0) {
    throw new Error(`Spatial region '${region.regionId}' requires a polygon ring`)
  }
  if (region.minHeight !== undefined && !Number.isFinite(region.minHeight)) {
    throw new Error(`Spatial region '${region.regionId}' minimum height must be finite`)
  }
  if (region.maxHeight !== undefined && !Number.isFinite(region.maxHeight)) {
    throw new Error(`Spatial region '${region.regionId}' maximum height must be finite`)
  }
  if (
    region.minHeight !== undefined
    && region.maxHeight !== undefined
    && region.minHeight > region.maxHeight
  ) {
    throw new Error(`Spatial region '${region.regionId}' minimum height must not exceed maximum height`)
  }
  for (const ring of region.footprint.coordinates) {
    if (ring.length === 0) {
      throw new Error(`Spatial region '${region.regionId}' polygon rings must not be empty`)
    }
    for (const coordinate of ring) {
      if (!coordinate.every(Number.isFinite)) {
        throw new Error(`Spatial region '${region.regionId}' coordinates must be finite`)
      }
    }
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty`)
}

function assertIsoTime(value: string, label: string): number {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) throw new Error(`${label} must be a valid ISO timestamp`)
  return time
}

function isExpired(validUntil: string | undefined, at: string): boolean {
  return validUntil !== undefined
    && assertIsoTime(validUntil, 'Evidence validity time') <= assertIsoTime(at, 'Comparison time')
}

function laterIsoTime(left: string, right: string): string {
  return assertIsoTime(left, 'Timestamp') >= assertIsoTime(right, 'Timestamp') ? left : right
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

function compareBeliefObjects(left: BeliefObject, right: BeliefObject): number {
  return left.objectId.localeCompare(right.objectId)
}

function compareBeliefRegions(left: BeliefRegion, right: BeliefRegion): number {
  return left.region.regionId.localeCompare(right.region.regionId)
}

function compareConflicts(left: BeliefConflict, right: BeliefConflict): number {
  return left.conflictId.localeCompare(right.conflictId)
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
    ...(object.geometry
      ? { geometry: cloneSpatialGeometry(object.geometry) }
      : {}),
    ...(object.centroid ? { centroid: [...object.centroid] as typeof object.centroid } : {}),
    ...(object.bbox ? { bbox: [...object.bbox] as typeof object.bbox } : {}),
    properties: { ...object.properties },
    provenance: { ...object.provenance },
  }
}

function cloneSpatialGeometry(
  geometry: SpatialObject['geometry'] & {},
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

function cloneEvidenceReference(reference: EvidenceReference): EvidenceReference {
  return { ...reference }
}

function cloneBeliefObject(object: BeliefObject): BeliefObject {
  return {
    ...object,
    object: cloneSpatialObject(object.object),
    evidence: object.evidence.map(cloneEvidenceReference),
  }
}

function cloneBeliefRegion(region: BeliefRegion): BeliefRegion {
  return {
    ...region,
    region: cloneRegion(region.region),
    blockingObjectIds: [...region.blockingObjectIds],
    evidence: region.evidence.map(cloneEvidenceReference),
  }
}

function cloneConflict(conflict: BeliefConflict): BeliefConflict {
  return { ...conflict, evidenceIds: [...conflict.evidenceIds] }
}
