// CesiumAir's authored nose points 90 degrees right of our route-bearing frame.
export const AIRCRAFT_MODEL_HEADING_OFFSET_RADIANS = -Math.PI / 2
export const MAX_FLIGHT_FRAME_DELTA_MS = 50

export interface FlightTimelineStep {
  elapsedMs: number
  progress: number
}

export function advanceFlightTimeline(
  elapsedMs: number,
  frameDeltaMs: number,
  durationMs: number,
): FlightTimelineStep {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('Flight duration must be a positive finite number')
  }
  const safeElapsedMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  const safeDeltaMs = Number.isFinite(frameDeltaMs)
    ? Math.min(MAX_FLIGHT_FRAME_DELTA_MS, Math.max(0, frameDeltaMs))
    : 0
  const nextElapsedMs = Math.min(durationMs, safeElapsedMs + safeDeltaMs)
  return {
    elapsedMs: nextElapsedMs,
    progress: nextElapsedMs / durationMs,
  }
}

export function aircraftModelHeadingRadians(routeHeadingRadians: number): number {
  return normalizeRadians(routeHeadingRadians + AIRCRAFT_MODEL_HEADING_OFFSET_RADIANS)
}

function normalizeRadians(value: number): number {
  const twoPi = Math.PI * 2
  return ((value + Math.PI) % twoPi + twoPi) % twoPi - Math.PI
}
