import * as Cesium from 'cesium'
import type {
  CreateAnimationParams,
  ControlClockParams,
  UpdateAnimationPathParams,
  TrackEntityParams,
  SetGlobeLightingParams,
  AnimationInfo,
} from '../types'
import { parseColor } from '../utils'

export type AnimationMap = Map<string, { startTime: Cesium.JulianDate; stopTime: Cesium.JulianDate }>

const MODEL_PRESETS: Record<string, string> = {
  cesium_man: 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumMan/Cesium_Man.glb',
  cesium_air: 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumAir/Cesium_Air.glb',
  ground_vehicle: 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/GroundVehicle/GroundVehicle.glb',
  cesium_drone: 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumDrone/CesiumDrone.glb',
}

function resolveModelUri(uri?: string): string | undefined {
  if (!uri) return undefined
  return MODEL_PRESETS[uri] ?? uri
}

export function createAnimation(
  viewer: Cesium.Viewer,
  params: CreateAnimationParams,
  animations: AnimationMap,
): Cesium.Entity {
  const { waypoints, name, showPath = true, pathWidth = 2, pathColor = '#00FF00', pathLeadTime = 0, pathTrailTime = 1e10, multiplier = 1, shouldAnimate = true } = params

  if (!waypoints || waypoints.length < 2) {
    throw new Error('Animation requires at least 2 waypoints')
  }

  const positionProperty = new Cesium.SampledPositionProperty()
  for (const wp of waypoints) {
    const time = Cesium.JulianDate.fromIso8601(wp.time)
    const position = Cesium.Cartesian3.fromDegrees(wp.longitude, wp.latitude, wp.height ?? 0)
    positionProperty.addSample(time, position)
  }
  positionProperty.setInterpolationOptions({
    interpolationDegree: 2,
    interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
  })

  const modelUri = resolveModelUri(params.modelUri)

  const entity = viewer.entities.add({
    name,
    position: positionProperty,
    orientation: new Cesium.VelocityOrientationProperty(positionProperty),
    model: modelUri ? {
      uri: modelUri,
      minimumPixelSize: 64,
      maximumScale: 200,
    } : undefined,
    path: showPath ? new Cesium.PathGraphics({
      width: pathWidth,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.1,
        color: parseColor(pathColor),
      }),
      leadTime: pathLeadTime,
      trailTime: pathTrailTime,
    }) : undefined,
    point: !modelUri ? { pixelSize: 10, color: Cesium.Color.RED } : undefined,
  })

  const startTime = Cesium.JulianDate.fromIso8601(waypoints[0]!.time)
  const stopTime = Cesium.JulianDate.fromIso8601(waypoints[waypoints.length - 1]!.time)
  viewer.clock.startTime = startTime.clone()
  viewer.clock.stopTime = stopTime.clone()
  viewer.clock.currentTime = startTime.clone()
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP
  viewer.clock.multiplier = multiplier
  viewer.clock.shouldAnimate = shouldAnimate

  animations.set(entity.id, { startTime, stopTime })
  return entity
}

export function controlAnimation(viewer: Cesium.Viewer, action: 'play' | 'pause'): void {
  viewer.clock.shouldAnimate = action === 'play'
}

export function removeAnimation(
  viewer: Cesium.Viewer,
  entityId: string,
  animations: AnimationMap,
): boolean {
  const entity = viewer.entities.getById(entityId)
  if (!entity) return false
  viewer.entities.remove(entity)
  animations.delete(entityId)
  return true
}

export function listAnimations(
  viewer: Cesium.Viewer,
  animations: AnimationMap,
): AnimationInfo[] {
  const result: AnimationInfo[] = []
  for (const [entityId, info] of animations) {
    const entity = viewer.entities.getById(entityId)
    result.push({
      entityId,
      name: entity?.name,
      startTime: Cesium.JulianDate.toIso8601(info.startTime),
      stopTime: Cesium.JulianDate.toIso8601(info.stopTime),
      exists: !!entity,
    })
  }
  return result
}

export function updateAnimationPath(
  viewer: Cesium.Viewer,
  params: UpdateAnimationPathParams,
): boolean {
  const entity = viewer.entities.getById(params.entityId)
  if (!entity?.path) return false
  if (params.width !== undefined) entity.path.width = new Cesium.ConstantProperty(params.width)
  if (params.color !== undefined) {
    entity.path.material = new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.1,
      color: parseColor(params.color),
    })
  }
  if (params.leadTime !== undefined) entity.path.leadTime = new Cesium.ConstantProperty(params.leadTime)
  if (params.trailTime !== undefined) entity.path.trailTime = new Cesium.ConstantProperty(params.trailTime)
  if (params.show !== undefined) entity.path.show = new Cesium.ConstantProperty(params.show)
  return true
}

export function trackEntity(viewer: Cesium.Viewer, params: TrackEntityParams): void {
  if (params.entityId) {
    const entity = viewer.entities.getById(params.entityId)
    if (!entity) throw new Error(`Entity not found: ${params.entityId}`)
    viewer.trackedEntity = entity
    if (params.heading !== undefined || params.pitch !== undefined || params.range !== undefined) {
      const position = entity.position?.getValue(viewer.clock.currentTime)
      if (position) {
        const hpr = new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(params.heading ?? 0),
          Cesium.Math.toRadians(params.pitch ?? -30),
          params.range ?? 500,
        )
        viewer.camera.lookAt(position, hpr)
      }
    }
  } else {
    viewer.trackedEntity = undefined
  }
}

export function controlClock(viewer: Cesium.Viewer, params: ControlClockParams): void {
  switch (params.action) {
    case 'configure':
      if (params.startTime) viewer.clock.startTime = Cesium.JulianDate.fromIso8601(params.startTime)
      if (params.stopTime) viewer.clock.stopTime = Cesium.JulianDate.fromIso8601(params.stopTime)
      if (params.currentTime) viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(params.currentTime)
      if (params.multiplier !== undefined) viewer.clock.multiplier = params.multiplier
      if (params.shouldAnimate !== undefined) viewer.clock.shouldAnimate = params.shouldAnimate
      if (params.clockRange) viewer.clock.clockRange = Cesium.ClockRange[params.clockRange]
      break
    case 'setTime':
      if (params.time) viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(params.time)
      break
    case 'setMultiplier':
      if (params.multiplier !== undefined) viewer.clock.multiplier = params.multiplier
      break
  }
}

export function setGlobeLighting(viewer: Cesium.Viewer, params: SetGlobeLightingParams): void {
  if (params.enableLighting !== undefined) {
    viewer.scene.globe.enableLighting = params.enableLighting
  }
  if (params.dynamicAtmosphereLighting !== undefined) {
    viewer.scene.globe.dynamicAtmosphereLighting = params.dynamicAtmosphereLighting
  }
  if (params.dynamicAtmosphereLightingFromSun !== undefined) {
    viewer.scene.globe.dynamicAtmosphereLightingFromSun = params.dynamicAtmosphereLightingFromSun
  }
}
