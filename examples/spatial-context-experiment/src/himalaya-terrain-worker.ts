import {
  ArcGISTiledElevationTerrainProvider,
  Cartographic,
  HeightmapTerrainData,
} from 'cesium'
import { executeWorldWorkerMessage } from 'cesium-mcp-spatial'
import Lerc from 'lerc'
import type {
  TerrainProvider,
  TilingScheme,
} from 'cesium'

import type {
  HimalayaTerrainWorkerInput,
  HimalayaTerrainWorkerOutput,
} from './himalaya-terrain-worker-protocol.js'

interface TerrainWorkerScope {
  CESIUM_BASE_URL?: string
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const workerScope = globalThis as unknown as TerrainWorkerScope
workerScope.CESIUM_BASE_URL = '/'

let terrainUrl: string | undefined
let terrainProviderPromise: Promise<TerrainProvider> | undefined

workerScope.onmessage = async (event) => {
  const response = await executeWorldWorkerMessage<
    HimalayaTerrainWorkerInput,
    HimalayaTerrainWorkerOutput
  >(event.data, sampleTerrainInWorker)
  if (!response) return
  if (response.ok) {
    workerScope.postMessage(response, [response.output.heights.buffer as ArrayBuffer])
  } else {
    workerScope.postMessage(response)
  }
}

async function sampleTerrainInWorker(
  input: HimalayaTerrainWorkerInput,
): Promise<HimalayaTerrainWorkerOutput> {
  validateInput(input)
  const terrainProvider = await getTerrainProvider(input.terrainUrl)
  const samples: TerrainSample[] = []
  for (let index = 0; index < input.cartographicRadians.length; index += 2) {
    samples.push({
      index: index / 2,
      position: new Cartographic(
        input.cartographicRadians[index]!,
        input.cartographicRadians[index + 1]!,
      ),
    })
  }

  const heights = new Float64Array(samples.length)
  heights.fill(Number.NaN)
  const tileRequests = groupSamplesByTile(
    terrainProvider.tilingScheme,
    input.level,
    samples,
  )
  await Promise.all(tileRequests.map((request) => sampleTerrainTile(
    input.terrainUrl,
    terrainProvider.tilingScheme,
    request,
    heights,
  )))
  return { heights }
}

interface TerrainSample {
  index: number
  position: Cartographic
}

interface TerrainTileRequest {
  x: number
  y: number
  level: number
  samples: TerrainSample[]
}

function groupSamplesByTile(
  tilingScheme: TilingScheme,
  level: number,
  samples: TerrainSample[],
): TerrainTileRequest[] {
  const requests = new Map<string, TerrainTileRequest>()
  for (const sample of samples) {
    const coordinate = tilingScheme.positionToTileXY(sample.position, level)
    if (!coordinate) continue
    const key = `${coordinate.x}/${coordinate.y}`
    let request = requests.get(key)
    if (!request) {
      request = { x: coordinate.x, y: coordinate.y, level, samples: [] }
      requests.set(key, request)
    }
    request.samples.push(sample)
  }
  return [...requests.values()]
}

async function sampleTerrainTile(
  terrainUrl: string,
  tilingScheme: TilingScheme,
  request: TerrainTileRequest,
  heights: Float64Array,
): Promise<void> {
  const baseUrl = terrainUrl.endsWith('/') ? terrainUrl : `${terrainUrl}/`
  const response = await fetch(
    `${baseUrl}tile/${request.level}/${request.y}/${request.x}`,
  )
  if (!response.ok) {
    throw new Error(
      `ArcGIS terrain tile ${request.level}/${request.y}/${request.x} failed with ${response.status}`,
    )
  }
  interpolateTileSamples(
    tilingScheme,
    request,
    await response.arrayBuffer(),
    heights,
  )
}

function interpolateTileSamples(
  tilingScheme: TilingScheme,
  request: TerrainTileRequest,
  encodedHeightmap: ArrayBuffer,
  heights: Float64Array,
): void {
  const decoded = Lerc.decode(encodedHeightmap)
  if (decoded.statistics[0]?.minValue === Number.MAX_VALUE) {
    throw new Error(`ArcGIS terrain tile ${request.x}/${request.y} contains no valid heights`)
  }
  const pixels = decoded.pixels[0]
  if (!pixels) throw new Error('ArcGIS terrain tile contains no elevation band')

  const decodedTerrainData = new HeightmapTerrainData({
    buffer: pixels,
    width: decoded.width,
    height: decoded.height,
    structure: { elementMultiplier: 1 },
  })
  const rectangle = tilingScheme.tileXYToRectangle(
    request.x,
    request.y,
    request.level,
  )
  for (const sample of request.samples) {
    const height = decodedTerrainData.interpolateHeight(
      rectangle,
      sample.position.longitude,
      sample.position.latitude,
    )
    heights[sample.index] = height !== undefined && Number.isFinite(height)
      ? height
      : Number.NaN
  }
}

function getTerrainProvider(url: string): Promise<TerrainProvider> {
  if (!terrainProviderPromise || terrainUrl !== url) {
    terrainUrl = url
    terrainProviderPromise = ArcGISTiledElevationTerrainProvider.fromUrl(url)
  }
  return terrainProviderPromise
}

function validateInput(input: HimalayaTerrainWorkerInput): void {
  if (!input.terrainUrl) throw new Error('Terrain URL is required')
  if (!Number.isInteger(input.level) || input.level < 0) {
    throw new RangeError('Terrain level must be a non-negative integer')
  }
  if (input.cartographicRadians.length % 2 !== 0) {
    throw new Error('Cartographic coordinate buffer must contain longitude/latitude pairs')
  }
}
