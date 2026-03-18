import * as Cesium from 'cesium'
import type { AddLabelParams, AddMarkerParams, AddPolylineParams, AddPolygonParams, AddModelParams, UpdateEntityParams, BatchEntityDef, QueryEntitiesParams, QueryEntityResult, GetEntityPropertiesParams, EntityPropertiesResult } from '../types'
import { parseColor, validateCoordinate } from '../utils'

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
    ? parseColor(style.fillColor)
    : Cesium.Color.WHITE
  const outlineColor = style?.outlineColor
    ? parseColor(style.outlineColor)
    : Cesium.Color.BLACK
  const outlineWidth = style?.outlineWidth ?? 2
  const showBackground = style?.showBackground ?? false
  const backgroundColor = style?.backgroundColor
    ? parseColor(style.backgroundColor)
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
  validateCoordinate(longitude, latitude)
  const cesiumColor = parseColor(color)

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

/**
 * 添加折线实体
 */
export function addPolyline(viewer: Cesium.Viewer, params: AddPolylineParams): Cesium.Entity {
  const { coordinates, color = '#3B82F6', width = 3, clampToGround = true, label } = params
  const cesiumColor = parseColor(color)

  const positions = coordinates.map(c => {
    validateCoordinate(c[0]!, c[1]!, c[2])
    return Cesium.Cartesian3.fromDegrees(c[0]!, c[1]!, c[2] ?? 0)
  })

  // 取中点作为标签位置
  const midIdx = Math.floor(positions.length / 2)

  return viewer.entities.add({
    position: label ? positions[midIdx] : undefined,
    polyline: {
      positions,
      width,
      material: cesiumColor,
      clampToGround,
    },
    label: label
      ? {
          text: label,
          font: '13px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
      : undefined,
  })
}

/**
 * 添加多边形实体
 */
export function addPolygon(viewer: Cesium.Viewer, params: AddPolygonParams): Cesium.Entity {
  const { coordinates, color = '#3B82F6', outlineColor = '#FFFFFF', opacity = 0.6, extrudedHeight, clampToGround = true, label } = params
  const fillColor = parseColor(color).withAlpha(opacity)
  const strokeColor = parseColor(outlineColor)

  const positions = coordinates.map(c => {
    validateCoordinate(c[0]!, c[1]!, c[2])
    return Cesium.Cartesian3.fromDegrees(c[0]!, c[1]!, c[2] ?? 0)
  })

  // 计算质心作为标签位置
  const centroid = centroidOfCoords(coordinates.map(c => [c[0]!, c[1]!]))

  return viewer.entities.add({
    position: (label && centroid) ? Cesium.Cartesian3.fromDegrees(centroid[0], centroid[1]) : undefined,
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      material: fillColor,
      outline: true,
      outlineColor: strokeColor,
      outlineWidth: 1,
      heightReference: clampToGround ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE,
      extrudedHeight,
    },
    label: label
      ? {
          text: label,
          font: '13px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
      : undefined,
  })
}

/**
 * 添加 3D 模型 (glTF/GLB)
 */
export function addModel(viewer: Cesium.Viewer, params: AddModelParams): Cesium.Entity {
  const { longitude, latitude, height = 0, url, scale = 1, heading = 0, pitch = 0, roll = 0, label } = params
  validateCoordinate(longitude, latitude, height)

  const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, height)
  const hpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(heading),
    Cesium.Math.toRadians(pitch),
    Cesium.Math.toRadians(roll),
  )
  const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr)

  return viewer.entities.add({
    position,
    orientation: orientation as any,
    model: {
      uri: url,
      scale,
    },
    label: label
      ? {
          text: label,
          font: '13px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -24),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
      : undefined,
  })
}

/**
 * 更新已有实体属性
 */
export function updateEntity(viewer: Cesium.Viewer, params: UpdateEntityParams): boolean {
  const entity = viewer.entities.getById(params.entityId)
  if (!entity) return false

  if (params.position) {
    const { longitude, latitude, height } = params.position
    validateCoordinate(longitude, latitude, height)
    entity.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(longitude, latitude, height ?? 0),
    )
  }

  if (params.label !== undefined && entity.label) {
    entity.label.text = new Cesium.ConstantProperty(params.label)
  }

  if (params.color !== undefined) {
    const c = parseColor(params.color)
    if (entity.point) entity.point.color = new Cesium.ConstantProperty(c)
    if (entity.polyline) entity.polyline.material = new Cesium.ColorMaterialProperty(c)
    if (entity.polygon) entity.polygon.material = new Cesium.ColorMaterialProperty(c)
  }

  if (params.scale !== undefined) {
    if (entity.model) entity.model.scale = new Cesium.ConstantProperty(params.scale)
    if (entity.label) entity.label.scale = new Cesium.ConstantProperty(params.scale)
  }

  if (params.show !== undefined) {
    entity.show = params.show
  }

  return true
}

/**
 * 移除单个实体
 */
