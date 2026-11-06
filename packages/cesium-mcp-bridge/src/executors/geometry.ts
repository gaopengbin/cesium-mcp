import type { BridgeExecutor } from '../bridge.js'
import type { UpdateVectorCollectionParams, SetTilesetOptionsParams, SnapToGeometryParams, MeasureSnappedDistanceParams, SetClippingPolygonsParams } from '../types.js'
import { updateVectorCollection, setTilesetOptions, snapToGeometry, measureSnappedDistance, setClippingPolygons } from '../commands/advanced.js'

export const geometryExecutors = {
  updateVectorCollection(params, bridge) { return { success: true, data: updateVectorCollection(bridge.viewer, bridge.layerManager, params as unknown as UpdateVectorCollectionParams) } },
  setTilesetOptions(params, bridge) { return { success: true, data: setTilesetOptions(bridge.viewer, bridge.layerManager, params as unknown as SetTilesetOptionsParams) } },
  snapToGeometry(params, bridge) { return { success: true, data: snapToGeometry(bridge.viewer, params as unknown as SnapToGeometryParams) } },
  measureSnappedDistance(params, bridge) { return { success: true, data: measureSnappedDistance(bridge.viewer, params as unknown as MeasureSnappedDistanceParams) } },
  setClippingPolygons(params, bridge) { return { success: true, data: setClippingPolygons(bridge.viewer, bridge.layerManager, params as unknown as SetClippingPolygonsParams) } },
} satisfies Readonly<Record<string, BridgeExecutor>>
