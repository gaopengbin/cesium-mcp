import { paramDescriptions as enParamDescriptions } from './locales/en'
import {
  paramDescriptions as zhParamDescriptions,
  toolDescriptions as zhToolDescriptions,
} from './locales/zh-CN'
import type {
  CesiumToolAnnotations,
  CesiumToolContract,
  CesiumToolLocale,
} from './types'

const READ_ONLY_TOOLS = new Set([
  'screenshot',
  'getView',
  'queryEntities',
  'getEntityProperties',
  'listViewpoints',
  'exportScene',
  'listLayers',
  'getLayerSchema',
  'listAnimations',
  'geocode',
])

const DESTRUCTIVE_TOOLS = new Set([
  'removeLayer',
  'clearAll',
  'removeEntity',
  'removeAnimation',
])

const NON_IDEMPOTENT_TOOLS = new Set([
  'addGeoJsonLayer',
  'addGeoJsonPrimitive',
  'addLabel',
  'addHeatmap',
  'measure',
  'addMarker',
  'addPolyline',
  'addPolygon',
  'addModel',
  'batchAddEntities',
  'playTrajectory',
  'load3dTiles',
  'load3dGaussianSplat',
  'loadImageryService',
  'loadCzml',
  'loadKml',
  'addBillboard',
  'addBox',
  'addCorridor',
  'addCylinder',
  'addEllipse',
  'addRectangle',
  'addWall',
  'createAnimation',
  'controlAnimation',
  'controlClock',
])

const OPEN_WORLD_TOOLS = new Set(['geocode'])

const TITLE_OVERRIDES: Readonly<Record<string, string>> = {
  flyTo: 'Fly To Location',
  zoomToExtent: 'Zoom to Extent',
  addGeoJsonLayer: 'Add GeoJSON Layer',
  addGeoJsonPrimitive: 'Add GeoJSON Primitive',
  load3dTiles: 'Load 3D Tiles',
  load3dGaussianSplat: 'Load 3D Gaussian Splat',
  loadCzml: 'Load CZML',
  loadKml: 'Load KML/KMZ',
  setPostProcess: 'Set Post-Processing',
  geocode: 'Geocode Address',
}

function titleFromName(name: string): string {
  return TITLE_OVERRIDES[name]
    ?? name
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/^./, first => first.toUpperCase())
}

function behaviorAnnotations(name: string): CesiumToolAnnotations {
  return {
    readOnlyHint: READ_ONLY_TOOLS.has(name),
    destructiveHint: DESTRUCTIVE_TOOLS.has(name),
    idempotentHint: !NON_IDEMPOTENT_TOOLS.has(name),
    openWorldHint: OPEN_WORLD_TOOLS.has(name),
  }
}

export function resolveCesiumToolMetadata(
  name: string,
  description: string,
  annotations: CesiumToolAnnotations = {},
): Pick<CesiumToolContract, 'title' | 'annotations' | 'localizations'> {
  return {
    title: titleFromName(name),
    annotations: {
      ...behaviorAnnotations(name),
      ...annotations,
    },
    localizations: {
      en: {
        description,
        parameters: enParamDescriptions[name] ?? {},
      },
      'zh-CN': {
        description: zhToolDescriptions[name] ?? description,
        parameters: zhParamDescriptions[name] ?? {},
      },
    },
  }
}

export function normalizeCesiumToolLocale(locale?: string): CesiumToolLocale {
  return locale?.trim().toLowerCase() === 'zh-cn' ? 'zh-CN' : 'en'
}
