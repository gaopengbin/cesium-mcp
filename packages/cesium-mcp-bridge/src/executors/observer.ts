import type { BridgeExecutor } from '../bridge.js'
import type { CaptureObserverViewParams } from '../types.js'

export const observerExecutors = {
  async captureObserverView(params, bridge) {
    const data = await bridge.captureObserverView(
      params as unknown as CaptureObserverViewParams,
    )
    return {
      success: true,
      data,
      message: 'Independent observer view captured',
    }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
