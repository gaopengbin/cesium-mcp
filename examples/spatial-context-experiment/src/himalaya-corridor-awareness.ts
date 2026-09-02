import {
  applyWorldObservation,
  createAgentBeliefState,
  planCorridorRoute,
} from 'cesium-mcp-spatial'
import type {
  AgentBeliefState,
  CorridorRouteResult,
  CorridorTopology,
  SpatialRegion,
  WorldObservation,
} from 'cesium-mcp-spatial'

export const HIMALAYA_LEFT_BYPASS_REGION_ID = 'himalaya-left-bypass'
export const HIMALAYA_RIGHT_BYPASS_REGION_ID = 'himalaya-right-bypass'

const CLEARANCE_NUMERICAL_TOLERANCE_METERS = 0.5

export const HIMALAYA_LEFT_BYPASS_REGION: SpatialRegion = {
  regionId: HIMALAYA_LEFT_BYPASS_REGION_ID,
  footprint: {
    type: 'Polygon',
    coordinates: [[
      [86.835, 27.895],
      [86.865, 27.885],
      [86.955, 27.965],
      [86.925, 27.985],
      [86.835, 27.895],
    ]],
  },
  minHeight: 6_000,
  maxHeight: 12_000,
  properties: {
    purpose: 'flight-bypass-corridor',
    side: 'left',
  },
}

export const HIMALAYA_RIGHT_BYPASS_REGION: SpatialRegion = {
  regionId: HIMALAYA_RIGHT_BYPASS_REGION_ID,
  footprint: {
    type: 'Polygon',
    coordinates: [[
      [86.865, 27.865],
      [86.895, 27.845],
      [86.985, 27.925],
      [86.955, 27.945],
      [86.865, 27.865],
    ]],
  },
  minHeight: 6_000,
  maxHeight: 12_000,
  properties: {
    purpose: 'flight-bypass-corridor',
    side: 'right',
  },
}

export const HIMALAYA_CORRIDOR_TOPOLOGY: CorridorTopology = {
  nodeIds: [
    'current',
    'left-bypass',
    'right-bypass',
    'rejoin',
  ],
  edges: [
    {
      edgeId: 'current-to-left-bypass',
      fromNodeId: 'current',
      toNodeId: 'left-bypass',
      regionId: HIMALAYA_LEFT_BYPASS_REGION_ID,
      baseCost: 1,
      bidirectional: false,
    },
    {
      edgeId: 'left-bypass-to-rejoin',
      fromNodeId: 'left-bypass',
      toNodeId: 'rejoin',
      regionId: HIMALAYA_LEFT_BYPASS_REGION_ID,
      baseCost: 1,
      bidirectional: false,
    },
    {
      edgeId: 'current-to-right-bypass',
      fromNodeId: 'current',
      toNodeId: 'right-bypass',
      regionId: HIMALAYA_RIGHT_BYPASS_REGION_ID,
      baseCost: 1,
      bidirectional: false,
    },
    {
      edgeId: 'right-bypass-to-rejoin',
      fromNodeId: 'right-bypass',
      toNodeId: 'rejoin',
      regionId: HIMALAYA_RIGHT_BYPASS_REGION_ID,
      baseCost: 1,
      bidirectional: false,
    },
  ],
}

export interface CreateInitialHimalayaCorridorBeliefInput {
  beliefId: string
  worldId: string
  createdAt: string
}

export interface HimalayaCorridorRayReading {
  headingOffsetDegrees: number
  hitType: 'none' | 'terrain' | 'scene' | 'no-fly-zone'
  hitDistanceMeters?: number
}

export interface ApplyHimalayaCorridorRayObservationInput {
  observationId: string
  worldRevision: number
  sampledAt: string
  sceneReady: boolean
  preferredSide: 'left' | 'right'
  rangeMeters: number
  readings: readonly HimalayaCorridorRayReading[]
  validForMs?: number
}

export interface HimalayaCorridorRayObservationUpdate {
  belief: AgentBeliefState
  observation: WorldObservation
  regionId: string
  establishedFreeCorridor: boolean
}

