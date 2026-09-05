import type {
  EmbodiedStateObservation,
} from '../../../packages/cesium-mcp-spatial/src/index.js'
import type {
  EmbodiedWorldSnapshot,
  NavigationCandidate,
  NavigationCandidateId,
} from './embodied-agent-loop.js'

export interface GeoPoint {
  longitude: number
  latitude: number
  height: number
}

export interface CircularHazard {
  id: string
  center: GeoPoint
  radiusMeters: number
  sensorRangeMeters: number
}

export interface WorldSensorInput {
  revision: number
  position: GeoPoint
  target: GeoPoint
  embodiment: EmbodiedStateObservation
  hazard: CircularHazard
  hazardVisible: boolean
  terrainHeightAt(point: GeoPoint): number | undefined
  candidateDistanceMeters?: number
  actorRayClearanceMeters?: Partial<Record<NavigationCandidateId, number>>
  hazardPaddingMeters?: number
}

export interface WorldSensorResult {
  snapshot: EmbodiedWorldSnapshot
  hazardDetected: boolean
}

const EARTH_RADIUS_METERS = 6_378_137
const CANDIDATE_OFFSETS: Array<{ id: NavigationCandidateId, radians: number }> = [
  { id: 'front', radians: 0 },
  { id: 'left', radians: -Math.PI / 5 },
  { id: 'right', radians: Math.PI / 5 },
]

export function senseEmbodiedWorld(input: WorldSensorInput): WorldSensorResult {
  const targetBearing = initialBearingRadians(input.position, input.target)
  const hazardDetected = input.hazardVisible || canDetectHazard(
    input.position,
    input.embodiment.headingRadians,
    input.hazard,
  )
  const candidateDistanceMeters = positiveFinite(input.candidateDistanceMeters, 28)
  const currentTerrainHeight = input.terrainHeightAt(input.position)
  const candidates = CANDIDATE_OFFSETS.map(({ id, radians }) => createCandidate({
    id,
    headingRadians: wrapAngle(input.embodiment.headingRadians + radians),
    position: input.position,
    currentTerrainHeight,
    candidateDistanceMeters,
    hazard: input.hazard,
    hazardVisible: hazardDetected,
    hazardPaddingMeters: positiveFinite(
      input.hazardPaddingMeters,
      input.embodiment.mode === 'vehicle' ? 3 : 1.5,
    ),
    actorRayClearanceMeters: input.actorRayClearanceMeters?.[id],
    maxSlopeDegrees: input.embodiment.mode === 'vehicle' ? 22 : 45,
    terrainHeightAt: input.terrainHeightAt,
  }))
  const velocity = input.embodiment.velocityEnu

  return {
    hazardDetected,
    snapshot: {
      revision: input.revision,
      capturedAt: input.embodiment.capturedAt,
      mode: input.embodiment.mode,
      distanceToGoalMeters: distanceMeters(input.position, input.target),
      bearingErrorRadians: wrapAngle(targetBearing - input.embodiment.headingRadians),
      grounded: input.embodiment.grounded,
      speedMetersPerSecond: Math.hypot(velocity.east, velocity.north),
      ...(hazardDetected ? { hazardId: input.hazard.id } : {}),
      ...(input.embodiment.physicsCenterRayHit
        ? { physicsCenterRayDistanceMeters: input.embodiment.physicsCenterRayHit.distanceMeters }
        : {}),
      candidates,
    },
  }
}

export function canDetectHazard(
  position: GeoPoint,
  headingRadians: number,
  hazard: CircularHazard,
): boolean {
  const distance = distanceMeters(position, hazard.center)
  if (distance <= hazard.radiusMeters + 8) return true
  if (distance > hazard.sensorRangeMeters) return false
  const bearing = initialBearingRadians(position, hazard.center)
  return Math.abs(wrapAngle(bearing - headingRadians)) <= Math.PI * 0.42
}

export function rayCircleClearanceMeters(
  position: GeoPoint,
  headingRadians: number,
  hazard: CircularHazard,
  maximumMeters: number,
): number {
  const center = localOffsetMeters(position, hazard.center)
  const direction = {
    east: Math.sin(headingRadians),
    north: Math.cos(headingRadians),
  }
  const projected = center.east * direction.east + center.north * direction.north
  if (projected <= 0) return maximumMeters
  const centerDistanceSquared = center.east ** 2 + center.north ** 2
  const closestSquared = centerDistanceSquared - projected ** 2
  const radiusSquared = hazard.radiusMeters ** 2
  if (closestSquared >= radiusSquared) return maximumMeters
  const entry = projected - Math.sqrt(radiusSquared - closestSquared)
  return Math.max(0, Math.min(maximumMeters, entry))
}

