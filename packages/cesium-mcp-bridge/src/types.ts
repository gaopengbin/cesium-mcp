import type * as Cesium from 'cesium'
import type { ColorInput } from './utils'

// ==================== Command & Result ====================

export interface BridgeCommand {
  action: string
  params: Record<string, unknown>
}

export interface BridgeResult {
  success: boolean
  data?: unknown
  error?: string
  message?: string
}

// ==================== View ====================

export interface FlyToParams {
  longitude: number
  latitude: number
  height?: number
  heading?: number
  pitch?: number
  roll?: number
  duration?: number
}

export interface SetViewParams {
  longitude: number
  latitude: number
  height?: number
  heading?: number
  pitch?: number
  roll?: number
}

export interface ViewState {
  longitude: number
  latitude: number
  height: number
  heading: number
  pitch: number
  roll: number
}

export interface ZoomToExtentParams {
  bbox: [number, number, number, number] // [west, south, east, north]
  duration?: number
}

// ==================== Layer ====================

export interface LayerInfo {
  id: string
  name: string
  type: string
  visible: boolean
  color: string
  dataRefId?: string
}

export interface ChoroplethStyle {
  field: string
  breaks: number[]
  colors: string[]
}

export interface CategoryStyle {
  field: string
  colors?: string[]
}

export interface LayerStyle {
  color?: string
  opacity?: number
  pointSize?: number
  strokeWidth?: number
  /** 每个面/实体随机颜色 */
  randomColor?: boolean
  /** 按索引渐变填充，指定色系起止色如 ['#FF0000', '#0000FF'] */
  gradient?: [string, string]
  choropleth?: ChoroplethStyle
  category?: CategoryStyle
}

export interface AddGeoJsonLayerParams {
  id?: string
  name?: string
  data?: Record<string, unknown>
  url?: string
  style?: LayerStyle
  dataRefId?: string
  labelField?: string
  labelStyle?: {
    font?: string
    fillColor?: string
    outlineColor?: string
    outlineWidth?: number
    pixelOffset?: [number, number]
    scale?: number
  }
}

export interface AddHeatmapParams {
  id?: string
  name?: string
  data: Record<string, unknown>
  radius?: number
  gradient?: Record<number, string>
  blur?: number
  maxOpacity?: number
  minOpacity?: number
  resolution?: number
}

export interface SetBasemapParams {
  basemap: 'dark' | 'satellite' | 'standard' | string
}

// ==================== 3D Scene ====================

export interface Load3dTilesParams {
  id?: string
  name?: string
  url: string
  maximumScreenSpaceError?: number
  heightOffset?: number
}

export interface LoadTerrainParams {
  provider: 'cesiumion' | 'arcgis' | 'flat'
  url?: string
  cesiumIonAssetId?: number
}

export interface LoadImageryServiceParams {
  id?: string
  name?: string
  url: string
  serviceType: 'wms' | 'wmts' | 'xyz' | 'arcgis_mapserver'
  layerName?: string
  opacity?: number
}

export interface LoadCzmlParams {
  id?: string
  name?: string
  data?: unknown[]
  url?: string
  sourceUri?: string
  clampToGround?: boolean
  flyTo?: boolean
}

export interface LoadKmlParams {
  id?: string
  name?: string
  url?: string
  data?: string
  sourceUri?: string
  clampToGround?: boolean
  flyTo?: boolean
}

// ==================== Trajectory ====================

export interface PlayTrajectoryParams {
  id?: string
  name?: string
  coordinates: number[][]
  durationSeconds?: number
  trailSeconds?: number
  label?: string
}

// ==================== Entity ====================

export interface AddLabelParams {
  dataRefId?: string
  data?: Record<string, unknown>
  field: string
  style?: {
    font?: string
    fillColor?: string
    outlineColor?: string
    outlineWidth?: number
    backgroundColor?: string
    showBackground?: boolean
    pixelOffset?: [number, number]
    scale?: number
  }
}

export interface AddMarkerParams {
  longitude: number
  latitude: number
  label?: string
  color?: ColorInput
  size?: number
}

export interface AddPolylineParams {
  coordinates: number[][]  // [[lon, lat, height?], ...]
  color?: ColorInput
  width?: number
  clampToGround?: boolean
  label?: string
}

export interface AddPolygonParams {
  coordinates: number[][]  // [[lon, lat, height?], ...] 外环
  color?: ColorInput
  outlineColor?: ColorInput
  opacity?: number
  extrudedHeight?: number
  clampToGround?: boolean
  label?: string
}

export interface AddModelParams {
  longitude: number
  latitude: number
  height?: number
  url: string
  scale?: number
  heading?: number
  pitch?: number
  roll?: number
  label?: string
}

export interface UpdateEntityParams {
  entityId: string
  position?: { longitude: number; latitude: number; height?: number }
  label?: string
  color?: ColorInput
  scale?: number
  show?: boolean
}

