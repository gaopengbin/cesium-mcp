import * as Cesium from 'cesium'
import type { FlyToParams, SetViewParams, ViewState, ZoomToExtentParams, SaveViewpointParams, LoadViewpointParams } from '../types'
import { validateCoordinate } from '../utils'

/**
 * 根据 pitch/heading 反算相机位置偏移，使目标经纬度出现在视口正中心。
 * pitch = -90 时相机在目标正上方（无偏移），pitch 越浅偏移越大。
 */
function _offsetCamera(
  targetLon: number,
  targetLat: number,
  height: number,
  headingDeg: number,
  pitchDeg: number,
): [number, number] {
  // 仅在倾斜视角时偏移；-90°（正下方）或接近 0°（水平）不偏移
  if (pitchDeg <= -89.5 || pitchDeg >= -1) return [targetLon, targetLat]

  const absPitchRad = Math.abs(Cesium.Math.toRadians(pitchDeg))
  const headingRad = Cesium.Math.toRadians(headingDeg)

  // 视线与地面交点的水平距离
  let d = height / Math.tan(absPitchRad)

  // 防止浅角度导致极端偏移（限制最大水平距离为 height 的 5 倍）
  const maxDist = height * 5
  if (d > maxDist) d = maxDist

  const METERS_PER_DEG_LAT = 111320
  const metersPerDegLon = 111320 * Math.cos(Cesium.Math.toRadians(targetLat))

  // 相机在目标的"背后"（heading 反方向）
  const cameraLat = targetLat - (d * Math.cos(headingRad)) / METERS_PER_DEG_LAT
  const cameraLon = targetLon - (d * Math.sin(headingRad)) / metersPerDegLon

  return [cameraLon, cameraLat]
}

export function flyTo(viewer: Cesium.Viewer, params: FlyToParams): Promise<void> {
  const {
    longitude,
    latitude,
    height = 50000,
    heading = 0,
    pitch = -45,
    roll = 0,
    duration = 2,
  } = params

  validateCoordinate(longitude, latitude, height)

  const [cameraLon, cameraLat] = _offsetCamera(longitude, latitude, height, heading, pitch)

  return new Promise((resolve) => {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(cameraLon, cameraLat, height),
      orientation: {
        heading: Cesium.Math.toRadians(heading),
        pitch: Cesium.Math.toRadians(pitch),
        roll: Cesium.Math.toRadians(roll),
      },
      duration,
      complete: resolve,
    })
  })
}

export function setView(viewer: Cesium.Viewer, params: SetViewParams): void {
  const { longitude, latitude, height = 50000, heading = 0, pitch = -45, roll = 0 } = params
  validateCoordinate(longitude, latitude, height)

  const [cameraLon, cameraLat] = _offsetCamera(longitude, latitude, height, heading, pitch)

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(cameraLon, cameraLat, height),
    orientation: {
      heading: Cesium.Math.toRadians(heading),
      pitch: Cesium.Math.toRadians(pitch),
      roll: Cesium.Math.toRadians(roll),
    },
  })
}

export function getView(viewer: Cesium.Viewer): ViewState {
  const carto = viewer.camera.positionCartographic
  return {
    longitude: Cesium.Math.toDegrees(carto.longitude),
    latitude: Cesium.Math.toDegrees(carto.latitude),
    height: carto.height,
    heading: Cesium.Math.toDegrees(viewer.camera.heading),
    pitch: Cesium.Math.toDegrees(viewer.camera.pitch),
    roll: Cesium.Math.toDegrees(viewer.camera.roll),
  }
}

export function zoomToExtent(viewer: Cesium.Viewer, params: ZoomToExtentParams): Promise<void> {
  const { bbox, duration = 1.5 } = params
  const [west, south, east, north] = bbox

  return new Promise((resolve) => {
    viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
      duration,
      complete: resolve,
    })
  })
}

// ==================== Viewpoint Bookmarks ====================

const _viewpoints = new Map<string, ViewState>()

export function saveViewpoint(viewer: Cesium.Viewer, params: SaveViewpointParams): ViewState {
  const state = getView(viewer)
  _viewpoints.set(params.name, state)
  return state
}

export function loadViewpoint(viewer: Cesium.Viewer, params: LoadViewpointParams): ViewState | null {
  const state = _viewpoints.get(params.name)
  if (!state) return null
  const duration = params.duration ?? 2
  if (duration > 0) {
    flyTo(viewer, { ...state, duration })
  } else {
    setView(viewer, state)
  }
  return state
}

export function listViewpoints(): { name: string; state: ViewState }[] {
  return Array.from(_viewpoints.entries()).map(([name, state]) => ({ name, state }))
}
