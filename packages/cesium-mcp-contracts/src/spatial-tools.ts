import { resolveCesiumToolMetadata } from './metadata.js'
import type { CesiumToolContract, JsonSchema } from './types.js'

const coordinateSchema: JsonSchema = {
  type: 'array',
  prefixItems: [
    { type: 'number', minimum: -180, maximum: 180 },
    { type: 'number', minimum: -90, maximum: 90 },
    { type: 'number' },
  ],
  items: { type: 'number' },
  minItems: 2,
  maxItems: 3,
}

const boundsSchema: JsonSchema = {
  type: 'array',
  prefixItems: [
    { type: 'number', minimum: -180, maximum: 180 },
    { type: 'number', minimum: -90, maximum: 90 },
    { type: 'number', minimum: -180, maximum: 180 },
    { type: 'number', minimum: -90, maximum: 90 },
  ],
  items: { type: 'number' },
  minItems: 4,
  maxItems: 4,
  description: 'Geographic bounds [west, south, east, north] in decimal degrees',
}

const geometrySchema: JsonSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { const: 'Point' },
        coordinates: coordinateSchema,
      },
      required: ['type', 'coordinates'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'LineString' },
        coordinates: { type: 'array', items: coordinateSchema, minItems: 2 },
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
          items: { type: 'array', items: coordinateSchema, minItems: 4 },
          minItems: 1,
        },
      },
      required: ['type', 'coordinates'],
      additionalProperties: false,
    },
  ],
}

const qualitySchema: JsonSchema = {
  type: 'string',
  enum: ['exact', 'derived', 'approximate', 'unknown'],
}

const spatialObjectSchema: JsonSchema = {
  type: 'object',
  properties: {
    objectId: { type: 'string' },
    sourceType: {
      type: 'string',
      enum: ['entity', 'layer', 'geojson', 'czml', 'tileset-feature'],
    },
    type: { type: 'string' },
    name: { type: 'string' },
    layerId: { type: 'string' },
    resourceId: { type: 'string' },
    geometry: geometrySchema,
    centroid: coordinateSchema,
    bbox: boundsSchema,
    properties: { type: 'object', additionalProperties: true },
    geometryQuality: qualitySchema,
    observedAt: { type: 'string', format: 'date-time' },
    revision: { type: 'integer', minimum: 0 },
    provenance: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        method: { type: 'string' },
      },
      required: ['source', 'method'],
      additionalProperties: false,
    },
  },
  required: [
    'objectId',
    'sourceType',
    'type',
    'properties',
    'geometryQuality',
    'observedAt',
    'revision',
    'provenance',
  ],
  additionalProperties: false,
}

const summarySchema: JsonSchema = {
  type: 'object',
  properties: {
    objectCount: { type: 'integer', minimum: 0 },
    countsBySource: {
      type: 'object',
      additionalProperties: { type: 'integer', minimum: 0 },
    },
    countsByType: {
      type: 'object',
      additionalProperties: { type: 'integer', minimum: 0 },
    },
    bounds: boundsSchema,
    revision: { type: 'integer', minimum: 0 },
  },
  required: ['objectCount', 'countsBySource', 'countsByType', 'revision'],
  additionalProperties: false,
}

const relationResultSchema: JsonSchema = {
  type: 'object',
  properties: {
    subjectId: { type: 'string' },
    objectId: { type: 'string' },
    relation: {
      type: 'string',
      enum: ['distance', 'near', 'intersects', 'within', 'contains', 'overlaps'],
    },
    value: { type: ['boolean', 'number', 'null'] },
    unit: { const: 'meters' },
    quality: qualitySchema,
    basis: { type: 'string' },
    subjectRevision: { type: 'integer', minimum: 0 },
    objectRevision: { type: 'integer', minimum: 0 },
    observedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'subjectId',
    'objectId',
    'relation',
    'value',
    'quality',
    'basis',
    'subjectRevision',
    'objectRevision',
    'observedAt',
  ],
  additionalProperties: false,
}

const viewSchema: JsonSchema = {
  type: 'object',
  properties: {
    longitude: { type: 'number' },
    latitude: { type: 'number' },
    height: { type: 'number' },
    heading: { type: 'number' },
    pitch: { type: 'number' },
    roll: { type: 'number' },
  },
  required: ['longitude', 'latitude', 'height', 'heading', 'pitch', 'roll'],
  additionalProperties: false,
}