export interface RemoveEntityParams {
  entityId: string
}

// ==================== UpdateLayerStyle ====================

export interface UpdateLayerStyleParams {
  layerId: string
  labelStyle?: {
    font?: string
    fillColor?: string
    outlineColor?: string
    outlineWidth?: number
    backgroundColor?: string
    showBackground?: boolean
    pixelOffset?: [number, number]
    scale?: number
    fontSize?: number
  }
  layerStyle?: {
    color?: string
    opacity?: number
    strokeWidth?: number
    pointSize?: number
  }
  tileStyle?: {
    color?: string
    show?: string
    pointSize?: string
    meta?: Record<string, string>
  }
}

// ==================== Interaction ====================

export interface ScreenshotResult {
  dataUrl: string
  width: number
  height: number
}

export interface HighlightParams {
  layerId: string
  featureIndex?: number
  color?: ColorInput
}

export interface MeasureParams {
  mode: 'distance' | 'area'
  positions: [number, number, number?][]
  showOnMap?: boolean
  id?: string
}

export interface MeasureResult {
  mode: 'distance' | 'area'
  value: number
  unit: string
  segments?: number[]
  id?: string
}

// ==================== Clear All ====================

export interface ClearAllResult {
  removedLayers: number
  removedEntities: number
}

// ==================== Get Entity Properties ====================

export interface GetEntityPropertiesParams {
  entityId: string
}

export interface EntityPropertiesResult {
  entityId: string
  name?: string
  type: string
  position?: { longitude: number; latitude: number; height: number }
  properties: Record<string, unknown>
  graphicProperties: Record<string, unknown>
}

// ==================== Export Scene ====================

export interface ExportSceneResult {
  view: ViewState
  layers: LayerInfo[]
  entities: QueryEntityResult[]
  timestamp: string
}

// ==================== Get Layer Schema ====================

export interface GetLayerSchemaParams {
  layerId: string
}

export interface LayerSchemaField {
  name: string
  type: string
  sample?: unknown
}

export interface LayerSchemaResult {
  layerId: string
  layerName: string
  entityCount: number
  fields: LayerSchemaField[]
}

// ==================== Event ====================

export type BridgeEventType = 'layerAdded' | 'layerRemoved' | 'viewChanged' | 'error'

export interface BridgeEvent {
  type: BridgeEventType
  data: unknown
}

export type BridgeEventHandler = (event: BridgeEvent) => void

// ==================== Camera (融合官方 Camera Server) ====================

export interface LookAtTransformParams {
  longitude: number
  latitude: number
  height?: number
  heading?: number
  pitch?: number
  range?: number
}

export interface StartOrbitParams {
  speed?: number
  clockwise?: boolean
}

export interface SetCameraOptionsParams {
  enableRotate?: boolean
  enableTranslate?: boolean
  enableZoom?: boolean
  enableTilt?: boolean
  enableLook?: boolean
  minimumZoomDistance?: number
  maximumZoomDistance?: number
  enableInputs?: boolean
}

// ==================== Entity Types (融合官方 Entity Server) ====================

export interface MaterialSpec {
  type: 'color' | 'image' | 'checkerboard' | 'stripe' | 'grid'
  color?: ColorInput
  image?: string
  repeat?: { x: number; y: number }
  evenColor?: ColorInput
  oddColor?: ColorInput
  orientation?: 'horizontal' | 'vertical'
  cellAlpha?: number
  lineCount?: { x: number; y: number }
}

export type MaterialInput = ColorInput | MaterialSpec

export interface OrientationInput {
  heading: number
  pitch: number
  roll: number
}

export interface AddBillboardParams {
  longitude: number
  latitude: number
  height?: number
  name?: string
  image: string
  scale?: number
  color?: ColorInput
  pixelOffset?: { x: number; y: number }
  horizontalOrigin?: 'CENTER' | 'LEFT' | 'RIGHT'
  verticalOrigin?: 'CENTER' | 'TOP' | 'BOTTOM' | 'BASELINE'
  heightReference?: 'NONE' | 'CLAMP_TO_GROUND' | 'RELATIVE_TO_GROUND'
}

export interface AddBoxParams {
  longitude: number
  latitude: number
  height?: number
  name?: string
  dimensions: { width: number; length: number; height: number }
  material?: MaterialInput
  outline?: boolean
  outlineColor?: ColorInput
  fill?: boolean
  orientation?: OrientationInput
  heightReference?: 'NONE' | 'CLAMP_TO_GROUND' | 'RELATIVE_TO_GROUND'
}

export interface PositionDegrees {
  longitude: number
  latitude: number
  height?: number
}

export interface AddCorridorParams {
  name?: string
  positions: PositionDegrees[]
  width: number
  material?: MaterialInput
  cornerType?: 'ROUNDED' | 'MITERED' | 'BEVELED'
  height?: number
  extrudedHeight?: number
  outline?: boolean
  outlineColor?: ColorInput
}

