import { describe, expect, it } from 'vitest'
import {
  advanceFlightTimeline,
  aircraftModelHeadingRadians,
  cameraTrackingAlpha,
  cinematicFlightCameraIntent,
  interpolateCameraAngleRadians,
  MAX_FLIGHT_FRAME_DELTA_MS,
  shouldPublishFlightProgress,
} from './flight-animation.js'

describe('flight animation', () => {
  it('advances on a stable timeline without a scene-loading gate', () => {
    const first = advanceFlightTimeline(0, 16, 1_000)
    const delayed = advanceFlightTimeline(first.elapsedMs, 500, 1_000)

    expect(first).toEqual({ elapsedMs: 16, progress: 0.016 })
    expect(delayed.elapsedMs).toBe(16 + MAX_FLIGHT_FRAME_DELTA_MS)
    expect(delayed.progress).toBeCloseTo(0.066)
  })

  it('clamps invalid deltas and completes exactly at the duration', () => {
    expect(advanceFlightTimeline(900, -20, 1_000)).toEqual({
      elapsedMs: 900,
      progress: 0.9,
    })
    expect(advanceFlightTimeline(980, 50, 1_000)).toEqual({
      elapsedMs: 1_000,
      progress: 1,
    })
  })

  it('turns the CesiumAir model left by 90 degrees from the route heading', () => {
    expect(aircraftModelHeadingRadians(0)).toBeCloseTo(-Math.PI / 2)
    expect(aircraftModelHeadingRadians(Math.PI / 2)).toBeCloseTo(0)
  })

  it('smooths camera motion by half-life without depending on frame rate', () => {
    expect(cameraTrackingAlpha(0, 240)).toBe(0)
    expect(cameraTrackingAlpha(240, 240)).toBeCloseTo(0.5)
    expect(cameraTrackingAlpha(480, 240)).toBeCloseTo(0.75)
  })

  it('interpolates camera headings across the shortest angular path', () => {
    const from = 179 * Math.PI / 180
    const to = -179 * Math.PI / 180
    const halfway = interpolateCameraAngleRadians(from, to, 0.5)

    expect(Math.abs(halfway)).toBeCloseTo(Math.PI)
  })

  it('adds close terrain-pass views only to the automatic follow preference', () => {
    expect(cinematicFlightCameraIntent('follow', 0.14, false)).toBe('terrain-pass')
    expect(cinematicFlightCameraIntent('follow', 0.5, false)).toBe('follow')
    expect(cinematicFlightCameraIntent('overview', 0.14, false)).toBe('overview')
    expect(cinematicFlightCameraIntent('pov', 0.5, false)).toBe('pov')
    expect(cinematicFlightCameraIntent('follow', 0.14, true)).toBe('decision')
  })

  it('decouples UI progress publication from the render frame rate', () => {
    expect(shouldPublishFlightProgress(1_000, 950, 100, false)).toBe(false)
    expect(shouldPublishFlightProgress(1_050, 950, 100, false)).toBe(true)
    expect(shouldPublishFlightProgress(951, 950, 100, true)).toBe(true)
  })
})
