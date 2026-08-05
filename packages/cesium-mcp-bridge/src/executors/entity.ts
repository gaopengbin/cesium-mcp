import type { BridgeExecutor } from '../bridge.js'
import type {
  AddLabelParams,
  AddMarkerParams,
  AddModelParams,
  AddPolygonParams,
  AddPolylineParams,
  BatchAddEntitiesParams,
  GetEntityPropertiesParams,
  QueryEntitiesParams,
  RemoveEntityParams,
  UpdateEntityParams,
} from '../types.js'

export const entityExecutors = {
  addMarker(params, bridge) {
    const entity = bridge.addMarker(params as unknown as AddMarkerParams)
    return {
      success: true,
      data: { entityId: entity.id },
      message: 'Marker added',
    }
  },
  addLabel(params, bridge) {
    const count = bridge.addLabel(
      params as unknown as AddLabelParams & { data: Record<string, unknown> },
    )
    return {
      success: true,
      data: { labelCount: count },
      message: `${count} labels added`,
    }
  },
  addModel(params, bridge) {
    const entity = bridge.addModel(params as unknown as AddModelParams)
    return {
      success: true,
      data: { entityId: entity.id },
      message: 'Model added',
    }
  },
  addPolygon(params, bridge) {
    const entity = bridge.addPolygon(params as unknown as AddPolygonParams)
    return {
      success: true,
      data: { entityId: entity.id },
      message: 'Polygon added',
    }
  },
  addPolyline(params, bridge) {
    const entity = bridge.addPolyline(params as unknown as AddPolylineParams)
    return {
      success: true,
      data: { entityId: entity.id },
      message: 'Polyline added',
    }
  },
  updateEntity(params, bridge) {
    const input = params as unknown as UpdateEntityParams
    const updated = bridge.updateEntity(input)
    return {
      success: updated,
      message: updated ? 'Entity updated' : undefined,
      error: updated ? undefined : `Entity not found: ${input.entityId}`,
    }
  },
  removeEntity(params, bridge) {
    const input = params as unknown as RemoveEntityParams
    const removed = bridge.removeEntity(input.entityId)
    return {
      success: removed,
      message: removed ? 'Entity removed' : undefined,
      error: removed ? undefined : `Entity not found: ${input.entityId}`,
    }
  },
  batchAddEntities(params, bridge) {
    const result = bridge.batchAddEntities(params as unknown as BatchAddEntitiesParams)
    return {
      success: true,
      data: result,
      message: `${result.entityIds.length} entities added`,
    }
  },
  queryEntities(params, bridge) {
    const entities = bridge.queryEntities(params as unknown as QueryEntitiesParams)
    return {
      success: true,
      data: { entities },
      message: `${entities.length} entities found`,
    }
  },
  getEntityProperties(params, bridge) {
    const result = bridge.getEntityProperties(
      params as unknown as GetEntityPropertiesParams,
    )
    return {
      success: true,
      data: result,
      message: `Properties for entity '${result.entityId}'`,
    }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
