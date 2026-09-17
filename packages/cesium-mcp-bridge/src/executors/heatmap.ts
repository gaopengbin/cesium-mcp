import type { BridgeExecutor } from '../bridge.js'
import type { AddHeatmapParams } from '../types.js'

export const heatmapExecutors = {
  async addHeatmap(params, bridge, context = {}) {
    const info = await bridge.addHeatmap(params as unknown as AddHeatmapParams, context.signal)
    return {
      success: true,
      data: info,
      message: `Heatmap '${info.name}' added`,
    }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
