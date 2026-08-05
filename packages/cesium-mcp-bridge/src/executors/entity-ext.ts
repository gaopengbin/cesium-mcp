import type { BridgeExecutor } from '../bridge.js'
import type {
  AddBillboardParams,
  AddBoxParams,
  AddCorridorParams,
  AddCylinderParams,
  AddEllipseParams,
  AddRectangleParams,
  AddWallParams,
} from '../types.js'

export const entityExtExecutors = {
  addBillboard(params, bridge) {
    const entity = bridge.addBillboard(params as unknown as AddBillboardParams)
    return { success: true, data: { entityId: entity.id }, message: 'Billboard added' }
  },
  addBox(params, bridge) {
    const entity = bridge.addBox(params as unknown as AddBoxParams)
    return { success: true, data: { entityId: entity.id }, message: 'Box added' }
  },
  addCorridor(params, bridge) {
    const entity = bridge.addCorridor(params as unknown as AddCorridorParams)
    return { success: true, data: { entityId: entity.id }, message: 'Corridor added' }
  },
  addCylinder(params, bridge) {
    const entity = bridge.addCylinder(params as unknown as AddCylinderParams)
    return { success: true, data: { entityId: entity.id }, message: 'Cylinder added' }
  },
  addEllipse(params, bridge) {
    const entity = bridge.addEllipse(params as unknown as AddEllipseParams)
    return { success: true, data: { entityId: entity.id }, message: 'Ellipse added' }
  },
  addRectangle(params, bridge) {
    const entity = bridge.addRectangle(params as unknown as AddRectangleParams)
    return { success: true, data: { entityId: entity.id }, message: 'Rectangle added' }
  },
  addWall(params, bridge) {
    const entity = bridge.addWall(params as unknown as AddWallParams)
    return { success: true, data: { entityId: entity.id }, message: 'Wall added' }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