export function removeEntity(viewer: Cesium.Viewer, entityId: string): boolean {
  const entity = viewer.entities.getById(entityId)
  if (!entity) return false
  return viewer.entities.remove(entity)
}

// ==================== Batch & Query ====================

/**
 * 批量添加实体 — 一次 WebSocket 调用创建多个实体
 */
export function batchAddEntities(
  viewer: Cesium.Viewer,
  entities: BatchEntityDef[],
  helpers: {
    addMarker: (p: any) => Cesium.Entity
    addPolyline: (p: any) => Cesium.Entity
    addPolygon: (p: any) => Cesium.Entity
    addModel: (p: any) => Cesium.Entity
    addBillboard: (p: any) => Cesium.Entity
    addBox: (p: any) => Cesium.Entity
    addCylinder: (p: any) => Cesium.Entity
    addEllipse: (p: any) => Cesium.Entity
    addRectangle: (p: any) => Cesium.Entity
    addWall: (p: any) => Cesium.Entity
    addCorridor: (p: any) => Cesium.Entity
  },
): { entityIds: string[]; errors: string[] } {
  const entityIds: string[] = []
  const errors: string[] = []

  for (let i = 0; i < entities.length; i++) {
    const def = entities[i]!
    const { type, ...params } = def
    try {
      const fn = helpers[type === 'marker' ? 'addMarker'
        : type === 'polyline' ? 'addPolyline'
        : type === 'polygon' ? 'addPolygon'
        : type === 'model' ? 'addModel'
        : type === 'billboard' ? 'addBillboard'
        : type === 'box' ? 'addBox'
        : type === 'cylinder' ? 'addCylinder'
        : type === 'ellipse' ? 'addEllipse'
        : type === 'rectangle' ? 'addRectangle'
        : type === 'wall' ? 'addWall'
        : type === 'corridor' ? 'addCorridor'
        : null as never]
      if (!fn) {
        errors.push(`[${i}] Unknown type: ${type}`)
        continue
      }
      const entity = fn(params)
      entityIds.push(entity.id)
    } catch (err) {
      errors.push(`[${i}] ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { entityIds, errors }
}

/**
 * 查询已有实体 — 按名称/类型/空间范围过滤
 */
export function queryEntities(viewer: Cesium.Viewer, params: QueryEntitiesParams): QueryEntityResult[] {
  const results: QueryEntityResult[] = []
  const entities = viewer.entities.values

  for (const entity of entities) {
    // 确定实体类型
    let type = 'unknown'
    if (entity.point) type = 'marker'
    else if (entity.billboard) type = 'billboard'
    else if (entity.polyline) type = 'polyline'
    else if (entity.polygon) type = 'polygon'
    else if (entity.model) type = 'model'
    else if (entity.box) type = 'box'
    else if (entity.cylinder) type = 'cylinder'
    else if (entity.ellipse) type = 'ellipse'
    else if (entity.rectangle) type = 'rectangle'
    else if (entity.wall) type = 'wall'
    else if (entity.corridor) type = 'corridor'
    else if (entity.label && !entity.point) type = 'label'

    // 按类型过滤
    if (params.type && type !== params.type) continue

    // 按名称模糊匹配
    const name = entity.name ?? entity.label?.text?.getValue(Cesium.JulianDate.now()) ?? undefined
    if (params.name && name && !String(name).toLowerCase().includes(params.name.toLowerCase())) continue
    if (params.name && !name) continue

    // 获取位置
    let position: QueryEntityResult['position']
    if (entity.position) {
      const pos = entity.position.getValue(Cesium.JulianDate.now())
      if (pos) {
        const carto = Cesium.Cartographic.fromCartesian(pos)
        position = {
          longitude: Cesium.Math.toDegrees(carto.longitude),
          latitude: Cesium.Math.toDegrees(carto.latitude),
          height: carto.height,
        }
      }
    }

    // 按空间范围过滤
    if (params.bbox && position) {
      const [west, south, east, north] = params.bbox
      if (position.longitude < west || position.longitude > east ||
          position.latitude < south || position.latitude > north) continue
    } else if (params.bbox && !position) {
      continue
    }

    results.push({
      entityId: entity.id,
      name: name ? String(name) : undefined,
      type,
      position,
    })
  }
  return results
}

// ==================== getEntityProperties ====================

function detectEntityType(entity: Cesium.Entity): string {
  if (entity.point) return 'marker'
  if (entity.billboard) return 'billboard'
  if (entity.polyline) return 'polyline'
  if (entity.polygon) return 'polygon'
  if (entity.model) return 'model'
  if (entity.box) return 'box'
  if (entity.cylinder) return 'cylinder'
  if (entity.ellipse) return 'ellipse'
  if (entity.rectangle) return 'rectangle'
  if (entity.wall) return 'wall'
  if (entity.corridor) return 'corridor'
  if (entity.label && !entity.point) return 'label'
  return 'unknown'
}

function extractGraphicProperties(entity: Cesium.Entity, type: string): Record<string, unknown> {
  const now = Cesium.JulianDate.now()
  const props: Record<string, unknown> = {}

  const tryGetValue = (prop: any) => {
    if (prop == null) return undefined
    if (typeof prop.getValue === 'function') return prop.getValue(now)
    return prop
  }

  const extractColor = (colorProp: any): string | undefined => {
    const c = tryGetValue(colorProp)
    if (c && typeof c.toCssColorString === 'function') return c.toCssColorString()
    return undefined
  }

  switch (type) {
    case 'marker': {
      const pt = entity.point!
      props.pixelSize = tryGetValue(pt.pixelSize)
      props.color = extractColor(pt.color)
      props.outlineColor = extractColor(pt.outlineColor)
      props.outlineWidth = tryGetValue(pt.outlineWidth)
      break
    }
    case 'polyline': {
      const pl = entity.polyline!
      props.width = tryGetValue(pl.width)
      props.clampToGround = tryGetValue(pl.clampToGround)
      break
    }
    case 'polygon': {
      const pg = entity.polygon!
      props.extrudedHeight = tryGetValue(pg.extrudedHeight)
      props.fill = tryGetValue(pg.fill)
      props.outline = tryGetValue(pg.outline)
      break
    }
    case 'model': {
      const m = entity.model!
      props.scale = tryGetValue(m.scale)
      props.minimumPixelSize = tryGetValue(m.minimumPixelSize)
      break
    }
    case 'billboard': {
      const bb = entity.billboard!
      props.width = tryGetValue(bb.width)
      props.height = tryGetValue(bb.height)
      props.scale = tryGetValue(bb.scale)
      props.rotation = tryGetValue(bb.rotation)
      break
    }
    case 'label': {
      const lb = entity.label!
      props.text = tryGetValue(lb.text)
      props.font = tryGetValue(lb.font)
      props.fillColor = extractColor(lb.fillColor)
      props.scale = tryGetValue(lb.scale)
      break
    }
    case 'box': {
      const bx = entity.box!
      const dims = tryGetValue(bx.dimensions)
      if (dims && 'x' in dims && 'y' in dims && 'z' in dims) {
        props.dimensions = { x: dims.x, y: dims.y, z: dims.z }
      }
      break
    }
    case 'cylinder': {
      const cy = entity.cylinder!
      props.length = tryGetValue(cy.length)
      props.topRadius = tryGetValue(cy.topRadius)
      props.bottomRadius = tryGetValue(cy.bottomRadius)
      break
    }
    case 'ellipse': {
      const el = entity.ellipse!
      props.semiMajorAxis = tryGetValue(el.semiMajorAxis)
      props.semiMinorAxis = tryGetValue(el.semiMinorAxis)
      break
    }
    case 'rectangle': {
      const rc = entity.rectangle!
      const rect = tryGetValue(rc.coordinates)
      if (rect && 'west' in rect && 'south' in rect && 'east' in rect && 'north' in rect) {
        props.coordinates = {
          west: Cesium.Math.toDegrees(rect.west),
          south: Cesium.Math.toDegrees(rect.south),
          east: Cesium.Math.toDegrees(rect.east),
          north: Cesium.Math.toDegrees(rect.north),
        }
      }
      break
    }
  }

  // 移除 undefined 值
  for (const key of Object.keys(props)) {
    if (props[key] === undefined) delete props[key]
  }
  return props
}

export function getEntityProperties(viewer: Cesium.Viewer, params: GetEntityPropertiesParams): EntityPropertiesResult {
  const entity = viewer.entities.getById(params.entityId)
  if (!entity) throw new Error(`Entity not found: ${params.entityId}`)

  const type = detectEntityType(entity)

  // 提取位置
  let position: EntityPropertiesResult['position']
  if (entity.position) {
    const pos = entity.position.getValue(Cesium.JulianDate.now())
    if (pos) {
      const carto = Cesium.Cartographic.fromCartesian(pos)
      position = {
        longitude: Cesium.Math.toDegrees(carto.longitude),
        latitude: Cesium.Math.toDegrees(carto.latitude),
        height: carto.height,
      }
    }
  }

  // 提取自定义属性
  const properties: Record<string, unknown> = {}
  if (entity.properties) {
    const names = entity.properties.propertyNames
    for (const name of names) {
      properties[name] = entity.properties[name]?.getValue(Cesium.JulianDate.now())
    }
  }

  // 提取图形属性
  const graphicProperties = extractGraphicProperties(entity, type)

  return {
    entityId: entity.id,
    name: entity.name ?? undefined,
    type,
    position,
    properties,
    graphicProperties,
  }
}

// ==================== Helpers ====================

/** 计算 GeoJSON Feature 的质心坐标 [lon, lat] */
export function computeFeatureCentroid(feature: any): [number, number] | null {
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

export function centroidOfCoords(coords: number[][]): [number, number] | null {
  if (!coords?.length) return null
  let sumLon = 0
  let sumLat = 0
  for (const c of coords) {
    sumLon += c[0]!
    sumLat += c[1]!
  }
  return [sumLon / coords.length, sumLat / coords.length]
}
