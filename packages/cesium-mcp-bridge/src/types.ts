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
  choropleth?: ChoroplethStyle
  category?: CategoryStyle
}

export interface AddGeoJsonLayerParams {
  id?: string
  name?: string
  data: Record<string, unknown>
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

// ==================== Event ====================

export type BridgeEventType = 'layerAdded' | 'layerRemoved' | 'viewChanged' | 'error'

export interface BridgeEvent {
  type: BridgeEventType
  data: unknown
}

export type BridgeEventHandler = (event: BridgeEvent) => void
