import type { CesiumToolContract, JsonSchema } from './types'
import { resolveCesiumToolMetadata } from './metadata'

const longitudeSchema: JsonSchema = {
  type: 'number',
  minimum: -180,
  maximum: 180,
  description: 'Longitude in decimal degrees',
}

const latitudeSchema: JsonSchema = {
  type: 'number',
  minimum: -90,
  maximum: 90,
  description: 'Latitude in decimal degrees',
}

const heightSchema: JsonSchema = {
  type: 'number',
  minimum: 0,
  maximum: 50000000,
  description: 'Height above the ellipsoid in meters',
}

const colorSchema: JsonSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 64,
  description: 'CSS color such as #3B82F6 or rgba(59,130,246,0.8)',
}

const positionSchema: JsonSchema = {
  type: 'array',
  prefixItems: [
    longitudeSchema,
    latitudeSchema,
    {
      type: 'number',
      minimum: -12000,
      maximum: 50000000,
      description: 'Optional height in meters',
    },
  ],
  minItems: 2,
  maxItems: 3,
  description: 'Coordinate tuple [longitude, latitude, optional height]',
}

const geoJsonGeometrySchema: JsonSchema = {
  oneOf: [
    {
      type: 'object',
      properties: { type: { const: 'Point' }, coordinates: positionSchema },
      required: ['type', 'coordinates'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'LineString' },
        coordinates: { type: 'array', items: positionSchema, minItems: 2 },
      },
      required: ['type', 'coordinates'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'Polygon' },
        coordinates: {
          type: 'array',
          items: { type: 'array', items: positionSchema, minItems: 4 },
          minItems: 1,
        },
      },
      required: ['type', 'coordinates'],
      additionalProperties: false,
    },
  ],
}

const geoJsonSchema: JsonSchema = {
  type: 'object',
  description: 'GeoJSON FeatureCollection containing Point, LineString, or Polygon features',
  properties: {
    type: { const: 'FeatureCollection' },
    features: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { const: 'Feature' },
          id: { type: ['string', 'number'] },
          geometry: geoJsonGeometrySchema,
          properties: {
            type: ['object', 'null'],
            description: 'Feature attributes used for labels and thematic styling',
          },
        },
        required: ['type', 'geometry', 'properties'],
        additionalProperties: false,
      },
    },
  },
  required: ['type', 'features'],
  additionalProperties: false,
}

const labelStyleSchema: JsonSchema = {
  type: 'object',
  properties: {
    font: { type: 'string', minLength: 1, maxLength: 100 },
    fillColor: colorSchema,
    outlineColor: colorSchema,
    outlineWidth: { type: 'number', minimum: 0, maximum: 10 },
    backgroundColor: colorSchema,
    showBackground: { type: 'boolean' },
    pixelOffset: {
      type: 'array',
      items: { type: 'number', minimum: -1000, maximum: 1000 },
      minItems: 2,
      maxItems: 2,
    },
    scale: { type: 'number', exclusiveMinimum: 0, maximum: 10 },
  },
  additionalProperties: false,
}

const layerStyleSchema: JsonSchema = {
  type: 'object',
  properties: {
    color: colorSchema,
    opacity: { type: 'number', minimum: 0, maximum: 1 },
    pointSize: { type: 'number', minimum: 1, maximum: 128 },
    strokeWidth: { type: 'number', minimum: 0, maximum: 64 },
    randomColor: { type: 'boolean' },
    gradient: { type: 'array', items: colorSchema, minItems: 2, maxItems: 2 },
    choropleth: {
      type: 'object',
      properties: {
        field: { type: 'string', minLength: 1 },
        breaks: { type: 'array', items: { type: 'number' }, minItems: 1 },
        colors: { type: 'array', items: colorSchema, minItems: 2 },
      },
      required: ['field', 'breaks', 'colors'],
      additionalProperties: false,
    },
    category: {
      type: 'object',
      properties: {
        field: { type: 'string', minLength: 1 },
        colors: { type: 'array', items: colorSchema, minItems: 1 },
      },
      required: ['field'],
      additionalProperties: false,
    },
  },
  additionalProperties: false,
}

function bridgeResultSchema(data?: JsonSchema): JsonSchema {
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' },
      error: { type: 'string' },
      ...(data ? { data } : {}),
    },
    required: ['success'],
    additionalProperties: false,
  }
}

const entityResultSchema = bridgeResultSchema({
  type: 'object',
  properties: { entityId: { type: 'string' } },
  required: ['entityId'],
  additionalProperties: false,
})

const viewStateSchema: JsonSchema = {
  type: 'object',
  properties: {
    longitude: longitudeSchema,
    latitude: latitudeSchema,
    height: heightSchema,
    heading: { type: 'number' },
    pitch: { type: 'number' },
    roll: { type: 'number' },
  },
  required: ['longitude', 'latitude', 'height', 'heading', 'pitch', 'roll'],
  additionalProperties: false,
}

