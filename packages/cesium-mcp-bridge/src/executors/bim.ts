import type { BridgeExecutor } from '../bridge.js'
import type { QueryBimElementsParams, GetBimElementParams, GetBimTreeParams, AggregateBimElementsParams, FocusBimElementsParams, SelectBimElementsParams, FilterBimElementsParams, BimLayerParams, SnapBimElementParams } from '../types.js'
import { queryBimElements, getBimElement, getBimTree, getBimElementParents, aggregateBimElements, focusBimElements, selectBimElements, filterBimElements, clearBimSelection, snapBimElement } from '../commands/bim.js'

export const bimExecutors = {
  async getBimTree(params, bridge, context = {}) {
    return { success: true, data: await getBimTree(bridge.layerManager, params as unknown as GetBimTreeParams, context.signal) }
  },
  async getBimElementParents(params, bridge, context = {}) {
    return { success: true, data: await getBimElementParents(bridge.layerManager, params as unknown as GetBimElementParams, context.signal) }
  },
  async queryBimElements(params, bridge, context = {}) {
    return { success: true, data: await queryBimElements(bridge.layerManager, params as unknown as QueryBimElementsParams, context.signal) }
  },
  async getBimElement(params, bridge, context = {}) {
    return { success: true, data: await getBimElement(bridge.layerManager, params as unknown as GetBimElementParams, context.signal) }
  },
  async aggregateBimElements(params, bridge, context = {}) {
    return { success: true, data: await aggregateBimElements(bridge.layerManager, params as unknown as AggregateBimElementsParams, context.signal) }
  },
  async focusBimElements(params, bridge, context = {}) {
    return { success: true, data: await focusBimElements(bridge.viewer, bridge.layerManager, params as unknown as FocusBimElementsParams, context.signal) }
  },
  selectBimElements(params, bridge) {
    return { success: true, data: selectBimElements(bridge.viewer, bridge.layerManager, params as unknown as SelectBimElementsParams) }
  },
  async filterBimElements(params, bridge, context = {}) {
    return { success: true, data: await filterBimElements(bridge.viewer, bridge.layerManager, params as unknown as FilterBimElementsParams, context.signal) }
  },
  clearBimSelection(params, bridge) {
    return { success: true, data: clearBimSelection(bridge.viewer, bridge.layerManager, params as unknown as BimLayerParams) }
  },
  async snapBimElement(params, bridge, context = {}) {
    return { success: true, data: await snapBimElement(bridge.viewer, bridge.layerManager, params as unknown as SnapBimElementParams, context.signal) }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
