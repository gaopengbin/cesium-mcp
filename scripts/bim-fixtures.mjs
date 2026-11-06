// Synthetic engineering model for deterministic offline rendering checks.
import { BoxGeometry, Cartesian3, Matrix4, Transforms, VertexFormat, Cartographic, Math as CesiumMath } from 'cesium'

export const bimIds = ['9007199254740993', '9007199254740994']
const transform = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(116.4, 39.9, 0))
export const bimElements = bimIds.map((id, i) => {
  const center = Matrix4.multiplyByPoint(transform, new Cartesian3(i ? 30 : -30, 0, 20), new Cartesian3())
  const geo = Cartographic.fromCartesian(center)
  return { id, label: i ? 'QA column' : 'QA wall', properties: { 'IFC Class Name': { value: i ? 'ifccolumn' : 'ifcwall' }, 'Quantity.Net Volume': { value: i ? 20 : 10, displayValue: `${i ? 20 : 10} m³`, units: 'm³' } }, location: { center: { longitude: CesiumMath.toDegrees(geo.longitude), latitude: CesiumMath.toDegrees(geo.latitude), height: geo.height }, radius: 30 } }
})
const pad = (buffer, alignment = 4, fill = 0) => Buffer.concat([buffer, Buffer.alloc((alignment - buffer.length % alignment) % alignment, fill)])
export function bimFixture(options = {}) {
  const positions = [], normals = [], batches = [], indices = []
  for (let batch = 0; batch < 2; batch++) {
    const geometry = BoxGeometry.createGeometry(BoxGeometry.fromDimensions({ dimensions: new Cartesian3(20, 20, 40), vertexFormat: VertexFormat.POSITION_AND_NORMAL }))
    const offset = positions.length / 3
    for (let i = 0; i < geometry.attributes.position.values.length; i += 3) positions.push(geometry.attributes.position.values[i] + (batch ? 30 : -30), geometry.attributes.position.values[i + 1], geometry.attributes.position.values[i + 2] + 20)
    normals.push(...geometry.attributes.normal.values)
    batches.push(...Array(geometry.attributes.position.values.length / 3).fill(batch))
    indices.push(...Array.from(geometry.indices, index => index + offset))
  }
  const binary = [], views = []
  for (const [array, target] of [[new Float32Array(positions), 34962], [new Float32Array(normals), 34962], [new Uint16Array(batches), 34962], [new Uint16Array(indices), 34963]]) {
    const byteOffset = binary.reduce((n, b) => n + b.length, 0)
    const buffer = Buffer.from(array.buffer)
    views.push({ buffer: 0, byteOffset, byteLength: buffer.length, target })
    binary.push(pad(buffer))
  }
  const data = Buffer.concat(binary)
  const gltf = { asset: { version: '2.0' }, extensionsUsed: ['KHR_materials_unlit'], scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], buffers: [{ byteLength: data.length }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-40, -10, 0], max: [40, 10, 40] }, { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' }, { bufferView: 2, componentType: 5123, count: batches.length, type: 'SCALAR' }, { bufferView: 3, componentType: 5123, count: indices.length, type: 'SCALAR' }],
    materials: [{ extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] }, doubleSided: true }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, _BATCHID: 2 }, indices: 3, material: 0 }] }],
  }
  if (options.emissiveStrength !== undefined) {
    gltf.extensionsUsed = ['KHR_materials_emissive_strength']
    gltf.materials = [{ extensions: { KHR_materials_emissive_strength: { emissiveStrength: options.emissiveStrength } }, emissiveFactor: [0.1, 0, 0], pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true }]
  }
  const json = pad(Buffer.from(JSON.stringify(gltf)), 4, 32)
  const glbHeader = Buffer.alloc(20), binHeader = Buffer.alloc(8)
  glbHeader.writeUInt32LE(0x46546c67, 0); glbHeader.writeUInt32LE(2, 4); glbHeader.writeUInt32LE(28 + json.length + data.length, 8); glbHeader.writeUInt32LE(json.length, 12); glbHeader.writeUInt32LE(0x4e4f534a, 16)
  binHeader.writeUInt32LE(data.length, 0); binHeader.writeUInt32LE(0x004e4942, 4)
  const glb = Buffer.concat([glbHeader, json, binHeader, data])
  const feature = pad(Buffer.from(JSON.stringify({ BATCH_LENGTH: 2 })), 8, 32)
  const metadata = Buffer.from(JSON.stringify({ element: bimIds, visible: [true, true] }))
  const table = Buffer.concat([metadata, Buffer.alloc((8 - (28 + feature.length + metadata.length) % 8) % 8, 32)])
  const header = Buffer.alloc(28)
  header.write('b3dm'); header.writeUInt32LE(1, 4); header.writeUInt32LE(28 + feature.length + table.length + glb.length, 8); header.writeUInt32LE(feature.length, 12); header.writeUInt32LE(table.length, 20)
  return { b3dm: Buffer.concat([header, feature, table, glb]), tileset: { asset: { version: '1.0', gltfUpAxis: 'Z' }, geometricError: 200, root: { transform: Array.from(transform), boundingVolume: { box: [0, 0, 20, 50, 0, 0, 0, 20, 0, 0, 0, 30] }, geometricError: 0, content: { uri: 'model.b3dm' } } } }
}
