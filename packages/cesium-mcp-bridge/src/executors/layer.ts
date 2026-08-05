import type { BridgeExecutor } from '../bridge.js'
import type {
  AddGeoJsonLayerParams,
  AddGeoJsonPrimitiveParams,
  GetLayerSchemaParams,
  SetBasemapParams,
  UpdateLayerStyleParams,
} from '../types.js'

export const layerExecutors = {
  async addGeoJsonLayer(params, bridge) {
    const info = await bridge.addGeoJsonLayer(
      params as unknown as AddGeoJsonLayerParams,
    )
    return {
      success: true,
      data: info,
      message: `GeoJSON layer '${info.name}' added`,
    }
  },
  async addGeoJsonPrimitive(params, bridge) {
    const info = await bridge.addGeoJsonPrimitive(
      params as unknown as AddGeoJsonPrimitiveParams,
    )
    return {
      success: true,
      data: info,
      message: `GeoJSON primitive '${info.name}' added`,
    }
  },
  listLayers(_params, bridge) {
    const layers = bridge.listLayers()
    return {
      success: true,
      data: { layers },
      message: `${layers.length} layers found`,
    }
  },
  getLayerSchema(params, bridge) {
    const result = bridge.getLayerSchema(params as unknown as GetLayerSchemaParams)
    return {
      success: true,
      data: result,
      message: `Layer '${result.layerName}' has ${result.fields.length} fields, ${result.entityCount} entities`,
    }
  },
  removeLayer(params, bridge) {
    const id = params.id as string
    bridge.removeLayer(id)
    return { success: true, message: `Layer '${id}' removed` }
  },
  clearAll(_params, bridge) {
    const result = bridge.clearAll()
    return {
      success: true,
      data: result,
      message: `Cleared ${result.removedLayers} layers and ${result.removedEntities} entities`,
    }
  },
  setLayerVisibility(params, bridge) {
    const id = params.id as string
    const visible = params.visible as boolean
    bridge.setLayerVisibility(id, visible)
    return {
      success: true,
      message: `Layer '${id}' visibility set to ${visible}`,
    }
  },
  updateLayerStyle(params, bridge) {
    const input = params as unknown as UpdateLayerStyleParams
    const updated = bridge.updateLayerStyle(input)
    return {
      success: updated,
      message: updated ? 'Layer style updated' : undefined,
      error: updated
        ? undefined
        : `图层未找到或不支持样式修改: ${input.layerId}`,
    }
  },
  setBasemap(params, bridge) {
    const basemap = bridge.setBasemap(params as unknown as SetBasemapParams)
    return {
      success: true,
      data: { basemap },
      message: `Basemap set to '${basemap}'`,
    }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
