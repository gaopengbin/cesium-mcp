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
 * 搜索范围包含 viewer.entities 和所有 DataSource 中的实体
 */
export function queryEntities(viewer: Cesium.Viewer, params: QueryEntitiesParams): QueryEntityResult[] {
  const results: QueryEntityResult[] = []

  // viewer 顶层实体
  for (const entity of viewer.entities.values) {
    matchEntityForQuery(entity, params, results)
  }

  // DataSource 中的实体（GeoJSON / CZML / KML 等图层）
  const dsColl = viewer.dataSources
  if (dsColl) {
    for (let i = 0; i < dsColl.length; i++) {
      const ds = dsColl.get(i)
      for (const entity of ds.entities.values) {
        matchEntityForQuery(entity, params, results)
      }
    }
  }

  return results
}

/** 将单个实体与查询条件匹配，命中则追加到 results */
function matchEntityForQuery(
  entity: Cesium.Entity,
  params: QueryEntitiesParams,
  results: QueryEntityResult[],
): void {
  const type = detectEntityType(entity)

  if (params.type && type !== params.type) return

  const name = entity.name ?? entity.label?.text?.getValue(Cesium.JulianDate.now()) ?? undefined
  if (params.name && name && !String(name).toLowerCase().includes(params.name.toLowerCase())) return
  if (params.name && !name) return

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

  // 无 position（polygon/polyline/rectangle 等）→ 从几何顶点计算质心
  if (!position) {
    position = computeEntityCentroid(entity)
  }

  if (params.bbox && position) {
    const [west, south, east, north] = params.bbox
    // 对有几何覆盖范围的实体，检查 bbox 交集而非仅中心点
    const entityBbox = computeEntityBbox(entity)
    if (entityBbox) {
      // bbox 交集：实体范围与查询范围完全不重叠才排除
      if (entityBbox[2] < west || entityBbox[0] > east ||
          entityBbox[3] < south || entityBbox[1] > north) return
    } else {
      // 无 bbox → 用中心点判断
      if (position.longitude < west || position.longitude > east ||
          position.latitude < south || position.latitude > north) return
    }
  } else if (params.bbox && !position) {
    return
  }

  results.push({
    entityId: entity.id,
    name: name ? String(name) : undefined,
    type,
    position,
  })
}

/** 从实体几何顶点计算质心坐标 */
function computeEntityCentroid(entity: Cesium.Entity): QueryEntityResult['position'] | undefined {
  const now = Cesium.JulianDate.now()
  let positions: Cesium.Cartesian3[] | undefined

  if (entity.polygon?.hierarchy) {
    const h = entity.polygon.hierarchy.getValue(now)
    if (h?.positions) positions = h.positions
  } else if (entity.polyline?.positions) {
    positions = entity.polyline.positions.getValue(now) as Cesium.Cartesian3[] | undefined
  } else if (entity.corridor?.positions) {
    positions = entity.corridor.positions.getValue(now) as Cesium.Cartesian3[] | undefined
  } else if (entity.rectangle?.coordinates) {
    const rect = entity.rectangle.coordinates.getValue(now) as Cesium.Rectangle | undefined
    if (rect) {
      return {
        longitude: Cesium.Math.toDegrees((rect.west + rect.east) / 2),
        latitude: Cesium.Math.toDegrees((rect.south + rect.north) / 2),
        height: 0,
      }
    }
  } else if (entity.wall?.positions) {
    positions = entity.wall.positions.getValue(now) as Cesium.Cartesian3[] | undefined
  }

  if (!positions || positions.length === 0) return undefined
  let lonSum = 0, latSum = 0, hSum = 0
  for (const p of positions) {
    const c = Cesium.Cartographic.fromCartesian(p)
    lonSum += Cesium.Math.toDegrees(c.longitude)
    latSum += Cesium.Math.toDegrees(c.latitude)
    hSum += c.height
  }
  const n = positions.length
  return { longitude: lonSum / n, latitude: latSum / n, height: hSum / n }
}