export interface HimalayaCorridorTrajectorySample {
  progress: number
  longitude: number
  latitude: number
  flightHeight: number
  terrainHeight?: number
  noFlyZoneBoundaryClearanceMeters?: number
  distanceFromPreviousMeters?: number
  sceneBlocked: boolean
}

export interface CreateHimalayaCorridorCertificateInput {
  trajectoryId: string
  direction: 'left' | 'right'
  sampledAt: string
  sceneReady: boolean
  samples: readonly HimalayaCorridorTrajectorySample[]
  requiredTerrainClearanceMeters: number
  requiredNoFlyZoneMarginMeters: number
  maximumSampleSpacingMeters: number
  trajectoryRadiusMeters?: number
  terrainSampling?: HimalayaCorridorTerrainSampling
  kinematicHandoff?: HimalayaCorridorKinematicHandoff
}

export interface HimalayaCorridorTerrainSampling {
  source: string
  longitudinalSpacingMeters: number
  lateralSpacingMeters: number
  verticalUncertaintyMeters: number
}

export interface HimalayaCorridorKinematicHandoff {
  distanceMeters: number
  maximumDistanceMeters: number
}

export interface HimalayaCorridorCertificate {
  trajectoryId: string
  direction: 'left' | 'right'
  sampledAt: string
  verificationScope: 'sampled-swept-corridor-grid'
  region: SpatialRegion
  status: 'free' | 'unknown' | 'occupied'
  complete: boolean
  sampleCount: number
  requiredTerrainClearanceMeters: number
  maximumSampleSpacingMeters?: number
  minimumTerrainClearanceMeters?: number
  minimumNoFlyZoneBoundaryClearanceMeters?: number
  terrainSampling?: HimalayaCorridorTerrainSampling
  kinematicHandoff?: HimalayaCorridorKinematicHandoff
  reasons: string[]
  limitations: string[]
}

export interface ApplyHimalayaCorridorCertificateInput {
  observationId: string
  worldRevision: number
  certificate: HimalayaCorridorCertificate
  validForMs?: number
}

export interface HimalayaCorridorCertificateUpdate {
  belief: AgentBeliefState
  observation: WorldObservation
  regionId: string
  establishedFreeCorridor: boolean
}

export function createInitialHimalayaCorridorBelief(
  input: CreateInitialHimalayaCorridorBeliefInput,
): AgentBeliefState {
  return createAgentBeliefState({
    ...input,
    regions: [
      HIMALAYA_LEFT_BYPASS_REGION,
      HIMALAYA_RIGHT_BYPASS_REGION,
    ],
  })
}

export function planHimalayaCorridorRoute(
  belief: AgentBeliefState,
): CorridorRouteResult {
  return planCorridorRoute({
    belief,
    topology: HIMALAYA_CORRIDOR_TOPOLOGY,
    startNodeId: 'current',
    goalNodeId: 'rejoin',
    policy: {
      unknownPolicy: 'reject',
    },
  })
}

