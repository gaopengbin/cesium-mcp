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

const activeFlights = new WeakMap<Cesium.Viewer, symbol>()

function cameraFlight(
  viewer: Cesium.Viewer,
  duration: number,
  start: (done: () => void) => void,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const id = Symbol('flight')
    let settled = false
    const cleanup = () => {
      clearTimeout(fallback)
      signal?.removeEventListener('abort', abort)
      if (activeFlights.get(viewer) === id) activeFlights.delete(viewer)
    }
    const done = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const abort = () => {
      if (settled) return
      settled = true
      const ownsFlight = activeFlights.get(viewer) === id
      cleanup()
      if (ownsFlight) viewer.camera.cancelFlight()
      reject(signal?.reason)
    }
    // Some Cesium flights do not call complete/cancel when already at the destination.
    const fallback = setTimeout(done, (duration + 1) * 1000)
    activeFlights.set(viewer, id)
    signal?.addEventListener('abort', abort, { once: true })
    try { start(done) } catch (error) {
      settled = true
      cleanup()
      reject(error)
    }
  })
}

export function flyTo(viewer: Cesium.Viewer, params: FlyToParams, signal?: AbortSignal): Promise<void> {
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

  return cameraFlight(viewer, duration, done => {
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
  }, signal)
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

export function zoomToExtent(viewer: Cesium.Viewer, params: ZoomToExtentParams, signal?: AbortSignal): Promise<void> {
  const { bbox, duration = 1.5 } = params
  const [west, south, east, north] = bbox

  return cameraFlight(viewer, duration, done => {
    viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
      duration,
      complete: done,
      cancel: done,
    })
  }, signal)
}

// ==================== Viewpoint Bookmarks ====================

const _viewpoints = new WeakMap<Cesium.Viewer, Map<string, ViewState>>()

function viewpointsFor(viewer: Cesium.Viewer): Map<string, ViewState> {
  let viewpoints = _viewpoints.get(viewer)
  if (!viewpoints) {
    viewpoints = new Map()
    _viewpoints.set(viewer, viewpoints)
  }
  return viewpoints
}

export function saveViewpoint(viewer: Cesium.Viewer, params: SaveViewpointParams): ViewState {
  const state = getView(viewer)
  viewpointsFor(viewer).set(params.name, state)
  return state
}

export function loadViewpoint(viewer: Cesium.Viewer, params: LoadViewpointParams): ViewState | null {
  const state = viewpointsFor(viewer).get(params.name)
  if (!state) return null
  const duration = params.duration ?? 2
  if (duration > 0) {
    flyTo(viewer, { ...state, duration })
  } else {
    setView(viewer, state)
  }
  return state
}

export function listViewpoints(viewer: Cesium.Viewer): { name: string; state: ViewState }[] {
  return Array.from(viewpointsFor(viewer).entries()).map(([name, state]) => ({ name, state }))
}

export function clearViewpoints(viewer: Cesium.Viewer): void {
  _viewpoints.delete(viewer)
}
