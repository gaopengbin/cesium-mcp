// CesiumAir's authored nose points 90 degrees right of our route-bearing frame.
export const AIRCRAFT_MODEL_HEADING_OFFSET_RADIANS = -Math.PI / 2
export const MAX_FLIGHT_FRAME_DELTA_MS = 50
export const CAMERA_TRACKING_HALF_LIFE_MS = 180

export type CinematicFlightViewMode = 'follow' | 'pov' | 'overview'
export type CinematicFlightCameraIntent = CinematicFlightViewMode | 'decision' | 'terrain-pass'

const TERRAIN_PASS_WINDOWS = [
  { start: 0.05, end: 0.23 },
  { start: 0.70, end: 0.92 },
] as const

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

export function shouldPublishFlightProgress(
  nowMs: number,
  lastPublishedAtMs: number,
  intervalMs: number,
  force: boolean,
): boolean {
  if (force) return true
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return true
  return nowMs - lastPublishedAtMs >= intervalMs
}

export function aircraftModelHeadingRadians(routeHeadingRadians: number): number {
  return normalizeRadians(routeHeadingRadians + AIRCRAFT_MODEL_HEADING_OFFSET_RADIANS)
}

export function cameraTrackingAlpha(
  frameDeltaMs: number,
  halfLifeMs = CAMERA_TRACKING_HALF_LIFE_MS,
): number {
  if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0) return 0
  if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0) return 1
  return 1 - 2 ** (-frameDeltaMs / halfLifeMs)
}

export function interpolateCameraAngleRadians(
  from: number,
  to: number,
  alpha: number,
): number {
  const safeAlpha = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0
  return normalizeRadians(from + normalizeRadians(to - from) * safeAlpha)
}

export function cinematicFlightCameraIntent(
  viewMode: CinematicFlightViewMode,
  progress: number,
  decisionActive: boolean,
): CinematicFlightCameraIntent {
  if (decisionActive) return 'decision'
  if (viewMode !== 'follow') return viewMode
  const safeProgress = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
  return TERRAIN_PASS_WINDOWS.some(window => (
    safeProgress >= window.start && safeProgress <= window.end
  ))
    ? 'terrain-pass'
    : 'follow'
}

function normalizeRadians(value: number): number {
  const twoPi = Math.PI * 2
  return ((value + Math.PI) % twoPi + twoPi) % twoPi - Math.PI
}