export function applyHimalayaCorridorRayObservation(
  belief: AgentBeliefState,
  input: ApplyHimalayaCorridorRayObservationInput,
): HimalayaCorridorRayObservationUpdate {
  const left = input.preferredSide === 'left'
  const region = left ? HIMALAYA_LEFT_BYPASS_REGION : HIMALAYA_RIGHT_BYPASS_REGION
  const sideReadings = input.readings.filter(reading => (
    left ? reading.headingOffsetDegrees < -10 : reading.headingOffsetDegrees > 10
  ))
  const hasBlockingHit = sideReadings.some(reading => (
    (reading.hitType === 'scene' || reading.hitType === 'no-fly-zone')
    && reading.hitDistanceMeters !== undefined
    && reading.hitDistanceMeters <= input.rangeMeters
  ))
  const validForMs = input.validForMs ?? 10_000
  const validUntil = new Date(
    Date.parse(input.sampledAt) + Math.max(0, validForMs),
  ).toISOString()
  const sensorId = `himalaya-${input.preferredSide}-bypass-ray-fan`
  const observation: WorldObservation = {
    schemaVersion: 1,
    observationId: input.observationId,
    worldId: belief.worldId,
    worldRevision: input.worldRevision,
    startedAt: input.sampledAt,
    completedAt: input.sampledAt,
    changedDuringObservation: false,
    readiness: input.sceneReady ? 'ready' : 'loading',
    sensors: [{
      sensorId,
      kind: 'ray',
      rangeMeters: input.rangeMeters,
    }],
    evidence: [{
      kind: 'region-occupancy',
      evidenceId: `${input.observationId}:evidence`,
      sensorId,
      sampledAt: input.sampledAt,
      quality: hasBlockingHit ? 'derived' : 'unknown',
      confidence: hasBlockingHit ? 0.86 : 0,
      basis: hasBlockingHit
        ? `A ${input.preferredSide} side ray positively intersected a blocking scene volume.`
        : `Sparse ${input.preferredSide} side-ray misses cannot prove an entire 3D bypass corridor free.`,
      validUntil,
      region,
      occupancy: hasBlockingHit ? 'occupied' : 'unknown',
      coverage: 'partial',
      ...(hasBlockingHit ? {} : { unknownReason: 'insufficient-coverage' as const }),
    }],
    limitations: [
      'Positive side-ray hits may establish partial occupancy, but negative rays never establish a free 3D corridor.',
      'A free corridor requires a certificate over the exact executable trajectory.',
    ],
  }
  const update = applyWorldObservation(belief, observation)
  return {
    belief: update.state,
    observation,
    regionId: region.regionId,
    establishedFreeCorridor: false,
  }
}

