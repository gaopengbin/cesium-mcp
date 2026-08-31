import type {
  SpatialCoordinate,
  SpatialEvidenceQuality,
  SpatialGeometry,
  SpatialObject,
} from '../types.js'

export type OccupancyState = 'free' | 'occupied' | 'unknown'

export type BeliefFreshness = 'current' | 'stale'

export type SpatialKnowledgeState = OccupancyState | 'stale'

export interface SpatialRegion {
  regionId: string
  footprint: Extract<SpatialGeometry, { type: 'Polygon' }>
  minHeight?: number
  maxHeight?: number
  properties?: Record<string, unknown>
}

export type AuthoritativeRegionState =
  | {
      region: SpatialRegion
      modeled: true
      occupancy: Exclude<OccupancyState, 'unknown'>
      blockingObjectIds: string[]
      revision: number
      changedAt: string
    }
  | {
      region: SpatialRegion
      modeled: false
      reason: string
      revision: number
      changedAt: string
    }

export interface AuthoritativeWorldState {
  schemaVersion: 1
  worldId: string
  revision: number
  capturedAt: string
  objects: SpatialObject[]
  regions: AuthoritativeRegionState[]
}

export type ObservationSensorKind =
  | 'scene-query'
  | 'camera'
  | 'ray'
  | 'terrain'
  | 'metadata'

export interface ObserverPose {
  position: SpatialCoordinate
  headingDegrees?: number
  pitchDegrees?: number
  rollDegrees?: number
}

export interface ObservationSensor {
  sensorId: string
  kind: ObservationSensorKind
  pose?: ObserverPose
  rangeMeters?: number
  horizontalFieldOfViewDegrees?: number
  verticalFieldOfViewDegrees?: number
}

export type ObservationReadiness = 'ready' | 'partial' | 'loading' | 'unknown'

export type ObservationCoverage = 'complete' | 'partial' | 'occluded' | 'unavailable'

export type UnknownReason =
  | 'not-observed'
  | 'occluded'
  | 'not-loaded'
  | 'out-of-range'
  | 'sensor-unavailable'
  | 'conflicting-evidence'
  | 'insufficient-coverage'

export interface ObservationEvidenceBase {
  evidenceId: string
  sensorId: string
  sampledAt: string
  quality: SpatialEvidenceQuality
  confidence: number
  basis: string
  validUntil?: string
  limitations?: string[]
}

export interface ObjectObservationEvidence extends ObservationEvidenceBase {
  kind: 'object'
  object: SpatialObject
}

export interface RegionObservationEvidence extends ObservationEvidenceBase {
  kind: 'region-occupancy'
  region: SpatialRegion
  occupancy: OccupancyState
  coverage: ObservationCoverage
  blockingObjectIds?: string[]
  unknownReason?: UnknownReason
}

export interface ArtifactObservationEvidence extends ObservationEvidenceBase {
  kind: 'artifact'
  artifactType: 'image' | 'depth' | 'ray-bundle'
  artifactRef: string
  relatedRegionIds: string[]
}

export type WorldEvidence =
  | ObjectObservationEvidence
  | RegionObservationEvidence
  | ArtifactObservationEvidence

export interface WorldObservation {
  schemaVersion: 1
  observationId: string
  worldId: string
  worldRevision: number
  startedAt: string
  completedAt: string
  changedDuringObservation: boolean
  readiness: ObservationReadiness
  sensors: ObservationSensor[]
  evidence: WorldEvidence[]
  limitations: string[]
}

export interface EvidenceReference {
  observationId: string
  evidenceId: string
  worldRevision: number
  sampledAt: string
}

export interface BeliefObject {
  objectId: string
  object: SpatialObject
  confidence: number
  freshness: BeliefFreshness
  lastObservedAt: string
  lastWorldRevision: number
  validUntil?: string
  evidence: EvidenceReference[]
}

export interface BeliefRegion {
  region: SpatialRegion
  occupancy: OccupancyState
  freshness: BeliefFreshness
  confidence: number
  lastObservedAt?: string
  lastWorldRevision?: number
  validUntil?: string
  blockingObjectIds: string[]
  unknownReason?: UnknownReason
  evidence: EvidenceReference[]
}

export interface BeliefConflict {
  conflictId: string
  targetType: 'object' | 'region'
  targetId: string
  detectedAt: string
  evidenceIds: string[]
  resolution: 'conservative-unknown'
}

export interface AgentBeliefState {
  schemaVersion: 1
  beliefId: string
  worldId: string
  revision: number
  createdAt: string
  updatedAt: string
  latestWorldRevisionObserved?: number
  objects: BeliefObject[]
  regions: BeliefRegion[]
  appliedObservationIds: string[]
  conflicts: BeliefConflict[]
}

export interface CreateAgentBeliefStateInput {
  beliefId: string
  worldId: string
  createdAt: string
  regions: readonly SpatialRegion[]
}

export type BeliefChangeKind =
  | 'added'
  | 'updated'
  | 'revived'
  | 'staled'
  | 'conflicted'
  | 'ignored'

export interface BeliefChange {
  targetType: 'object' | 'region'
  targetId: string
  change: BeliefChangeKind
  reason?: string
}

export interface BeliefStateDiff {
  fromRevision: number
  toRevision: number
  observationId?: string
  changes: BeliefChange[]
  ignoredEvidenceIds: string[]
}

export interface BeliefUpdateResult {
  state: AgentBeliefState
  diff: BeliefStateDiff
  duplicate: boolean
}

export interface ApplyWorldObservationOptions {
  defaultValidForMs?: number
}

export interface BeliefInvalidation {
  invalidatedAt: string
  reason: string
  regionIds?: string[]
  objectIds?: string[]
}

export interface PredictedRegionCoverage {
  regionId: string
  visibilityProbability: number
}

export interface ObservationCandidate {
  candidateId: string
  sensor: ObservationSensor
  predictedCoverage: PredictedRegionCoverage[]
  movementCost: number
  acquisitionCost: number
  exposureRisk: number
  readinessProbability: number
  properties?: Record<string, unknown>
}

export interface ActivePerceptionGoal {
  goalId: string
  relevantRegionIds: string[]
  regionWeights?: Record<string, number>
  maximumObservationCount: number
  uncertaintyThreshold: number
}

export interface ActivePerceptionWeights {
  informationGain: number
  routeDisambiguation: number
  movementCost: number
  acquisitionCost: number
  exposureRisk: number
  readinessCost: number
}

export interface ObservationCandidateScore {
  candidateId: string
  valid: boolean
  score: number
  expectedInformationGain: number
  routeDisambiguation: number
  movementCost: number
  acquisitionCost: number
  exposureRisk: number
  readinessCost: number
  coveredUnknownRegionIds: string[]
  reasons: string[]
}

export interface ActivePerceptionDecision {
  goalId: string
  beliefRevision: number
  shouldObserve: boolean
  selectedCandidateId?: string
  scores: ObservationCandidateScore[]
  reason: string
}
