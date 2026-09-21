import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from '@loaders.gl/core'
import { GLTFLoader, postProcessGLTF } from '@loaders.gl/gltf'
import { Cartesian3, Cartographic, Math as CesiumMath, Matrix4, Quaternion } from 'cesium'
import draco3d from 'draco3d'

// Original PLATEAU textured geometry, decoded only for local collision meshes.
// No building extrusion, height adjustment, road surface or procedural geometry.
const TILESET_URL = 'https://assets.cms.plateau.reearth.io/assets/28/07d0a1-b6be-46ef-bd87-4f0683b5ef6e/13101_chiyoda-ku_pref_2025_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2/tileset.json'
const COVERAGE = [139.758, 35.676, 139.7678, 35.692]
const DOWNLOAD_LIMIT = 90_000_000
const OUTPUT = new URL('../src/assets/tokyo-colliders.json', import.meta.url)
const CACHE = new URL('../../../artifacts/plateau-city-cache/', import.meta.url)
const ORIGIN = Cartesian3.fromDegrees(139.76475, 35.681, 38)
// B3dmLoader defaults: upAxis Y, forwardAxis X. The RTC translations are ECEF.
// GltfLoader.js / B3dmLoader.js in Cesium combine tile * b3dmRTC * gltfRTC * axis * node.
const Y_UP_TO_Z_UP = Matrix4.fromColumnMajorArray([
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
  0, 0, 0, 1,
])
let downloadedBytes = 0
let networkDownloadedBytes = 0

function product(...matrices) {
  return matrices.reduce((left, right) => Matrix4.multiply(left, right, new Matrix4()), Matrix4.clone(Matrix4.IDENTITY))
}

function translation(values = [0, 0, 0]) {
  assert.equal(values.length, 3, 'RTC center requires three coordinates')
  assert(values.every(Number.isFinite), 'RTC center must be finite')
  return Matrix4.fromTranslation(Cartesian3.fromArray(values))
}

function nodeTransform(node) {
  if (node.matrix) {
    assert.equal(node.matrix.length, 16)
    return Matrix4.fromColumnMajorArray(node.matrix)
  }
  return Matrix4.fromTranslationQuaternionRotationScale(
    Cartesian3.fromArray(node.translation ?? [0, 0, 0]),
    Quaternion.unpack(node.rotation ?? [0, 0, 0, 1]),
    Cartesian3.fromArray(node.scale ?? [1, 1, 1]),
  )
}

function jsonChunk(buffer, start, length) {
  if (length === 0) return {}
  return JSON.parse(buffer.subarray(start, start + length).toString('utf8').replace(/[\s\0]+$/u, ''))
}

function parseB3dm(buffer) {
  assert.equal(buffer.subarray(0, 4).toString(), 'b3dm')
  assert.equal(buffer.readUInt32LE(4), 1, 'Only modern b3dm version 1 is supported')
  assert.equal(buffer.readUInt32LE(8), buffer.length, 'b3dm byteLength mismatch')
  const featureJsonLength = buffer.readUInt32LE(12)
  const featureBinaryLength = buffer.readUInt32LE(16)
  const batchJsonLength = buffer.readUInt32LE(20)
  const batchBinaryLength = buffer.readUInt32LE(24)
  const featureTable = jsonChunk(buffer, 28, featureJsonLength)
  const featureBinaryOffset = 28 + featureJsonLength
  const batchTable = jsonChunk(buffer, featureBinaryOffset + featureBinaryLength, batchJsonLength)
  const glbOffset = featureBinaryOffset + featureBinaryLength + batchJsonLength + batchBinaryLength
  assert(glbOffset + 20 <= buffer.length)
  assert.equal(buffer.subarray(glbOffset, glbOffset + 4).toString(), 'glTF')
  assert.equal(buffer.readUInt32LE(glbOffset + 4), 2, 'Only GLB 2 is supported')
  assert.equal(buffer.readUInt32LE(glbOffset + 16), 0x4E4F534A, 'GLB JSON must be the first chunk')
  const rawGltf = jsonChunk(buffer, glbOffset + 20, buffer.readUInt32LE(glbOffset + 12))
  const rtc = featureTable.RTC_CENTER
  const rtcCenter = Array.isArray(rtc) ? rtc : rtc?.byteOffset !== undefined
    ? [0, 1, 2].map(index => buffer.readFloatLE(featureBinaryOffset + rtc.byteOffset + index * 4))
    : [0, 0, 0]
  return { featureTable, batchTable, rtcCenter, rawGltf, glb: buffer.subarray(glbOffset) }
}