/** 计算实体的地理范围 [west, south, east, north] */
function computeEntityBbox(entity: Cesium.Entity): [number, number, number, number] | undefined {
  const now = Cesium.JulianDate.now()
  let positions: Cesium.Cartesian3[] | undefined

  if (entity.polygon?.hierarchy) {
    const h = entity.polygon.hierarchy.getValue(now)
    if (h?.positions) positions = h.positions
  } else if (entity.polyline?.positions) {
    positions = entity.polyline.positions.getValue(now) as Cesium.Cartesian3[] | undefined
  } else if (entity.corridor?.positions) {
    positions = entity.corridor.positions.getValue(now) as Cesium.Cartesian3[] | undefined
  } else if (entity.rectangle?.coordinates) {
    const rect = entity.rectangle.coordinates.getValue(now) as Cesium.Rectangle | undefined
    if (rect) {
      return [
        Cesium.Math.toDegrees(rect.west),
        Cesium.Math.toDegrees(rect.south),
        Cesium.Math.toDegrees(rect.east),
        Cesium.Math.toDegrees(rect.north),
      ]
    }
  } else if (entity.wall?.positions) {
    positions = entity.wall.positions.getValue(now) as Cesium.Cartesian3[] | undefined
  }

  if (!positions || positions.length === 0) return undefined
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
  for (const p of positions) {
    const c = Cesium.Cartographic.fromCartesian(p)
    const lon = Cesium.Math.toDegrees(c.longitude)
    const lat = Cesium.Math.toDegrees(c.latitude)
    if (lon < west) west = lon
    if (lon > east) east = lon
    if (lat < south) south = lat
    if (lat > north) north = lat
  }
  return [west, south, east, north]
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
    try {
      if (typeof prop.getValue === 'function') return prop.getValue(now)
    } catch { return undefined }
    return prop
  }

  const extractColor = (colorProp: any): string | undefined => {
    const c = tryGetValue(colorProp)
    if (c && typeof c.toCssColorString === 'function') return c.toCssColorString()
    return undefined
  }

  /** 从 MaterialProperty 中提取颜色 */
  const extractMaterialColor = (materialProp: any): string | undefined => {
    const mat = tryGetValue(materialProp)
    if (!mat) return undefined
    // ColorMaterialProperty → getValue 返回 { color: Color }
    if (mat.color && typeof mat.color.toCssColorString === 'function') return mat.color.toCssColorString()
    // 直接是 Color 对象
    if (typeof mat.toCssColorString === 'function') return mat.toCssColorString()
    // MaterialProperty 可能有 .color 属性
    if (materialProp?.color) return extractColor(materialProp.color)
    return undefined
  }

  /** 从 Cartesian3 数组提取 [lon, lat, height] 坐标列表 */
  const extractPositions = (posProp: any): Array<[number, number, number]> | undefined => {
    const positions = tryGetValue(posProp)
    if (!Array.isArray(positions) || positions.length === 0) return undefined
    try {
      return positions.map((p: Cesium.Cartesian3) => {
        const c = Cesium.Cartographic.fromCartesian(p)
        return [
          Cesium.Math.toDegrees(c.longitude),
          Cesium.Math.toDegrees(c.latitude),
          c.height,
        ] as [number, number, number]
      })
    } catch { return undefined }
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
      props.color = extractMaterialColor(pl.material)
      props.positions = extractPositions(pl.positions)
      break
    }
    case 'polygon': {
      const pg = entity.polygon!
      props.extrudedHeight = tryGetValue(pg.extrudedHeight)
      props.fill = tryGetValue(pg.fill)
      props.outline = tryGetValue(pg.outline)
      props.color = extractMaterialColor(pg.material)
      const hierarchy = tryGetValue(pg.hierarchy)
      if (hierarchy?.positions) {
        props.positions = extractPositions({ getValue: () => hierarchy.positions })
      }
      break
    }
    case 'model': {
      const m = entity.model!
      props.scale = tryGetValue(m.scale)
      props.minimumPixelSize = tryGetValue(m.minimumPixelSize)
      props.uri = tryGetValue((m as any).uri)
      props.silhouetteColor = extractColor((m as any).silhouetteColor)
      break
    }
    case 'billboard': {
      const bb = entity.billboard!
      props.width = tryGetValue(bb.width)
      props.height = tryGetValue(bb.height)
      props.scale = tryGetValue(bb.scale)
      props.rotation = tryGetValue(bb.rotation)
      props.color = extractColor(bb.color)
      break
    }
    case 'label': {
      const lb = entity.label!
      props.text = tryGetValue(lb.text)
      props.font = tryGetValue(lb.font)
      props.fillColor = extractColor(lb.fillColor)
      props.outlineColor = extractColor(lb.outlineColor)
      props.scale = tryGetValue(lb.scale)
      break
    }
    case 'box': {
      const bx = entity.box!
      const dims = tryGetValue(bx.dimensions)
      if (dims && 'x' in dims && 'y' in dims && 'z' in dims) {
        props.dimensions = { x: dims.x, y: dims.y, z: dims.z }
      }
      props.color = extractMaterialColor(bx.material)
      break
    }
    case 'cylinder': {
      const cy = entity.cylinder!
      props.length = tryGetValue(cy.length)
      props.topRadius = tryGetValue(cy.topRadius)
      props.bottomRadius = tryGetValue(cy.bottomRadius)
      props.color = extractMaterialColor(cy.material)
      break
    }
    case 'ellipse': {
      const el = entity.ellipse!
      props.semiMajorAxis = tryGetValue(el.semiMajorAxis)
      props.semiMinorAxis = tryGetValue(el.semiMinorAxis)
      props.color = extractMaterialColor(el.material)
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
      props.color = extractMaterialColor(rc.material)
      break
    }
    case 'wall': {
      const w = entity.wall!
      props.color = extractMaterialColor(w.material)
      props.positions = extractPositions(w.positions)
      break
    }
    case 'corridor': {
      const co = entity.corridor!
      props.width = tryGetValue(co.width)
      props.color = extractMaterialColor(co.material)
      props.positions = extractPositions(co.positions)
      break
    }
  }

  // 移除 undefined 值
  for (const key of Object.keys(props)) {
    if (props[key] === undefined) delete props[key]
  }
  return props
}

