import type { BridgeExecutor } from '../bridge.js'
import { animationExecutors } from './animation.js'
import { cameraExecutors } from './camera.js'
import { entityExecutors } from './entity.js'
import { entityExtExecutors } from './entity-ext.js'
import { heatmapExecutors } from './heatmap.js'
import { interactionExecutors } from './interaction.js'
import { layerExecutors } from './layer.js'
import { sceneExecutors } from './scene.js'
import { tilesExecutors } from './tiles.js'
import { trajectoryExecutors } from './trajectory.js'
import { viewExecutors } from './view.js'

const defaultBridgeExecutors = {
  ...viewExecutors,
  ...entityExecutors,
  ...layerExecutors,
  ...cameraExecutors,
  ...entityExtExecutors,
  ...animationExecutors,
  ...sceneExecutors,
  ...tilesExecutors,
  ...interactionExecutors,
  ...trajectoryExecutors,
  ...heatmapExecutors,
}

export const defaultBridgeExecutorNames: readonly string[] =
  Object.freeze(Object.keys(defaultBridgeExecutors))

export function createDefaultBridgeExecutors(): Record<string, BridgeExecutor> {
  return { ...defaultBridgeExecutors }
}
