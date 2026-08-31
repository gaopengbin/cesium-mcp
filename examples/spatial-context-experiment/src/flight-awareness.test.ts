import { describe, expect, it } from 'vitest'
import {
  createAvoidanceManeuver,
  isAvoidanceDirectionSafe,
  maneuverLateralOffsetMeters,
  offsetCoordinateLaterally,
  selectAvoidanceDecision,
} from './flight-awareness.js'
import type { FlightRayReading } from './flight-awareness.js'

const readings: FlightRayReading[] = [
  { headingOffsetDegrees: -30, pitchDegrees: 0, hitType: 'none' },
  { headingOffsetDegrees: -16, pitchDegrees: 0, hitType: 'none' },
  {
    headingOffsetDegrees: 0,
    pitchDegrees: 0,
    hitType: 'no-fly-zone',
    hitDistanceMeters: 4_200,
    objectId: 'temporary-no-fly-zone',
  },
  { headingOffsetDegrees: 16, pitchDegrees: 0, hitType: 'scene', hitDistanceMeters: 6_000 },
  { headingOffsetDegrees: 30, pitchDegrees: 0, hitType: 'none' },
]

describe('rolling flight awareness', () => {
  it('chooses the clearer side when a forward scene ray is blocked', () => {
    expect(selectAvoidanceDecision(readings, 15_000, 9_000)).toEqual({
      direction: 'left',
      obstacleType: 'no-fly-zone',
      obstacleId: 'temporary-no-fly-zone',
      obstacleDistanceMeters: 4_200,
      leftClearanceMeters: 15_000,
      rightClearanceMeters: 6_000,
    })
  })

  it('does not treat terrain-only readings as a lateral obstacle', () => {
    expect(selectAvoidanceDecision([{
      headingOffsetDegrees: 0,
      pitchDegrees: -5,
      hitType: 'terrain',
      hitDistanceMeters: 2_000,
    }], 15_000, 9_000)).toBeUndefined()
  })

  it('creates a smooth left detour that rejoins the intended route', () => {
    const decision = selectAvoidanceDecision(readings, 15_000, 9_000)!
    const maneuver = createAvoidanceManeuver(decision, 0.3, {
      progressSpan: 0.2,
      maximumOffsetMeters: 5_000,
    })

    expect(maneuverLateralOffsetMeters(maneuver, 0.3)).toBe(0)
    expect(maneuverLateralOffsetMeters(maneuver, 0.4)).toBeCloseTo(-5_000)
    expect(maneuverLateralOffsetMeters(maneuver, 0.5)).toBe(0)
    const offset = offsetCoordinateLaterally(
      { longitude: 86.9, latitude: 27.9 },
      0,
      maneuverLateralOffsetMeters(maneuver, 0.4),
    )
    expect(offset.longitude).toBeLessThan(86.9)
    expect(offset.latitude).toBeCloseTo(27.9)
  })

  it('locks the maximum detour offset to the obstacle progress', () => {
    const decision = selectAvoidanceDecision(readings, 15_000, 9_000)!
    const maneuver = createAvoidanceManeuver(decision, 0.31, {
      progressSpan: 0.26,
      peakProgress: 0.42,
      maximumOffsetMeters: 6_500,
    })

    expect(maneuver.peakProgress).toBe(0.42)
    expect(maneuverLateralOffsetMeters(maneuver, 0.31)).toBe(0)
    expect(maneuverLateralOffsetMeters(maneuver, 0.42)).toBeCloseTo(-6_500)
    expect(maneuverLateralOffsetMeters(maneuver, 0.48)).toBeLessThan(-1_000)
    expect(maneuverLateralOffsetMeters(maneuver, 0.57)).toBeCloseTo(0)
  })

  it('rejects a model direction that violates the local clearance floor', () => {
    const decision = selectAvoidanceDecision(readings, 15_000, 9_000)!

    expect(isAvoidanceDirectionSafe(decision, 'left')).toBe(true)
    expect(isAvoidanceDirectionSafe(decision, 'right', 7_000)).toBe(false)
  })
})
