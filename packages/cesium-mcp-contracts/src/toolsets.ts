import { cesiumExtendedToolContracts } from './extended-tools'
import { cesiumCoreToolContracts } from './tools'
import type { CesiumToolContract } from './types'

export const cesiumBrowserToolsetNames = [
  'view',
  'entity',
  'layer',
  'camera',
  'entity-ext',
  'animation',
  'scene',
  'tiles',
  'interaction',
  'trajectory',
  'heatmap',
  'geolocation',
] as const

export type CesiumBrowserToolsetName = typeof cesiumBrowserToolsetNames[number]
export type CesiumToolsetSelection =
  | 'core'
  | 'all'
  | CesiumBrowserToolsetName
  | readonly CesiumBrowserToolsetName[]

export interface CesiumBrowserToolset {
  name: CesiumBrowserToolsetName
  description: string
  tools: readonly CesiumToolContract[]
}

const allContracts = [...cesiumCoreToolContracts, ...cesiumExtendedToolContracts]
const contractByName = new Map(allContracts.map(tool => [tool.name, tool]))

if (contractByName.size !== allContracts.length) {
  throw new Error('Duplicate Cesium browser tool contract name')
}

const toolsetDefinitions: Record<CesiumBrowserToolsetName, {
  description: string
  names: readonly string[]
}> = {
  view: {
    description: 'Camera navigation, viewpoint bookmarks, and scene export',
    names: ['flyTo', 'setView', 'getView', 'zoomToExtent', 'saveViewpoint', 'loadViewpoint', 'listViewpoints', 'exportScene'],
  },
  entity: {
    description: 'Core entity creation, updates, removal, batch operations, and queries',
    names: ['addMarker', 'addLabel', 'addModel', 'addPolygon', 'addPolyline', 'updateEntity', 'removeEntity', 'batchAddEntities', 'queryEntities', 'getEntityProperties'],
  },
  layer: {
    description: 'GeoJSON, layer discovery, visibility, styling, removal, and basemaps',
    names: ['addGeoJsonLayer', 'addGeoJsonPrimitive', 'listLayers', 'getLayerSchema', 'removeLayer', 'clearAll', 'setLayerVisibility', 'updateLayerStyle', 'setBasemap'],
  },
  camera: {
    description: 'Advanced camera targeting, orbit, and input options',
    names: ['lookAtTransform', 'startOrbit', 'stopOrbit', 'setCameraOptions'],
  },
  'entity-ext': {
    description: 'Billboard, box, corridor, cylinder, ellipse, rectangle, and wall entities',
    names: ['addBillboard', 'addBox', 'addCorridor', 'addCylinder', 'addEllipse', 'addRectangle', 'addWall'],
  },
  animation: {
    description: 'Time-dynamic entities, paths, tracking, clock control, and globe lighting',
    names: ['createAnimation', 'controlAnimation', 'removeAnimation', 'listAnimations', 'updateAnimationPath', 'trackEntity', 'controlClock', 'setGlobeLighting'],
  },
  scene: {
    description: 'Scene environment and post-processing options',
    names: ['setSceneOptions', 'setPostProcess'],
  },
  tiles: {
    description: '3D Tiles, Gaussian Splats, terrain, imagery, CZML, KML, and edge display',
    names: ['load3dTiles', 'load3dGaussianSplat', 'loadTerrain', 'loadImageryService', 'loadCzml', 'loadKml', 'setEdgeDisplayMode'],
  },
  interaction: {
    description: 'Screenshot, feature highlighting, and measurement',
    names: ['screenshot', 'highlight', 'measure'],
  },
  trajectory: {
    description: 'Trajectory playback',
    names: ['playTrajectory'],
  },
  heatmap: {
    description: 'Heatmap visualization',
    names: ['addHeatmap'],
  },
  geolocation: {
    description: 'Address and place-name geocoding',
    names: ['geocode'],
  },
}

function contractsForNames(names: readonly string[]): readonly CesiumToolContract[] {
  return names.map(name => {
    const contract = contractByName.get(name)
    if (!contract) throw new Error(`Missing Cesium browser tool contract: ${name}`)
    return contract
  })
}

export const cesiumBrowserToolsets: Readonly<Record<CesiumBrowserToolsetName, CesiumBrowserToolset>> =
  Object.fromEntries(cesiumBrowserToolsetNames.map(name => [
    name,
    {
      name,
      description: toolsetDefinitions[name].description,
      tools: contractsForNames(toolsetDefinitions[name].names),
    },
  ])) as unknown as Readonly<Record<CesiumBrowserToolsetName, CesiumBrowserToolset>>

export const cesiumBrowserToolContracts: readonly CesiumToolContract[] =
  cesiumBrowserToolsetNames.flatMap(name => cesiumBrowserToolsets[name].tools)

export function selectCesiumToolContracts(
  selection: CesiumToolsetSelection = 'core',
): readonly CesiumToolContract[] {
  if (selection === 'core') return cesiumCoreToolContracts
  if (selection === 'all') return cesiumBrowserToolContracts
  if (typeof selection === 'string') return cesiumBrowserToolsets[selection].tools

  const selected = new Map<string, CesiumToolContract>()
  for (const toolsetName of selection) {
    for (const tool of cesiumBrowserToolsets[toolsetName].tools) {
      selected.set(tool.name, tool)
    }
  }
  return [...selected.values()]
}
