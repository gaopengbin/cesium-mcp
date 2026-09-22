import { describe, expect, it, vi } from 'vitest'
import { urbanMotionSpeedLimit } from './urban-motion-speed-limit.js'
import { offsetGeoPoint } from './world-sensor.js'
import type { GeoPoint } from './world-sensor.js'

const start: GeoPoint = { longitude: 139.76, latitude: 35.68, height: 38 }
const metersPerLatitudeDegree = Math.PI * 6_378_137 / 180
const northOf = (point: GeoPoint) => (point.latitude - start.latitude) * metersPerLatitudeDegree

// This wall is only 10 cm thick. Testing endpoints alone would miss it.
const thinWallIsClear = (from: GeoPoint, to: GeoPoint) => {
  const low = Math.min(northOf(from), northOf(to))
  const high = Math.max(northOf(from), northOf(to))
  return high < 10 || low > 10.1
}

describe('urban motion speed limit', () => {
  it('retains 300 m/s on a clear local segment and preserves altitude', () => {
    const clear = vi.fn((_from: GeoPoint, _to: GeoPoint) => true)
    const speed = urbanMotionSpeedLimit({ position: start, headingRadians: 0, proposedSpeedMetersPerSecond: 300, segmentIsWalkable: clear })
    expect(speed).toBe(300)
    expect(clear).toHaveBeenCalledTimes(2)
    const destination = clear.mock.calls[1][1] as GeoPoint
    expect(northOf(destination)).toBeCloseTo(60)
    expect(destination.longitude).toBe(start.longitude)
    expect(destination.height).toBe(start.height)
  })

  it('does not cross a thin wall in one 20 Hz sensing interval at a requested 300 m/s', () => {
    const unguardedEnd = offsetGeoPoint(start, 0, 300 / 20)
    expect(northOf(unguardedEnd)).toBeGreaterThan(10.1)
    const speed = urbanMotionSpeedLimit({ position: start, headingRadians: 0, proposedSpeedMetersPerSecond: 300, segmentIsWalkable: thinWallIsClear })
    expect(speed).toBeGreaterThan(48)
    expect(speed).toBeLessThan(50)
    expect(thinWallIsClear(start, offsetGeoPoint(start, 0, speed / 20))).toBe(true)
    expect(thinWallIsClear(start, offsetGeoPoint(start, 0, speed * 0.2))).toBe(true)
  })

  it('rechecks from the current position and stops before the wall over repeated sensing intervals', () => {
    let position = start
    for (let tick = 0; tick < 80; tick += 1) {
      const speed = urbanMotionSpeedLimit({ position, headingRadians: 0, proposedSpeedMetersPerSecond: 300, segmentIsWalkable: thinWallIsClear })
      const next = offsetGeoPoint(position, 0, speed / 20)
      expect(thinWallIsClear(position, next)).toBe(true)
      position = next
    }
    expect(northOf(position)).toBeLessThan(10)
    expect(northOf(position)).toBeGreaterThan(9.5)
    expect(urbanMotionSpeedLimit({ position, headingRadians: 0, proposedSpeedMetersPerSecond: 300, segmentIsWalkable: thinWallIsClear })).toBe(0)
  })

  it('covers a frame longer than the normal lookahead instead of stepping through the wall', () => {
    const speed = urbanMotionSpeedLimit({ position: start, headingRadians: 0, proposedSpeedMetersPerSecond: 300, segmentIsWalkable: thinWallIsClear, frameDeltaSeconds: 0.5 })
    expect(speed).toBeGreaterThan(18)
    expect(speed).toBeLessThan(20)
    expect(thinWallIsClear(start, offsetGeoPoint(start, 0, speed * 0.5))).toBe(true)
  })

  it('stops immediately when the starting point is not walkable', () => {
    const clear = vi.fn(() => false)
    expect(urbanMotionSpeedLimit({ position: start, headingRadians: 0, proposedSpeedMetersPerSecond: 300, segmentIsWalkable: clear })).toBe(0)
    expect(clear).toHaveBeenCalledExactlyOnceWith(start, start)
  })

  it('makes only eight bisection checks and returns a proven clear lower bound', () => {
    const clear = vi.fn(thinWallIsClear)
    const speed = urbanMotionSpeedLimit({ position: start, headingRadians: 0, proposedSpeedMetersPerSecond: 300, segmentIsWalkable: clear })
    expect(clear).toHaveBeenCalledTimes(10)
    expect(50 - speed).toBeLessThanOrEqual(300 / 2 ** 8)
    expect(thinWallIsClear(start, offsetGeoPoint(start, 0, speed * 0.2))).toBe(true)
  })

  it('uses the actor heading and does not brake for a wall in another direction', () => {
    expect(urbanMotionSpeedLimit({ position: start, headingRadians: Math.PI / 2, proposedSpeedMetersPerSecond: 300, segmentIsWalkable: thinWallIsClear })).toBe(300)
    expect(urbanMotionSpeedLimit({ position: start, headingRadians: Math.PI, proposedSpeedMetersPerSecond: 300, segmentIsWalkable: thinWallIsClear })).toBe(300)
  })

  it('does not raise an already conservative proposed speed', () => {
    expect(urbanMotionSpeedLimit({ position: start, headingRadians: 0, proposedSpeedMetersPerSecond: 2, segmentIsWalkable: thinWallIsClear })).toBe(2)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('stops for invalid speed %s without querying geometry', proposedSpeedMetersPerSecond => {
    const clear = vi.fn(() => true)
    expect(urbanMotionSpeedLimit({ position: start, headingRadians: 0, proposedSpeedMetersPerSecond, segmentIsWalkable: clear })).toBe(0)
    expect(clear).not.toHaveBeenCalled()
  })

  it.each([
    { headingRadians: Number.NaN },
    { headingRadians: Number.POSITIVE_INFINITY },
    { frameDeltaSeconds: -0.1 },
    { frameDeltaSeconds: Number.NaN },
    { frameDeltaSeconds: Number.POSITIVE_INFINITY },
    { position: { ...start, latitude: 91 } },
    { position: { ...start, longitude: Number.NaN } },
    { position: { ...start, height: Number.NaN } },
  ])('stops for invalid motion input %j', invalid => {
    const clear = vi.fn(() => true)
    expect(urbanMotionSpeedLimit({ position: start, headingRadians: 0, proposedSpeedMetersPerSecond: 300, segmentIsWalkable: clear, ...invalid })).toBe(0)
    expect(clear).not.toHaveBeenCalled()
  })
})
