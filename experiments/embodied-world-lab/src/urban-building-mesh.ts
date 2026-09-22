export interface UrbanBuildingMeshMetadata {
  schemaVersion: 1
  byteOrder: 'little-endian'
  coordinateEncoding: string
  originEcef: [number, number, number]
  coverageBbox: [number, number, number, number]
  counts: {
    tileCount: number
    vertexCount: number
    sourceVertexCount: number
    triangleCount: number
    uniqueBuildingIdCount: number
  }
  source: {
    name: string
    attribution: string
    tilesetUrl: string
    policyUrl: string
    originalJsonSha256: string
    maxCoordinateErrorMeters: number
  }
}

export interface UrbanBuildingMesh extends UrbanBuildingMeshMetadata {
  positions: Float32Array
  indices: Uint32Array
  byteLength: number
}

function invalidMesh(): Error {
  return new Error('城市建筑数据不完整，暂不能开始导航')
}

export function decodeUrbanBuildingMesh(buffer: ArrayBuffer): UrbanBuildingMesh {
  if (buffer.byteLength < 16) throw invalidMesh()
  const view = new DataView(buffer)
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 8))
  const headerLength = view.getUint32(12, true)
  if (magic !== 'CTYMESH1' || view.getUint32(8, true) !== 1 || headerLength < 2 || headerLength > 65_536 || 16 + headerLength > buffer.byteLength) throw invalidMesh()
  let metadata: UrbanBuildingMeshMetadata
  try {
    metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 16, headerLength))) as UrbanBuildingMeshMetadata
  } catch {
    throw invalidMesh()
  }
  if (!metadata || typeof metadata !== 'object') throw invalidMesh()
  const validTuple = (tuple: unknown, length: number): tuple is number[] => Array.isArray(tuple) && tuple.length === length && tuple.every(Number.isFinite)
  const counts = metadata.counts
  if (metadata.schemaVersion !== 1 || metadata.byteOrder !== 'little-endian'
    || !validTuple(metadata.originEcef, 3) || !validTuple(metadata.coverageBbox, 4)
    || metadata.coverageBbox[0] >= metadata.coverageBbox[2] || metadata.coverageBbox[1] >= metadata.coverageBbox[3]
    || !counts || ![counts.vertexCount, counts.sourceVertexCount, counts.triangleCount, counts.tileCount, counts.uniqueBuildingIdCount].every(value => Number.isSafeInteger(value) && value > 0)
    || counts.vertexCount > counts.sourceVertexCount
    || !metadata.source || !/^[a-f0-9]{64}$/.test(metadata.source.originalJsonSha256)
    || !Number.isFinite(metadata.source.maxCoordinateErrorMeters) || metadata.source.maxCoordinateErrorMeters < 0 || metadata.source.maxCoordinateErrorMeters >= 0.001) throw invalidMesh()
  // Typed-array views use native byte order. All supported browser targets are
  // little-endian; fail explicitly rather than misreading coordinates otherwise.
  if (new Uint8Array(new Uint32Array([1]).buffer)[0] !== 1) throw invalidMesh()
  const positionsOffset = Math.ceil((16 + headerLength) / 8) * 8
  const indicesOffset = positionsOffset + counts.vertexCount * 3 * 4
  const expectedLength = indicesOffset + counts.triangleCount * 3 * 4
  if (!Number.isSafeInteger(expectedLength) || expectedLength !== buffer.byteLength) throw invalidMesh()
  const positions = new Float32Array(buffer, positionsOffset, counts.vertexCount * 3)
  const indices = new Uint32Array(buffer, indicesOffset, counts.triangleCount * 3)
  for (const coordinate of positions) if (!Number.isFinite(coordinate)) throw invalidMesh()
  for (const index of indices) if (index >= counts.vertexCount) throw invalidMesh()
  return { ...metadata, positions, indices, byteLength: buffer.byteLength }
}

let cachedMesh: Promise<UrbanBuildingMesh> | undefined

/** One binary download and one decoded mesh shared by rendering, physics and routing. */
export function loadUrbanBuildingMesh(): Promise<UrbanBuildingMesh> {
  cachedMesh ??= (async () => {
    const response = await fetch(new URL('./assets/tokyo-buildings.bin', import.meta.url))
    if (!response.ok) throw new Error('城市建筑数据加载失败，请重试')
    return decodeUrbanBuildingMesh(await response.arrayBuffer())
  })().catch(error => {
    cachedMesh = undefined
    throw error
  })
  return cachedMesh
}
