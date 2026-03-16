import * as Cesium from 'cesium'
import type { FlyToParams, SetViewParams, ViewState, ZoomToExtentParams, SaveViewpointParams, LoadViewpointParams } from '../types'
import { validateCoordinate } from '../utils'

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

  return new Promise((resolve) => {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
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
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
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
