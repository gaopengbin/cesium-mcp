import { describe, expect, it } from 'vitest'
import { urbanTravelSpeed } from './urban-travel-speed.js'

describe('urban travel speed', () => {
  it.each([3, 8, 12])('respects the selected %s m/s travel speed on a distant straight', (maximum) => {
    expect(urbanTravelSpeed(maximum, 100, 0)).toBe(maximum)
  })

  it('caps travel at 12 m/s without raising a lower user limit', () => {
    expect(urbanTravelSpeed(20, 100, 0)).toBe(12)
    expect(urbanTravelSpeed(1.5, 100, 0)).toBe(1.5)
    expect(urbanTravelSpeed(1.5, 1, 0)).toBe(1.5)
  })

  it('slows before a waypoint and retains a bounded approach speed', () => {
    expect(urbanTravelSpeed(12, 16, 0)).toBe(8)
    expect(urbanTravelSpeed(12, 10, 0)).toBe(5)
    expect(urbanTravelSpeed(12, 4, 0)).toBe(2.8)
    expect(urbanTravelSpeed(12, 0, 0)).toBe(2.8)
  })

  it('does not accelerate out of a corner when the next waypoint becomes distant', () => {
    expect(urbanTravelSpeed(12, 1.9, 0)).toBe(2.8)
    expect(urbanTravelSpeed(12, 100, Math.PI / 2)).toBe(0)
    expect(urbanTravelSpeed(12, 100, -Math.PI / 2)).toBe(0)
  })

  it('keeps small steering corrections at travel speed and stops large turns', () => {
    expect(urbanTravelSpeed(8, 100, 0.2)).toBeCloseTo(8)
    expect(urbanTravelSpeed(8, 100, -0.2)).toBeCloseTo(8)
    expect(urbanTravelSpeed(8, 100, 0.8)).toBe(0)
    expect(urbanTravelSpeed(8, 100, -0.8)).toBe(0)
    expect(urbanTravelSpeed(8, 100, Math.PI)).toBe(0)
  })

  it('progressively restores speed as the actor aligns in either direction', () => {
    const errors = [0.8, 0.7, 0.5, 0.3, 0.2]
    const speeds = errors.map(error => urbanTravelSpeed(8, 100, error))
    for (let index = 1; index < speeds.length; index += 1) {
      expect(speeds[index]).toBeGreaterThan(speeds[index - 1])
    }
    for (const error of errors) {
      expect(urbanTravelSpeed(8, 100, error)).toBeCloseTo(urbanTravelSpeed(8, 100, -error))
    }
    expect(urbanTravelSpeed(8, 100, 0.5)).toBeCloseTo(4)
  })

  it('allows turn safety to reduce speed below the waypoint approach floor', () => {
    const speed = urbanTravelSpeed(8, 1, 0.7)
    expect(speed).toBeGreaterThan(0)
    expect(speed).toBeLessThan(2.8)
    expect(urbanTravelSpeed(8, 1, 0.8)).toBe(0)
  })

  it('uses the shortest equivalent angular error', () => {
    expect(urbanTravelSpeed(8, 100, Math.PI * 2)).toBeCloseTo(8)
    expect(urbanTravelSpeed(8, 100, Math.PI * 2 + 0.5)).toBeCloseTo(4)
    expect(urbanTravelSpeed(8, 100, -Math.PI * 2 - 0.5)).toBeCloseTo(4)
  })

  it.each([
    [Number.NaN, 100, 0],
    [Number.POSITIVE_INFINITY, 100, 0],
    [8, Number.NaN, 0],
    [8, Number.POSITIVE_INFINITY, 0],
    [8, 100, Number.NaN],
    [8, 100, Number.NEGATIVE_INFINITY],
    [0, 100, 0],
    [-8, 100, 0],
    [8, -1, 0],
  ])('stops for invalid input (%s, %s, %s)', (maximum, distance, error) => {
    expect(urbanTravelSpeed(maximum, distance, error)).toBe(0)
  })
})