const sceneReadinessSchema: JsonSchema = {
  type: 'object',
  properties: {
    state: { type: 'string', enum: ['ready', 'partial', 'loading', 'unknown'] },
    dataSourcesReady: { type: ['boolean', 'null'] },
    globeTilesLoaded: { type: ['boolean', 'null'] },
    terrainProvider: { type: 'string' },
    managedTilesets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          layerId: { type: 'string' },
          name: { type: 'string' },
          visible: { type: 'boolean' },
          tilesLoaded: { type: ['boolean', 'null'] },
        },
        required: ['layerId', 'name', 'visible', 'tilesLoaded'],
        additionalProperties: false,
      },
    },
    pendingReasons: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'state',
    'dataSourcesReady',
    'globeTilesLoaded',
    'terrainProvider',
    'managedTilesets',
    'pendingReasons',
  ],
  additionalProperties: false,
}

const observerTargetSchema: JsonSchema = {
  type: 'object',
  properties: {
    targetObjectId: { type: 'string' },
    preset: { type: 'string', enum: ['overview', 'detail', 'eye-level'] },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    height: { type: 'number' },
    range: { type: 'number', minimum: 50, maximum: 20000000 },
    heading: { type: 'number', minimum: 0, maximum: 360 },
    pitch: { type: 'number', minimum: -89, maximum: -5 },
  },
  required: ['longitude', 'latitude', 'height', 'range', 'heading', 'pitch'],
  additionalProperties: false,
}

const observerEvidenceSchema: JsonSchema = {
  type: 'object',
  properties: {
    dataUrl: { type: 'string', minLength: 32 },
    width: { type: 'integer', minimum: 1 },
    height: { type: 'integer', minimum: 1 },
    camera: viewSchema,
    target: observerTargetSchema,
    observedAt: { type: 'string', format: 'date-time' },
    bounds: boundsSchema,
    visibleObjectIds: { type: 'array', items: { type: 'string' }, maxItems: 500 },
    objectCount: { type: 'integer', minimum: 0 },
    quality: { const: 'derived' },
    basis: { const: 'observer-viewer-spatial-snapshot' },
    readiness: {
      type: 'object',
      properties: {
        state: { const: 'ready' },
        framesRendered: { type: 'integer', minimum: 1 },
        stableFrameCount: { type: 'integer', minimum: 1 },
        dataSourcesReady: { const: true },
        globeTilesLoaded: { const: true },
        frameHasContent: { const: true },
      },
      required: [
        'state',
        'framesRendered',
        'stableFrameCount',
        'dataSourcesReady',
        'globeTilesLoaded',
        'frameHasContent',
      ],
      additionalProperties: false,
    },
    userCameraUnchanged: { type: 'boolean' },
    limitations: { type: 'array', items: { type: 'string' }, minItems: 1 },
  },
  required: [
    'dataUrl',
    'width',
    'height',
    'camera',
    'target',
    'observedAt',
    'visibleObjectIds',
    'objectCount',
    'quality',
    'basis',
    'readiness',
    'userCameraUnchanged',
    'limitations',
  ],
  additionalProperties: false,
}

