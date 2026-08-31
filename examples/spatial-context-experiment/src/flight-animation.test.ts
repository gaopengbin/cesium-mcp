import { describe, expect, it } from 'vitest'
import {
  advanceFlightTimeline,
  aircraftModelHeadingRadians,
  MAX_FLIGHT_FRAME_DELTA_MS,
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
})