export function createHimalayaCorridorCertificate(
  input: CreateHimalayaCorridorCertificateInput,
): HimalayaCorridorCertificate {
  const finiteSamples = input.samples.every(sample => (
    Number.isFinite(sample.progress)
    && Number.isFinite(sample.longitude)
    && Number.isFinite(sample.latitude)
    && Number.isFinite(sample.flightHeight)
  ))
  const terrainComplete = input.samples.every(sample => (
    sample.terrainHeight !== undefined && Number.isFinite(sample.terrainHeight)
  ))
  const noFlyZoneComplete = input.samples.every(sample => (
    sample.noFlyZoneBoundaryClearanceMeters !== undefined
    && Number.isFinite(sample.noFlyZoneBoundaryClearanceMeters)
  ))
  const maximumSampleSpacingMeters = maximumDefined(
    input.samples.map(sample => sample.distanceFromPreviousMeters),
  )
  const minimumTerrainClearanceMeters = minimumDefined(
    input.samples.map(sample => sample.terrainHeight === undefined
      ? undefined
      : sample.flightHeight - sample.terrainHeight),
  )
  const minimumNoFlyZoneBoundaryClearanceMeters = minimumDefined(
    input.samples.map(sample => sample.noFlyZoneBoundaryClearanceMeters),
  )
  const sceneBlocked = input.samples.some(sample => sample.sceneBlocked)
  const kinematicHandoffComplete = input.kinematicHandoff === undefined || (
    Number.isFinite(input.kinematicHandoff.distanceMeters)
    && Number.isFinite(input.kinematicHandoff.maximumDistanceMeters)
    && input.kinematicHandoff.distanceMeters <= input.kinematicHandoff.maximumDistanceMeters
  )
  const requiredTerrainClearanceMeters = input.requiredTerrainClearanceMeters
    + (input.terrainSampling?.verticalUncertaintyMeters ?? 0)
  const enteredKnownHazard = sceneBlocked
    || (minimumTerrainClearanceMeters !== undefined && minimumTerrainClearanceMeters < 0)
    || (minimumNoFlyZoneBoundaryClearanceMeters !== undefined
      && minimumNoFlyZoneBoundaryClearanceMeters < 0)
  const complete = input.sceneReady
    && input.samples.length >= 2
    && finiteSamples
    && terrainComplete
    && noFlyZoneComplete
    && maximumSampleSpacingMeters !== undefined
    && maximumSampleSpacingMeters <= input.maximumSampleSpacingMeters
    && kinematicHandoffComplete
  const safe = complete
    && !sceneBlocked
    && minimumTerrainClearanceMeters !== undefined
    && minimumTerrainClearanceMeters >= 0
    && minimumTerrainClearanceMeters + CLEARANCE_NUMERICAL_TOLERANCE_METERS
      >= requiredTerrainClearanceMeters
    && minimumNoFlyZoneBoundaryClearanceMeters !== undefined
    && minimumNoFlyZoneBoundaryClearanceMeters >= 0
    && minimumNoFlyZoneBoundaryClearanceMeters + CLEARANCE_NUMERICAL_TOLERANCE_METERS
      >= input.requiredNoFlyZoneMarginMeters
  const reasons = certificateReasons({
    ...input,
    finiteSamples,
    terrainComplete,
    noFlyZoneComplete,
    actualMaximumSampleSpacingMeters: maximumSampleSpacingMeters,
    minimumTerrainClearanceMeters,
    minimumNoFlyZoneBoundaryClearanceMeters,
    sceneBlocked,
  })
  return {
    trajectoryId: input.trajectoryId,
    direction: input.direction,
    sampledAt: input.sampledAt,
    verificationScope: 'sampled-swept-corridor-grid',
    region: trajectoryRegion(input),
    status: enteredKnownHazard ? 'occupied' : safe ? 'free' : 'unknown',
    complete: safe,
    sampleCount: input.samples.length,
    requiredTerrainClearanceMeters,
    ...(maximumSampleSpacingMeters !== undefined ? { maximumSampleSpacingMeters } : {}),
    ...(minimumTerrainClearanceMeters !== undefined ? { minimumTerrainClearanceMeters } : {}),
    ...(minimumNoFlyZoneBoundaryClearanceMeters !== undefined
      ? { minimumNoFlyZoneBoundaryClearanceMeters }
      : {}),
    ...(input.terrainSampling ? { terrainSampling: { ...input.terrainSampling } } : {}),
    ...(input.kinematicHandoff ? { kinematicHandoff: { ...input.kinematicHandoff } } : {}),
    reasons,
    limitations: [
      'Free means the declared swept-corridor sampling contract passed; it is not a mathematical proof about unsampled sub-grid terrain.',
      'The certificate is valid only for this trajectoryId, terrain source, sampling grid, and vertical uncertainty allowance.',
      'The live handoff distance is a bounded dynamics proxy; it does not prove a full aircraft performance envelope.',
    ],
  }
}

export function applyHimalayaCorridorCertificateObservation(
  belief: AgentBeliefState,
  input: ApplyHimalayaCorridorCertificateInput,
): HimalayaCorridorCertificateUpdate {
  const certificate = input.certificate
  const validForMs = input.validForMs ?? 10_000
  const validUntil = new Date(
    Date.parse(certificate.sampledAt) + Math.max(0, validForMs),
  ).toISOString()
  const sensorId = `${certificate.trajectoryId}:swept-trajectory-certificate`
  const observation: WorldObservation = {
    schemaVersion: 1,
    observationId: input.observationId,
    worldId: belief.worldId,
    worldRevision: input.worldRevision,
    startedAt: certificate.sampledAt,
    completedAt: certificate.sampledAt,
    changedDuringObservation: false,
    readiness: certificate.complete ? 'ready' : 'partial',
    sensors: [{
      sensorId,
      kind: 'ray',
    }],
    evidence: [{
      kind: 'region-occupancy',
      evidenceId: `${input.observationId}:evidence`,
      sensorId,
      sampledAt: certificate.sampledAt,
      quality: certificate.status === 'unknown' ? 'unknown' : 'derived',
      confidence: certificate.status === 'free' ? 0.96 : certificate.status === 'occupied' ? 0.94 : 0,
      basis: certificate.reasons.join(' '),
      validUntil,
      region: certificate.region,
      occupancy: certificate.status,
      coverage: certificate.complete ? 'complete' : 'partial',
      ...(certificate.status === 'unknown'
        ? { unknownReason: 'insufficient-coverage' as const }
        : {}),
    }],
    limitations: [
      'The certificate applies only to the exact sampled executable trajectory identified by trajectoryId.',
      'It does not prove the surrounding map region or an alternative maneuver free.',
      ...certificate.limitations,
    ],
  }
  const update = applyWorldObservation(belief, observation)
  return {
    belief: update.state,
    observation,
    regionId: certificate.region.regionId,
    establishedFreeCorridor: certificate.status === 'free' && certificate.complete,
  }
}

