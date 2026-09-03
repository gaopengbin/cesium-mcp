export interface HimalayaTerrainWorkerInput {
  terrainUrl: string
  level: number
  cartographicRadians: Float64Array
}

export interface HimalayaTerrainWorkerOutput {
  heights: Float64Array
}
