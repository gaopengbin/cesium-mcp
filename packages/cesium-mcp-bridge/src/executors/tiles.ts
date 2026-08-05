import type { BridgeExecutor } from '../bridge.js'
import type {
  AddGaussianSplatParams,
  Load3dTilesParams,
  LoadCzmlParams,
  LoadImageryServiceParams,
  LoadKmlParams,
  LoadTerrainParams,
  SetEdgeDisplayModeParams,
} from '../types.js'

export const tilesExecutors = {
  async load3dTiles(params, bridge) {
    const info = await bridge.load3dTiles(params as unknown as Load3dTilesParams)
    return {
      success: true,
      data: info,
      message: `3D Tiles '${info.name}' loaded`,
    }
  },
  async load3dGaussianSplat(params, bridge) {
    const info = await bridge.load3dGaussianSplat(
      params as unknown as AddGaussianSplatParams,
    )
    return {
      success: true,
      data: info,
      message: `3D Gaussian Splat '${info.name}' loaded`,
    }
  },
  loadTerrain(params, bridge) {
    bridge.loadTerrain(params as unknown as LoadTerrainParams)
    return { success: true, message: 'Terrain provider updated' }
  },
  async loadImageryService(params, bridge) {
    const info = await bridge.loadImageryService(
      params as unknown as LoadImageryServiceParams,
    )
    return {
      success: true,
      data: info,
      message: `Imagery service '${info.name}' loaded`,
    }
  },
  async loadCzml(params, bridge) {
    const info = await bridge.loadCzml(params as unknown as LoadCzmlParams)
    return {
      success: true,
      data: info,
      message: `CZML data source '${info.name}' loaded`,
    }
  },
  async loadKml(params, bridge) {
    const info = await bridge.loadKml(params as unknown as LoadKmlParams)
    return {
      success: true,
      data: info,
      message: `KML data source '${info.name}' loaded`,
    }
  },
  setEdgeDisplayMode(params, bridge) {
    const result = bridge.setEdgeDisplayMode(
      params as unknown as SetEdgeDisplayModeParams,
    )
    return {
      success: true,
      data: result,
      message: `Edge display mode set on ${result.applied} tileset(s)`,
    }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
