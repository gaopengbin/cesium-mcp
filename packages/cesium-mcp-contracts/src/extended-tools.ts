import type { CesiumToolContract, JsonSchema } from './types'
import { resolveCesiumToolMetadata } from './metadata'

const stringSchema: JsonSchema = { type: 'string', minLength: 1, maxLength: 500 }
const idSchema: JsonSchema = { type: 'string', minLength: 1, maxLength: 200 }
const urlSchema: JsonSchema = { type: 'string', minLength: 1, maxLength: 4096 }
const numberSchema: JsonSchema = { type: 'number' }
const booleanSchema: JsonSchema = { type: 'boolean' }
const colorSchema: JsonSchema = { type: 'string', minLength: 1, maxLength: 64 }
const longitudeSchema: JsonSchema = { type: 'number', minimum: -180, maximum: 180 }
const latitudeSchema: JsonSchema = { type: 'number', minimum: -90, maximum: 90 }
const heightSchema: JsonSchema = { type: 'number', minimum: -12000, maximum: 50000000 }
const durationSchema: JsonSchema = { type: 'number', minimum: 0, maximum: 86400 }
const positionTupleSchema: JsonSchema = {
  type: 'array',
  prefixItems: [longitudeSchema, latitudeSchema, heightSchema],
  minItems: 2,
  maxItems: 3,
}
const positionObjectSchema: JsonSchema = {
  type: 'object',
  properties: {
    longitude: longitudeSchema,
    latitude: latitudeSchema,
    height: heightSchema,
  },
  required: ['longitude', 'latitude'],
  additionalProperties: false,
}
const positionsSchema: JsonSchema = {
  type: 'array',
  items: positionObjectSchema,
  minItems: 2,
  maxItems: 10000,
}
const orientationSchema: JsonSchema = {
  type: 'object',
  properties: {
    heading: numberSchema,
    pitch: numberSchema,
    roll: numberSchema,
  },
  required: ['heading', 'pitch', 'roll'],
  additionalProperties: false,
}
const materialSchema: JsonSchema = {
  oneOf: [
    colorSchema,
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['color', 'image', 'checkerboard', 'stripe', 'grid'] },
        color: colorSchema,
        image: urlSchema,
        evenColor: colorSchema,
        oddColor: colorSchema,
        orientation: { type: 'string', enum: ['horizontal', 'vertical'] },
        cellAlpha: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['type'],
      additionalProperties: true,
    },
  ],
}
const bridgeResultSchema: JsonSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {},
    message: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['success'],
  additionalProperties: false,
}