export function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)
  const deltaLat = lat2 - lat1
  const deltaLon = toRadians(to.longitude - from.longitude)
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function initialBearingRadians(from: GeoPoint, to: GeoPoint): number {
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)
  const deltaLon = toRadians(to.longitude - from.longitude)
  const east = Math.sin(deltaLon) * Math.cos(lat2)
  const north = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  return Math.atan2(east, north)
}

export function offsetGeoPoint(origin: GeoPoint, eastMeters: number, northMeters: number): GeoPoint {
  const latitudeRadians = toRadians(origin.latitude)
  return {
    longitude: origin.longitude
      + toDegrees(eastMeters / (EARTH_RADIUS_METERS * Math.cos(latitudeRadians))),
    latitude: origin.latitude + toDegrees(northMeters / EARTH_RADIUS_METERS),
    height: origin.height,
  }
}

export function wrapAngle(value: number): number {
  let wrapped = value
  while (wrapped > Math.PI) wrapped -= Math.PI * 2
  while (wrapped < -Math.PI) wrapped += Math.PI * 2
  return wrapped
}

export function isGroundSupportHit(
  heightAboveTerrainMeters: number | undefined,
  surfaceUpDot: number,
): boolean {
  return typeof heightAboveTerrainMeters === 'number'
    && Number.isFinite(heightAboveTerrainMeters)
    && Math.abs(heightAboveTerrainMeters) <= 8
    && Number.isFinite(surfaceUpDot)
    && surfaceUpDot >= Math.cos(toRadians(50))
}

function createCandidate(input: {
  id: NavigationCandidateId
  headingRadians: number
  position: GeoPoint
  currentTerrainHeight: number | undefined
  candidateDistanceMeters: number
  hazard: CircularHazard
  hazardVisible: boolean
  hazardPaddingMeters: number
  actorRayClearanceMeters?: number
  maxSlopeDegrees: number
  terrainHeightAt(point: GeoPoint): number | undefined
}): NavigationCandidate {
  const probe = offsetGeoPoint(
    input.position,
    Math.sin(input.headingRadians) * input.candidateDistanceMeters,
    Math.cos(input.headingRadians) * input.candidateDistanceMeters,
  )
  const terrainHeight = input.terrainHeightAt(probe)
  const terrainReady = Number.isFinite(input.currentTerrainHeight) && Number.isFinite(terrainHeight)
  const slopeDegrees = terrainReady
    ? toDegrees(Math.atan2(
        terrainHeight! - input.currentTerrainHeight!,
        input.candidateDistanceMeters,
      ))
    : undefined
  const maximumClearance = input.candidateDistanceMeters
  const hazardClearanceMeters = input.hazardVisible
    ? rayCircleClearanceMeters(
        input.position,
        input.headingRadians,
        {
          ...input.hazard,
          radiusMeters: input.hazard.radiusMeters + input.hazardPaddingMeters,
        },
        maximumClearance,
      )
    : maximumClearance
  const actorRayClearanceMeters = Number.isFinite(input.actorRayClearanceMeters)
    ? Math.max(0, Math.min(maximumClearance, input.actorRayClearanceMeters!))
    : maximumClearance
  const clearanceMeters = Math.min(hazardClearanceMeters, actorRayClearanceMeters)

  return {
    id: input.id,
    clearanceMeters,
    ...(slopeDegrees !== undefined ? { slopeDegrees } : {}),
    terrainReady,
    traversable: terrainReady
      && Math.abs(slopeDegrees ?? 90) <= input.maxSlopeDegrees
      && clearanceMeters >= 10,
  }
}

function localOffsetMeters(origin: GeoPoint, point: GeoPoint): { east: number, north: number } {
  const latitudeRadians = toRadians(origin.latitude)
  return {
    east: toRadians(point.longitude - origin.longitude)
      * EARTH_RADIUS_METERS
      * Math.cos(latitudeRadians),
    north: toRadians(point.latitude - origin.latitude) * EARTH_RADIUS_METERS,
  }
}

function positiveFinite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

function toRadians(value: number): number {
  return value * Math.PI / 180
}

function toDegrees(value: number): number {
  return value * 180 / Math.PI
}