function trajectoryRegion(input: CreateHimalayaCorridorCertificateInput): SpatialRegion {
  const fallback = input.direction === 'left'
    ? HIMALAYA_LEFT_BYPASS_REGION
    : HIMALAYA_RIGHT_BYPASS_REGION
  if (input.samples.length < 2) return fallback
  const radiusMeters = input.trajectoryRadiusMeters ?? 60
  const leftBoundary = input.samples.map((sample, index) => (
    offsetTrajectoryCoordinate(
      sample,
      trajectoryHeadingRadians(input.samples, index),
      -radiusMeters,
    )
  ))
  const rightBoundary = input.samples.map((sample, index) => (
    offsetTrajectoryCoordinate(
      sample,
      trajectoryHeadingRadians(input.samples, index),
      radiusMeters,
    )
  )).reverse()
  const footprint = [...leftBoundary, ...rightBoundary]
  footprint.push([...footprint[0]!] as [number, number])
  const heights = input.samples.map(sample => sample.flightHeight)
  return {
    regionId: fallback.regionId,
    footprint: {
      type: 'Polygon',
      coordinates: [footprint],
    },
    minHeight: Math.min(...heights) - radiusMeters,
    maxHeight: Math.max(...heights) + radiusMeters,
    properties: {
      purpose: 'sampled-executable-flight-trajectory',
      side: input.direction,
      trajectoryId: input.trajectoryId,
      trajectoryRadiusMeters: radiusMeters,
      sampleCount: input.samples.length,
      maximumAllowedSampleSpacingMeters: input.maximumSampleSpacingMeters,
      verificationScope: 'sampled-swept-corridor-grid',
      ...(input.terrainSampling ? {
        terrainLongitudinalSpacingMeters: input.terrainSampling.longitudinalSpacingMeters,
        terrainLateralSpacingMeters: input.terrainSampling.lateralSpacingMeters,
        terrainVerticalUncertaintyMeters: input.terrainSampling.verticalUncertaintyMeters,
        terrainSource: input.terrainSampling.source,
      } : {}),
    },
  }
}

function trajectoryHeadingRadians(
  samples: readonly HimalayaCorridorTrajectorySample[],
  index: number,
): number {
  const start = samples[Math.max(0, index - 1)]!
  const end = samples[Math.min(samples.length - 1, index + 1)]!
  const meanLatitude = (start.latitude + end.latitude) / 2 * Math.PI / 180
  const eastMeters = (end.longitude - start.longitude) * 111_320 * Math.cos(meanLatitude)
  const northMeters = (end.latitude - start.latitude) * 111_320
  return Math.atan2(eastMeters, northMeters)
}

function offsetTrajectoryCoordinate(
  coordinate: Pick<HimalayaCorridorTrajectorySample, 'longitude' | 'latitude'>,
  routeHeadingRadians: number,
  lateralOffsetMeters: number,
): [number, number] {
  const eastMeters = Math.cos(routeHeadingRadians) * lateralOffsetMeters
  const northMeters = -Math.sin(routeHeadingRadians) * lateralOffsetMeters
  const latitudeRadians = coordinate.latitude * Math.PI / 180
  return [
    coordinate.longitude + eastMeters
      / Math.max(1, 111_320 * Math.cos(latitudeRadians)),
    coordinate.latitude + northMeters / 111_320,
  ]
}

