import type { BridgeExecutor } from '../bridge.js'
import { cameraExecutors } from './camera.js'
import { viewExecutors } from './view.js'

const defaultBridgeExecutors = {
  ...viewExecutors,
  ...cameraExecutors,
}

export const defaultBridgeExecutorNames: readonly string[] =
  Object.freeze(Object.keys(defaultBridgeExecutors))

export function createDefaultBridgeExecutors(): Record<string, BridgeExecutor> {
  return { ...defaultBridgeExecutors }
}
