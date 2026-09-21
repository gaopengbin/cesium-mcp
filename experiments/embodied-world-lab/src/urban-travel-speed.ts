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

  const maximum = Math.min(12, maximumSpeedMetersPerSecond)
  const approachSpeed = Math.min(maximum, Math.max(2.8, distanceToWaypointMeters / 2))
  const angle = Math.abs(Math.atan2(Math.sin(bearingErrorRadians), Math.cos(bearingErrorRadians)))
  if (angle <= 0.2) return approachSpeed
  if (angle >= 0.8) return 0

  const progress = (angle - 0.2) / 0.6
  const turnLimit = 1 - progress * progress * (3 - 2 * progress)
  // Turning may lower speed below the approach floor, including a full stop.
  return approachSpeed * turnLimit
}
