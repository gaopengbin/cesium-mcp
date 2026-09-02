import {
  DEFAULT_ACTIVE_PERCEPTION_WEIGHTS,
  decideActivePerception,
} from 'cesium-mcp-spatial'
import type {
  ActivePerceptionDecision,
  ActivePerceptionGoal,
  AgentBeliefState,
  ObservationCandidate,
  SpatialCoordinate,
} from 'cesium-mcp-spatial'

export const FLIGHT_OBSERVATION_CANDIDATE_IDS = [
  'forward-confirmation',
  'left-overlook',
  'right-overlook',
  'high-overlook',
] as const

export type FlightObservationCandidateId =
  typeof FLIGHT_OBSERVATION_CANDIDATE_IDS[number]

export type FlightObservationSide = 'left' | 'right'

/**
 * A camera offset that the Cesium execution layer can apply with
 * `camera.lookAt(target, new HeadingPitchRange(...))`.
 */
export interface FlightObservationExecutionPose {
  target: SpatialCoordinate
  relativeHeadingDegrees: number
  azimuthFromTargetDegrees: number
  pitchDegrees: number
  rangeMeters: number
}

export interface FlightObservationCandidate extends ObservationCandidate {
  candidateId: FlightObservationCandidateId
  executionPose: FlightObservationExecutionPose
}

export interface CreateFlightObservationCandidatesInput {
  riskEnvelopeRegionId: string
  target: SpatialCoordinate
  routeHeadingDegrees: number
  /**
   * A side already known to have lower observer exposure from vehicle-local
   * constraints. This is not obstacle truth and remains optional when unknown.
   */
  lowerExposureSide?: FlightObservationSide
}

export interface CreateFlightActivePerceptionGoalOptions {
  goalId?: string
  maximumObservationCount?: number
  uncertaintyThreshold?: number
  regionWeight?: number
}

export interface SelectFlightActivePerceptionInput
  extends CreateFlightObservationCandidatesInput,
  CreateFlightActivePerceptionGoalOptions {
  belief: AgentBeliefState
  /** Counts active camera actions for this flight, not evidence records. */
  activeObservationCount: number
}

export interface FlightActivePerceptionSelection {
  goal: ActivePerceptionGoal
  candidates: FlightObservationCandidate[]
  decision: ActivePerceptionDecision
  selectedCandidate?: FlightObservationCandidate
  selectedExecutionPose?: FlightObservationExecutionPose
}

const DEFAULT_MAXIMUM_OBSERVATION_COUNT = 3
const DEFAULT_UNCERTAINTY_THRESHOLD = 0.18

export function createFlightActivePerceptionGoal(
  riskEnvelopeRegionId: string,
  options: CreateFlightActivePerceptionGoalOptions = {},
): ActivePerceptionGoal {
  const regionId = requiredId(riskEnvelopeRegionId, 'risk envelope region')
  const maximumObservationCount = options.maximumObservationCount
    ?? DEFAULT_MAXIMUM_OBSERVATION_COUNT
  const uncertaintyThreshold = options.uncertaintyThreshold
    ?? DEFAULT_UNCERTAINTY_THRESHOLD
  const regionWeight = options.regionWeight ?? 1

  return {
    goalId: options.goalId?.trim() || `resolve-flight-risk:${regionId}`,
    relevantRegionIds: [regionId],
    regionWeights: { [regionId]: positiveFinite(regionWeight, 'region weight') },
    maximumObservationCount: nonNegativeInteger(
      maximumObservationCount,
      'maximum observation count',
    ),
    uncertaintyThreshold: unitInterval(uncertaintyThreshold, 'uncertainty threshold'),
  }
}

export function createFlightObservationCandidates(
  input: CreateFlightObservationCandidatesInput,
): FlightObservationCandidate[] {
  const regionId = requiredId(input.riskEnvelopeRegionId, 'risk envelope region')
  const target = validCoordinate(input.target)
  const routeHeadingDegrees = normalizeDegrees(input.routeHeadingDegrees)
  const sideRisk = (side: FlightObservationSide): number => {
    if (!input.lowerExposureSide) return 0.24
    return input.lowerExposureSide === side ? 0.08 : 0.55
  }
  const candidate = (
    candidateId: FlightObservationCandidateId,
    azimuthOffsetDegrees: number,
    pitchDegrees: number,
    rangeMeters: number,
    visibilityProbability: number,
    movementCost: number,
    acquisitionCost: number,
    exposureRisk: number,
    readinessProbability: number,
  ): FlightObservationCandidate => ({
    candidateId,
    sensor: {
      sensorId: `flight-observer:${candidateId}`,
      kind: 'camera',
      rangeMeters,
      horizontalFieldOfViewDegrees: 60,
      verticalFieldOfViewDegrees: 42,
    },
    predictedCoverage: [{ regionId, visibilityProbability }],
    movementCost,
    acquisitionCost,
    exposureRisk,
    readinessProbability,
    executionPose: {
      target: [...target] as SpatialCoordinate,
      relativeHeadingDegrees: azimuthOffsetDegrees,
      azimuthFromTargetDegrees: normalizeDegrees(
        routeHeadingDegrees + azimuthOffsetDegrees,
      ),
      pitchDegrees,
      rangeMeters,
    },
  })

  return [
    candidate(
      'forward-confirmation',
      180,
      -32,
      16_000,
      0.72,
      0.12,
      0.1,
      0.42,
      0.95,
    ),
    candidate(
      'left-overlook',
      -90,
      -38,
      18_000,
      0.94,
      0.25,
      0.14,
      sideRisk('left'),
      0.94,
    ),
    candidate(
      'right-overlook',
      90,
      -38,
      18_000,
      0.94,
      0.25,
      0.14,
      sideRisk('right'),
      0.94,
    ),
    candidate(
      'high-overlook',
      180,
      -58,
      25_000,
      0.9,
      0.48,
      0.28,
      0.18,
      0.88,
    ),
  ]
}

export function selectFlightActivePerception(
  input: SelectFlightActivePerceptionInput,
): FlightActivePerceptionSelection {
  const activeObservationCount = nonNegativeInteger(
    input.activeObservationCount,
    'active observation count',
  )
  const goal = createFlightActivePerceptionGoal(input.riskEnvelopeRegionId, input)
  const candidates = createFlightObservationCandidates(input)
  const decision = decideActivePerception(
    input.belief,
    goal,
    candidates,
    DEFAULT_ACTIVE_PERCEPTION_WEIGHTS,
    activeObservationCount,
  )
  const selectedCandidate = decision.selectedCandidateId
    ? candidates.find(item => item.candidateId === decision.selectedCandidateId)
    : undefined

  return {
    goal,
    candidates,
    decision,
    selectedCandidate,
    selectedExecutionPose: selectedCandidate?.executionPose,
  }
}

function requiredId(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${name} must not be empty`)
  return normalized
}

function validCoordinate(value: SpatialCoordinate): SpatialCoordinate {
  if (
    (value.length !== 2 && value.length !== 3)
    || value.some(component => !Number.isFinite(component))
  ) throw new RangeError('observation target must be a finite spatial coordinate')
  return [...value] as SpatialCoordinate
}

function normalizeDegrees(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('route heading must be finite')
  return ((value % 360) + 360) % 360
}

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`)
  }
  return value
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`)
  }
  return value
}

function unitInterval(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`)
  }
  return value
}