function certificateReasons(
  input: CreateHimalayaCorridorCertificateInput & {
    finiteSamples: boolean
    terrainComplete: boolean
    noFlyZoneComplete: boolean
    actualMaximumSampleSpacingMeters?: number
    minimumTerrainClearanceMeters?: number
    minimumNoFlyZoneBoundaryClearanceMeters?: number
    sceneBlocked: boolean
  },
): string[] {
  const reasons: string[] = []
  const requiredTerrainClearanceMeters = input.requiredTerrainClearanceMeters
    + (input.terrainSampling?.verticalUncertaintyMeters ?? 0)
  if (!input.sceneReady) reasons.push('The executing Cesium scene was not ready.')
  if (input.samples.length < 2) reasons.push('The candidate trajectory had fewer than two samples.')
  if (!input.finiteSamples) reasons.push('The candidate trajectory contained invalid coordinates.')
  if (!input.terrainComplete) reasons.push('Loaded DEM height was unavailable for at least one trajectory sample.')
  if (!input.noFlyZoneComplete) reasons.push('No-fly-zone clearance was unavailable for at least one swept segment.')
  if (
    input.actualMaximumSampleSpacingMeters === undefined
    || input.actualMaximumSampleSpacingMeters > input.maximumSampleSpacingMeters
  ) reasons.push(`Trajectory spacing exceeded ${input.maximumSampleSpacingMeters} m.`)
  if (input.sceneBlocked) reasons.push('The sampled trajectory intersected a known scene volume.')
  if (
    input.kinematicHandoff
    && (
      !Number.isFinite(input.kinematicHandoff.distanceMeters)
      || !Number.isFinite(input.kinematicHandoff.maximumDistanceMeters)
      || input.kinematicHandoff.distanceMeters > input.kinematicHandoff.maximumDistanceMeters
    )
  ) {
    reasons.push(`Live trajectory handoff distance exceeded ${input.kinematicHandoff.maximumDistanceMeters} m.`)
  }
  if (input.minimumTerrainClearanceMeters !== undefined) {
    if (input.minimumTerrainClearanceMeters < 0) {
      reasons.push('The sampled trajectory entered terrain.')
    } else if (
      input.minimumTerrainClearanceMeters + CLEARANCE_NUMERICAL_TOLERANCE_METERS
        < requiredTerrainClearanceMeters
    ) {
      reasons.push(`Terrain clearance was below ${requiredTerrainClearanceMeters} m, including the declared vertical uncertainty allowance.`)
    }
  }
  if (input.minimumNoFlyZoneBoundaryClearanceMeters !== undefined) {
    if (input.minimumNoFlyZoneBoundaryClearanceMeters < 0) {
      reasons.push('The sampled trajectory entered the no-fly-zone volume.')
    } else if (
      input.minimumNoFlyZoneBoundaryClearanceMeters + CLEARANCE_NUMERICAL_TOLERANCE_METERS
        < input.requiredNoFlyZoneMarginMeters
    ) {
      reasons.push(`No-fly-zone boundary clearance was below ${input.requiredNoFlyZoneMarginMeters} m.`)
    }
  }
  if (reasons.length === 0) {
    const terrainBasis = input.terrainSampling
      ? `a ${input.terrainSampling.longitudinalSpacingMeters} m longitudinal by ${input.terrainSampling.lateralSpacingMeters} m lateral swept-corridor grid from ${input.terrainSampling.source}, with ${input.terrainSampling.verticalUncertaintyMeters} m vertical uncertainty allowance`
      : 'the available loaded DEM samples'
    reasons.push(`The exact ${input.direction} executable trajectory completed ${terrainBasis}, known scene-volume checks, and continuous no-fly-zone segment checks.`)
  }
  return reasons
}

function minimumDefined(values: readonly (number | undefined)[]): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined && Number.isFinite(value))
  return defined.length > 0 ? Math.min(...defined) : undefined
}

function maximumDefined(values: readonly (number | undefined)[]): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined && Number.isFinite(value))
  return defined.length > 0 ? Math.max(...defined) : undefined
}
