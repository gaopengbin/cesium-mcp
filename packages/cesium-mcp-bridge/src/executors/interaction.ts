import type { BridgeExecutor } from '../bridge.js'
import type { HighlightParams, MeasureParams } from '../types.js'

export const interactionExecutors = {
  async screenshot(_params, bridge) {
    const result = await bridge.screenshot()
    return {
      success: true,
      data: result,
      message: 'Screenshot captured',
    }
  },
  highlight(params, bridge) {
    const input = params as unknown as HighlightParams
    bridge.highlight(input)
    return {
      success: true,
      message: input.clear ? 'Highlight cleared' : 'Features highlighted',
    }
  },
  measure(params, bridge) {
    const result = bridge.measure(params as unknown as MeasureParams)
    return {
      success: true,
      data: result,
      message: `Measurement complete: ${result.value} ${result.unit}`,
    }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
