import type { BridgeExecutor } from '../bridge.js'
import type {
  LookAtTransformParams,
  SetCameraOptionsParams,
  StartOrbitParams,
} from '../types.js'

export const cameraExecutors = {
  lookAtTransform(params, bridge) {
    bridge.lookAtTransform(params as unknown as LookAtTransformParams)
    return { success: true, message: 'Camera lookAtTransform applied' }
  },
  startOrbit(params, bridge) {
    bridge.startOrbit(params as unknown as StartOrbitParams)
    return { success: true, message: 'Orbit started' }
  },
  stopOrbit(_params, bridge) {
    bridge.stopOrbit()
    return { success: true, message: 'Orbit stopped' }
  },
  setCameraOptions(params, bridge) {
    bridge.setCameraOptions(params as unknown as SetCameraOptionsParams)
    return { success: true, message: 'Camera options updated' }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
