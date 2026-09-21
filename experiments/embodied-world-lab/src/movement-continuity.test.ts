import { describe, expect, it } from 'vitest'
import { createMovementContinuity } from './movement-continuity.js'

const base = {
  nowMs: 0, positionEcef: { x: 6_378_137, y: 0, z: 0 },
  translationInput: true, planning: true, safetyClear: true,
}

describe('measured movement continuity', () => {
  it('resets every metric for a new mission without replacing the exported stats object', () => {
    const tracker = createMovementContinuity()
    const exportedStats = tracker.stats
    tracker.observe(base)
    tracker.observe({ ...base, nowMs: 50 })
    tracker.acceptedPlan()
    tracker.observe({ ...base, nowMs: 100, positionEcef: { ...base.positionEcef, y: 1 } })
    tracker.observe({ ...base, nowMs: 150, positionEcef: { ...base.positionEcef, y: 1 } })
    tracker.observe({ ...base, nowMs: 900, positionEcef: { ...base.positionEcef, y: 1 } })
    tracker.observe({ ...base, nowMs: 950, positionEcef: { ...base.positionEcef, y: 1 } })
    expect(Object.values(exportedStats).every(value => value > 0)).toBe(true)

    tracker.reset()

    expect(tracker.stats).toBe(exportedStats)
    expect(Object.values(exportedStats).every(value => value === 0)).toBe(true)
  })

  it('does not count a mission-reset teleport and waits for the new mission first accepted plan', () => {
    const tracker = createMovementContinuity()
    tracker.acceptedPlan()
    tracker.observe(base)
    tracker.observe({ ...base, nowMs: 50, positionEcef: { ...base.positionEcef, y: 5 } })
    expect(tracker.stats.actualDistanceMeters).toBeCloseTo(5)
    tracker.reset()

    const newStart = { ...base.positionEcef, y: 1_000 }
    tracker.observe({ ...base, nowMs: 100, positionEcef: newStart })
    expect(Object.values(tracker.stats).every(value => value === 0)).toBe(true)
    tracker.observe({ ...base, nowMs: 150, positionEcef: newStart })
    expect(tracker.stats.waitingForFirstPlanTicks).toBe(1)
    expect(tracker.stats.waitingForRenewalTicks).toBe(0)
    expect(tracker.stats.actualDistanceMeters).toBe(0)
    tracker.observe({ ...base, nowMs: 200, positionEcef: { ...newStart, y: newStart.y + 0.1 } })
    expect(tracker.stats.actualDistanceMeters).toBeCloseTo(0.1)
  })

  it('preserves mission totals across a pause while starting a new sampling interval', () => {
    const tracker = createMovementContinuity()
    tracker.acceptedPlan()
    tracker.observe(base)
    tracker.observe({ ...base, nowMs: 50, positionEcef: { ...base.positionEcef, y: 1 } })
    tracker.observe({ ...base, nowMs: 100, positionEcef: { ...base.positionEcef, y: 1 } })
    const totals = { ...tracker.stats }
    tracker.beginRun()
    expect(tracker.stats).toEqual({ ...totals, currentRenewalStationaryMs: 0 })

    tracker.observe({ ...base, nowMs: 10_000, positionEcef: { ...base.positionEcef, y: 500 } })
    expect(tracker.stats.actualDistanceMeters).toBeCloseTo(1)
    expect(tracker.stats.unobservedMs).toBe(0)
    tracker.observe({ ...base, nowMs: 10_050, positionEcef: { ...base.positionEcef, y: 500.1 } })
    expect(tracker.stats.actualDistanceMeters).toBeCloseTo(1.1)
    expect(tracker.stats.movingTicks).toBe(2)
    expect(tracker.stats.maxRenewalStationaryMs).toBe(50)
  })

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
