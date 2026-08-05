import type { BridgeExecutor } from '../bridge.js'
import type { SetPostProcessParams, SetSceneOptionsParams } from '../types.js'

export const sceneExecutors = {
  setSceneOptions(params, bridge) {
    bridge.setSceneOptions(params as unknown as SetSceneOptionsParams)
    return { success: true, message: 'Scene options updated' }
  },
  setPostProcess(params, bridge) {
    bridge.setPostProcess(params as unknown as SetPostProcessParams)
    return { success: true, message: 'Post-processing effects updated' }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
