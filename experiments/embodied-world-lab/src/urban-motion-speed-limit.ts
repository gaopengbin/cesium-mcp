import { offsetGeoPoint } from './world-sensor.js'
import type { GeoPoint } from './world-sensor.js'

export interface UrbanMotionSpeedLimitInput {
  position: GeoPoint
  /** Clockwise from north, matching the actor's local ENU heading. */
  headingRadians: number
  proposedSpeedMetersPerSecond: number
  /** Must validate the entire segment, including actor clearance and known coverage. */
  segmentIsWalkable: (from: GeoPoint, to: GeoPoint) => boolean
  /** Actual upcoming motion step, if longer than the normal 20 Hz interval. */
  frameDeltaSeconds?: number
}

/** Local braking against known geometry; does not choose a route or replace physics. */
export function urbanMotionSpeedLimit(input: UrbanMotionSpeedLimitInput): number {
  const { position, headingRadians, proposedSpeedMetersPerSecond, segmentIsWalkable } = input
  const frameDelta = input.frameDeltaSeconds ?? 1 / 20
  if (!validPoint(position) || !Number.isFinite(headingRadians)
    || !Number.isFinite(proposedSpeedMetersPerSecond) || proposedSpeedMetersPerSecond <= 0
    || !Number.isFinite(frameDelta) || frameDelta < 0) return 0
  if (!segmentIsWalkable(position, position)) return 0

  // Cover four normal sensing intervals, or the full upcoming frame if longer.
  const horizon = Math.max(0.2, frameDelta)
  const east = Math.sin(headingRadians)
  const north = Math.cos(headingRadians)
  const isSafe = (speed: number): boolean => {
    const distance = speed * horizon
    const end = offsetGeoPoint(position, east * distance, north * distance)
    return validPoint(end) && segmentIsWalkable(position, end)
  }
  if (isSafe(proposedSpeedMetersPerSecond)) return proposedSpeedMetersPerSecond

  // Checking complete segments makes the first obstruction a monotone boundary.
  // Always return the last proven clear lower bound, never the untested midpoint.
  let safe = 0
  let blocked = proposedSpeedMetersPerSecond
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const candidate = safe + (blocked - safe) / 2
    if (isSafe(candidate)) safe = candidate
    else blocked = candidate
  }
  return safe
}

function validPoint(point: GeoPoint): boolean {
  return [point.longitude, point.latitude, point.height].every(Number.isFinite)
    && Math.abs(point.longitude) <= 180 && Math.abs(point.latitude) <= 90
}
