export type FlightRayHitType = 'none' | 'terrain' | 'scene' | 'no-fly-zone'
export type FlightAvoidanceDirection = 'left' | 'right'
export type FlightAwarenessCycleKind = 'detect' | 'verify'

export interface FlightRayReading {
  headingOffsetDegrees: number
  pitchDegrees: number
  hitType: FlightRayHitType
  hitDistanceMeters?: number
  objectId?: string
}

export interface FlightAvoidanceDecision {
  direction: FlightAvoidanceDirection
  obstacleType: Exclude<FlightRayHitType, 'none' | 'terrain'>
  obstacleId?: string
  obstacleDistanceMeters: number
  leftClearanceMeters: number
  rightClearanceMeters: number
}

export interface FlightAvoidanceManeuver extends FlightAvoidanceDecision {
  startProgress: number
  peakProgress: number
  endProgress: number
  maximumOffsetMeters: number
}

export interface GeographicCoordinate {
  longitude: number
  latitude: number
}

export interface FlightAwarenessCycleInput {
  decisionPending: boolean
  cyclesStarted: number
  maxCycles: number
  progress: number
  lastCycleProgress?: number
  minimumProgressDelta: number
  maximumVerificationProgress?: number
  hasBlockingSuggestion: boolean
  avoidance?: FlightAvoidanceManeuver
}

/**
 * Gates the slow visual-awareness loop independently from the fast ray-safety
 * loop. The first cycle requires a current blocking ray. Later cycles verify
 * the already committed maneuver without requiring another positive hit.
 */
export function selectFlightAwarenessCycle(
  input: FlightAwarenessCycleInput,
): FlightAwarenessCycleKind | undefined {
  if (input.decisionPending || input.cyclesStarted >= input.maxCycles) return undefined
  if (input.cyclesStarted === 0) {
    return input.hasBlockingSuggestion ? 'detect' : undefined
  }
  if (!input.avoidance) return undefined
  const maximumVerificationProgress = input.maximumVerificationProgress
    ?? input.avoidance.endProgress
  if (input.progress >= maximumVerificationProgress) return undefined
  const lastProgress = input.lastCycleProgress ?? input.avoidance.startProgress
  if (input.progress - lastProgress < input.minimumProgressDelta) return undefined
  return 'verify'
}

export function selectAvoidanceDecision(
  readings: readonly FlightRayReading[],
  sensorRangeMeters: number,
  triggerDistanceMeters: number,
): FlightAvoidanceDecision | undefined {
  const blocking = readings
    .filter(reading =>
      Math.abs(reading.headingOffsetDegrees) <= 10
      && (reading.hitType === 'scene' || reading.hitType === 'no-fly-zone')
      && reading.hitDistanceMeters !== undefined
      && reading.hitDistanceMeters <= triggerDistanceMeters,
    )
    .sort((left, right) => left.hitDistanceMeters! - right.hitDistanceMeters!)[0]
  if (!blocking?.hitDistanceMeters) return undefined
  if (blocking.hitType !== 'scene' && blocking.hitType !== 'no-fly-zone') return undefined

  const leftClearanceMeters = directionalClearance(readings, 'left', sensorRangeMeters)
  const rightClearanceMeters = directionalClearance(readings, 'right', sensorRangeMeters)
  return {
    direction: leftClearanceMeters >= rightClearanceMeters ? 'left' : 'right',
    obstacleType: blocking.hitType,
    ...(blocking.objectId ? { obstacleId: blocking.objectId } : {}),
    obstacleDistanceMeters: blocking.hitDistanceMeters,
    leftClearanceMeters,
    rightClearanceMeters,
  }
}

export function createAvoidanceManeuver(
  decision: FlightAvoidanceDecision,
  currentProgress: number,
  options: {
    progressSpan?: number
    peakProgress?: number
    maximumOffsetMeters?: number
  } = {},
): FlightAvoidanceManeuver {
  const startProgress = clamp(currentProgress, 0, 1)
  const progressSpan = Math.max(Number.EPSILON, options.progressSpan ?? 0.2)
  const endProgress = Math.min(1, startProgress + progressSpan)
  const peakProgress = clamp(
    options.peakProgress ?? startProgress + progressSpan / 2,
    startProgress,
    endProgress,
  )
  return {
    ...decision,
    startProgress,
    peakProgress,
    endProgress,
    maximumOffsetMeters: options.maximumOffsetMeters ?? 5_500,
  }
}

export function isAvoidanceDirectionSafe(
  decision: FlightAvoidanceDecision,
  direction: FlightAvoidanceDirection,
  minimumClearanceMeters = 2_000,
): boolean {
  const clearance = direction === 'left'
    ? decision.leftClearanceMeters
    : decision.rightClearanceMeters
  return clearance >= minimumClearanceMeters
}

export function maneuverLateralOffsetMeters(
  maneuver: FlightAvoidanceManeuver | undefined,
  progress: number,
): number {
  if (!maneuver || progress <= maneuver.startProgress || progress >= maneuver.endProgress) return 0
  const beforePeak = progress <= maneuver.peakProgress
  const phase = beforePeak
    ? (progress - maneuver.startProgress)
      / Math.max(Number.EPSILON, maneuver.peakProgress - maneuver.startProgress)
    : (progress - maneuver.peakProgress)
      / Math.max(Number.EPSILON, maneuver.endProgress - maneuver.peakProgress)
  const magnitude = beforePeak
    ? Math.sin(Math.PI / 2 * phase) * maneuver.maximumOffsetMeters
    : Math.cos(Math.PI / 2 * phase) * maneuver.maximumOffsetMeters
  return maneuver.direction === 'left' ? -magnitude : magnitude
}

export function offsetCoordinateLaterally(
  coordinate: GeographicCoordinate,
  routeHeadingRadians: number,
  lateralOffsetMeters: number,
): GeographicCoordinate {
  if (Math.abs(lateralOffsetMeters) < Number.EPSILON) return { ...coordinate }
  const eastMeters = Math.cos(routeHeadingRadians) * lateralOffsetMeters
  const northMeters = -Math.sin(routeHeadingRadians) * lateralOffsetMeters
  const latitudeRadians = coordinate.latitude * Math.PI / 180
  const metersPerLongitudeDegree = Math.max(1, 111_320 * Math.cos(latitudeRadians))
  return {
    longitude: coordinate.longitude + eastMeters / metersPerLongitudeDegree,
    latitude: coordinate.latitude + northMeters / 111_320,
  }
}

function directionalClearance(
  readings: readonly FlightRayReading[],
  direction: FlightAvoidanceDirection,
  sensorRangeMeters: number,
): number {
  const candidates = readings.filter(reading =>
    direction === 'left'
      ? reading.headingOffsetDegrees < -10
      : reading.headingOffsetDegrees > 10,
  )
  if (candidates.length === 0) return 0
  return Math.min(...candidates.map(reading => reading.hitDistanceMeters ?? sensorRangeMeters))
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