async function download(url, expectedLength) {
  const cachePath = new URL(`${createHash('sha256').update(String(url)).digest('hex')}.bin`, CACHE)
  try {
    const buffer = await readFile(cachePath)
    if (!expectedLength || buffer.length === expectedLength) {
      downloadedBytes += buffer.length
      assert(downloadedBytes <= DOWNLOAD_LIMIT, 'Source data budget exceeded')
      return buffer
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(240_000) })
      assert(response.ok, `${response.status} ${url}`)
      const declaredLength = Number(response.headers.get('content-length'))
      assert(!declaredLength || downloadedBytes + declaredLength <= DOWNLOAD_LIMIT, 'Source data budget exceeded')
      const chunks = []
      for await (const chunk of response.body) {
        networkDownloadedBytes += chunk.length
        assert(networkDownloadedBytes <= DOWNLOAD_LIMIT * 2, 'Network retry budget exceeded')
        chunks.push(Buffer.from(chunk))
      }
      const buffer = Buffer.concat(chunks)
      if (expectedLength) assert.equal(buffer.length, expectedLength, 'Source changed after size preflight')
      downloadedBytes += buffer.length
      assert(downloadedBytes <= DOWNLOAD_LIMIT, 'Source data budget exceeded')
      await mkdir(CACHE, { recursive: true })
      const temporary = new URL(`${cachePath.href}.partial`)
      await writeFile(temporary, buffer)
      await rename(temporary, cachePath)
      return buffer
    } catch (error) {
      if (attempt === 2 || !['TimeoutError', 'TypeError', 'AbortError'].includes(error.name)) throw error
      console.warn(`Retry ${attempt + 1}/2: ${new URL(url).pathname}`)
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
    }
  }
}

function findLeaves(tileset) {
  const bbox = COVERAGE.map(CesiumMath.toRadians)
  const leaves = []
  const visit = (tile, parentTransform) => {
    const tileRegion = tile.boundingVolume?.region
    assert(tileRegion, 'Expected geographic region bounds; refusing unverified spatial filtering')
    if (tileRegion[2] < bbox[0] || tileRegion[0] > bbox[2] || tileRegion[3] < bbox[1] || tileRegion[1] > bbox[3]) return
    const transform = product(parentTransform, tile.transform ? Matrix4.fromColumnMajorArray(tile.transform) : Matrix4.IDENTITY)
    const children = tile.children ?? []
    if (children.length === 0 && tile.content) {
      const region = tile.content.boundingVolume?.region ?? tileRegion
      if (region[2] < bbox[0] || region[0] > bbox[2] || region[3] < bbox[1] || region[1] > bbox[3]) return
      assert.equal(tile.geometricError, 0, 'Expected the highest-detail leaf')
      const uri = tile.content.uri ?? tile.content.url
      assert(uri.endsWith('.b3dm'), 'External tilesets or other formats need separate validation')
      leaves.push({ uri, region, transform })
    }
    for (const child of children) visit(child, transform)
  }
  visit(tileset.root, Matrix4.IDENTITY)
  return leaves.sort((a, b) => a.uri.localeCompare(b.uri))
}

function extendBounds(bounds, values) {
  for (let i = 0; i < 3; i++) {
    bounds[i] = Math.min(bounds[i], values[i])
    bounds[i + 3] = Math.max(bounds[i + 3], values[i])
  }
}

