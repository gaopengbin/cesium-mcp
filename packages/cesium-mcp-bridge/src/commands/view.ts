import * as Cesium from 'cesium'
import type { FlyToParams, SetViewParams, ViewState, ZoomToExtentParams, SaveViewpointParams, LoadViewpointParams } from '../types'
import { validateCoordinate } from '../utils'

/**
 * 将用户期望的相机高度(height)转换为 HeadingPitchRange 的 range（斜距）。
 * pitch=-90 时 range=height（正上方），pitch 越浅 range 越大。
 */
function _heightToRange(height: number, pitchDeg: number): number {
  const absSin = Math.abs(Math.sin(Cesium.Math.toRadians(pitchDeg)))
  // 接近水平时(sin→0)限制最大 range 为 height*10，避免极端值
  return absSin > 0.05 ? height / absSin : height * 10
}

export function flyTo(viewer: Cesium.Viewer, params: FlyToParams): Promise<void> {
  const {
    longitude,
    latitude,
    height = 50000,
    heading = 0,
    pitch = -45,
    duration = 2,
  } = params

  validateCoordinate(longitude, latitude, height)

  const target = Cesium.Cartesian3.fromDegrees(longitude, latitude, 0)
  const range = _heightToRange(height, pitch)

  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(fallback)
      resolve()
    }
    // 兜底：Cesium 在"目标已在相机附近"或"被下一个 fly 打断"等场景下
    // 可能既不触发 complete 也不触发 cancel，避免调用者永远 pending
    const fallback = setTimeout(done, (duration + 1) * 1000)

    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 0), {
      duration,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(heading),
        Cesium.Math.toRadians(pitch),
        range,
      ),
      complete: done,
      cancel: done,
    })
  })
}

export function setView(viewer: Cesium.Viewer, params: SetViewParams): void {
  const { longitude, latitude, height = 50000, heading = 0, pitch = -45, roll } = params
  validateCoordinate(longitude, latitude, height)

  const target = Cesium.Cartesian3.fromDegrees(longitude, latitude, 0)
  const range = _heightToRange(height, pitch)

  viewer.camera.lookAt(
    target,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(heading),
      Cesium.Math.toRadians(pitch),
      range,
    ),
  )
  // lookAt 会锁定相机，解除锁定以恢复自由操控
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
  if (roll !== undefined) {
    viewer.camera.setView({
      orientation: {
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: Cesium.Math.toRadians(roll),
      },
    })
  }
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
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(fallback)
      resolve()
    }
    const fallback = setTimeout(done, (duration + 1) * 1000)

    viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
      duration,
      complete: done,
      cancel: done,
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
