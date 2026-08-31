import { describe, expect, it } from 'vitest'

import {
  buildTerrainAwareFlightPlan,
  densifyFlightRoute,
} from './flight-planning.js'

describe('terrain-aware flight planning', () => {
  it('densifies route anchors without duplicating segment boundaries', () => {
    const samples = densifyFlightRoute([
      { longitude: 86.7, latitude: 27.8, name: 'start' },
      { longitude: 86.8, latitude: 27.9, name: 'ridge' },
      { longitude: 86.9, latitude: 28.0, name: 'finish' },
    ], 5_000)

    expect(samples[0]).toMatchObject({ longitude: 86.7, latitude: 27.8, name: 'start' })
    expect(samples.at(-1)).toMatchObject({ longitude: 86.9, latitude: 28.0, name: 'finish' })
    expect(samples.filter(sample => sample.longitude === 86.8 && sample.latitude === 27.9)).toHaveLength(1)
    expect(samples.length).toBeGreaterThan(3)
  })

  it('raises the planned route above a ridge while the naive route violates clearance', () => {
    const plan = buildTerrainAwareFlightPlan([
      { longitude: 86.7, latitude: 27.8, terrainHeight: 3_000 },
      { longitude: 86.8, latitude: 27.9, terrainHeight: 8_500 },
      { longitude: 86.9, latitude: 28.0, terrainHeight: 3_200 },
    ], {
      clearanceMeters: 600,
      maxClimbAngleDegrees: 12,
      maxDescentAngleDegrees: 14,
    })

    expect(plan.metrics.minimumClearanceMeters).toBeGreaterThanOrEqual(600)
    expect(plan.metrics.naiveMinimumClearanceMeters).toBeLessThan(0)
    expect(plan.metrics.naiveViolationCount).toBe(1)
    expect(plan.samples[1]!.flightHeight).toBe(9_100)
  })

  it('anticipates a steep climb and delays a steep descent', () => {
    const plan = buildTerrainAwareFlightPlan([
      { longitude: 86.70, latitude: 27.80, terrainHeight: 3_000 },
      { longitude: 86.71, latitude: 27.80, terrainHeight: 3_000 },
      { longitude: 86.72, latitude: 27.80, terrainHeight: 6_000 },
      { longitude: 86.73, latitude: 27.80, terrainHeight: 3_000 },
    ], {
      clearanceMeters: 500,
      maxClimbAngleDegrees: 10,
      maxDescentAngleDegrees: 10,
    })

    expect(plan.samples[0]!.flightHeight).toBeGreaterThan(3_500)
    expect(plan.samples[1]!.flightHeight).toBeGreaterThan(3_500)
    expect(plan.samples[3]!.flightHeight).toBeGreaterThan(3_500)
    expect(plan.metrics.maximumClimbAngleDegrees).toBeLessThanOrEqual(10.001)
    expect(plan.metrics.maximumDescentAngleDegrees).toBeLessThanOrEqual(10.001)
  })

  it('rejects invalid terrain samples and options', () => {
    expect(() => buildTerrainAwareFlightPlan([
      { longitude: 86.7, latitude: 27.8, terrainHeight: Number.NaN },
      { longitude: 86.8, latitude: 27.9, terrainHeight: 4_000 },
    ], {
      clearanceMeters: 500,
      maxClimbAngleDegrees: 10,
      maxDescentAngleDegrees: 10,
    })).toThrow('finite')

    expect(() => densifyFlightRoute([
      { longitude: 86.7, latitude: 27.8 },
      { longitude: 86.8, latitude: 27.9 },
    ], 0)).toThrow('positive')
  })
})
