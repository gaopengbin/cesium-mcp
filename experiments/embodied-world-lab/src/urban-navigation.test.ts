import { readFileSync } from 'node:fs'

import { Cartesian3, IntersectionTests, Matrix4, Transforms } from 'cesium'
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

function boxMesh(): UrbanNavigationMesh {
  const origin = Cartesian3.fromDegrees(139.76475, 35.681, 38)
  const frame = Transforms.eastNorthUpToFixedFrame(origin)
  const local = [
    [-10, -20, 0], [10, -20, 0], [10, 20, 0], [-10, 20, 0],
    [-10, -20, 25], [10, -20, 25], [10, 20, 25], [-10, 20, 25],
  ]
  const positions = local.flatMap(point => {
    const world = Matrix4.multiplyByPoint(frame, Cartesian3.fromArray(point), new Cartesian3())
    return [world.x - origin.x, world.y - origin.y, world.z - origin.z]
  })
  return {
    originEcef: [origin.x, origin.y, origin.z], positions,
    indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7],
    coverageBbox: [139.763, 35.679, 139.7665, 35.683],
  }
}

describe('urban navigation candidates from building meshes', () => {
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
})
