import { describe, expect, it } from 'vitest'
import {
  createAvoidanceManeuver,
  isAvoidanceDirectionSafe,
  maneuverLateralOffsetMeters,
  offsetCoordinateLaterally,
  selectAvoidanceDecision,
  selectFlightAwarenessCycle,
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

  it('starts one detection cycle only when a blocking ray exists', () => {
    expect(selectFlightAwarenessCycle({
      decisionPending: false,
      cyclesStarted: 0,
      maxCycles: 3,
      progress: 0.3,
      minimumProgressDelta: 0.025,
      hasBlockingSuggestion: true,
    })).toBe('detect')
    expect(selectFlightAwarenessCycle({
      decisionPending: false,
      cyclesStarted: 0,
      maxCycles: 3,
      progress: 0.3,
      minimumProgressDelta: 0.025,
      hasBlockingSuggestion: false,
    })).toBeUndefined()
  })

  it('serializes verification cycles and rate-limits them by route progress', () => {
    const avoidance = createAvoidanceManeuver(
      selectAvoidanceDecision(readings, 15_000, 9_000)!,
      0.3,
      { progressSpan: 0.26, peakProgress: 0.42 },
    )
    const base = {
      cyclesStarted: 1,
      maxCycles: 3,
      lastCycleProgress: 0.3,
      minimumProgressDelta: 0.025,
      hasBlockingSuggestion: false,
      avoidance,
    }

    expect(selectFlightAwarenessCycle({
      ...base,
      decisionPending: true,
      progress: 0.36,
    })).toBeUndefined()
    expect(selectFlightAwarenessCycle({
      ...base,
      decisionPending: false,
      progress: 0.31,
    })).toBeUndefined()
    expect(selectFlightAwarenessCycle({
      ...base,
      decisionPending: false,
      progress: 0.36,
    })).toBe('verify')
    expect(selectFlightAwarenessCycle({
      ...base,
      decisionPending: false,
      progress: avoidance.endProgress,
    })).toBeUndefined()
    expect(selectFlightAwarenessCycle({
      ...base,
      decisionPending: false,
      progress: avoidance.endProgress + 0.1,
      maximumVerificationProgress: 0.98,
    })).toBe('verify')
  })

  it('stops scheduling after the visual-awareness budget is exhausted', () => {
    const decision = selectAvoidanceDecision(readings, 15_000, 9_000)!
    expect(selectFlightAwarenessCycle({
      decisionPending: false,
      cyclesStarted: 3,
      maxCycles: 3,
      progress: 0.4,
      lastCycleProgress: 0.3,
      minimumProgressDelta: 0.025,
      hasBlockingSuggestion: true,
      avoidance: createAvoidanceManeuver(decision, 0.3),
    })).toBeUndefined()
  })
})
