import { resolveCesiumToolMetadata } from './metadata.js'
import type { CesiumToolContract, JsonSchema } from './types.js'

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
}

const viewSchema: JsonSchema = {
  type: 'object',
  properties: {
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    height: { type: 'number' },
    heading: { type: 'number' },
    pitch: { type: 'number' },
    roll: { type: 'number' },
  },
  required: ['longitude', 'latitude', 'height', 'heading', 'pitch', 'roll'],
  additionalProperties: false,
}

const targetSchema: JsonSchema = {
  type: 'object',
  properties: {
    targetObjectId: { type: 'string', minLength: 1 },
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

const dataSchema: JsonSchema = {
  type: 'object',
  properties: {
    dataUrl: { type: 'string', minLength: 32 },
    width: { type: 'integer', minimum: 1 },
    height: { type: 'integer', minimum: 1 },
    camera: viewSchema,
    target: targetSchema,
    observedAt: { type: 'string', format: 'date-time' },
    bounds: boundsSchema,
    visibleObjectIds: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 500,
    },
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
    limitations: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
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

const outputSchema: JsonSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: dataSchema,
    message: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['success'],
  additionalProperties: false,
}

const description = 'Capture a PNG from a lazy, independent Cesium observer camera without moving the application camera. The first experimental version mirrors managed Point, LineString, and Polygon geometry from the spatial snapshot.'
const metadata = resolveCesiumToolMetadata(
  'captureObserverView',
  description,
  { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
)

export const cesiumObserverToolContracts: readonly CesiumToolContract[] = [{
  name: 'captureObserverView',
  action: 'captureObserverView',
  description,
  inputSchema: {
    type: 'object',
    properties: {
      targetObjectId: { type: 'string', minLength: 1 },
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
    oneOf: [
      { required: ['targetObjectId'] },
      { required: ['targetLongitude', 'targetLatitude'] },
    ],
    additionalProperties: false,
  },
  outputSchema,
  ...metadata,
  localizations: {
    en: {
      description,
      parameters: {
        targetObjectId: 'Spatial object ID to center the observer on. Use this instead of target coordinates.',
        targetLongitude: 'Longitude of the point the observer camera looks at.',
        targetLatitude: 'Latitude of the point the observer camera looks at.',
        targetHeight: 'Target height in meters above the ellipsoid.',
        preset: 'View preset: overview, detail, or eye-level. Explicit camera values override it.',
        range: 'Observer distance from the target in meters.',
        heading: 'Observer orbit heading around the target in degrees.',
        pitch: 'Observer orbit pitch in degrees; negative values look downward.',
        imageWidth: 'PNG width in pixels.',
        imageHeight: 'PNG height in pixels.',
      },
    },
    'zh-CN': {
      description: '使用延迟创建、完全独立的 Cesium 观察相机截取 PNG，不移动应用当前相机。首个实验版本会从空间快照镜像受管的点、线和面几何。',
      parameters: {
        targetObjectId: '观察相机居中的空间对象 ID；与目标坐标二选一。',
        targetLongitude: '观察相机看向目标点的经度。',
        targetLatitude: '观察相机看向目标点的纬度。',
        targetHeight: '目标点相对椭球面的高度（米）。',
        preset: '视角预设：overview、detail 或 eye-level；显式相机参数优先。',
        range: '观察相机距目标点的距离（米）。',
        heading: '观察相机绕目标点的方位角（度）。',
        pitch: '观察相机的俯仰角（度），负值表示向下观察。',
        imageWidth: 'PNG 图片宽度（像素）。',
        imageHeight: 'PNG 图片高度（像素）。',
      },
    },
  },
}]