const observationSchema: JsonSchema = {
  type: 'object',
  properties: {
    observationId: { type: 'string', minLength: 1 },
    scope: { type: 'string', enum: ['view', 'scene'] },
    scene: {
      type: 'object',
      properties: {
        summary: summarySchema,
        objects: { type: 'array', items: spatialObjectSchema, maxItems: 500 },
      },
      required: ['summary'],
      additionalProperties: false,
    },
    view: {
      type: 'object',
      properties: {
        camera: viewSchema,
        bounds: boundsSchema,
        quality: qualitySchema,
        basis: { type: 'string' },
      },
      required: ['camera', 'quality', 'basis'],
      additionalProperties: false,
    },
    readiness: sceneReadinessSchema,
    freshness: {
      type: 'object',
      properties: {
        sceneObservedAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time' },
        ageMs: { type: 'number', minimum: 0 },
        snapshotRevision: { type: 'integer', minimum: 1 },
        changedDuringObservation: { type: 'boolean' },
      },
      required: [
        'sceneObservedAt',
        'completedAt',
        'ageMs',
        'snapshotRevision',
        'changedDuringObservation',
      ],
      additionalProperties: false,
    },
    visual: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['never', 'auto', 'always'] },
        status: { type: 'string', enum: ['captured', 'skipped', 'unavailable'] },
        reason: { type: 'string' },
        evidence: observerEvidenceSchema,
      },
      required: ['mode', 'status', 'reason'],
      additionalProperties: false,
    },
    quality: qualitySchema,
    basis: { type: 'string' },
    limitations: { type: 'array', items: { type: 'string' }, minItems: 1 },
  },
  required: [
    'observationId',
    'scope',
    'scene',
    'view',
    'readiness',
    'freshness',
    'visual',
    'quality',
    'basis',
    'limitations',
  ],
  additionalProperties: false,
}

function bridgeResultSchema(data: JsonSchema): JsonSchema {
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data,
      message: { type: 'string' },
      error: { type: 'string' },
    },
    required: ['success'],
    additionalProperties: false,
  }
}

function spatialContract(
  name: string,
  description: string,
  zhDescription: string,
  parameters: Readonly<Record<string, string>>,
  zhParameters: Readonly<Record<string, string>>,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): CesiumToolContract {
  const metadata = resolveCesiumToolMetadata(name, description, { readOnlyHint: true })
  return {
    name,
    action: name,
    description,
    inputSchema,
    outputSchema,
    ...metadata,
    localizations: {
      en: { description, parameters },
      'zh-CN': { description: zhDescription, parameters: zhParameters },
    },
  }
}

const queryProperties: Readonly<Record<string, JsonSchema>> = {
  name: { type: 'string', minLength: 1, maxLength: 200 },
  types: {
    type: 'array',
    items: { type: 'string', minLength: 1 },
    minItems: 1,
    maxItems: 50,
  },
  sourceTypes: {
    type: 'array',
    items: {
      type: 'string',
      enum: ['entity', 'layer', 'geojson', 'czml', 'tileset-feature'],
    },
    minItems: 1,
    maxItems: 5,
  },
  layerId: { type: 'string', minLength: 1, maxLength: 200 },
  bbox: boundsSchema,
  near: {
    type: 'object',
    properties: {
      longitude: { type: 'number', minimum: -180, maximum: 180 },
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      radiusMeters: { type: 'number', exclusiveMinimum: 0, maximum: 20000000 },
    },
    required: ['longitude', 'latitude', 'radiusMeters'],
    additionalProperties: false,
  },
  propertyEquals: {
    type: 'object',
    additionalProperties: {
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'null' },
      ],
    },
  },
  limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
}

