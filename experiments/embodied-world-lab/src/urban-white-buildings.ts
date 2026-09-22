import {
  BoundingSphere,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive,
  PrimitiveType,
  ShadowMode,
} from 'cesium'
import type { Viewer } from 'cesium'
import type { UrbanBuildingMesh } from './urban-building-mesh.js'

export const URBAN_WHITE_BUILDINGS_ID = 'urban-white-buildings'

/** Expand only the render vertices so adjacent walls retain crisp face normals. */
export function createUrbanWhiteBuildingGeometry(mesh: UrbanBuildingMesh): Geometry {
  const positions = new Float64Array(mesh.indices.length * 3)
  const normals = new Float32Array(positions.length)
  const indices = new Uint32Array(mesh.indices.length)
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const a = mesh.indices[triangle] * 3
    const b = mesh.indices[triangle + 1] * 3
    const c = mesh.indices[triangle + 2] * 3
    const abx = mesh.positions[b] - mesh.positions[a]
    const aby = mesh.positions[b + 1] - mesh.positions[a + 1]
    const abz = mesh.positions[b + 2] - mesh.positions[a + 2]
    const acx = mesh.positions[c] - mesh.positions[a]
    const acy = mesh.positions[c + 1] - mesh.positions[a + 1]
    const acz = mesh.positions[c + 2] - mesh.positions[a + 2]
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    const magnitude = Math.hypot(nx, ny, nz)
    for (let vertex = 0; vertex < 3; vertex++) {
      const source = mesh.indices[triangle + vertex] * 3
      const offset = (triangle + vertex) * 3
      positions.set(mesh.positions.subarray(source, source + 3), offset)
      normals[offset] = magnitude > 0 ? nx / magnitude : 0
      normals[offset + 1] = magnitude > 0 ? ny / magnitude : 0
      normals[offset + 2] = magnitude > 0 ? nz / magnitude : 1
      indices[triangle + vertex] = triangle + vertex
    }
  }
  const attributes = new GeometryAttributes()
  attributes.position = new GeometryAttribute({ componentDatatype: ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions })
  attributes.normal = new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: normals })
  return new Geometry({
    attributes,
    indices,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(positions),
  })
}

export interface UrbanWhiteBuildingHandle {
  primitive: Primitive
  destroy: () => void
}

export function addUrbanWhiteBuildings(viewer: Viewer, mesh: UrbanBuildingMesh): UrbanWhiteBuildingHandle {
  const primitive = viewer.scene.primitives.add(new Primitive({
    geometryInstances: new GeometryInstance({
      id: URBAN_WHITE_BUILDINGS_ID,
      geometry: createUrbanWhiteBuildingGeometry(mesh),
      attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#e7eaee')) },
    }),
    modelMatrix: Matrix4.fromTranslation(Cartesian3.fromArray(mesh.originEcef)),
    appearance: new PerInstanceColorAppearance({ flat: false, translucent: false, closed: true }),
    asynchronous: false,
    // A stable object pick lets the mission editor reject a clicked facade or
    // roof, even when depth reconstruction cannot supply a useful height.
    allowPicking: true,
    shadows: ShadowMode.DISABLED,
  })) as Primitive
  viewer.scene.requestRender()
  return {
    primitive,
    destroy: () => {
      if (!primitive.isDestroyed()) viewer.scene.primitives.remove(primitive)
    },
  }
}