export interface AddCylinderParams {
  longitude: number
  latitude: number
  height?: number
  name?: string
  length: number
  topRadius: number
  bottomRadius: number
  material?: MaterialInput
  outline?: boolean
  outlineColor?: ColorInput
  fill?: boolean
  orientation?: OrientationInput
  numberOfVerticalLines?: number
  slices?: number
}

export interface AddEllipseParams {
  longitude: number
  latitude: number
  height?: number
  name?: string
  semiMajorAxis: number
  semiMinorAxis: number
  material?: MaterialInput
  extrudedHeight?: number
  rotation?: number
  outline?: boolean
  outlineColor?: ColorInput
  fill?: boolean
  stRotation?: number
  numberOfVerticalLines?: number
}

export interface AddRectangleParams {
  name?: string
  west: number
  south: number
  east: number
  north: number
  material?: MaterialInput
  height?: number
  extrudedHeight?: number
  rotation?: number
  outline?: boolean
  outlineColor?: ColorInput
  fill?: boolean
  stRotation?: number
}

export interface AddWallParams {
  name?: string
  positions: PositionDegrees[]
  minimumHeights?: number[]
  maximumHeights?: number[]
  material?: MaterialInput
  outline?: boolean
  outlineColor?: ColorInput
  fill?: boolean
}

// ==================== Animation (融合官方 Animation Server) ====================

export interface AnimationWaypoint {
  longitude: number
  latitude: number
  height?: number
  time: string  // ISO 8601
}

export interface CreateAnimationParams {
  name?: string
  waypoints: AnimationWaypoint[]
  modelUri?: string
  showPath?: boolean
  pathWidth?: number
  pathColor?: string
  pathLeadTime?: number
  pathTrailTime?: number
  multiplier?: number
  shouldAnimate?: boolean
}

export interface ControlAnimationParams {
  action: 'play' | 'pause'
}

export interface RemoveAnimationParams {
  entityId: string
}

export interface UpdateAnimationPathParams {
  entityId: string
  width?: number
  color?: string
  leadTime?: number
  trailTime?: number
  show?: boolean
}

export interface TrackEntityParams {
  entityId?: string
  heading?: number
  pitch?: number
  range?: number
}

export interface ControlClockParams {
  action: 'configure' | 'setTime' | 'setMultiplier'
  startTime?: string
  stopTime?: string
  currentTime?: string
  time?: string
  multiplier?: number
  shouldAnimate?: boolean
  clockRange?: 'UNBOUNDED' | 'CLAMPED' | 'LOOP_STOP'
}

export interface SetGlobeLightingParams {
  enableLighting?: boolean
  dynamicAtmosphereLighting?: boolean
  dynamicAtmosphereLightingFromSun?: boolean
}

// ==================== Scene & Post-Processing ====================

export interface SetSceneOptionsParams {
  fogEnabled?: boolean
  fogDensity?: number
  fogMinimumBrightness?: number
  skyAtmosphereShow?: boolean
  skyAtmosphereHueShift?: number
  skyAtmosphereSaturationShift?: number
  skyAtmosphereBrightnessShift?: number
  groundAtmosphereShow?: boolean
  shadowsEnabled?: boolean
  shadowsSoftShadows?: boolean
  shadowsDarkness?: number
  sunShow?: boolean
  sunGlowFactor?: number
  moonShow?: boolean
  depthTestAgainstTerrain?: boolean
  backgroundColor?: string
}

export interface SetPostProcessParams {
  bloom?: boolean
  bloomContrast?: number
  bloomBrightness?: number
  bloomDelta?: number
  bloomSigma?: number
  bloomStepSize?: number
  bloomGlowOnly?: boolean
  ambientOcclusion?: boolean
  aoIntensity?: number
  aoBias?: number
  aoLengthCap?: number
  aoStepSize?: number
  fxaa?: boolean
}

export interface AnimationInfo {
  entityId: string
  name?: string
  startTime: string
  stopTime: string
  exists: boolean
}

// ==================== Batch & Query ====================

export interface BatchEntityDef {
  type: 'marker' | 'polyline' | 'polygon' | 'model' | 'billboard' | 'box' | 'cylinder' | 'ellipse' | 'rectangle' | 'wall' | 'corridor'
  [key: string]: unknown
}

export interface BatchAddEntitiesParams {
  entities: BatchEntityDef[]
}

export interface QueryEntitiesParams {
  name?: string
  type?: string
  bbox?: [number, number, number, number] // [west, south, east, north]
}

export interface QueryEntityResult {
  entityId: string
  name?: string
  type: string
  position?: { longitude: number; latitude: number; height: number }
}

// ==================== Viewpoint Bookmarks ====================

export interface SaveViewpointParams {
  name: string
}

export interface LoadViewpointParams {
  name: string
  duration?: number
}
