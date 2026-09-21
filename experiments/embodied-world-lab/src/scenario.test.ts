import { describe, expect, it } from 'vitest'

import {
  createScenario,
  LANDSLIDE_CENTER,
  LANDSLIDE_HAZARD,
  NAMCHE_GOAL,
  NAMCHE_START,
  SCENARIO_PRESETS,
} from './scenario.js'
import { distanceMeters, initialBearingRadians } from './world-sensor.js'
import type { GeoPoint } from './world-sensor.js'

function offset(point: GeoPoint) {
  const distance = distanceMeters(NAMCHE_START, point)
  const bearing = initialBearingRadians(NAMCHE_START, point)
  return {
    east: Math.sin(bearing) * distance,
    north: Math.cos(bearing) * distance,
  }
}

describe('Namche experiment scenarios', () => {
  it('keeps the original experiment coordinates and risk configuration compatible', () => {
    const scenario = createScenario('inspection', 260921)

    expect(NAMCHE_START).toEqual({ longitude: 86.71445, latitude: 27.80555, height: 0 })
    expect(scenario.start).toEqual(NAMCHE_START)
    expect(scenario.goal).toEqual(NAMCHE_GOAL)
    expect(scenario.hazard.center).toEqual(LANDSLIDE_CENTER)
    expect(LANDSLIDE_HAZARD.radiusMeters).toBe(22)
    expect(LANDSLIDE_HAZARD.sensorRangeMeters).toBe(105)
  })

  it('offers three distinct geographic presets and one generated scenario', () => {
    expect(SCENARIO_PRESETS.map(preset => preset.id))
      .toEqual(['inspection', 'wide-detour', 'near-risk', 'random'])
    const presetGeometry = SCENARIO_PRESETS.slice(0, 3).map(preset => {
      const { goal, hazard } = createScenario(preset.id, 7)
      return JSON.stringify({ goal, center: hazard.center, radius: hazard.radiusMeters })
    })
    expect(new Set(presetGeometry).size).toBe(3)
    expect(SCENARIO_PRESETS.every(preset => preset.description.includes('实验'))).toBe(true)
  })

  it('reproduces a random layout from the same seed while different seeds vary it', () => {
    expect(createScenario('random', 846641)).toEqual(createScenario('random', 846641))
    expect(createScenario('random', 846641).goal)
      .not.toEqual(createScenario('random', 846642).goal)
  })

  it('leaves fixed preset geometry independent of the seed', () => {
    for (const preset of SCENARIO_PRESETS.filter(value => value.id !== 'random')) {
      const first = createScenario(preset.id, 1)
      const second = createScenario(preset.id, 2)
      expect(first.start).toEqual(second.start)
      expect(first.goal).toEqual(second.goal)
      expect(first.hazard).toEqual(second.hazard)
    }
  })

  it('keeps endpoints clear of the hazard and the complete layout within sampled terrain', () => {
    const scenarios = [
      ...SCENARIO_PRESETS.map(preset => createScenario(preset.id, 260921)),
      ...Array.from({ length: 500 }, (_, seed) => createScenario('random', seed * 1999)),
    ]

    for (const scenario of scenarios) {
      expect(scenario.start).toEqual(NAMCHE_START)
      expect(distanceMeters(scenario.start, scenario.goal)).toBeGreaterThan(100)
      expect(distanceMeters(scenario.start, scenario.goal)).toBeLessThan(210)
      for (const point of [scenario.start, scenario.goal]) {
        expect(distanceMeters(point, scenario.hazard.center) - scenario.hazard.radiusMeters)
          .toBeGreaterThanOrEqual(20)
        const local = offset(point)
        // The current sensor probes up to 28 m beyond the actor position.
        expect(Math.abs(local.east) + 28).toBeLessThanOrEqual(210)
        expect(Math.abs(local.north) + 28).toBeLessThanOrEqual(210)
      }
      const center = offset(scenario.hazard.center)
      expect(Math.hypot(center.east, center.north) + scenario.hazard.radiusMeters)
        .toBeLessThan(210)
      expect(Math.abs(center.east) + scenario.hazard.radiusMeters).toBeLessThan(210)
      expect(Math.abs(center.north) + scenario.hazard.radiusMeters).toBeLessThan(210)
    }
  })

  it('normalizes invalid seeds and returns independent mutable point objects', () => {
    for (const seed of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(createScenario('random', seed)).toEqual(createScenario('random', 260921))
    }
    expect(createScenario('random', -12.5).seed).toBe(12)
    const first = createScenario('inspection', 1)
    first.start.height = 9999
    first.goal.height = 9999
    first.hazard.center.height = 9999
    const second = createScenario('inspection', 1)
    expect(second.start.height).toBe(0)
    expect(second.goal.height).toBe(0)
    expect(second.hazard.center.height).toBe(0)
    expect(NAMCHE_START.height).toBe(0)
  })
})
