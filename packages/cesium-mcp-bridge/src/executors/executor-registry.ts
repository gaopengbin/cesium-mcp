import type { BridgeExecutor } from '../bridge.js'
import { cameraExecutors } from './camera.js'
import { entityExecutors } from './entity.js'
import { interactionExecutors } from './interaction.js'
import { layerExecutors } from './layer.js'
import { sceneExecutors } from './scene.js'
import { tilesExecutors } from './tiles.js'
import { viewExecutors } from './view.js'

const defaultBridgeExecutors = {
  ...viewExecutors,
  ...entityExecutors,
  ...layerExecutors,
  ...cameraExecutors,
  ...sceneExecutors,
  ...tilesExecutors,
  ...interactionExecutors,
}

export const defaultBridgeExecutorNames: readonly string[] =
  Object.freeze(Object.keys(defaultBridgeExecutors))

export function createDefaultBridgeExecutors(): Record<string, BridgeExecutor> {
  return { ...defaultBridgeExecutors }
}