export const cesiumSpatialToolContracts: readonly CesiumToolContract[] = [
  spatialContract(
    'observeScene',
    'Create one grounded observation from the managed Cesium scene. Structured facts are returned first; independent visual evidence is captured only when the image policy requires it. Readiness and freshness prevent unloaded or changing content from being reported as complete.',
    '从受管 Cesium 场景创建一次可追溯观察。优先返回结构化事实，仅在图像策略需要时采集独立视觉证据，并通过加载状态和新鲜度避免把未加载或变化中的内容误报为完整结果。',
    {
      scope: 'Observe objects in the current geographic view or the whole managed scene.',
      includeObjects: 'Include selected normalized objects with the scene summary.',
      limit: 'Maximum normalized objects returned.',
      imageMode: 'never skips images, auto captures only when visual grounding is useful, always requires an attempt.',
      targetObjectId: 'Stable spatial object ID used as the observer target.',
      targetLongitude: 'Observer target longitude when no object ID is supplied.',
      targetLatitude: 'Observer target latitude when no object ID is supplied.',
      targetHeight: 'Observer target height above the ellipsoid.',
      preset: 'Independent observer view preset.',
      range: 'Independent observer distance from the target.',
      heading: 'Independent observer heading in degrees.',
      pitch: 'Independent observer pitch in degrees.',
      imageWidth: 'PNG width when visual evidence is captured.',
      imageHeight: 'PNG height when visual evidence is captured.',
    },
    {
      scope: '观察当前地理视域或整个受管场景中的对象。',
      includeObjects: '除场景摘要外是否返回选中的标准化对象。',
      limit: '最多返回的标准化对象数量。',
      imageMode: 'never 不采图，auto 仅在需要视觉落地时采图，always 始终尝试采图。',
      targetObjectId: '作为独立观察目标的稳定空间对象 ID。',
      targetLongitude: '未提供对象 ID 时的观察目标经度。',
      targetLatitude: '未提供对象 ID 时的观察目标纬度。',
      targetHeight: '观察目标的椭球高度。',
      preset: '独立观察视角预设。',
      range: '独立观察相机距目标的距离。',
      heading: '独立观察相机航向角。',
      pitch: '独立观察相机俯仰角。',
      imageWidth: '采集视觉证据时的 PNG 宽度。',
      imageHeight: '采集视觉证据时的 PNG 高度。',
    },
    {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['view', 'scene'], default: 'view' },
        includeObjects: { type: 'boolean', default: true },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
        imageMode: {
          type: 'string',
          enum: ['never', 'auto', 'always'],
          default: 'auto',
        },
        targetObjectId: { type: 'string', minLength: 1, maxLength: 500 },
        targetLongitude: { type: 'number', minimum: -180, maximum: 180 },
        targetLatitude: { type: 'number', minimum: -90, maximum: 90 },
        targetHeight: { type: 'number', minimum: -10000, maximum: 1000000 },
        preset: { type: 'string', enum: ['overview', 'detail', 'eye-level'] },
        range: { type: 'number', minimum: 50, maximum: 20000000 },
        heading: { type: 'number', minimum: 0, maximum: 360 },
        pitch: { type: 'number', minimum: -89, maximum: -5 },
        imageWidth: { type: 'integer', minimum: 320, maximum: 1600, default: 1024 },
        imageHeight: { type: 'integer', minimum: 180, maximum: 1200, default: 576 },
      },
      additionalProperties: false,
    },
    bridgeResultSchema(observationSchema),
  ),
  spatialContract(
    'describeScene',
    'Describe the currently managed Cesium scene as normalized spatial objects. Evidence quality states whether geometry is exact, derived, approximate, or unavailable.',
    '将当前受管 Cesium 场景描述为标准化空间对象，并明确几何证据是精确、推导、近似还是未知。',
    {
      includeObjects: 'Include normalized objects in addition to aggregate counts.',
      limit: 'Maximum objects returned when includeObjects is true.',
    },
    {
      includeObjects: '除汇总信息外，是否返回标准化对象。',
      limit: '返回对象时的最大数量。',
    },
    {
      type: 'object',
      properties: {
        includeObjects: { type: 'boolean', default: false },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
      },
      additionalProperties: false,
    },
    bridgeResultSchema({
      type: 'object',
      properties: {
        summary: summarySchema,
        objects: { type: 'array', items: spatialObjectSchema },
      },
      required: ['summary'],
      additionalProperties: false,
    }),
  ),
  spatialContract(
    'querySpatialObjects',
    'Query normalized scene objects by semantic type, source, layer, geographic extent, distance, or exact property values.',
    '按语义类型、来源、图层、地理范围、距离或精确属性值查询标准化场景对象。',
    {
      name: 'Case-insensitive substring of the object name.',
      types: 'Semantic or Cesium object types to include.',
      sourceTypes: 'Source categories to include.',
      layerId: 'Restrict results to one managed layer.',
      bbox: 'Bounds [west, south, east, north] in degrees.',
      near: 'Return objects whose centroid is within the radius.',
      propertyEquals: 'Exact property filters combined with AND.',
      limit: 'Maximum number of objects to return.',
    },
    {
      name: '对象名称中不区分大小写的片段。',
      types: '要包含的语义类型或 Cesium 对象类型。',
      sourceTypes: '要包含的数据来源类别。',
      layerId: '仅查询指定受管图层。',
      bbox: '经纬度范围 [west, south, east, north]。',
      near: '返回质心位于指定半径内的对象。',
      propertyEquals: '使用 AND 组合的属性精确匹配条件。',
      limit: '最多返回的对象数量。',
    },
    {
      type: 'object',
      properties: queryProperties,
      additionalProperties: false,
    },
    bridgeResultSchema({
      type: 'object',
      properties: {
        objects: { type: 'array', items: spatialObjectSchema },
        total: { type: 'integer', minimum: 0 },
      },
      required: ['objects', 'total'],
      additionalProperties: false,
    }),
  ),
  spatialContract(
    'getObjectContext',
    'Get one normalized scene object plus nearby objects ranked by centroid distance. Use the evidence quality before making spatial claims.',
    '获取一个标准化场景对象及按质心距离排序的邻近对象；进行空间判断前应先检查证据质量。',
    {
      objectId: 'Stable object ID returned by a perception tool.',
      nearbyRadiusMeters: 'Search radius around the object centroid.',
      nearbyLimit: 'Maximum nearby objects to return.',
    },
    {
      objectId: '由感知工具返回的稳定对象 ID。',
      nearbyRadiusMeters: '围绕对象质心的邻近搜索半径。',
      nearbyLimit: '最多返回的邻近对象数量。',
    },
    {
      type: 'object',
      properties: {
        objectId: { type: 'string', minLength: 1, maxLength: 500 },
        nearbyRadiusMeters: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: 20000000,
          default: 1000,
        },
        nearbyLimit: { type: 'integer', minimum: 0, maximum: 100, default: 10 },
      },
      required: ['objectId'],
      additionalProperties: false,
    },
    bridgeResultSchema({
      type: 'object',
      properties: {
        object: spatialObjectSchema,
        nearby: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              object: spatialObjectSchema,
              distanceMeters: { type: 'number', minimum: 0 },
            },
            required: ['object', 'distanceMeters'],
            additionalProperties: false,
          },
        },
      },
      required: ['object', 'nearby'],
      additionalProperties: false,
    }),
  ),
  spatialContract(
    'querySpatialRelation',
    'Evaluate a spatial relation between two normalized scene objects and return the value together with its evidence basis and quality.',
    '评估两个标准化场景对象之间的空间关系，同时返回结论、证据依据和质量。',
    {
      subjectId: 'Subject object ID.',
      objectId: 'Reference object ID.',
      relation: 'Spatial relation to evaluate.',
      nearThresholdMeters: 'Distance threshold used only by the near relation.',
    },
    {
      subjectId: '主体对象 ID。',
      objectId: '参照对象 ID。',
      relation: '需要评估的空间关系。',
      nearThresholdMeters: '仅用于 near 关系的距离阈值。',
    },
    {
      type: 'object',
      properties: {
        subjectId: { type: 'string', minLength: 1, maxLength: 500 },
        objectId: { type: 'string', minLength: 1, maxLength: 500 },
        relation: {
          type: 'string',
          enum: ['distance', 'near', 'intersects', 'within', 'contains', 'overlaps'],
        },
        nearThresholdMeters: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: 20000000,
          default: 1000,
        },
      },
      required: ['subjectId', 'objectId', 'relation'],
      additionalProperties: false,
    },
    bridgeResultSchema(relationResultSchema),
  ),
  spatialContract(
    'getViewContext',
    'Get the camera state, geographic view bounds when computable, and normalized objects intersecting that view. This reports managed scene context, not pixel-perfect occlusion.',
    '获取相机状态、可计算时的地理视域范围，以及与视域相交的标准化对象；它描述受管场景上下文，不等同于像素级遮挡判断。',
    {
      includeObjects: 'Include normalized objects intersecting the view bounds.',
      limit: 'Maximum visible-context objects to return.',
    },
    {
      includeObjects: '是否返回与视域相交的标准化对象。',
      limit: '最多返回的视域上下文对象数量。',
    },
    {
      type: 'object',
      properties: {
        includeObjects: { type: 'boolean', default: true },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
      },
      additionalProperties: false,
    },
    bridgeResultSchema({
      type: 'object',
      properties: {
        view: viewSchema,
        bounds: boundsSchema,
        summary: summarySchema,
        objects: { type: 'array', items: spatialObjectSchema },
        quality: qualitySchema,
        basis: { type: 'string' },
      },
      required: ['view', 'summary', 'quality', 'basis'],
      additionalProperties: false,
    }),
  ),
]
