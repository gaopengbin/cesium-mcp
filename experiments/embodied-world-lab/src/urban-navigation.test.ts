import { readFileSync } from 'node:fs'

import { Cartesian3, Cartographic, IntersectionTests, Math as CesiumMath, Matrix4, Transforms } from 'cesium'
import { describe, expect, it } from 'vitest'

import { createUrbanNavigation } from './urban-navigation.js'
import type { UrbanNavigationMesh } from './urban-navigation.js'
import type { GeoPoint } from './world-sensor.js'

// Independent Cesium intersection query against the original ECEF triangles,
// without using the navigation grid or its private ray implementation.
function crossesMeshAtWalkingHeight(mesh: UrbanNavigationMesh, from: GeoPoint, to: GeoPoint): boolean {
  const start = Cartesian3.fromDegrees(from.longitude, from.latitude, 40)
  const end = Cartesian3.fromDegrees(to.longitude, to.latitude, 40)
  const vertices = [new Cartesian3(), new Cartesian3(), new Cartesian3()]
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const index = mesh.indices[offset + corner] * 3
      Cartesian3.fromElements(
        mesh.originEcef[0] + mesh.positions[index],
        mesh.originEcef[1] + mesh.positions[index + 1],
        mesh.originEcef[2] + mesh.positions[index + 2],
        vertices[corner],
      )
    }
    if (IntersectionTests.lineSegmentTriangle(start, end, vertices[0], vertices[1], vertices[2], false)) return true
  }
  return false
}

function localGeo(x: number, y: number): GeoPoint {
  const origin = Cartesian3.fromDegrees(139.76475, 35.681, 38)
  const world = Matrix4.multiplyByPoint(Transforms.eastNorthUpToFixedFrame(origin), new Cartesian3(x, y, 0), new Cartesian3())
  const point = Cartographic.fromCartesian(world)
  return { longitude: CesiumMath.toDegrees(point.longitude), latitude: CesiumMath.toDegrees(point.latitude), height: 38 }
}

function boxMesh(boxes = [[-10, -20, 10, 20]]): UrbanNavigationMesh {
  const origin = Cartesian3.fromDegrees(139.76475, 35.681, 38)
  const frame = Transforms.eastNorthUpToFixedFrame(origin)
  const local = boxes.flatMap(([x0, y0, x1, y1]) => [
    [x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0],
    [x0, y0, 25], [x1, y0, 25], [x1, y1, 25], [x0, y1, 25],
  ])
  const positions = local.flatMap(point => {
    const world = Matrix4.multiplyByPoint(frame, Cartesian3.fromArray(point), new Cartesian3())
    return [world.x - origin.x, world.y - origin.y, world.z - origin.z]
  })
  return {
    originEcef: [origin.x, origin.y, origin.z], positions,
    indices: boxes.flatMap((_, index) => [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7].map(vertex => vertex + index * 8)),
    coverageBbox: [139.763, 35.679, 139.7665, 35.683],
  }
}

