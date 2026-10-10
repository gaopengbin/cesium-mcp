// Test fixtures derived from Natural Earth rivers. No synthetic flow attributes.
import buildVectorGltfFromMVT from '../node_modules/@cesium/engine/Source/Scene/buildVectorGltfFromMVT.js'
import { Cartesian3 } from 'cesium'

export function createReceiverFixture() {
  // Artificial raised surface, solely for draping QA; no real-world building claim.
  const corners = [[87, 26], [90, 26], [90, 31], [87, 31]].map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, 180000))
  const points = [0, 1, 2, 0, 2, 3].map(index => corners[index])
  const data = Buffer.from(new Float32Array(points.flatMap(point => [point.x, point.y, point.z])).buffer)
  const doc = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: data.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: data.length, target: 34962 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 6, type: 'VEC3', min: ['x', 'y', 'z'].map(key => Math.min(...points.map(point => point[key]))), max: ['x', 'y', 'z'].map(key => Math.max(...points.map(point => point[key]))) }],
    materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.25, 0.25, 0.25, 1], metallicFactor: 0, roughnessFactor: 1 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0, mode: 4 }] }],
  }
  const json = Buffer.from(JSON.stringify(doc))
  const jsonChunk = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)])
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + jsonChunk.length + data.length, 8)
  header.writeUInt32LE(jsonChunk.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(data.length); binHeader.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, jsonChunk, binHeader, data])
}

const extent = 65536
const project = ([lon, lat]) => ({
  x: Math.round((lon + 180) / 360 * extent),
  y: Math.round((1 - Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360)) / Math.PI) / 2 * extent),
})
const varint = value => {
  const bytes = []
  do { const next = value % 128; value = Math.floor(value / 128); bytes.push(next | (value ? 128 : 0)) } while (value)
  return Buffer.from(bytes)
}
const integer = (field, value) => Buffer.concat([varint(field * 8), varint(value)])
const bytes = (field, value) => Buffer.concat([varint(field * 8 + 2), varint(value.length), value])
const string = (field, value) => bytes(field, Buffer.from(value))
const zigzag = value => value < 0 ? -value * 2 - 1 : value * 2

export function createRiverFixtures(geojson) {
  const features = geojson.features.filter(feature => feature.geometry.type.includes('LineString')).map(feature => ({
    type: 'LineString',
    geometry: (feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates).map(line => line.map(project)),
    properties: feature.properties,
  }))
  return encodeFixtures(features)
}

export function createMixedFixtures() {
  // Synthetic QA geometries are explicitly labelled, separate from the real rivers.
  return encodeFixtures([
    { type: 'Point', geometry: [[87, 27]].map(project), properties: { name: 'QA point', kind: 'point', ne_id: 1 } },
    { type: 'Polygon', geometry: [[[89, 26], [89, 28], [90, 28], [90, 26]]].map(ring => ring.map(project)), properties: { name: 'QA polygon', kind: 'polygon', ne_id: 2 } },
  ])
}

function encodeFixtures(features) {
  const layer = { name: 'rivers', extent, features }
  const keys = [...new Set(features.flatMap(feature => Object.keys(feature.properties)))]
  const values = []
  const encoded = features.map(feature => {
    const tags = []
    for (const [key, value] of Object.entries(feature.properties)) {
      if (value === null) continue
      tags.push(keys.indexOf(key), values.length)
      if (typeof value === 'number') {
        const number = Buffer.alloc(8)
        number.writeDoubleLE(value)
        values.push(Buffer.concat([varint(3 * 8 + 1), number]))
      } else if (typeof value === 'boolean') values.push(integer(7, Number(value)))
      else values.push(string(1, String(value)))
    }
    const commands = []
    let x = 0
    let y = 0
    for (const line of feature.type === 'Point' ? [feature.geometry] : feature.geometry) {
      if (!line.length) continue
      commands.push(9, zigzag(line[0].x - x), zigzag(line[0].y - y))
      x = line[0].x; y = line[0].y
      if (line.length > 1) commands.push((line.length - 1) * 8 + 2)
      for (const point of line.slice(1)) {
        commands.push(zigzag(point.x - x), zigzag(point.y - y))
        x = point.x; y = point.y
      }
      if (feature.type === 'Polygon') commands.push(15)
    }
    return bytes(2, Buffer.concat([bytes(2, Buffer.concat(tags.map(varint))), integer(3, feature.type === 'Point' ? 1 : feature.type === 'Polygon' ? 3 : 2), bytes(4, Buffer.concat(commands.map(varint)))]))
  })
  const mvt = bytes(3, Buffer.concat([string(1, 'rivers'), ...encoded, ...keys.map(key => string(3, key)), ...values.map(value => bytes(4, value)), integer(5, extent), integer(15, 2)]))
  const glb = buildVectorGltfFromMVT({ layers: [layer] }, { tileZ: 0, tileX: 0, tileY: 0 }, { featureIdProperty: 'ne_id' })
  return { mvt, glb: Buffer.from(glb) }
}
