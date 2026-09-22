import { readFileSync } from 'node:fs'
import { Cartesian3, IntersectionTests } from 'cesium'
import { describe, expect, it } from 'vitest'
import { decodeUrbanBuildingMesh } from './urban-building-mesh.js'
import { interpolateUrbanGeodesic, urbanGeodesicWindows } from './urban-geodesic-window.js'
import { createUrbanNavigation } from './urban-navigation.js'
import { distanceMeters, offsetGeoPoint } from './world-sensor.js'
import type { GeoPoint } from './world-sensor.js'

const mesh = decodeUrbanBuildingMesh(Uint8Array.from(readFileSync(new URL('./assets/tokyo-buildings.bin', import.meta.url))).buffer)
const navigation = createUrbanNavigation(mesh, { allowUnmappedTravel: true })
const point = (longitude: number, latitude: number): GeoPoint => ({ longitude, latitude, height: 38 })

function crossesKnownMesh(from: GeoPoint, to: GeoPoint): boolean {
  const a = Cartesian3.fromDegrees(from.longitude, from.latitude, 40)
  const b = Cartesian3.fromDegrees(to.longitude, to.latitude, 40)
  const corners = [new Cartesian3(), new Cartesian3(), new Cartesian3()]
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const index = mesh.indices[offset + corner] * 3
      Cartesian3.fromElements(mesh.originEcef[0] + mesh.positions[index], mesh.originEcef[1] + mesh.positions[index + 1], mesh.originEcef[2] + mesh.positions[index + 2], corners[corner])
    }
    if (IntersectionTests.lineSegmentTriangle(a, b, corners[0], corners[1], corners[2], false)) return true
  }
  return false
}

describe('open travel around a fixed set of known buildings', () => {
  it.each([0, 0.5, 1])('preserves endpoints and a valid direct candidate for a %s metre mission', meters => {
    for (const start of [point(139.761788, 35.676708), point(116.4, 39.9)]) {
      const goal = offsetGeoPoint(start, 0, meters)
      const routes = navigation.planCandidates(start, goal)
      expect(routes).toHaveLength(1)
      expect(routes[0].id).toBe('direct')
      expect(routes[0].waypoints).toEqual([start, goal])
      expect(routes[0].lengthMeters).toBeCloseTo(meters, 3)
      expect(Number.isFinite(routes[0].minimumClearanceMeters)).toBe(true)
      expect(navigation.isSegmentWalkable(start, goal)).toBe(true)
    }
  })

  it('interpolates centimetre-scale and near-antipodal coordinates without an acos precision collapse', () => {
    const from = point(139.76, 35.68)
    const to = offsetGeoPoint(from, 0, 0.02)
    expect(distanceMeters(from, interpolateUrbanGeodesic(from, to, 0.5))).toBeCloseTo(0.01, 5)
    const opposite = point(from.longitude - 180 + 1e-6, -from.latitude)
    const midway = interpolateUrbanGeodesic(from, opposite, 0.5)
    expect(Object.values(midway).every(Number.isFinite)).toBe(true)
    expect(distanceMeters(from, midway)).toBeGreaterThan(10_000_000)
  })

  it('allows legal points beyond the prepared bounds without allocating a global grid', () => {
    const size = navigation.grid.width * navigation.grid.height
    expect(size).toBeLessThan(4_000_000)
    const from = point(116.4, 39.9)
    const to = point(121.5, 31.2)
    expect(navigation.validatePoint(from)).toMatchObject({ valid: true, dataCoverage: 'unmapped' })
    const routes = navigation.planCandidates(from, to)
    expect(routes).toHaveLength(1)
    expect(routes[0].waypoints).toEqual([from, to])
    expect(routes[0].dataCoverage).toBe('unmapped')
    expect(Number.isFinite(routes[0].minimumClearanceMeters)).toBe(true)
    expect(navigation.isSegmentWalkable(from, to)).toBe(true)
    expect(navigation.grid.width * navigation.grid.height).toBe(size)
    expect(navigation.validatePoint(point(181, 0)).valid).toBe(false)
  })

  it('routes from the old user point to a point beyond the northern boundary while retaining known obstacle clearance', () => {
    const start = point(139.761788, 35.676708)
    const goal = point(139.766056, 35.705)
    const routes = navigation.planCandidates(start, goal)
    expect(routes.length).toBeGreaterThan(0)
    for (const route of routes) {
      expect(route.waypoints[0]).toEqual(start)
      expect(route.waypoints.at(-1)).toEqual(goal)
      expect(route.dataCoverage).toBe('mixed')
      expect(route.minimumClearanceMeters).toBeGreaterThanOrEqual(2)
      for (let index = 1; index < route.waypoints.length; index++) {
        expect(navigation.isSegmentWalkable(route.waypoints[index - 1], route.waypoints[index])).toBe(true)
        expect(crossesKnownMesh(route.waypoints[index - 1], route.waypoints[index])).toBe(false)
      }
    }
  }, 30_000)

  it('does not project antipodal travel back onto Tokyo buildings', () => {
    const from = point(-40.237, -35.68)
    const to = point(-40.23, -35.69)
    expect(navigation.validatePoint(from).valid).toBe(true)
    expect(navigation.planCandidates(from, to)[0].waypoints).toEqual([from, to])
    expect(navigation.planCandidates(from, to)[0].dataCoverage).toBe('unmapped')
  })

  it('does not skip known buildings when both mission endpoints are outside the data bounds', () => {
    const start = point(139.764, 35.64)
    const goal = point(139.764, 35.72)
    expect(navigation.isSegmentWalkable(start, goal)).toBe(false)
    const routes = navigation.planCandidates(start, goal)
    expect(routes.length).toBeGreaterThan(0)
    for (const route of routes) {
      expect(route.dataCoverage).toBe('mixed')
      expect(route.waypoints[0]).toEqual(start)
      expect(route.waypoints.at(-1)).toEqual(goal)
      expect(route.waypoints.length).toBeGreaterThan(2)
      for (let index = 1; index < route.waypoints.length; index++) {
        expect(navigation.isSegmentWalkable(route.waypoints[index - 1], route.waypoints[index])).toBe(true)
        expect(crossesKnownMesh(route.waypoints[index - 1], route.waypoints[index])).toBe(false)
      }
    }
  }, 30_000)

  it('keeps global and pole-crossing arc windows finite and bounded', () => {
    const from = point(0, 0)
    const to = point(180, 0)
    const midpoint = interpolateUrbanGeodesic(from, to, 0.5)
    expect(Object.values(midpoint).every(Number.isFinite)).toBe(true)
    expect(urbanGeodesicWindows(from, to, point(139.764, 35.681), 3_000).length).toBeLessThan(3)
    expect(navigation.planCandidates(point(179.9, 10), point(-179.9, 10))[0].lengthMeters).toBeLessThan(25_000)
  })
})
