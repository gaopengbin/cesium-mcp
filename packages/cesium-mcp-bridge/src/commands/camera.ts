import * as Cesium from 'cesium'
import type { LookAtTransformParams, SetCameraOptionsParams, StartOrbitParams } from '../types'
import { validateCoordinate } from '../utils'

export function lookAtTransform(viewer: Cesium.Viewer, params: LookAtTransformParams): void {
  const { longitude, latitude, height = 0, heading = 0, pitch = -45, range = 1000 } = params
  validateCoordinate(longitude, latitude, height)
  const center = Cesium.Cartesian3.fromDegrees(longitude, latitude, height)
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center)
  const hpr = new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(heading),
    Cesium.Math.toRadians(pitch),
    range,
  )
  viewer.camera.lookAtTransform(transform, hpr)
}

export type OrbitHandler = () => void

export function startOrbit(
  viewer: Cesium.Viewer,
  params: StartOrbitParams,
  existingHandler?: OrbitHandler,
): OrbitHandler {
  if (existingHandler) existingHandler()
  const speed = params.speed ?? 0.005
  const direction = (params.clockwise ?? true) ? -1 : 1
  const handler = viewer.clock.onTick.addEventListener(() => {
    viewer.camera.rotateRight(speed * direction)
  })
  return handler as unknown as OrbitHandler
}

export function stopOrbit(handler?: OrbitHandler): void {
  if (handler) handler()
}

export function setCameraOptions(viewer: Cesium.Viewer, params: SetCameraOptionsParams): void {
  const ctrl = viewer.scene.screenSpaceCameraController
  const fields: (keyof SetCameraOptionsParams)[] = [
    'enableRotate', 'enableTranslate', 'enableZoom', 'enableTilt',
    'enableLook', 'minimumZoomDistance', 'maximumZoomDistance', 'enableInputs',
  ]
  for (const key of fields) {
    if (params[key] !== undefined) {
      (ctrl as any)[key] = params[key]
    }
  }
}
