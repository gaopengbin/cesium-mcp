import { haversineDistanceMeters } from './geometry.js'
import type {
  FlightRouteCoordinate,
  FlightTerrainSample,
  TerrainAwareFlightOptions,
  TerrainAwareFlightPlan,
  TerrainAwareFlightSample,
} from './types.js'

const DEGREES_PER_RADIAN = 180 / Math.PI
const RADIANS_PER_DEGREE = Math.PI / 180

export function densifyFlightRoute(
  anchors: readonly FlightRouteCoordinate[],
  sampleSpacingMeters: number,
): FlightRouteCoordinate[] {
  if (anchors.length < 2) throw new Error('Flight route requires at least two anchors')
  if (!Number.isFinite(sampleSpacingMeters) || sampleSpacingMeters <= 0) {
    throw new Error('Flight route sample spacing must be a positive finite number')
  }
  anchors.forEach(assertCoordinate)

  const samples: FlightRouteCoordinate[] = [{ ...anchors[0]! }]
  for (let index = 1; index < anchors.length; index++) {
    const start = anchors[index - 1]!
    const end = anchors[index]!
    const distanceMeters = coordinateDistanceMeters(start, end)
    if (distanceMeters === 0) continue

    const steps = Math.max(1, Math.ceil(distanceMeters / sampleSpacingMeters))
    for (let step = 1; step <= steps; step++) {
      const fraction = step / steps
      samples.push({
        longitude: interpolate(start.longitude, end.longitude, fraction),
        latitude: interpolate(start.latitude, end.latitude, fraction),
        ...(step === steps && end.name ? { name: end.name } : {}),
      })
    }
  }

  if (samples.length < 2) throw new Error('Flight route anchors must not all be identical')
  return samples
}

export function buildTerrainAwareFlightPlan(
  terrainSamples: readonly FlightTerrainSample[],
  options: TerrainAwareFlightOptions,
): TerrainAwareFlightPlan {
  if (terrainSamples.length < 2) throw new Error('Flight plan requires at least two terrain samples')
  terrainSamples.forEach(assertTerrainSample)
  assertOptions(options)

  const distances = cumulativeDistances(terrainSamples)
  const totalDistance = distances.at(-1)!
  if (totalDistance <= 0) throw new Error('Flight terrain samples must span a non-zero distance')

  const plannedHeights = terrainSamples.map(sample => sample.terrainHeight + options.clearanceMeters)
  const climbSlope = Math.tan(options.maxClimbAngleDegrees * RADIANS_PER_DEGREE)
  const descentSlope = Math.tan(options.maxDescentAngleDegrees * RADIANS_PER_DEGREE)

  for (let index = plannedHeights.length - 2; index >= 0; index--) {
    const segmentDistance = distances[index + 1]! - distances[index]!
    const requiredHeight = plannedHeights[index + 1]! - segmentDistance * climbSlope
    plannedHeights[index] = Math.max(plannedHeights[index]!, requiredHeight)
  }

  for (let index = 1; index < plannedHeights.length; index++) {
    const segmentDistance = distances[index]! - distances[index - 1]!
    const requiredHeight = plannedHeights[index - 1]! - segmentDistance * descentSlope
    plannedHeights[index] = Math.max(plannedHeights[index]!, requiredHeight)
  }

  const naiveStartHeight = terrainSamples[0]!.terrainHeight + options.clearanceMeters
  const naiveEndHeight = terrainSamples.at(-1)!.terrainHeight + options.clearanceMeters
  const samples: TerrainAwareFlightSample[] = terrainSamples.map((sample, index) => {
    const fraction = distances[index]! / totalDistance
    const naiveFlightHeight = interpolate(naiveStartHeight, naiveEndHeight, fraction)
    const flightHeight = plannedHeights[index]!
    return {
      ...sample,
      distanceMeters: distances[index]!,
      flightHeight,
      clearanceMeters: flightHeight - sample.terrainHeight,
      naiveFlightHeight,
      naiveClearanceMeters: naiveFlightHeight - sample.terrainHeight,
    }
  })

  const terrainHeights = terrainSamples.map(sample => sample.terrainHeight)
  const flightHeights = samples.map(sample => sample.flightHeight)
  const clearances = samples.map(sample => sample.clearanceMeters)
  const naiveClearances = samples.map(sample => sample.naiveClearanceMeters)
  const angles = segmentAngles(samples)

  return {
    samples,
    options: { ...options },
    metrics: {
      distanceMeters: totalDistance,
      terrainHeightRange: [Math.min(...terrainHeights), Math.max(...terrainHeights)],
      flightHeightRange: [Math.min(...flightHeights), Math.max(...flightHeights)],
      minimumClearanceMeters: Math.min(...clearances),
      naiveMinimumClearanceMeters: Math.min(...naiveClearances),
      naiveViolationCount: naiveClearances.filter(clearance => clearance + 1e-6 < options.clearanceMeters).length,
      maximumClimbAngleDegrees: Math.max(0, ...angles),
      maximumDescentAngleDegrees: Math.max(0, ...angles.map(angle => -angle)),
    },
  }
}

