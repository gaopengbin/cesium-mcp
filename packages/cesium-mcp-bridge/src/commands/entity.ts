import * as Cesium from 'cesium'
import type { AddLabelParams, AddMarkerParams } from '../types'

/**
 * 为 GeoJSON 要素批量添加文本标注
 * 根据指定属性字段值，在每个要素的质心位置渲染 Cesium Label
 */
export function addLabels(
  viewer: Cesium.Viewer,
  data: Record<string, unknown>,
  params: AddLabelParams,
): Cesium.Entity[] {
  const { field, style } = params
  const features = (data as any)?.features ?? []
  const entities: Cesium.Entity[] = []

  const font = style?.font ?? '14px sans-serif'
  const fillColor = style?.fillColor
    ? Cesium.Color.fromCssColorString(style.fillColor)
    : Cesium.Color.WHITE
  const outlineColor = style?.outlineColor
    ? Cesium.Color.fromCssColorString(style.outlineColor)
    : Cesium.Color.BLACK
  const outlineWidth = style?.outlineWidth ?? 2
  const showBackground = style?.showBackground ?? false
  const backgroundColor = style?.backgroundColor
    ? Cesium.Color.fromCssColorString(style.backgroundColor)
    : new Cesium.Color(0.1, 0.1, 0.1, 0.7)
  const pixelOffset = style?.pixelOffset
    ? new Cesium.Cartesian2(style.pixelOffset[0], style.pixelOffset[1])
    : new Cesium.Cartesian2(0, -12)
  const scale = style?.scale ?? 1.0

  for (const feature of features) {
    const props = feature?.properties ?? {}
    const text = props[field]
    if (text == null || text === '') continue

    const center = computeFeatureCentroid(feature)
    if (!center) continue

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(center[0], center[1]),
      label: {
        text: String(text),
        font,
        fillColor,
        outlineColor,
        outlineWidth,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground,
        backgroundColor,
        pixelOffset,
        scale,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    entities.push(entity)
  }

  return entities
}

/**
 * 添加单个标注点
 */
export function addMarker(viewer: Cesium.Viewer, params: AddMarkerParams): Cesium.Entity {
  const { longitude, latitude, label, color = '#3B82F6', size = 12 } = params
  const cesiumColor = Cesium.Color.fromCssColorString(color)

  return viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
    point: {
      pixelSize: size,
      color: cesiumColor,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 1,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: label
      ? {
          text: label,
          font: '13px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
      : undefined,
  })
}

// ==================== Helpers ====================

/** 计算 GeoJSON Feature 的质心坐标 [lon, lat] */
function computeFeatureCentroid(feature: any): [number, number] | null {
  const geom = feature?.geometry
  if (!geom) return null
  const type: string = geom.type ?? ''
  const coords = geom.coordinates

  if (type === 'Point') {
    return [coords[0], coords[1]]
  }

  if (type === 'MultiPoint' || type === 'LineString') {
    return centroidOfCoords(coords)
  }

  if (type === 'MultiLineString' || type === 'Polygon') {
    // Polygon: 取外环质心
    const ring = type === 'Polygon' ? coords[0] : coords.flat()
    return centroidOfCoords(ring)
  }

  if (type === 'MultiPolygon') {
    // 取第一个多边形外环质心
    const ring = coords[0]?.[0]
    return ring ? centroidOfCoords(ring) : null
  }

  return null
}

function centroidOfCoords(coords: number[][]): [number, number] | null {
  if (!coords?.length) return null
  let sumLon = 0
  let sumLat = 0
  for (const c of coords) {
    sumLon += c[0]!
    sumLat += c[1]!
  }
  return [sumLon / coords.length, sumLat / coords.length]
}
