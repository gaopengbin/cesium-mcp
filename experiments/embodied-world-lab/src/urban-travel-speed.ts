/** Local speed limit in metres per second; route choice remains with the planner. */
export function urbanTravelSpeed(
  maximumSpeedMetersPerSecond: number,
  distanceToWaypointMeters: number,
  bearingErrorRadians: number,
): number {
  if (!Number.isFinite(maximumSpeedMetersPerSecond)
    || !Number.isFinite(distanceToWaypointMeters)
    || !Number.isFinite(bearingErrorRadians)
    || maximumSpeedMetersPerSecond <= 0
    || distanceToWaypointMeters < 0) return 0

  const approachSpeed = Math.min(maximumSpeedMetersPerSecond, Math.max(2.8, distanceToWaypointMeters / 2))
  const angle = Math.abs(Math.atan2(Math.sin(bearingErrorRadians), Math.cos(bearingErrorRadians)))
  if (angle >= 0.8) return 0

  // Fast travel requires alignment: limit sideways drift while retaining the
  // existing low-speed steering behaviour. This does not replace collision tests.
  const steeringSpeed = angle > 0.000001 ? Math.max(12, 2.4 / Math.sin(angle)) : maximumSpeedMetersPerSecond
  const alignedSpeed = Math.min(approachSpeed, steeringSpeed)
  if (angle <= 0.2) return alignedSpeed

  const progress = (angle - 0.2) / 0.6
  const turnLimit = 1 - progress * progress * (3 - 2 * progress)
  // Turning may lower speed below the approach floor, including a full stop.
  return alignedSpeed * turnLimit
}
