import type { BridgeExecutor } from '../bridge.js'
import type { QueryBimElementsParams, GetBimElementParams, AggregateBimElementsParams, FocusBimElementsParams, SelectBimElementsParams, FilterBimElementsParams, BimLayerParams } from '../types.js'
import { queryBimElements, getBimElement, aggregateBimElements, focusBimElements, selectBimElements, filterBimElements, clearBimSelection } from '../commands/bim.js'

export const bimExecutors = {
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
} satisfies Readonly<Record<string, BridgeExecutor>>
