import type { BridgeExecutor } from '../bridge.js'
import type {
  FlyToParams,
  LoadViewpointParams,
  SaveViewpointParams,
  SetViewParams,
  ZoomToExtentParams,
} from '../types.js'

export const viewExecutors = {
  async flyTo(params, bridge) {
    await bridge.flyTo(params as unknown as FlyToParams)
    return { success: true, message: 'Camera flew to target position' }
  },
  setView(params, bridge) {
    bridge.setView(params as unknown as SetViewParams)
    return { success: true, message: 'Camera view set' }
  },
  getView(_params, bridge) {
    return {
      success: true,
      data: bridge.getView(),
      message: 'Current view state retrieved',
    }
  },
  async zoomToExtent(params, bridge) {
    await bridge.zoomToExtent(params as unknown as ZoomToExtentParams)
    return { success: true, message: 'Zoomed to extent' }
  },
  saveViewpoint(params, bridge) {
    const viewpoint = params as unknown as SaveViewpointParams
    const state = bridge.saveViewpoint(viewpoint)
    return {
      success: true,
      data: state,
      message: `Viewpoint '${viewpoint.name}' saved`,
    }
  },
  loadViewpoint(params, bridge) {
    const viewpoint = params as unknown as LoadViewpointParams
    const state = bridge.loadViewpoint(viewpoint)
    if (!state) {
      return {
        success: false,
        error: `Viewpoint '${viewpoint.name}' not found`,
      }
    }
    return {
      success: true,
      data: state,
      message: `Viewpoint '${viewpoint.name}' loaded`,
    }
  },
  listViewpoints(_params, bridge) {
    const viewpoints = bridge.listViewpoints()
    return {
      success: true,
      data: { viewpoints },
      message: `${viewpoints.length} viewpoints saved`,
    }
  },
  exportScene(_params, bridge) {
    return {
      success: true,
      data: bridge.exportScene(),
      message: 'Scene exported',
    }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
