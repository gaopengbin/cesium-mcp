import * as Cesium from 'cesium'
import type { ScreenshotResult, HighlightParams, MeasureParams, MeasureResult } from '../types'
import { parseColor } from '../utils'
import type { LayerManager } from './layer'

/**
 * 地图截图，返回 base64 DataURL
 */
export function screenshot(viewer: Cesium.Viewer): Promise<ScreenshotResult> {
  return new Promise((resolve) => {
    // 等待下一帧渲染完成
    viewer.scene.requestRender()
    const removeListener = viewer.scene.postRender.addEventListener(() => {
      removeListener()
      const canvas = viewer.scene.canvas
      const dataUrl = canvas.toDataURL('image/png')
      resolve({
        dataUrl,
        width: canvas.width,
        height: canvas.height,
      })
    })
  })
}

/**
 * 高亮指定图层的要素（支持备份/恢复原始样式）
 */

// 模块级备份存储：entityId -> 原始样式
const _highlightBackups = new Map<string, Record<string, any>>()

export function highlight(
  viewer: Cesium.Viewer,
  layerManager: LayerManager,
  params: HighlightParams,
): void {
  const { layerId, featureIndex, color = '#FFFF00', clear } = params

  // 清除模式
  if (clear) {
    if (layerId) {
      const refs = layerManager.getCesiumRefs(layerId)
      if (refs?.dataSource) {
        for (const entity of refs.dataSource.entities.values) {
          restoreEntityStyle(entity)
        }
      }
    } else {
      // 无 layerId → 清除所有已备份的高亮
      // 遍历所有 DataSource 恢复
      const dsColl = viewer.dataSources
      if (dsColl) {
        for (let i = 0; i < dsColl.length; i++) {
          for (const entity of dsColl.get(i).entities.values) {
            restoreEntityStyle(entity)
          }
        }
      }
      // 也恢复 viewer 顶层实体
      for (const entity of viewer.entities.values) {
        restoreEntityStyle(entity)
      }
    }
    return
  }

  if (!layerId) return
  const refs = layerManager.getCesiumRefs(layerId)
  if (!refs?.dataSource) return

  const entities = refs.dataSource.entities.values
  const highlightColor = parseColor(color).withAlpha(0.8)

  if (featureIndex != null && featureIndex < entities.length) {
    const entity = entities[featureIndex]!
    backupAndHighlight(entity, highlightColor)
  } else {
    for (const entity of entities) {
      backupAndHighlight(entity, highlightColor)
    }
  }
}

function backupAndHighlight(entity: Cesium.Entity, color: Cesium.Color): void {
  // 仅首次备份，避免覆盖原始值
  if (!_highlightBackups.has(entity.id)) {
    const b: Record<string, any> = {}
    if (entity.polygon) b.polygonMaterial = entity.polygon.material
    if (entity.polyline) { b.polylineMaterial = entity.polyline.material; b.polylineWidth = entity.polyline.width }
    if (entity.point) { b.pointColor = entity.point.color; b.pointPixelSize = entity.point.pixelSize }
    if (entity.billboard) b.billboardColor = entity.billboard.color
    if (entity.model) { b.modelSilhouetteColor = (entity.model as any).silhouetteColor; b.modelSilhouetteSize = (entity.model as any).silhouetteSize }
    if (entity.label) b.labelFillColor = entity.label.fillColor
    if (entity.box) b.boxMaterial = entity.box.material
    if (entity.cylinder) b.cylinderMaterial = entity.cylinder.material
    if (entity.ellipse) b.ellipseMaterial = entity.ellipse.material
    if (entity.rectangle) b.rectangleMaterial = entity.rectangle.material
    if (entity.wall) b.wallMaterial = entity.wall.material
    if (entity.corridor) b.corridorMaterial = entity.corridor.material
    _highlightBackups.set(entity.id, b)
  }
  applyHighlight(entity, color)
}

function restoreEntityStyle(entity: Cesium.Entity): void {
  const b = _highlightBackups.get(entity.id)
  if (!b) return
  if (entity.polygon) entity.polygon.material = b.polygonMaterial
  if (entity.polyline) { entity.polyline.material = b.polylineMaterial; entity.polyline.width = b.polylineWidth }
  if (entity.point) { entity.point.color = b.pointColor; entity.point.pixelSize = b.pointPixelSize }
  if (entity.billboard) entity.billboard.color = b.billboardColor
  if (entity.model) { (entity.model as any).silhouetteColor = b.modelSilhouetteColor; (entity.model as any).silhouetteSize = b.modelSilhouetteSize }
  if (entity.label) entity.label.fillColor = b.labelFillColor
  if (entity.box) entity.box.material = b.boxMaterial
  if (entity.cylinder) entity.cylinder.material = b.cylinderMaterial
  if (entity.ellipse) entity.ellipse.material = b.ellipseMaterial
  if (entity.rectangle) entity.rectangle.material = b.rectangleMaterial
  if (entity.wall) entity.wall.material = b.wallMaterial
  if (entity.corridor) entity.corridor.material = b.corridorMaterial
  _highlightBackups.delete(entity.id)
}