function cumulativeDistances(samples: readonly FlightRouteCoordinate[]): number[] {
  const distances = [0]
  for (let index = 1; index < samples.length; index++) {
    distances.push(distances[index - 1]! + coordinateDistanceMeters(samples[index - 1]!, samples[index]!))
  }
  return distances
}

function segmentAngles(samples: readonly TerrainAwareFlightSample[]): number[] {
  const angles: number[] = []
  for (let index = 1; index < samples.length; index++) {
    const horizontalDistance = samples[index]!.distanceMeters - samples[index - 1]!.distanceMeters
    const heightDifference = samples[index]!.flightHeight - samples[index - 1]!.flightHeight
    angles.push(Math.atan2(heightDifference, horizontalDistance) * DEGREES_PER_RADIAN)
  }
  return angles
}

function coordinateDistanceMeters(
  start: FlightRouteCoordinate,
  end: FlightRouteCoordinate,
): number {
  return haversineDistanceMeters(
    [start.longitude, start.latitude],
    [end.longitude, end.latitude],
  )
}

function interpolate(start: number, end: number, fraction: number): number {
  return start + (end - start) * fraction
}

function assertCoordinate(coordinate: FlightRouteCoordinate): void {
  if (!Number.isFinite(coordinate.longitude) || !Number.isFinite(coordinate.latitude)) {
    throw new Error('Flight route coordinates must be finite')
  }
  if (coordinate.longitude < -180 || coordinate.longitude > 180) {
    throw new Error('Flight route longitude must be between -180 and 180')
  }
  if (coordinate.latitude < -90 || coordinate.latitude > 90) {
    throw new Error('Flight route latitude must be between -90 and 90')
  }
}

function assertTerrainSample(sample: FlightTerrainSample): void {
  assertCoordinate(sample)
  if (!Number.isFinite(sample.terrainHeight)) {
    throw new Error('Flight terrain heights must be finite')
  }
}

function assertOptions(options: TerrainAwareFlightOptions): void {
  if (!Number.isFinite(options.clearanceMeters) || options.clearanceMeters <= 0) {
    throw new Error('Flight clearance must be a positive finite number')
  }
  if (
    !Number.isFinite(options.maxClimbAngleDegrees)
    || options.maxClimbAngleDegrees <= 0
    || options.maxClimbAngleDegrees >= 90
  ) {
    throw new Error('Maximum climb angle must be between 0 and 90 degrees')
  }
  if (
    !Number.isFinite(options.maxDescentAngleDegrees)
    || options.maxDescentAngleDegrees <= 0
    || options.maxDescentAngleDegrees >= 90
  ) {
    throw new Error('Maximum descent angle must be between 0 and 90 degrees')
  }
}
