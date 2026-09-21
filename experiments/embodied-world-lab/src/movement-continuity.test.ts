import { describe, expect, it } from 'vitest'
import { createMovementContinuity } from './movement-continuity.js'

const base = {
  nowMs: 0, positionEcef: { x: 6_378_137, y: 0, z: 0 },
  translationInput: true, planning: true, safetyClear: true,
}

describe('measured movement continuity', () => {
  it('does not report movement when a forward command is blocked by a wall', () => {
    const tracker = createMovementContinuity()
    tracker.acceptedPlan()
    tracker.observe(base)
    tracker.observe({ ...base, nowMs: 50 })
    tracker.observe({ ...base, nowMs: 150 })
    expect(tracker.stats.inputMovingTicks).toBe(2)
    expect(tracker.stats.movingTicks).toBe(0)
    expect(tracker.stats.planningWhileMovingTicks).toBe(0)
    expect(tracker.stats.waitingForRenewalTicks).toBe(2)
    expect(tracker.stats.maxRenewalStationaryMs).toBe(150)
  })

  it('measures actual horizontal displacement during a pending renewal', () => {
    const tracker = createMovementContinuity()
    tracker.acceptedPlan()
    tracker.observe(base)
    tracker.observe({ ...base, nowMs: 50, positionEcef: { ...base.positionEcef, y: 0.12 } })
    expect(tracker.stats.movingTicks).toBe(1)
    expect(tracker.stats.planningWhileMovingTicks).toBe(1)
    expect(tracker.stats.actualDistanceMeters).toBeCloseTo(0.12)
    expect(tracker.stats.planningWhileMovingMs).toBe(50)
    expect(tracker.stats.maxRenewalStationaryMs).toBe(0)
  })

  it('ignores vertical settling and tiny position noise', () => {
    const tracker = createMovementContinuity()
    tracker.observe(base)
    tracker.observe({ ...base, nowMs: 50, positionEcef: { x: base.positionEcef.x - 0.4, y: 0, z: 0 } })
    tracker.observe({ ...base, nowMs: 100, positionEcef: { x: base.positionEcef.x - 0.4, y: 0.00001, z: 0 } })
    expect(tracker.stats.movingTicks).toBe(0)
  })

  it('separates first-plan waiting and excludes pauses between runs or unobserved gaps', () => {
    const tracker = createMovementContinuity()
    tracker.observe(base)
    tracker.observe({ ...base, nowMs: 100 })
    expect(tracker.stats.waitingForFirstPlanTicks).toBe(1)
    tracker.acceptedPlan()
    tracker.observe({ ...base, nowMs: 200 })
    tracker.observe({ ...base, nowMs: 300 })
    expect(tracker.stats.maxRenewalStationaryMs).toBe(100)
    tracker.observe({ ...base, nowMs: 3_000 })
    expect(tracker.stats.maxRenewalStationaryMs).toBe(100)
    expect(tracker.stats.unobservedMs).toBe(2_700)
    tracker.beginRun()
    tracker.observe({ ...base, nowMs: 5_000 })
    tracker.observe({ ...base, nowMs: 5_050 })
    expect(tracker.stats.waitingForFirstPlanTicks).toBe(3)
    expect(tracker.stats.maxRenewalStationaryMs).toBe(100)
  })
})