function applyHighlight(entity: Cesium.Entity, color: Cesium.Color): void {
  const mat = new Cesium.ColorMaterialProperty(color)
  const colorProp = new Cesium.ConstantProperty(color)
  if (entity.polygon) {
    entity.polygon.material = mat
  } else if (entity.polyline) {
    entity.polyline.material = mat
    entity.polyline.width = new Cesium.ConstantProperty(3)
  } else if (entity.point) {
    entity.point.color = colorProp
    entity.point.pixelSize = new Cesium.ConstantProperty(16)
  } else if (entity.billboard) {
    entity.billboard.color = colorProp
  } else if (entity.model) {
    ;(entity.model as any).silhouetteColor = colorProp
    ;(entity.model as any).silhouetteSize = new Cesium.ConstantProperty(2)
  } else if (entity.label) {
    entity.label.fillColor = colorProp
  } else if (entity.box) {
    entity.box.material = mat
  } else if (entity.cylinder) {
    entity.cylinder.material = mat
  } else if (entity.ellipse) {
    entity.ellipse.material = mat
  } else if (entity.rectangle) {
    entity.rectangle.material = mat
  } else if (entity.wall) {
    entity.wall.material = mat
  } else if (entity.corridor) {
    entity.corridor.material = mat
  }
}

/**
 * 测量距离或面积
 */
export function measure(
  viewer: Cesium.Viewer,
  params: MeasureParams,
): MeasureResult {
  const { mode, positions, showOnMap = true, id } = params

  if (positions.length < 2)
    throw new Error('At least 2 positions required')
  if (mode === 'area' && positions.length < 3)
    throw new Error('At least 3 positions required for area measurement')

  const cartoPositions = positions.map(
    ([lon, lat, alt]) => Cesium.Cartographic.fromDegrees(lon, lat, alt ?? 0),
  )

  if (mode === 'distance') {
    const segments: number[] = []
    const geodesic = new Cesium.EllipsoidGeodesic()
    for (let i = 0; i < cartoPositions.length - 1; i++) {
      geodesic.setEndPoints(cartoPositions[i]!, cartoPositions[i + 1]!)
      segments.push(geodesic.surfaceDistance)
    }
    const totalMeters = segments.reduce((a, b) => a + b, 0)

    if (showOnMap) {
      const cartesians = positions.map(
        ([lon, lat, alt]) => Cesium.Cartesian3.fromDegrees(lon, lat, alt ?? 0),
      )
      const measureId = id ?? `measure_${Date.now()}`
      viewer.entities.removeById(measureId)
      viewer.entities.removeById(`${measureId}_label`)
      viewer.entities.add({
        id: measureId,
        polyline: {
          positions: cartesians,
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.YELLOW,
            dashLength: 16,
          }),
          clampToGround: true,
        },
      })
      // 在中点添加标注
      const midIdx = Math.floor(positions.length / 2)
      const mid = positions[midIdx]!
      viewer.entities.add({
        id: `${measureId}_label`,
        position: Cesium.Cartesian3.fromDegrees(mid[0], mid[1], (mid[2] ?? 0) + 50),
        label: {
          text: totalMeters >= 1000
            ? `${(totalMeters / 1000).toFixed(2)} km`
            : `${totalMeters.toFixed(1)} m`,
          font: '14px sans-serif',
          fillColor: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -20),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
    }

    return {
      mode: 'distance',
      value: totalMeters >= 1000 ? +(totalMeters / 1000).toFixed(3) : +totalMeters.toFixed(1),
      unit: totalMeters >= 1000 ? 'km' : 'm',
      segments: segments.map(s => +s.toFixed(1)),
      id,
    }
  }

  // area mode
  const cartesians = positions.map(
    ([lon, lat, alt]) => Cesium.Cartesian3.fromDegrees(lon, lat, alt ?? 0),
  )
  const areaSqM = computeSphericalArea(cartoPositions)

  if (showOnMap) {
    const measureId = id ?? `measure_${Date.now()}`
    viewer.entities.removeById(measureId)
    viewer.entities.removeById(`${measureId}_label`)
    viewer.entities.add({
      id: measureId,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(cartesians),
        material: Cesium.Color.YELLOW.withAlpha(0.3),
        outline: true,
        outlineColor: Cesium.Color.YELLOW,
        outlineWidth: 2,
      },
    })
    // 标注在质心
    const center = Cesium.BoundingSphere.fromPoints(cartesians).center
    const centerCarto = Cesium.Cartographic.fromCartesian(center)
    viewer.entities.add({
      id: `${measureId}_label`,
      position: Cesium.Cartesian3.fromRadians(
        centerCarto.longitude, centerCarto.latitude, centerCarto.height + 50,
      ),
      label: {
        text: areaSqM >= 1e6
          ? `${(areaSqM / 1e6).toFixed(3)} km²`
          : `${areaSqM.toFixed(1)} m²`,
        font: '14px sans-serif',
        fillColor: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  }

  return {
    mode: 'area',
    value: areaSqM >= 1e6 ? +(areaSqM / 1e6).toFixed(3) : +areaSqM.toFixed(1),
    unit: areaSqM >= 1e6 ? 'km²' : 'm²',
    id,
  }
}

/** Compute spherical polygon area using spherical excess (Girard's theorem) */
function computeSphericalArea(cartoPositions: Cesium.Cartographic[]): number {
  const R = 6371008.8 // mean earth radius in meters
  const n = cartoPositions.length
  if (n < 3) return 0

  // Use the shoelface formula on the sphere
  let sum = 0
  for (let i = 0; i < n; i++) {
    const a = cartoPositions[i]!
    const b = cartoPositions[(i + 1) % n]!
    sum += (b.longitude - a.longitude) * (2 + Math.sin(a.latitude) + Math.sin(b.latitude))
  }
  return Math.abs(sum * R * R / 2)
}
