import { Cartesian3, ComponentDatatype, Matrix4, PrimitiveCollection } from 'cesium'
import type { GeometryInstance, Viewer } from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import type { UrbanBuildingMesh } from './urban-building-mesh.js'
import { addUrbanWhiteBuildings, createUrbanWhiteBuildingGeometry, URBAN_WHITE_BUILDINGS_ID } from './urban-white-buildings.js'

const mesh: UrbanBuildingMesh = {
  schemaVersion: 1,
  byteOrder: 'little-endian',
  coordinateEncoding: 'ECEF offsets',
  originEcef: [-3_959_562, 3_350_267, 3_699_520],
  coverageBbox: [139.758, 35.676, 139.7678, 35.692],
  counts: { vertexCount: 4, sourceVertexCount: 6, triangleCount: 2, tileCount: 1, uniqueBuildingIdCount: 1 },
  source: {
    name: 'test fixture', attribution: '', tilesetUrl: '', policyUrl: '', originalJsonSha256: '0'.repeat(64), maxCoordinateErrorMeters: 0,
  },
  // Two perpendicular faces sharing an edge: normals must not be averaged.
  positions: new Float32Array([0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0, 5]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  byteLength: 0,
}

describe('local white urban buildings', () => {
  it('keeps the collision triangles and sharp, unaveraged building face normals', () => {
    const geometry = createUrbanWhiteBuildingGeometry(mesh)
    expect(geometry.attributes.position!.componentDatatype).toBe(ComponentDatatype.DOUBLE)
    expect(Array.from(geometry.indices!)).toEqual([0, 1, 2, 3, 4, 5])
    const positions = geometry.attributes.position!.values as Float64Array
    const normals = geometry.attributes.normal!.values as Float32Array
    for (let vertex = 0; vertex < mesh.indices.length; vertex++) {
      expect(Array.from(positions.slice(vertex * 3, vertex * 3 + 3)))
        .toEqual(Array.from(mesh.positions.slice(mesh.indices[vertex] * 3, mesh.indices[vertex] * 3 + 3)))
      expect(Array.from(normals.slice(vertex * 3, vertex * 3 + 3)))
        .toEqual(vertex < 3 ? [0, 0, 1] : [1, 0, 0])
    }
  })

  it('places one resident primitive at the source ECEF origin and removes it cleanly', () => {
    const primitives = new PrimitiveCollection()
    const requestRender = vi.fn()
    const viewer = { scene: { primitives, requestRender } } as unknown as Viewer
    const handle = addUrbanWhiteBuildings(viewer, mesh)
    expect(primitives.length).toBe(1)
    const position = Matrix4.multiplyByPoint(handle.primitive.modelMatrix, new Cartesian3(3, 0, 0), new Cartesian3())
    expect(position).toEqual(new Cartesian3(mesh.originEcef[0] + 3, mesh.originEcef[1], mesh.originEcef[2]))
    expect(handle.primitive.asynchronous).toBe(false)
    expect(handle.primitive.allowPicking).toBe(true)
    expect((handle.primitive.geometryInstances as GeometryInstance).id).toBe(URBAN_WHITE_BUILDINGS_ID)
    expect(requestRender).toHaveBeenCalledOnce()
    handle.destroy()
    handle.destroy()
    expect(primitives.length).toBe(0)
    expect(handle.primitive.isDestroyed()).toBe(true)
  })
})