describe('urban navigation candidates from building meshes', () => {
  it('returns one direct option with exact unsnapped endpoints when no obstacle blocks them', () => {
    const navigation = createUrbanNavigation(boxMesh())
    const start = localGeo(-44.73, -11.28)
    const goal = localGeo(-43.84, 12.59)
    const routes = navigation.planCandidates(start, goal)
    expect(routes.map(route => route.id)).toEqual(['direct'])
    expect(routes[0].waypoints).toEqual([start, goal])
    expect(navigation.planCandidates(start, start)[0].lengthMeters).toBe(0)
  })

  it('explains invalid clicks and suggests a legal nearby point without moving input coordinates', () => {
    const navigation = createUrbanNavigation(boxMesh())
    const inside = localGeo(0, 0)
    const original = { ...inside }
    const result = navigation.validatePoint(inside)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('near-building')
    expect(result.nearestValidPoint).toBeDefined()
    expect(navigation.validatePoint(result.nearestValidPoint!).valid).toBe(true)
    expect(inside).toEqual(original)
    expect(navigation.validatePoint({ ...inside, longitude: NaN }).reason).toBe('invalid-coordinate')
    expect(navigation.validatePoint({ ...inside, longitude: 139.8 }).reason).toBe('outside-coverage')
    expect(navigation.validatePoint({ ...inside, longitude: 139.7631 }).reason).toBe('boundary-margin')
  })

  it('finds a connected route around alternating barriers without falsely calling it left or right', () => {
    const mesh = boxMesh([[-200, -75, 20, -55], [-20, 55, 200, 75], [-80, -20, -60, 20]])
    const navigation = createUrbanNavigation(mesh)
    const start = localGeo(0, -130)
    const goal = localGeo(0, 140)
    const routes = navigation.planCandidates(start, goal)
    expect(routes.map(route => route.id)).toEqual(['detour'])
    expect(routes[0].waypoints[0]).toEqual(start)
    expect(routes[0].waypoints.at(-1)).toEqual(goal)
    expect(routes[0].waypoints.some(point => point.longitude > start.longitude + 0.0002)).toBe(true)
    expect(routes[0].waypoints.some(point => point.longitude < start.longitude - 0.0002)).toBe(true)
    for (let index = 1; index < routes[0].waypoints.length; index++) {
      expect(crossesMeshAtWalkingHeight(mesh, routes[0].waypoints[index - 1], routes[0].waypoints[index])).toBe(false)
    }
  })

  it('returns no candidates for valid endpoints in disconnected free regions', () => {
    const navigation = createUrbanNavigation(boxMesh([[-200, -20, 200, 20], [-80, -110, -60, -70]]))
    const start = localGeo(0, -60)
    const goal = localGeo(0, 60)
    expect(navigation.validatePoint(start).valid).toBe(true)
    expect(navigation.validatePoint(goal).valid).toBe(true)
    expect(navigation.planCandidates(start, goal)).toEqual([])
  })

  it('fills solid building interiors and preserves radius clearance around a closed mesh', () => {
    const navigation = createUrbanNavigation(boxMesh())
    expect(navigation.clearanceAt({ longitude: 139.76475, latitude: 35.681, height: 38 })).toBe(0)
    const challenge = navigation.defaultChallenge
    expect(challenge.directMeshHitDistanceMeters).toBeGreaterThan(0)
    expect(navigation.isSegmentWalkable(challenge.start, challenge.goal)).toBe(false)
    expect(challenge.candidates.map(candidate => candidate.id)).toEqual(['left', 'right'])
    for (const candidate of challenge.candidates) {
      expect(candidate.lengthMeters).toBeGreaterThan(challenge.directDistanceMeters)
      expect(candidate.minimumClearanceMeters).toBeGreaterThanOrEqual(2)
      for (let index = 1; index < candidate.waypoints.length; index++) {
        expect(navigation.isSegmentWalkable(candidate.waypoints[index - 1], candidate.waypoints[index])).toBe(true)
      }
    }
    expect(challenge.candidates[0].waypoints).not.toEqual(challenge.candidates[1].waypoints)
  })

  it('rejects endpoints in buildings or outside the verified coverage', () => {
    const navigation = createUrbanNavigation(boxMesh())
    const inside = { longitude: 139.76475, latitude: 35.681, height: 38 }
    expect(navigation.planCandidates(inside, navigation.defaultChallenge.goal)).toEqual([])
    const outside = { longitude: 139.8, latitude: 35.7, height: 38 }
    expect(navigation.clearanceAt(outside)).toBe(0)
    expect(navigation.isSegmentWalkable(outside, navigation.defaultChallenge.start)).toBe(false)
  })

  it('finds two finite, mesh-blocked choices in the actual PLATEAU asset, within the sensor boundary', () => {
    const data = JSON.parse(readFileSync(new URL('./assets/tokyo-colliders.json', import.meta.url), 'utf8')) as UrbanNavigationMesh
    const navigation = createUrbanNavigation(data)
    const challenge = navigation.defaultChallenge
    expect(challenge.directMeshHitDistanceMeters).toBeGreaterThan(0)
    expect(challenge.directMeshHitDistanceMeters).toBeLessThan(challenge.directDistanceMeters)
    expect(crossesMeshAtWalkingHeight(data, challenge.start, challenge.goal)).toBe(true)
    expect(challenge.candidates).toHaveLength(2)
    for (const candidate of challenge.candidates) {
      expect(candidate.lengthMeters).toBeGreaterThanOrEqual(80)
      expect(candidate.lengthMeters).toBeLessThanOrEqual(180)
      expect(candidate.minimumClearanceMeters).toBeGreaterThanOrEqual(2)
      for (const point of candidate.waypoints) {
        expect(navigation.coverageClearanceAt(point)).toBeGreaterThanOrEqual(34)
        expect(navigation.clearanceAt(point)).toBeGreaterThanOrEqual(2)
      }
      for (let index = 1; index < candidate.waypoints.length; index++) {
        expect(navigation.isSegmentWalkable(candidate.waypoints[index - 1], candidate.waypoints[index])).toBe(true)
        expect(crossesMeshAtWalkingHeight(data, candidate.waypoints[index - 1], candidate.waypoints[index])).toBe(false)
      }
    }
    expect(navigation.planCandidates(challenge.start, challenge.goal)).toEqual(challenge.candidates)
  }, 30_000)

  it('supports exact user endpoints across several real city street sections, including a mixed-side detour', () => {
    const data = JSON.parse(readFileSync(new URL('./assets/tokyo-colliders.json', import.meta.url), 'utf8')) as UrbanNavigationMesh
    const navigation = createUrbanNavigation(data)
    const pairs = [
      [[139.76375, 35.68045], [139.76375, 35.68245]],
      [[139.7648, 35.68045], [139.76375, 35.68165]],
      [[139.766, 35.67985], [139.76435, 35.68105]],
    ]
    for (const [index, [from, to]] of pairs.entries()) {
      const start = { longitude: from[0], latitude: from[1], height: 38 }
      const goal = { longitude: to[0], latitude: to[1], height: 38 }
      expect(navigation.validatePoint(start).valid).toBe(true)
      expect(navigation.validatePoint(goal).valid).toBe(true)
      expect(crossesMeshAtWalkingHeight(data, start, goal)).toBe(true)
      const candidates = navigation.planCandidates(start, goal)
      expect(candidates.length).toBeGreaterThan(0)
      if (index === 0) expect(candidates.map(candidate => candidate.id)).toEqual(['detour'])
      for (const candidate of candidates) {
        expect(candidate.lengthMeters).toBeGreaterThan(150)
        expect(candidate.lengthMeters).toBeLessThan(400)
        expect(candidate.minimumClearanceMeters).toBeGreaterThanOrEqual(2)
        expect(candidate.waypoints[0]).toEqual(start)
        expect(candidate.waypoints.at(-1)).toEqual(goal)
        for (let point = 1; point < candidate.waypoints.length; point++) {
          expect(navigation.isSegmentWalkable(candidate.waypoints[point - 1], candidate.waypoints[point])).toBe(true)
          expect(crossesMeshAtWalkingHeight(data, candidate.waypoints[point - 1], candidate.waypoints[point])).toBe(false)
        }
      }
    }
  }, 30_000)
})