function emptyBounds() {
  return [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
}

function validateWorldPoint(worldPoint, region) {
  const cartographic = Cartographic.fromCartesian(worldPoint)
  assert(cartographic, 'Invalid ECEF vertex')
  // Compare against independently supplied source bounds: catches RTC/axis/node mistakes.
  const angularTolerance = 0.5 / 6_378_137
  assert(cartographic.longitude >= region[0] - angularTolerance && cartographic.longitude <= region[2] + angularTolerance, 'Longitude outside tile region; verify transform order')
  assert(cartographic.latitude >= region[1] - angularTolerance && cartographic.latitude <= region[3] + angularTolerance, 'Latitude outside tile region; verify transform order')
  assert(cartographic.height >= region[4] - 0.5 && cartographic.height <= region[5] + 0.5, 'Height outside tile region; verify RTC/up axis')
  return [CesiumMath.toDegrees(cartographic.longitude), CesiumMath.toDegrees(cartographic.latitude), cartographic.height]
}

async function decodeTile(buffer, leaf, positions, indices) {
  const b3dm = parseB3dm(buffer)
  assert(!b3dm.rawGltf.skins?.length && !b3dm.rawGltf.animations?.length, 'Animated/skinned city meshes are not supported')
  const modelTransform = product(
    leaf.transform,
    translation(b3dm.rtcCenter),
    translation(b3dm.rawGltf.extensions?.CESIUM_RTC?.center),
    Y_UP_TO_Z_UP,
  )
  const parsed = await parse(b3dm.glb, GLTFLoader, {
    worker: false,
    modules: { draco3d },
    gltf: {
      loadBuffers: true,
      loadImages: false,
      decompressMeshes: true,
      // loaders.gl interprets false here as excluded; WebP is irrelevant to geometry.
      excludeExtensions: { EXT_texture_webp: false },
    },
  })
  const gltf = postProcessGLTF(parsed)
  const startVertex = positions.length / 3
  const startIndex = indices.length
  const bounds = emptyBounds()
  let primitiveCount = 0
  const visit = (node, parent, ancestry) => {
    assert(!ancestry.has(node), 'Cyclic glTF hierarchy')
    const nextAncestry = new Set([...ancestry, node])
    const transform = product(parent, nodeTransform(node))
    for (const primitive of node.mesh?.primitives ?? []) {
      assert.equal(primitive.mode ?? 4, 4, 'Only TRIANGLES primitives are supported')
      assert(!primitive.targets?.length, 'Morph targets need separate collision preparation')
      const vertexPositions = primitive.attributes?.POSITION?.value
      assert(vertexPositions && vertexPositions.length % 3 === 0, 'Missing decoded POSITION')
      const primitiveIndices = primitive.indices?.value ?? Uint32Array.from({ length: vertexPositions.length / 3 }, (_, index) => index)
      assert.equal(primitiveIndices.length % 3, 0)
      const vertexOffset = positions.length / 3
      for (let offset = 0; offset < vertexPositions.length; offset += 3) {
        const point = Matrix4.multiplyByPoint(transform, Cartesian3.fromArray(vertexPositions, offset), new Cartesian3())
        extendBounds(bounds, validateWorldPoint(point, leaf.region))
        for (const coordinate of ['x', 'y', 'z']) {
          // Millimetre precision in a small local ECEF frame; no globe-scale Float32 loss.
          positions.push(Number((point[coordinate] - ORIGIN[coordinate]).toFixed(3)))
        }
      }
      for (const index of primitiveIndices) {
        assert(Number.isInteger(index) && index >= 0 && index < vertexPositions.length / 3)
        indices.push(vertexOffset + index)
      }
      primitiveCount++
    }
    for (const child of node.children ?? []) visit(child, transform, nextAncestry)
  }
  for (const node of gltf.scene?.nodes ?? gltf.scenes?.[0]?.nodes ?? []) visit(node, modelTransform, new Set())
  assert(positions.length / 3 > startVertex, `No geometry extracted: ${leaf.uri}`)
  const idKey = Object.keys(b3dm.batchTable).find(key => /^(gml[_:]?id|id)$/iu.test(key))
  const buildingIds = idKey && Array.isArray(b3dm.batchTable[idKey]) ? b3dm.batchTable[idKey].filter(id => typeof id === 'string') : []
  return {
    uri: leaf.uri,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    downloadedBytes: buffer.length,
    featureCount: b3dm.featureTable.BATCH_LENGTH ?? 0,
    buildingIds,
    buildingIdProperty: idKey ?? null,
    primitiveCount,
    vertexOffset: startVertex,
    vertexCount: positions.length / 3 - startVertex,
    indexOffset: startIndex,
    triangleCount: (indices.length - startIndex) / 3,
    sourceRegion: leaf.region,
    decodedBoundsDegreesHeight: bounds,
    tileTransform: Matrix4.toArray(leaf.transform),
    b3dmRtcCenter: b3dm.rtcCenter,
    gltfRtcCenter: b3dm.rawGltf.extensions?.CESIUM_RTC?.center ?? [0, 0, 0],
  }
}

// Independently cast a segment against the exported array representation.
function segmentHit(positions, indices, from, to) {
  const direction = Cartesian3.subtract(to, from, new Cartesian3())
  const length = Cartesian3.magnitude(direction)
  Cartesian3.normalize(direction, direction)
  let nearest = Infinity
  for (let i = 0; i < indices.length; i += 3) {
    const a = Cartesian3.fromArray(positions, indices[i] * 3)
    const b = Cartesian3.fromArray(positions, indices[i + 1] * 3)
    const c = Cartesian3.fromArray(positions, indices[i + 2] * 3)
    const edge1 = Cartesian3.subtract(b, a, new Cartesian3())
    const edge2 = Cartesian3.subtract(c, a, new Cartesian3())
    const p = Cartesian3.cross(direction, edge2, new Cartesian3())
    const det = Cartesian3.dot(edge1, p)
    if (Math.abs(det) < 1e-10) continue
    const displacement = Cartesian3.subtract(from, a, new Cartesian3())
    const u = Cartesian3.dot(displacement, p) / det
    if (u < 0 || u > 1) continue
    const q = Cartesian3.cross(displacement, edge1, new Cartesian3())
    const v = Cartesian3.dot(direction, q) / det
    if (v < 0 || u + v > 1) continue
    const distance = Cartesian3.dot(edge2, q) / det
    if (distance >= 0 && distance <= length && distance < nearest) nearest = distance
  }
  return Number.isFinite(nearest) ? nearest : null
}

function localPoint(longitude, latitude, height) {
  return Cartesian3.subtract(Cartesian3.fromDegrees(longitude, latitude, height), ORIGIN, new Cartesian3())
}

function verifyRayQueries(positions, indices) {
  const records = []
  // Real street endpoints supplied from the rendered city view; mesh queries are diagnostic,
  // not a claim that the flat 38 m walking surface is contained in the building source.
  const start = [139.764624924, 35.681082469]
  const goal = [139.764700799, 35.682126853]
  for (const height of [39, 40, 45]) {
    const from = localPoint(...start, height)
    const to = localPoint(...goal, height)
    records.push({ name: `street-segment-${height}m`, from: [...start, height], to: [...goal, height], nearestHitMeters: segmentHit(positions, indices, from, to) })
  }
  let tested = 0
  for (let i = 0; i < indices.length && tested < 3; i += 3) {
    const a = Cartesian3.fromArray(positions, indices[i] * 3)
    const b = Cartesian3.fromArray(positions, indices[i + 1] * 3)
    const c = Cartesian3.fromArray(positions, indices[i + 2] * 3)
    const normal = Cartesian3.cross(Cartesian3.subtract(b, a, new Cartesian3()), Cartesian3.subtract(c, a, new Cartesian3()), new Cartesian3())
    if (Cartesian3.magnitude(normal) < 0.1) continue
    Cartesian3.normalize(normal, normal)
    const center = Cartesian3.divideByScalar(Cartesian3.add(Cartesian3.add(a, b, new Cartesian3()), c, new Cartesian3()), 3, new Cartesian3())
    const offset = Cartesian3.multiplyByScalar(normal, 0.5, new Cartesian3())
    const from = Cartesian3.add(center, offset, new Cartesian3())
    const to = Cartesian3.subtract(center, offset, new Cartesian3())
    const hit = segmentHit(positions, indices, from, to)
    assert(hit !== null && hit <= 0.501, 'An exported source surface must block a crossing ray')
    records.push({ name: `source-triangle-crossing-${tested + 1}`, triangleIndex: i / 3, nearestHitMeters: hit })
    tested++
  }
  assert.equal(tested, 3)
  return records
}

function selfTestTransforms() {
  const matrix = product(
    translation([100, 200, 300]),
    translation([1000, 2000, 3000]),
    translation([10, 20, 30]),
    Y_UP_TO_Z_UP,
    nodeTransform({ translation: [1, 2, 3], scale: [2, 3, 4] }),
  )
  const point = Matrix4.multiplyByPoint(matrix, new Cartesian3(1, 2, 3), new Cartesian3())
  assert.deepEqual([point.x, point.y, point.z], [1113, 2205, 3338])
  const q = Quaternion.fromAxisAngle(Cartesian3.UNIT_Z, Math.PI / 2)
  const rotated = Matrix4.multiplyByPoint(nodeTransform({ rotation: [q.x, q.y, q.z, q.w] }), new Cartesian3(1, 0, 0), new Cartesian3())
  assert(Math.abs(rotated.x) < 1e-10 && Math.abs(rotated.y - 1) < 1e-10)
}

async function main() {
  selfTestTransforms()
  const tilesetBuffer = await download(TILESET_URL)
  const tileset = JSON.parse(tilesetBuffer.toString('utf8'))
  assert.equal(tileset.asset.gltfUpAxis ?? 'Y', 'Y', 'This preparation expects b3dm Y-up')
  const leaves = findLeaves(tileset)
  assert.equal(leaves.length, 64, 'Source changed: recheck spatial coverage and download budget')
  let expectedBytes = tilesetBuffer.length
  let headCursor = 0
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (headCursor < leaves.length) {
      const leaf = leaves[headCursor++]
      const response = await fetch(new URL(leaf.uri, TILESET_URL), { method: 'HEAD', signal: AbortSignal.timeout(60_000) })
      assert(response.ok)
      leaf.expectedBytes = Number(response.headers.get('content-length'))
      assert(leaf.expectedBytes > 0, 'Cannot preflight source budget without Content-Length')
      expectedBytes += leaf.expectedBytes
    }
  }))
  assert(expectedBytes <= DOWNLOAD_LIMIT, `Expected download ${expectedBytes} exceeds budget`)
  console.log(`Preflight: ${leaves.length} leaves, ${expectedBytes} source bytes, ${JSON.stringify(COVERAGE)}`)
  const buffers = new Array(leaves.length)
  let downloadCursor = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (downloadCursor < leaves.length) {
      const index = downloadCursor++
      const leaf = leaves[index]
      buffers[index] = await download(new URL(leaf.uri, TILESET_URL), leaf.expectedBytes)
      console.log(`Ready ${index + 1}/${leaves.length}: ${leaf.uri} (${buffers[index].length} bytes)`)
    }
  }))
  const positions = []
  const indices = []
  const tiles = []
  for (const [index, leaf] of leaves.entries()) {
    const buffer = buffers[index]
    const record = await decodeTile(buffer, leaf, positions, indices)
    buffers[index] = undefined
    tiles.push(record)
    console.log(`${leaf.uri}: ${record.vertexCount} vertices, ${record.triangleCount} triangles, bounds verified`)
  }
  assert(positions.every(Number.isFinite))
  assert(indices.every(index => index >= 0 && index < positions.length / 3))
  const rayChecks = verifyRayQueries(positions, indices)
  const buildingIds = new Set(tiles.flatMap(tile => tile.buildingIds))
  const output = {
    schemaVersion: 1,
    originEcef: [ORIGIN.x, ORIGIN.y, ORIGIN.z],
    coordinateEncoding: 'ECEF offsets in metres rounded to 0.001 m; add originEcef before frame.ecefToRapier',
    coverageBbox: COVERAGE,
    coverageNote: 'All highest-detail leaves intersecting this bbox are included, with whole source geometry retained. Outside this bbox coverage is incomplete. Buildings only; no road/terrain surface is synthesized.',
    source: {
      name: 'PLATEAU Chiyoda 2025 LOD2 textured building meshes',
      tilesetUrl: TILESET_URL,
      tilesetSha256: createHash('sha256').update(tilesetBuffer).digest('hex'),
      attribution: '出典：国土交通省 Project PLATEAU（千代田区・2025年度）',
      policyUrl: 'https://www.mlit.go.jp/plateau/site-policy/',
      modification: 'Original highest-detail building triangles decoded for collision; textures/materials omitted, RTC and transforms applied, vertices stored in a local ECEF frame. No footprint extrusion or height shift.',
      licenseBasis: 'PLATEAU general PDL1.0 terms and compatible CC BY 4.0 permission, unless separate resource rights apply.',
      heightDatum: 'Original source WGS84 ECEF positions are retained. Any 38 m local walking plane is a separate application approximation.',
    },
    counts: {
      tileCount: tiles.length,
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
      featureCount: tiles.reduce((count, tile) => count + tile.featureCount, 0),
      uniqueBuildingIdCount: buildingIds.size || null,
      buildingIdCountNote: 'Unique source gml_id values when present; featureCount counts batched features and may include building parts.',
      downloadedBytes,
    },
    verification: {
      transformFixturesPassed: true,
      allVerticesWithinOriginalTileRegions: true,
      regionToleranceMeters: 0.5,
      rayChecks,
    },
    tiles,
    positions,
    indices,
  }
  await mkdir(dirname(fileURLToPath(OUTPUT)), { recursive: true })
  const temporaryOutput = new URL(`${OUTPUT.href}.partial`)
  await writeFile(temporaryOutput, `${JSON.stringify(output)}\n`)
  await rename(temporaryOutput, OUTPUT)
  console.log(JSON.stringify({ output: fileURLToPath(OUTPUT), counts: output.counts, networkDownloadedBytes, rayChecks }, null, 2))
}

if (process.argv.includes('--self-test')) {
  selfTestTransforms()
  console.log('City collider transform fixtures passed; no network requests or output changes')
} else {
  await main()
}