/** 在 viewer.entities 及所有 DataSource 中查找实体 */
function findEntityById(viewer: Cesium.Viewer, entityId: string): Cesium.Entity | undefined {
  const entity = viewer.entities.getById(entityId)
  if (entity) return entity
  const dsColl = viewer.dataSources
  if (dsColl) {
    for (let i = 0; i < dsColl.length; i++) {
      const found = dsColl.get(i).entities.getById(entityId)
      if (found) return found
    }
  }
  return undefined
}

export function getEntityProperties(viewer: Cesium.Viewer, params: GetEntityPropertiesParams): EntityPropertiesResult {
  const entity = findEntityById(viewer, params.entityId)
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
  // 无 position 时从几何顶点推算质心
  if (!position) {
    position = computeEntityCentroid(entity)
  }

  // 提取自定义属性（含嵌套对象容错）
  const properties: Record<string, unknown> = {}
  if (entity.properties) {
    const names = entity.properties.propertyNames
    for (const name of names) {
      try {
        const val = entity.properties[name]?.getValue(Cesium.JulianDate.now())
        properties[name] = val
      } catch {
        // SampledProperty 等时间动态属性可能在无可用样本时抛出
        properties[name] = undefined
      }
    }
  }

  // 提取 description
  let description: string | undefined
  if (entity.description) {
    try {
      const desc = entity.description.getValue(Cesium.JulianDate.now())
      if (typeof desc === 'string') description = desc
    } catch { /* ignore */ }
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
    description,
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
