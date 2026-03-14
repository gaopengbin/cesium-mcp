import * as Cesium from 'cesium'
import type { PlayTrajectoryParams } from '../types'

/**
 * 轨迹动画：使用 SampledPositionProperty + Clock 沿路径播放移动实体 + 尾迹线
 * 返回用于停止动画的清理函数
 */
export function playTrajectory(
  viewer: Cesium.Viewer,
  params: PlayTrajectoryParams,
): { entityId: string; stop: () => void; pause: () => void; resume: () => void; isPlaying: () => boolean; movingEntity: Cesium.Entity; trailEntity: Cesium.Entity } {
  const {
    id,
    coordinates,
    durationSeconds = 30,
    trailSeconds = 5,
    label,
  } = params

  const entityId = id ?? `trajectory_${Date.now()}`
  const totalPoints = coordinates.length

  // 时间线：从当前时刻开始，持续 durationSeconds
  const startTime = Cesium.JulianDate.now()
  const stopTime = Cesium.JulianDate.addSeconds(startTime, durationSeconds, new Cesium.JulianDate())

  // 计算各段累积距离，用于按距离分配时间（匀速运动）
  const segDists: number[] = [0]
  for (let i = 1; i < totalPoints; i++) {
    const [lon0, lat0] = coordinates[i - 1]!
    const [lon1, lat1] = coordinates[i]!
    const dlat = (lat1! - lat0!) * Math.PI / 180
    const dlon = (lon1! - lon0!) * Math.PI / 180
    const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat0! * Math.PI / 180) * Math.cos(lat1! * Math.PI / 180) * Math.sin(dlon / 2) ** 2
    const dist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    segDists.push(segDists[i - 1]! + dist)
  }
  const totalDist = segDists[totalPoints - 1]!

  // 构建 SampledPositionProperty：按累积距离分配时间 + 线性插值（无多项式过冲）
  const positionProperty = new Cesium.SampledPositionProperty()
  positionProperty.setInterpolationOptions({
    interpolationDegree: 1,
    interpolationAlgorithm: Cesium.LinearApproximation,
  })

  for (let i = 0; i < totalPoints; i++) {
    const fraction = totalDist > 0 ? segDists[i]! / totalDist : i / (totalPoints - 1)
    const time = Cesium.JulianDate.addSeconds(startTime, fraction * durationSeconds, new Cesium.JulianDate())
    const coord = coordinates[i]!
    const lon = coord[0]!
    const lat = coord[1]!
    const alt = coord.length > 2 ? (coord[2] ?? 0) : 0
    positionProperty.addSample(time, Cesium.Cartesian3.fromDegrees(lon, lat, alt))
  }

  // 尾迹路径线 — 完整轨迹作为静态 polyline
  const pathPositions = coordinates.map(c =>
    Cesium.Cartesian3.fromDegrees(c[0]!, c[1]!, c.length > 2 ? (c[2] ?? 0) : 0),
  )

  const trailEntity = viewer.entities.add({
    id: `${entityId}_trail`,
    polyline: {
      positions: pathPositions,
      width: 2,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.2,
        color: Cesium.Color.CYAN.withAlpha(0.6),
      }),
      clampToGround: true,
    },
  })

  // 移动实体（带尾迹路径）
  const movingEntity = viewer.entities.add({
    id: entityId,
    position: positionProperty,
    orientation: new Cesium.VelocityOrientationProperty(positionProperty),
    point: {
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString('#F59E0B'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
    },
    path: {
      leadTime: 0,
      trailTime: trailSeconds,
      width: 4,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.3,
        color: Cesium.Color.fromCssColorString('#F59E0B'),
      }),
    },
    label: label
      ? {
          text: label,
          font: '14px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -24),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        }
      : undefined,
  })

  // 配置 Clock
  const clock = viewer.clock
  clock.startTime = startTime.clone()
  clock.stopTime = stopTime.clone()
  clock.currentTime = startTime.clone()
  clock.clockRange = Cesium.ClockRange.LOOP_STOP
  clock.multiplier = 1.0
  clock.shouldAnimate = true

  // Timeline 同步
  if (viewer.timeline) {
    viewer.timeline.zoomTo(startTime, stopTime)
  }

  // 固定俯视视角：计算路线包围盒并 flyTo，不跟踪实体（避免闪烁）
  const lons = coordinates.map(c => c[0]!)
  const lats = coordinates.map(c => c[1]!)
  const pad = 0.005
  const west = Math.min(...lons) - pad
  const south = Math.min(...lats) - pad
  const east = Math.max(...lons) + pad
  const north = Math.max(...lats) + pad
  viewer.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    duration: 1.5,
  })

  // 控制函数
  const stop = () => {
    clock.shouldAnimate = false
    viewer.trackedEntity = undefined
    viewer.entities.remove(movingEntity)
    viewer.entities.remove(trailEntity)
  }
  const pause = () => { clock.shouldAnimate = false }
  const resume = () => { clock.shouldAnimate = true }
  const isPlaying = () => clock.shouldAnimate

  return { entityId, stop, pause, resume, isPlaying, movingEntity, trailEntity }
}
