import type { BridgeExecutor } from '../bridge.js'
import type { AddHeatmapParams } from '../types.js'

export const heatmapExecutors = {
  async addHeatmap(params, bridge) {
    const { resourceId, ...input } = params
    const info = await bridge.addHeatmap({
      ...input,
      ...(typeof resourceId === 'string'
        ? { dataRefId: resourceId }
        : {}),
    } as unknown as AddHeatmapParams)
    return {
      success: true,
      data: info,
      message: `Heatmap '${info.name}' added`,
    }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