const layerInfoSchema: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string' },
    visible: { type: 'boolean' },
    color: { type: 'string' },
    dataRefId: { type: 'string' },
  },
  required: ['id', 'name', 'type', 'visible', 'color'],
  additionalProperties: true,
}

function contract(
  name: string,
  description: string,
  resultDescription: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  annotations?: CesiumToolContract['annotations'],
): CesiumToolContract {
  const fullDescription = `${description} ${resultDescription}`
  return {
    name,
    description: fullDescription,
    inputSchema,
    outputSchema,
    ...resolveCesiumToolMetadata(name, fullDescription, annotations),
  }
}

const emptyInputSchema: JsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

export const cesiumCoreToolContracts: readonly CesiumToolContract[] = [
  contract(
    'flyTo',
    'Animate the camera to a geographic location. Use for visible navigation requested by the user.',
    'Returns { success: boolean, message?: string, error?: string }.',
    {
      type: 'object',
      properties: {
        longitude: longitudeSchema,
        latitude: latitudeSchema,
        height: heightSchema,
        heading: { type: 'number', minimum: 0, maximum: 360 },
        pitch: { type: 'number', minimum: -90, maximum: 90 },
        duration: { type: 'number', minimum: 0, maximum: 60 },
      },
      required: ['longitude', 'latitude'],
      additionalProperties: false,
    },
    bridgeResultSchema(),
  ),
  contract(
    'setView',
    'Set the camera position immediately without animation. Use for deterministic setup or instant view changes.',
    'Returns { success: boolean, message?: string, error?: string }.',
    {
      type: 'object',
      properties: {
        longitude: longitudeSchema,
        latitude: latitudeSchema,
        height: heightSchema,
        heading: { type: 'number', minimum: 0, maximum: 360 },
        pitch: { type: 'number', minimum: -90, maximum: 90 },
        roll: { type: 'number', minimum: -180, maximum: 180 },
      },
      required: ['longitude', 'latitude'],
      additionalProperties: false,
    },
    bridgeResultSchema(),
  ),
  contract(
    'getView',
    'Get the current camera position and orientation.',
    'Returns { success, data: { longitude, latitude, height, heading, pitch, roll }, message? }.',
    emptyInputSchema,
    bridgeResultSchema(viewStateSchema),
    { readOnlyHint: true },
  ),
  contract(
    'addMarker',
    'Add a point marker at geographic coordinates.',
    'Returns { success, data: { entityId }, message? }; keep entityId for removeEntity.',
    {
      type: 'object',
      properties: {
        longitude: longitudeSchema,
        latitude: latitudeSchema,
        label: { type: 'string', maxLength: 200 },
        color: colorSchema,
        size: { type: 'number', minimum: 1, maximum: 128 },
        id: { type: 'string', minLength: 1, maxLength: 100 },
      },
      required: ['longitude', 'latitude'],
      additionalProperties: false,
    },
    entityResultSchema,
  ),
  contract(
    'addPolyline',
    'Draw a path or route from geographic coordinate tuples.',
    'Returns { success, data: { entityId }, message? }; keep entityId for removeEntity.',
    {
      type: 'object',
      properties: {
        coordinates: { type: 'array', items: positionSchema, minItems: 2, maxItems: 10000 },
        color: colorSchema,
        width: { type: 'number', minimum: 1, maximum: 64 },
        clampToGround: { type: 'boolean' },
        label: { type: 'string', maxLength: 200 },
      },
      required: ['coordinates'],
      additionalProperties: false,
    },
    entityResultSchema,
  ),
  contract(
    'addPolygon',
    'Draw a polygon area from geographic coordinate tuples.',
    'Returns { success, data: { entityId }, message? }; keep entityId for removeEntity.',
    {
      type: 'object',
      properties: {
        coordinates: { type: 'array', items: positionSchema, minItems: 3, maxItems: 10000 },
        color: colorSchema,
        outlineColor: colorSchema,
        opacity: { type: 'number', minimum: 0, maximum: 1 },
        extrudedHeight: { type: 'number', minimum: 0, maximum: 100000 },
        clampToGround: { type: 'boolean' },
        label: { type: 'string', maxLength: 200 },
      },
      required: ['coordinates'],
      additionalProperties: false,
    },
    entityResultSchema,
  ),
  contract(
    'addLabel',
    'Add property-based text labels for GeoJSON features.',
    'Returns { success, data: { labelCount: integer }, message? }.',
    {
      type: 'object',
      properties: {
        data: geoJsonSchema,
        field: { type: 'string', minLength: 1, maxLength: 100 },
        style: labelStyleSchema,
      },
      required: ['data', 'field'],
      additionalProperties: false,
    },
    bridgeResultSchema({
      type: 'object',
      properties: { labelCount: { type: 'integer', minimum: 0 } },
      required: ['labelCount'],
      additionalProperties: false,
    }),
  ),
  contract(
    'addGeoJsonLayer',
    'Add a styled GeoJSON Point, LineString, or Polygon layer.',
    'Returns { success, data: { id, name, type, visible, color, dataRefId? }, message? }; use id with highlight.',
    {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 100 },
        name: { type: 'string', minLength: 1, maxLength: 200 },
        data: geoJsonSchema,
        style: layerStyleSchema,
      },
      required: ['data'],
      additionalProperties: false,
    },
    bridgeResultSchema(layerInfoSchema),
  ),
  contract(
    'setBasemap',
    'Switch the visible basemap style.',
    'Returns { success, data: { basemap }, message? }.',
    {
      type: 'object',
      properties: {
        basemap: {
          type: 'string',
          enum: ['dark', 'satellite', 'standard', 'osm', 'arcgis', 'light'],
        },
      },
      required: ['basemap'],
      additionalProperties: false,
    },
    bridgeResultSchema({
      type: 'object',
      properties: {
        basemap: {
          type: 'string',
          enum: ['dark', 'satellite', 'standard', 'osm', 'arcgis', 'light'],
        },
      },
      required: ['basemap'],
      additionalProperties: false,
    }),
  ),
  contract(
    'removeEntity',
    'Remove one entity created by an entity tool.',
    'Returns { success, message? } or { success: false, error } when entityId is not found.',
    {
      type: 'object',
      properties: { entityId: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['entityId'],
      additionalProperties: false,
    },
    bridgeResultSchema(),
  ),
  contract(
    'clearAll',
    'Clear all layers, entities, animations, and trajectories from the scene.',
    'Returns { success, data: { removedLayers, removedEntities }, message? }.',
    emptyInputSchema,
    bridgeResultSchema({
      type: 'object',
      properties: {
        removedLayers: { type: 'integer', minimum: 0 },
        removedEntities: { type: 'integer', minimum: 0 },
      },
      required: ['removedLayers', 'removedEntities'],
      additionalProperties: false,
    }),
  ),
  contract(
    'geocode',
    'Convert an address or place name to geographic coordinates using OSM Nominatim.',
    'Returns { success, longitude?, latitude?, displayName?, boundingBox?, message? }.',
    {
      type: 'object',
      properties: {
        address: { type: 'string', minLength: 2, maxLength: 300 },
        countryCode: { type: 'string', pattern: '^[A-Za-z]{2}$' },
      },
      required: ['address'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        longitude: longitudeSchema,
        latitude: latitudeSchema,
        displayName: { type: 'string' },
        boundingBox: {
          type: 'object',
          properties: {
            south: latitudeSchema,
            north: latitudeSchema,
            west: longitudeSchema,
            east: longitudeSchema,
          },
          required: ['south', 'north', 'west', 'east'],
          additionalProperties: false,
        },
        message: { type: 'string' },
      },
      required: ['success'],
      additionalProperties: false,
    },
    { readOnlyHint: true, untrustedContentHint: true },
  ),
  contract(
    'highlight',
    'Highlight one feature or every feature in a GeoJSON layer.',
    'Returns { success: boolean, message?: string, error?: string }.',
    {
      type: 'object',
      properties: {
        layerId: { type: 'string', minLength: 1, maxLength: 100 },
        featureIndex: { type: 'integer', minimum: 0 },
        color: colorSchema,
      },
      required: ['layerId'],
      additionalProperties: false,
    },
    bridgeResultSchema(),
  ),
  contract(
    'measure',
    'Measure distance or area between geographic coordinate tuples.',
    'Returns { success, data: { mode, value, unit, segments?, id? }, message? }.',
    {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['distance', 'area'] },
        positions: { type: 'array', items: positionSchema, minItems: 2, maxItems: 10000 },
        showOnMap: { type: 'boolean' },
        id: { type: 'string', minLength: 1, maxLength: 100 },
      },
      required: ['mode', 'positions'],
      additionalProperties: false,
    },
    bridgeResultSchema({
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['distance', 'area'] },
        value: { type: 'number', minimum: 0 },
        unit: { type: 'string' },
        segments: { type: 'array', items: { type: 'number', minimum: 0 } },
        id: { type: 'string' },
      },
      required: ['mode', 'value', 'unit'],
      additionalProperties: false,
    }),
  ),
  contract(
    'screenshot',
    'Capture the current Cesium map view as a PNG image.',
    'Returns { success, data: { dataUrl, width, height }, message? }; dataUrl is a base64 PNG.',
    emptyInputSchema,
    bridgeResultSchema({
      type: 'object',
      properties: {
        dataUrl: { type: 'string', pattern: '^data:image/png;base64,' },
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 },
      },
      required: ['dataUrl', 'width', 'height'],
      additionalProperties: false,
    }),
    { readOnlyHint: true },
  ),
]
