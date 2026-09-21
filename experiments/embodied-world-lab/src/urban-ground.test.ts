import { Cartesian3, Cartographic, Matrix4, Transforms } from 'cesium'
import { describe, expect, it } from 'vitest'

import { createUrbanGroundColliderMesh, URBAN_COLLISION_BOUNDS, URBAN_GROUND_HEIGHT } from './urban-scene.js'

describe('kilometre-scale urban ground collision', () => {
  it('covers the expanded district and follows the rendered ellipsoid height at distant corners', () => {
    const anchor = Cartesian3.fromDegrees(139.76475, 35.681, URBAN_GROUND_HEIGHT)
    const toWorld = Transforms.eastNorthUpToFixedFrame(anchor)
    const toEnu = Matrix4.inverseTransformation(toWorld, new Matrix4())
    const mesh = createUrbanGroundColliderMesh(point => {
      const enu = Matrix4.multiplyByPoint(toEnu, point, new Cartesian3())
      return { x: enu.x, y: enu.z, z: -enu.y }
    })
    const coordinates = []
    for (let index = 0; index < mesh.positions.length; index += 3) {
      const enu = new Cartesian3(mesh.positions[index], -mesh.positions[index + 2], mesh.positions[index + 1])
      const point = Cartographic.fromCartesian(Matrix4.multiplyByPoint(toWorld, enu, new Cartesian3()))
      expect(point.height).toBeCloseTo(URBAN_GROUND_HEIGHT, 2)
      coordinates.push([point.longitude * 180 / Math.PI, point.latitude * 180 / Math.PI])
    }
    expect(Math.min(...coordinates.map(point => point[0]))).toBeCloseTo(URBAN_COLLISION_BOUNDS[0], 7)
    expect(Math.max(...coordinates.map(point => point[0]))).toBeCloseTo(URBAN_COLLISION_BOUNDS[2], 7)
    expect(Math.min(...coordinates.map(point => point[1]))).toBeCloseTo(URBAN_COLLISION_BOUNDS[1], 7)
    expect(Math.max(...coordinates.map(point => point[1]))).toBeCloseTo(URBAN_COLLISION_BOUNDS[3], 7)
    expect(mesh.indices.length).toBeGreaterThan(1_000)
    const vertexAt = (index: number) => new Cartesian3(mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2])
    for (let index = 0; index < mesh.indices.length; index += 3) {
      const a = vertexAt(mesh.indices[index])
      const b = vertexAt(mesh.indices[index + 1])
      const c = vertexAt(mesh.indices[index + 2])
      const normal = Cartesian3.cross(Cartesian3.subtract(b, a, new Cartesian3()), Cartesian3.subtract(c, a, new Cartesian3()), new Cartesian3())
      expect(normal.y).toBeGreaterThan(0)
    }
  })
})