function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): JsonSchema {
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

function tool(
  name: string,
  description: string,
  properties: Record<string, JsonSchema> = {},
  required: string[] = [],
  annotations?: CesiumToolContract['annotations'],
): CesiumToolContract {
  const fullDescription = `${description} Returns { success: boolean, data?: unknown, message?: string, error?: string }.`
  return {
    name,
    description: fullDescription,
    inputSchema: objectSchema(properties, required),
    outputSchema: bridgeResultSchema,
    ...resolveCesiumToolMetadata(name, fullDescription, annotations),
  }
}

const entityName = { name: { ...stringSchema, maxLength: 200 } }
const entityPosition = {
  longitude: longitudeSchema,
  latitude: latitudeSchema,
  height: heightSchema,
}
const entityAppearance = {
  material: materialSchema,
  outline: booleanSchema,
  outlineColor: colorSchema,
  fill: booleanSchema,
}

export const cesiumExtendedToolContracts: readonly CesiumToolContract[] = [
  // View
  tool('zoomToExtent', 'Animate the camera to a west/south/east/north bounding box.', {
    bbox: {
      type: 'array',
      prefixItems: [longitudeSchema, latitudeSchema, longitudeSchema, latitudeSchema],
      minItems: 4,
      maxItems: 4,
    },
    duration: { type: 'number', minimum: 0, maximum: 60 },
  }, ['bbox']),
  tool('saveViewpoint', 'Save the current camera state under a page-local name.', {
    name: { ...stringSchema, maxLength: 100 },
  }, ['name']),
  tool('loadViewpoint', 'Restore a previously saved page-local camera state.', {
    name: { ...stringSchema, maxLength: 100 },
    duration: { type: 'number', minimum: 0, maximum: 60 },
  }, ['name']),
  tool('listViewpoints', 'List camera viewpoints saved in the current page.', {}, [], { readOnlyHint: true }),
  tool('exportScene', 'Export the current view, layer, and entity state as JSON.', {}, [], { readOnlyHint: true }),

  // Entity
  tool('addModel', 'Add a glTF or GLB model at geographic coordinates.', {
    ...entityPosition,
    url: urlSchema,
    scale: { type: 'number', exclusiveMinimum: 0, maximum: 100000 },
    heading: numberSchema,
    pitch: numberSchema,
    roll: numberSchema,
    label: { type: 'string', maxLength: 200 },
  }, ['longitude', 'latitude', 'url'], { untrustedContentHint: true }),
  tool('updateEntity', 'Update the position, appearance, label, or visibility of an entity.', {
    entityId: idSchema,
    position: positionObjectSchema,
    label: { type: 'string', maxLength: 200 },
    color: colorSchema,
    scale: { type: 'number', minimum: 0, maximum: 100000 },
    show: booleanSchema,
  }, ['entityId']),
  tool('batchAddEntities', 'Add multiple supported entities in one page operation.', {
    entities: {
      type: 'array',
      minItems: 1,
      maxItems: 1000,
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['marker', 'polyline', 'polygon', 'model', 'billboard', 'box', 'cylinder', 'ellipse', 'rectangle', 'wall', 'corridor'],
          },
        },
        required: ['type'],
        additionalProperties: true,
      },
    },
  }, ['entities']),
  tool('queryEntities', 'Query page entities by name, type, or geographic extent.', {
    name: { type: 'string', maxLength: 200 },
    type: { type: 'string', maxLength: 100 },
    bbox: {
      type: 'array',
      prefixItems: [longitudeSchema, latitudeSchema, longitudeSchema, latitudeSchema],
      minItems: 4,
      maxItems: 4,
    },
  }, [], { readOnlyHint: true }),
  tool('getEntityProperties', 'Read the properties and graphics metadata for one entity.', {
    entityId: idSchema,
  }, ['entityId'], { readOnlyHint: true }),

  // Layer
  tool('addGeoJsonPrimitive', 'Render GeoJSON as Cesium primitives for large browser datasets.', {
    id: idSchema,
    name: { ...stringSchema, maxLength: 200 },
    data: { type: 'object' },
    url: urlSchema,
    allowPicking: booleanSchema,
    show: booleanSchema,
  }, [], { untrustedContentHint: true }),
  tool('listLayers', 'List all layers currently managed by the page.', {}, [], { readOnlyHint: true }),
  tool('getLayerSchema', 'Inspect fields, entity counts, and metadata for a layer.', {
    layerId: idSchema,
  }, ['layerId'], { readOnlyHint: true }),
  tool('removeLayer', 'Remove a managed layer from the page.', {
    id: idSchema,
  }, ['id']),
  tool('setLayerVisibility', 'Show or hide a managed layer.', {
    id: idSchema,
    visible: booleanSchema,
  }, ['id', 'visible']),
  tool('updateLayerStyle', 'Update vector, imagery, primitive, or 3D Tiles styling for a layer.', {
    layerId: idSchema,
    labelStyle: { type: 'object', additionalProperties: true },
    layerStyle: { type: 'object', additionalProperties: true },
    imageryStyle: { type: 'object', additionalProperties: true },
    primitiveStyle: { type: 'object', additionalProperties: true },
    tileStyle: { type: 'object', additionalProperties: true },
  }, ['layerId']),

  // Camera
  tool('lookAtTransform', 'Aim the camera at a geographic target with heading, pitch, and range.', {
    ...entityPosition,
    heading: numberSchema,
    pitch: numberSchema,
    range: { type: 'number', minimum: 0, maximum: 50000000 },
  }, ['longitude', 'latitude']),
  tool('startOrbit', 'Start continuous camera orbit around the current target.', {
    speed: { type: 'number', minimum: 0.001, maximum: 360 },
    clockwise: booleanSchema,
  }),
  tool('stopOrbit', 'Stop a camera orbit started by startOrbit.'),
  tool('setCameraOptions', 'Configure Cesium camera input and zoom constraints.', {
    enableRotate: booleanSchema,
    enableTranslate: booleanSchema,
    enableZoom: booleanSchema,
    enableTilt: booleanSchema,
    enableLook: booleanSchema,
    enableInputs: booleanSchema,
    minimumZoomDistance: { type: 'number', minimum: 0 },
    maximumZoomDistance: { type: 'number', minimum: 0 },
  }),

  // Extended entity types
  tool('addBillboard', 'Add an image billboard at geographic coordinates.', {
    ...entityPosition,
    ...entityName,
    image: urlSchema,
    scale: { type: 'number', exclusiveMinimum: 0, maximum: 1000 },
    color: colorSchema,
    pixelOffset: objectSchema({ x: numberSchema, y: numberSchema }, ['x', 'y']),
    horizontalOrigin: { type: 'string', enum: ['CENTER', 'LEFT', 'RIGHT'] },
    verticalOrigin: { type: 'string', enum: ['CENTER', 'TOP', 'BOTTOM', 'BASELINE'] },
    heightReference: { type: 'string', enum: ['NONE', 'CLAMP_TO_GROUND', 'RELATIVE_TO_GROUND'] },
  }, ['longitude', 'latitude', 'image'], { untrustedContentHint: true }),
  tool('addBox', 'Add a three-dimensional box entity.', {
    ...entityPosition,
    ...entityName,
    dimensions: objectSchema({
      width: { type: 'number', exclusiveMinimum: 0 },
      length: { type: 'number', exclusiveMinimum: 0 },
      height: { type: 'number', exclusiveMinimum: 0 },
    }, ['width', 'length', 'height']),
    ...entityAppearance,
    orientation: orientationSchema,
    heightReference: { type: 'string', enum: ['NONE', 'CLAMP_TO_GROUND', 'RELATIVE_TO_GROUND'] },
  }, ['longitude', 'latitude', 'dimensions']),
  tool('addCorridor', 'Add a corridor with a geographic centerline and width.', {
    ...entityName,
    positions: positionsSchema,
    width: { type: 'number', exclusiveMinimum: 0 },
    ...entityAppearance,
    cornerType: { type: 'string', enum: ['ROUNDED', 'MITERED', 'BEVELED'] },
    height: heightSchema,
    extrudedHeight: heightSchema,
  }, ['positions', 'width']),
  tool('addCylinder', 'Add a cylinder or cone entity.', {
    ...entityPosition,
    ...entityName,
    length: { type: 'number', exclusiveMinimum: 0 },
    topRadius: { type: 'number', minimum: 0 },
    bottomRadius: { type: 'number', minimum: 0 },
    ...entityAppearance,
    orientation: orientationSchema,
    numberOfVerticalLines: { type: 'integer', minimum: 0, maximum: 1024 },
    slices: { type: 'integer', minimum: 3, maximum: 4096 },
  }, ['longitude', 'latitude', 'length', 'topRadius', 'bottomRadius']),
  tool('addEllipse', 'Add an ellipse or circle entity.', {
    ...entityPosition,
    ...entityName,
    semiMajorAxis: { type: 'number', exclusiveMinimum: 0 },
    semiMinorAxis: { type: 'number', exclusiveMinimum: 0 },
    ...entityAppearance,
    extrudedHeight: heightSchema,
    rotation: numberSchema,
    stRotation: numberSchema,
  }, ['longitude', 'latitude', 'semiMajorAxis', 'semiMinorAxis']),
  tool('addRectangle', 'Add a geographic rectangle entity.', {
    ...entityName,
    west: longitudeSchema,
    south: latitudeSchema,
    east: longitudeSchema,
    north: latitudeSchema,
    ...entityAppearance,
    height: heightSchema,
    extrudedHeight: heightSchema,
    rotation: numberSchema,
    stRotation: numberSchema,
  }, ['west', 'south', 'east', 'north']),
  tool('addWall', 'Add a wall along geographic positions.', {
    ...entityName,
    positions: positionsSchema,
    minimumHeights: { type: 'array', items: heightSchema, maxItems: 10000 },
    maximumHeights: { type: 'array', items: heightSchema, maxItems: 10000 },
    ...entityAppearance,
  }, ['positions']),

  // Animation
  tool('createAnimation', 'Create a time-dynamic entity moving through ISO-timestamped waypoints.', {
    ...entityName,
    waypoints: {
      type: 'array',
      minItems: 2,
      maxItems: 10000,
      items: objectSchema({
        ...entityPosition,
        time: { type: 'string', format: 'date-time' },
      }, ['longitude', 'latitude', 'time']),
    },
    modelUri: urlSchema,
    showPath: booleanSchema,
    pathWidth: { type: 'number', minimum: 0, maximum: 64 },
    pathColor: colorSchema,
    pathLeadTime: durationSchema,
    pathTrailTime: durationSchema,
    multiplier: { type: 'number', minimum: 0, maximum: 100000 },
    shouldAnimate: booleanSchema,
  }, ['waypoints'], { untrustedContentHint: true }),
  tool('controlAnimation', 'Play or pause the Cesium clock animation.', {
    action: { type: 'string', enum: ['play', 'pause'] },
  }, ['action']),
  tool('removeAnimation', 'Remove one animated entity.', {
    entityId: idSchema,
  }, ['entityId']),
  tool('listAnimations', 'List animated entities in the current page.', {}, [], { readOnlyHint: true }),
  tool('updateAnimationPath', 'Update the path appearance of an animated entity.', {
    entityId: idSchema,
    width: { type: 'number', minimum: 0, maximum: 64 },
    color: colorSchema,
    leadTime: durationSchema,
    trailTime: durationSchema,
    show: booleanSchema,
  }, ['entityId']),
  tool('trackEntity', 'Track an entity with the Cesium camera, or stop tracking when entityId is omitted.', {
    entityId: idSchema,
    heading: numberSchema,
    pitch: numberSchema,
    range: { type: 'number', minimum: 0, maximum: 50000000 },
  }),
  tool('controlClock', 'Configure Cesium simulation time, current time, speed, or range.', {
    action: { type: 'string', enum: ['configure', 'setTime', 'setMultiplier'] },
    startTime: { type: 'string', format: 'date-time' },
    stopTime: { type: 'string', format: 'date-time' },
    currentTime: { type: 'string', format: 'date-time' },
    time: { type: 'string', format: 'date-time' },
    multiplier: { type: 'number', minimum: 0, maximum: 100000 },
    shouldAnimate: booleanSchema,
    clockRange: { type: 'string', enum: ['UNBOUNDED', 'CLAMPED', 'LOOP_STOP'] },
  }, ['action']),
  tool('setGlobeLighting', 'Configure globe lighting and atmosphere lighting.', {
    enableLighting: booleanSchema,
    dynamicAtmosphereLighting: booleanSchema,
    dynamicAtmosphereLightingFromSun: booleanSchema,
  }),

  // Scene
  tool('setSceneOptions', 'Configure fog, atmosphere, shadows, celestial bodies, terrain depth testing, and background.', {
    fogEnabled: booleanSchema,
    fogDensity: { type: 'number', minimum: 0, maximum: 1 },
    fogMinimumBrightness: { type: 'number', minimum: 0, maximum: 1 },
    skyAtmosphereShow: booleanSchema,
    skyAtmosphereHueShift: numberSchema,
    skyAtmosphereSaturationShift: numberSchema,
    skyAtmosphereBrightnessShift: numberSchema,
    groundAtmosphereShow: booleanSchema,
    shadowsEnabled: booleanSchema,
    shadowsSoftShadows: booleanSchema,
    shadowsDarkness: { type: 'number', minimum: 0, maximum: 1 },
    sunShow: booleanSchema,
    sunGlowFactor: { type: 'number', minimum: 0 },
    moonShow: booleanSchema,
    depthTestAgainstTerrain: booleanSchema,
    backgroundColor: colorSchema,
  }),
  tool('setPostProcess', 'Configure bloom, ambient occlusion, and FXAA post-processing.', {
    bloom: booleanSchema,
    bloomContrast: numberSchema,
    bloomBrightness: numberSchema,
    bloomDelta: numberSchema,
    bloomSigma: numberSchema,
    bloomStepSize: numberSchema,
    bloomGlowOnly: booleanSchema,
    ambientOcclusion: booleanSchema,
    aoIntensity: numberSchema,
    aoBias: numberSchema,
    aoLengthCap: numberSchema,
    aoStepSize: numberSchema,
    fxaa: booleanSchema,
  }),

  // Tiles and external data
  tool('load3dTiles', 'Load a 3D Tiles tileset from a URL or Cesium ion asset.', {
    id: idSchema,
    name: { ...stringSchema, maxLength: 200 },
    url: urlSchema,
    ionAssetId: { type: 'integer', minimum: 1 },
    maximumScreenSpaceError: { type: 'number', minimum: 0 },
    heightOffset: numberSchema,
  }, [], { untrustedContentHint: true }),
  tool('load3dGaussianSplat', 'Load a 3D Gaussian Splat tileset from a URL.', {
    id: idSchema,
    name: { ...stringSchema, maxLength: 200 },
    url: urlSchema,
    maximumScreenSpaceError: { type: 'number', minimum: 0 },
    show: booleanSchema,
  }, ['url'], { untrustedContentHint: true }),
  tool('loadTerrain', 'Switch the Cesium terrain provider.', {
    provider: { type: 'string', enum: ['cesiumion', 'arcgis', 'flat'] },
    url: urlSchema,
    cesiumIonAssetId: { type: 'integer', minimum: 1 },
  }, ['provider'], { untrustedContentHint: true }),
  tool('loadImageryService', 'Load WMS, WMTS, XYZ, ArcGIS MapServer, or ion imagery.', {
    id: idSchema,
    name: { ...stringSchema, maxLength: 200 },
    url: urlSchema,
    ionAssetId: { type: 'integer', minimum: 1 },
    serviceType: { type: 'string', enum: ['wms', 'wmts', 'xyz', 'arcgis_mapserver', 'ion'] },
    layerName: { type: 'string', maxLength: 500 },
    opacity: { type: 'number', minimum: 0, maximum: 1 },
  }, [], { untrustedContentHint: true }),
  tool('loadCzml', 'Load CZML data from inline packets or a URL.', {
    id: idSchema,
    name: { ...stringSchema, maxLength: 200 },
    data: { type: 'array', maxItems: 10000 },
    url: urlSchema,
    sourceUri: urlSchema,
    clampToGround: booleanSchema,
    flyTo: booleanSchema,
  }, [], { untrustedContentHint: true }),
  tool('loadKml', 'Load KML or KMZ data from inline text or a URL.', {
    id: idSchema,
    name: { ...stringSchema, maxLength: 200 },
    url: urlSchema,
    data: { type: 'string', maxLength: 10000000 },
    sourceUri: urlSchema,
    clampToGround: booleanSchema,
    flyTo: booleanSchema,
  }, [], { untrustedContentHint: true }),
  tool('setEdgeDisplayMode', 'Set surface and edge rendering mode for one or all 3D Tiles layers.', {
    tilesetId: idSchema,
    mode: { type: 'string', enum: ['surfaces_only', 'surfaces_and_edges', 'edges_only'] },
  }, ['mode']),

  // Specialized visualization
  tool('playTrajectory', 'Play a moving entity along geographic coordinate tuples.', {
    id: idSchema,
    name: { ...stringSchema, maxLength: 200 },
    coordinates: { type: 'array', items: positionTupleSchema, minItems: 2, maxItems: 10000 },
    durationSeconds: durationSchema,
    trailSeconds: durationSchema,
    label: { type: 'string', maxLength: 200 },
  }, ['coordinates']),
  tool('addHeatmap', 'Add a heatmap from GeoJSON point features.', {
    id: idSchema,
    name: { ...stringSchema, maxLength: 200 },
    data: { type: 'object' },
    radius: { type: 'number', minimum: 1, maximum: 500 },
    gradient: { type: 'object', additionalProperties: colorSchema },
    blur: { type: 'number', minimum: 0, maximum: 1 },
    maxOpacity: { type: 'number', minimum: 0, maximum: 1 },
    minOpacity: { type: 'number', minimum: 0, maximum: 1 },
    resolution: { type: 'number', minimum: 0.05, maximum: 10 },
  }, ['data']),
]
