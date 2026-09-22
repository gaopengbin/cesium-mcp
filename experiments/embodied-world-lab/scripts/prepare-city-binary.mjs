import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const sourceUrl = new URL('../src/assets/tokyo-colliders.json', import.meta.url)
const binaryUrl = new URL('../src/assets/tokyo-buildings.bin', import.meta.url)
const metadataUrl = new URL('../src/assets/tokyo-buildings.meta.json', import.meta.url)
const sourceBytes = await readFile(sourceUrl)
const source = JSON.parse(sourceBytes.toString('utf8'))
if (source.schemaVersion !== 1 || source.positions.length % 3 || source.indices.length % 3) {
  throw new Error('Unsupported source building mesh')
}

// Only identical source coordinates share a vertex. Float32 conversion happens
// afterwards, so nearby but distinct source vertices are never merged.
const unique = new Map()
const remap = new Uint32Array(source.positions.length / 3)
const positions = []
let maxCoordinateErrorMeters = 0
for (let i = 0; i < source.positions.length; i += 3) {
  const point = source.positions.slice(i, i + 3)
  if (!point.every(Number.isFinite)) throw new Error('Non-finite source position')
  const key = point.join(',')
  let index = unique.get(key)
  if (index === undefined) {
    index = positions.length / 3
    unique.set(key, index)
    for (const coordinate of point) {
      const rounded = Math.fround(coordinate)
      maxCoordinateErrorMeters = Math.max(maxCoordinateErrorMeters, Math.abs(rounded - coordinate))
      positions.push(rounded)
    }
  }
  remap[i / 3] = index
}
if (maxCoordinateErrorMeters >= 0.001) throw new Error('Float32 coordinates exceeded the 1 mm error budget')
const indices = Uint32Array.from(source.indices, index => {
  if (!Number.isInteger(index) || index < 0 || index >= remap.length) throw new Error('Invalid source index')
  return remap[index]
})
const metadata = {
  schemaVersion: 1,
  byteOrder: 'little-endian',
  coordinateEncoding: 'Float32 ECEF offsets in metres; add originEcef. Identical source vertices deduplicated; triangle order and winding retained.',
  originEcef: source.originEcef,
  coverageBbox: source.coverageBbox,
  counts: {
    tileCount: source.counts.tileCount,
    vertexCount: positions.length / 3,
    sourceVertexCount: source.counts.vertexCount,
    triangleCount: source.counts.triangleCount,
    uniqueBuildingIdCount: source.counts.uniqueBuildingIdCount,
  },
  source: {
    ...source.source,
    modification: `${source.source.modification} Identical vertices deduplicated and positions encoded as Float32 for shared rendering, collision and navigation. White rendering omits source textures.`,
    originalJsonSha256: createHash('sha256').update(sourceBytes).digest('hex'),
    maxCoordinateErrorMeters,
  },
}
const header = Buffer.from(JSON.stringify(metadata), 'utf8')
const positionsOffset = Math.ceil((16 + header.length) / 8) * 8
const indicesOffset = positionsOffset + positions.length * 4
const output = Buffer.alloc(indicesOffset + indices.length * 4)
output.write('CTYMESH1', 0, 'ascii')
output.writeUInt32LE(1, 8)
output.writeUInt32LE(header.length, 12)
header.copy(output, 16)
for (let i = 0; i < positions.length; i++) output.writeFloatLE(positions[i], positionsOffset + i * 4)
for (let i = 0; i < indices.length; i++) output.writeUInt32LE(indices[i], indicesOffset + i * 4)
await writeFile(binaryUrl, output)
await writeFile(metadataUrl, `${JSON.stringify({ ...metadata, byteLength: output.length, binarySha256: createHash('sha256').update(output).digest('hex') }, null, 2)}\n`)
console.log(JSON.stringify({ sourceBytes: sourceBytes.length, binaryBytes: output.length, ...metadata.counts, maxCoordinateErrorMeters }, null, 2))
