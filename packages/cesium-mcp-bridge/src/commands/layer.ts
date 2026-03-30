import * as Cesium from 'cesium'
import h337 from 'heatmap.js'
import type {
  AddGeoJsonLayerParams, AddHeatmapParams, LayerInfo, SetBasemapParams,
  CategoryStyle, Load3dTilesParams, LoadTerrainParams, LoadImageryServiceParams,
  LoadCzmlParams, LoadKmlParams, UpdateLayerStyleParams,
  GetLayerSchemaParams, LayerSchemaResult, LayerSchemaField,
} from '../types'
import { parseColor } from '../utils'

// ==================== 图层状态（由 Bridge 实例持有） ====================

interface CesiumRefs {
  dataSource?: Cesium.GeoJsonDataSource | Cesium.CzmlDataSource | Cesium.KmlDataSource
  entity?: Cesium.Entity
  labelEntities?: Cesium.Entity[]
  tileset?: Cesium.Cesium3DTileset
  imageryLayer?: Cesium.ImageryLayer
  movingEntity?: Cesium.Entity
  trailEntity?: Cesium.Entity
  trajectoryId?: string
}

export class LayerManager {
  private _layers: LayerInfo[] = []
  private _cesiumRefs = new Map<string, CesiumRefs>()
  private _viewer: Cesium.Viewer

  constructor(viewer: Cesium.Viewer) {
    this._viewer = viewer
  }

  get layers(): LayerInfo[] {
    return this._layers
  }

  getCesiumRefs(layerId: string): CesiumRefs | undefined {
    return this._cesiumRefs.get(layerId)
  }

  setCesiumRefs(layerId: string, refs: Partial<CesiumRefs>): void {
    this._cesiumRefs.set(layerId, refs as CesiumRefs)
  }

  // ==================== addGeoJsonLayer ====================

  async addGeoJsonLayer(params: AddGeoJsonLayerParams): Promise<LayerInfo> {
    const { id, name, data, url, style, dataRefId } = params

    if (!data && !url) throw new Error('Either "data" or "url" must be provided')

    const layerId = id ?? `layer_${Date.now()}`
    const layerName = name ?? layerId
    const color = style?.color ?? '#3B82F6'
    const opacity = style?.opacity ?? 0.6
    const pointSize = style?.pointSize ?? 10

    this.removeLayer(layerId)

    const cesiumColor = parseColor(color).withAlpha(opacity)

    const ds = await Cesium.GeoJsonDataSource.load(url ?? data, {
      stroke: cesiumColor,
      fill: cesiumColor.withAlpha(opacity * 0.4),
      strokeWidth: 3,
      markerSize: 1,
      markerColor: cesiumColor,
      clampToGround: true,
    })
    ds.name = layerName

    // 将默认 pin 图标替换为 canvas 圆点图片（保留 billboard 以兼容 EntityCluster）
    const circleImage = createCircleImage(pointSize * 2, color, opacity)
    const entities = ds.entities.values
    let hasPoints = false
    const labelField = params.labelField
    const ls = params.labelStyle
    const labelFont = ls?.font ?? '12px sans-serif'
    const labelFillColor = ls?.fillColor
      ? parseColor(ls.fillColor)
      : Cesium.Color.WHITE
    const labelOutlineColor = ls?.outlineColor
      ? parseColor(ls.outlineColor)
      : Cesium.Color.BLACK
    const labelOutlineWidth = ls?.outlineWidth ?? 2
    const labelOffset = ls?.pixelOffset
      ? new Cesium.Cartesian2(ls.pixelOffset[0], ls.pixelOffset[1])
      : new Cesium.Cartesian2(0, -pointSize - 4)

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!
      if (e.billboard) {
        hasPoints = true
        e.billboard.image = new Cesium.ConstantProperty(circleImage) as any
        e.billboard.width = new Cesium.ConstantProperty(pointSize * 2) as any
        e.billboard.height = new Cesium.ConstantProperty(pointSize * 2) as any
        e.billboard.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.CLAMP_TO_GROUND) as any
        e.billboard.disableDepthTestDistance = new Cesium.ConstantProperty(Number.POSITIVE_INFINITY) as any
      }

      // 同时附加文字标注（圆点+文字同图层）
      if (labelField && e.properties && e.position) {
        const val = e.properties[labelField]?.getValue(Cesium.JulianDate.now())
        if (val != null && val !== '') {
          e.label = new Cesium.LabelGraphics({
            text: String(val),
            font: labelFont,
            fillColor: labelFillColor,
            outlineColor: labelOutlineColor,
            outlineWidth: labelOutlineWidth,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: labelOffset,
            scale: ls?.scale ?? 1.0,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          })
        }
      }
    }

    // 为贴地 polygon 添加 polyline 描边（clampToGround 下 polygon outline 不支持）
    const strokeWidth = style?.strokeWidth ?? 3
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!
      if (e.polygon) {
        const hierarchy = e.polygon.hierarchy?.getValue(Cesium.JulianDate.now())
        if (hierarchy?.positions) {
          const positions = [...hierarchy.positions, hierarchy.positions[0]]
          ds.entities.add({
            polyline: {
              positions,
              width: strokeWidth,
              material: cesiumColor,
              clampToGround: true,
            },
          })
          // 处理内环
          if (hierarchy.holes) {
            for (const hole of hierarchy.holes) {
              if (hole.positions) {
                ds.entities.add({
                  polyline: {
                    positions: [...hole.positions, hole.positions[0]],
                    width: strokeWidth,
                    material: cesiumColor,
                    clampToGround: true,
                  },
                })
              }
            }
          }
        }
      }
    }

    // choropleth 分级着色
    const choropleth = style?.choropleth
    if (choropleth?.field && choropleth?.breaks && choropleth?.colors) {
      applyChoroplethStyle(ds, choropleth.field, choropleth.breaks, choropleth.colors, opacity)
    }

    // category 分类着色（聚类等）
    const category = style?.category
    if (category?.field) {
      applyCategoryStyle(ds, category.field, category.colors, opacity)
    }

    // 随机色填充
    if (style?.randomColor) {
      applyRandomColorStyle(ds, opacity)
    }

    // 渐变色填充
    if (style?.gradient) {
      applyGradientStyle(ds, style.gradient, opacity)
    }

    this._viewer.dataSources.add(ds)

    const geomType = data ? detectGeometryType(data) : detectGeometryTypeFromDataSource(ds)
    const info: LayerInfo = {
      id: layerId,
      name: layerName,
      type: geomType,
      visible: true,
      color,
      dataRefId,
    }
    this._cesiumRefs.set(layerId, { dataSource: ds })
    this._layers.push(info)

    this._viewer.flyTo(ds, { duration: 1.5 })
    return info
  }

  // ==================== addHeatmap ====================

  async addHeatmap(params: AddHeatmapParams): Promise<LayerInfo> {
    const {
      id, name, data,
      radius = 30, gradient,
      blur = 0.85,
      maxOpacity = 0.8, minOpacity = 0,
      resolution = 512,
    } = params
    const layerId = id ?? `heatmap_${Date.now()}`
    const layerName = name ?? layerId

    // 从 GeoJSON 提取点坐标 + 权重
    const features = (data as any)?.features ?? []
    const points: Array<{ lon: number; lat: number; weight: number }> = []
    for (const f of features) {
      const geom = f?.geometry
      if (geom?.type === 'Point') {
        const [lon, lat] = geom.coordinates as [number, number]
        const w = f.properties?.weight ?? f.properties?.value ?? f.properties?.density ?? 1
        points.push({ lon, lat, weight: typeof w === 'number' ? w : 1 })
      }
    }

    if (!points.length) {
      return this.addGeoJsonLayer({ id: layerId, name: layerName, data, style: { color: '#FF4500', opacity: 0.8 } })
    }

    // 计算数据范围
    const lons = points.map(p => p.lon)
    const lats = points.map(p => p.lat)
    const lonRange = Math.max(...lons) - Math.min(...lons)
    const latRange = Math.max(...lats) - Math.min(...lats)
    const padLon = lonRange * 0.05 || 0.01
    const padLat = latRange * 0.05 || 0.01
    const west = Math.min(...lons) - padLon
    const south = Math.min(...lats) - padLat
    const east = Math.max(...lons) + padLon
    const north = Math.max(...lats) + padLat

    // 使用 heatmap.js 生成 canvas
    const canvas = generateHeatmapCanvas(points, radius, { west, south, east, north }, {
      gradient, blur, maxOpacity, minOpacity, resolution,
    })
    if (!canvas) {
      return this.addGeoJsonLayer({ id: layerId, name: layerName, data, style: { color: '#FF4500', opacity: 0.8 } })
    }

    const entity = this._viewer.entities.add({
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
        material: new Cesium.ImageMaterialProperty({
          image: new Cesium.ConstantProperty(canvas),
          transparent: true,
        }),
        classificationType: Cesium.ClassificationType.BOTH,
      },
    })

    const info: LayerInfo = {
      id: layerId,
      name: layerName,
      type: '热力图',
      visible: true,
      color: '#FF4500',
    }
    this._cesiumRefs.set(layerId, { entity })
    this._layers.push(info)

    this._viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
      duration: 1.5,
    })

    return info
  }

  // ==================== 基础图层操作 ====================

  removeLayer(id: string): void {
    const idx = this._layers.findIndex(l => l.id === id)
    if (idx === -1) return
    const refs = this._cesiumRefs.get(id)
    if (refs) {
      if (refs.dataSource) this._viewer.dataSources.remove(refs.dataSource, true)
      if (refs.entity) this._viewer.entities.remove(refs.entity)
      if (refs.labelEntities) {
        for (const e of refs.labelEntities) this._viewer.entities.remove(e)
      }
      if (refs.tileset) this._viewer.scene.primitives.remove(refs.tileset)
      if (refs.imageryLayer) this._viewer.imageryLayers.remove(refs.imageryLayer)
      if (refs.movingEntity) this._viewer.entities.remove(refs.movingEntity)
      if (refs.trailEntity) this._viewer.entities.remove(refs.trailEntity)
      this._cesiumRefs.delete(id)
    }
    this._layers.splice(idx, 1)
  }

  /** 根据 Cesium Entity 引用反查并移除对应图层记录（不再删除 entity 本身） */
  untrackByEntity(entity: Cesium.Entity): string | undefined {
    for (const [layerId, refs] of this._cesiumRefs) {
      if (refs.entity === entity) {
        const idx = this._layers.findIndex(l => l.id === layerId)
        if (idx !== -1) this._layers.splice(idx, 1)
        this._cesiumRefs.delete(layerId)
        return layerId
      }
    }
    return undefined
  }

  setLayerVisibility(id: string, visible: boolean): void {
    const layer = this._layers.find(l => l.id === id)
    if (!layer) return
    layer.visible = visible
    const refs = this._cesiumRefs.get(id)
    if (!refs) return
    if (refs.dataSource) refs.dataSource.show = visible
    if (refs.entity) refs.entity.show = visible
    if (refs.labelEntities) {
      for (const e of refs.labelEntities) e.show = visible
    }
    if (refs.tileset) refs.tileset.show = visible
    if (refs.imageryLayer) refs.imageryLayer.show = visible
    if (refs.movingEntity) refs.movingEntity.show = visible
    if (refs.trailEntity) refs.trailEntity.show = visible
  }

  toggleLayer(id: string): void {
    const layer = this._layers.find(l => l.id === id)
    if (layer) {
      this.setLayerVisibility(id, !layer.visible)
    }
  }

  zoomToLayer(id: string): void {
    const refs = this._cesiumRefs.get(id)
    if (!refs) return
    if (refs.dataSource) { this._viewer.flyTo(refs.dataSource); return }
    if (refs.labelEntities?.length) { this._viewer.flyTo(refs.labelEntities); return }
    if (refs.entity) { this._viewer.flyTo(refs.entity); return }
    if (refs.tileset) { this._viewer.flyTo(refs.tileset); return }
    if (refs.movingEntity) { this._viewer.flyTo(refs.movingEntity); return }
  }

  updateLayerStyle(params: UpdateLayerStyleParams): boolean {
    const layer = this._layers.find(l => l.id === params.layerId)
    if (!layer) return false

    const refs = this._cesiumRefs.get(params.layerId)

    // 标注图层样式更新
    const ls = params.labelStyle
    if (ls && refs?.labelEntities) {
      const entities: Cesium.Entity[] = refs.labelEntities
      for (const entity of entities) {
        if (!entity.label) continue
        if (ls.font || ls.fontSize) {
          const fontSize = ls.fontSize ?? 14
          entity.label.font = new Cesium.ConstantProperty(ls.font ?? `${fontSize}px sans-serif`)
        }
        if (ls.fillColor) {
          entity.label.fillColor = new Cesium.ConstantProperty(
            parseColor(ls.fillColor)
          )
        }
        if (ls.outlineColor) {
          entity.label.outlineColor = new Cesium.ConstantProperty(
            parseColor(ls.outlineColor)
          )
        }
        if (ls.outlineWidth !== undefined) {
          entity.label.outlineWidth = new Cesium.ConstantProperty(ls.outlineWidth)
        }
        if (ls.scale !== undefined) {
          entity.label.scale = new Cesium.ConstantProperty(ls.scale)
        }
        if (ls.showBackground !== undefined) {
          entity.label.showBackground = new Cesium.ConstantProperty(ls.showBackground)
        }
        if (ls.backgroundColor) {
          entity.label.backgroundColor = new Cesium.ConstantProperty(
            parseColor(ls.backgroundColor)
          )
        }
        if (ls.pixelOffset) {
          entity.label.pixelOffset = new Cesium.ConstantProperty(
            new Cesium.Cartesian2(ls.pixelOffset[0], ls.pixelOffset[1])
          )
        }
      }
      if (ls.fillColor) layer.color = ls.fillColor
      return true
    }

    // GeoJSON 图层样式更新
    const gs = params.layerStyle
    if (gs && refs?.dataSource) {
      const ds = refs.dataSource
      const entities = ds.entities.values
      const color = gs.color ? parseColor(gs.color) : null
      const opacity = gs.opacity ?? 0.6
      for (const entity of entities) {
        if (entity.polyline) {
          if (color) entity.polyline.material = new Cesium.ColorMaterialProperty(color.withAlpha(opacity))
          if (gs.strokeWidth !== undefined) entity.polyline.width = new Cesium.ConstantProperty(gs.strokeWidth)
        }
        if (entity.polygon) {
          if (color) {
            entity.polygon.material = new Cesium.ColorMaterialProperty(color.withAlpha(opacity * 0.4))
            entity.polygon.outlineColor = new Cesium.ConstantProperty(color)
          }
        }
        if (entity.billboard) {
          const newSize = gs.pointSize ?? undefined
          const newColor = color ?? undefined
          if (newColor || newSize) {
            const cssCol = gs.color ?? layer.color ?? '#3B82F6'
            const sz = newSize ?? 10
            entity.billboard.image = new Cesium.ConstantProperty(createCircleImage(sz * 2, cssCol, opacity)) as any
            entity.billboard.width = new Cesium.ConstantProperty(sz * 2) as any
            entity.billboard.height = new Cesium.ConstantProperty(sz * 2) as any
          }
        }
        if (entity.point) {
          if (color) entity.point.color = new Cesium.ConstantProperty(color.withAlpha(opacity))
          if (gs.pointSize !== undefined) entity.point.pixelSize = new Cesium.ConstantProperty(gs.pointSize)
        }
      }
      if (gs.color) layer.color = gs.color
      return true
    }

    // 3D Tiles 样式更新
    const ts = params.tileStyle
    if (ts && refs?.tileset) {
      const styleObj: Record<string, unknown> = {}
      if (ts.color) styleObj.color = ts.color
      if (ts.show) styleObj.show = ts.show
      if (ts.pointSize) styleObj.pointSize = ts.pointSize
      if (ts.meta) Object.assign(styleObj, { meta: ts.meta })
      refs.tileset.style = new Cesium.Cesium3DTileStyle(styleObj)
      if (ts.color) layer.color = ts.color
      return true
    }

    return false
  }

  listLayers(): LayerInfo[] {
    return this._layers.map(({ id, name, type, visible, color, dataRefId }) => ({ id, name, type, visible, color, dataRefId }))
  }

  getLayerSchema(params: GetLayerSchemaParams): LayerSchemaResult {
    const layer = this._layers.find(l => l.id === params.layerId)
    if (!layer) throw new Error(`Layer not found: ${params.layerId}`)

    const refs = this._cesiumRefs.get(params.layerId)

    // 3D Tiles: 从已加载瓦片的 feature batch table 中提取字段
    if (refs?.tileset) {
      return this._getTilesetSchema(params.layerId, layer.name, refs.tileset)
    }

    const ds = refs?.dataSource
    if (!ds) throw new Error(`Layer '${params.layerId}' has no DataSource or Tileset`)

    const entities = ds.entities.values
    // 从首个有属性的实体中采集字段
    const fieldMap = new Map<string, LayerSchemaField>()
    for (const e of entities) {
      if (!e.properties) continue
      for (const name of e.properties.propertyNames) {
        if (fieldMap.has(name)) continue
        const val = e.properties[name]?.getValue?.(Cesium.JulianDate.now())
        fieldMap.set(name, {
          name,
          type: val === null || val === undefined ? 'unknown' : Array.isArray(val) ? 'array' : typeof val,
          sample: val,
        })
      }
      // 一旦采集到字段就可以停止（所有实体字段结构一致）
      if (fieldMap.size > 0) break
    }

    return {
      layerId: params.layerId,
      layerName: layer.name,
      entityCount: entities.length,
      fields: Array.from(fieldMap.values()),
    }
  }

  private _getTilesetSchema(layerId: string, layerName: string, tileset: Cesium.Cesium3DTileset): LayerSchemaResult {
    const fieldMap = new Map<string, LayerSchemaField>()

    // 方式1：从 tileset.properties（tileset.json 中的 properties 声明）
    const props = (tileset as any).properties
    if (props && typeof props === 'object') {
      for (const key of Object.keys(props)) {
        const meta = props[key]
        fieldMap.set(key, {
          name: key,
          type: meta?.type ?? (meta?.minimum !== undefined ? 'number' : 'unknown'),
          sample: meta?.minimum ?? meta?.maximum ?? undefined,
        })
      }
    }

    // 方式2：从已加载的 root tile content 的 feature batch table
    const root = tileset.root
    if (root?.content && typeof root.content.featuresLength === 'number' && root.content.featuresLength > 0) {
      const feature = root.content.getFeature(0) as Cesium.Cesium3DTileFeature
      if (feature && typeof feature.getPropertyIds === 'function') {
        const ids = feature.getPropertyIds()
        for (const id of ids) {
          if (fieldMap.has(id)) continue
          const val = feature.getProperty(id)
          fieldMap.set(id, {
            name: id,
            type: val === null || val === undefined ? 'unknown' : Array.isArray(val) ? 'array' : typeof val,
            sample: val,
          })
        }
      }
    }

    // 提取 3D Tiles / Ion 元数据
    const metadata: LayerSchemaResult['metadata'] = {}
    const asset = (tileset as any).asset
    if (asset && typeof asset === 'object') {
      if (asset.version) metadata.assetVersion = String(asset.version)
      if (asset.tilesetVersion) metadata.tilesetVersion = String(asset.tilesetVersion)
    }
    // Cesium Ion 资产 ID（从 IonResource 中提取）
    const resource = (tileset as any).resource ?? (tileset as any)._resource
    if (resource?.ionAssetId) metadata.ionAssetId = resource.ionAssetId
    // 几何误差
    if (tileset.maximumScreenSpaceError != null) metadata.geometricError = tileset.maximumScreenSpaceError
    // 包围球
    if (tileset.boundingSphere) {
      try {
        const center = Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center)
        metadata.boundingSphere = {
          longitude: Cesium.Math.toDegrees(center.longitude),
          latitude: Cesium.Math.toDegrees(center.latitude),
          height: center.height,
          radius: tileset.boundingSphere.radius,
        }
      } catch { /* degenerate bounding sphere */ }
    }
    // extras（tileset.json 中的自定义字段）
    const extras = (tileset as any).extras
    if (extras && typeof extras === 'object' && Object.keys(extras).length > 0) {
      metadata.extras = extras
    }

    return {
      layerId,
      layerName,
      entityCount: -1, // 3D Tiles 不提供精确实体数
      fields: Array.from(fieldMap.values()),
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }
  }

  clearAll(): { removedLayers: number; removedEntities: number } {
    const removedLayers = this._layers.length
    // 逐个移除所有已注册图层
    const ids = this._layers.map(l => l.id)
    for (const id of ids) {
      this.removeLayer(id)
    }
    // 清除可能残留的非图层实体
    const removedEntities = this._viewer.entities.values.length
    this._viewer.entities.removeAll()
    this._viewer.dataSources.removeAll(true)
    return { removedLayers, removedEntities }
  }

  /** 更新图层列表引用（供外部响应式框架使用） */
  setLayersRef(layers: LayerInfo[]): void {
    this._layers = layers
  }

  // ==================== 3D Scene ====================

  async load3dTiles(params: Load3dTilesParams): Promise<LayerInfo> {
    const { id, name, url, maximumScreenSpaceError = 16, heightOffset = 0 } = params
    const layerId = id ?? `3dtiles_${Date.now()}`
    const layerName = name ?? '3D Tiles'

    this.removeLayer(layerId)

    const tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
      maximumScreenSpaceError,
    })

    if (heightOffset !== 0) {
      const cartographic = Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center)
      const surface = Cesium.Cartesian3.fromRadians(
        cartographic.longitude, cartographic.latitude, 0,
      )
      const offset = Cesium.Cartesian3.fromRadians(
        cartographic.longitude, cartographic.latitude, heightOffset,
      )
      const translation = Cesium.Cartesian3.subtract(offset, surface, new Cesium.Cartesian3())
      tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation)
    }

    this._viewer.scene.primitives.add(tileset)
    this._viewer.flyTo(tileset, { duration: 1.5 })

    const info: LayerInfo = {
      id: layerId,
      name: layerName,
      type: '3D Tiles',
      visible: true,
      color: '#8B5CF6',
    }
    this._cesiumRefs.set(layerId, { tileset })
    this._layers.push(info)
    return info
  }

  loadTerrain(params: LoadTerrainParams): void {
    const { provider, url, cesiumIonAssetId } = params
    const onError = (e: unknown) => console.error('[CesiumBridge] loadTerrain failed:', e)

    if (provider === 'flat') {
      this._viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider()
    } else if (provider === 'arcgis') {
      Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
        'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer',
      ).then((tp: Cesium.TerrainProvider) => {
        this._viewer.scene.terrainProvider = tp
      }).catch(onError)
    } else if (provider === 'cesiumion' && cesiumIonAssetId) {
      Cesium.CesiumTerrainProvider.fromIonAssetId(cesiumIonAssetId).then((tp: Cesium.TerrainProvider) => {
        this._viewer.scene.terrainProvider = tp
      }).catch(onError)
    } else if (url) {
      Cesium.CesiumTerrainProvider.fromUrl(url).then((tp: Cesium.TerrainProvider) => {
        this._viewer.scene.terrainProvider = tp
      }).catch(onError)
    }
  }

  loadImageryService(params: LoadImageryServiceParams): LayerInfo {
    const { id, name, url, serviceType, layerName, opacity = 1.0 } = params
    const layerId = id ?? `imagery_${Date.now()}`
    const layerName_ = name ?? `影像 (${serviceType})`

    let provider: Cesium.ImageryProvider
    switch (serviceType) {
      case 'wms':
        provider = new Cesium.WebMapServiceImageryProvider({
          url,
          layers: layerName ?? '',
        })
        break
      case 'wmts':
        provider = new Cesium.WebMapTileServiceImageryProvider({
          url,
          layer: layerName ?? '',
          style: 'default',
          tileMatrixSetID: 'default028mm',
        })
        break
      case 'arcgis_mapserver':
        provider = new Cesium.ArcGisMapServerImageryProvider({ url } as any)
        break
      case 'xyz':
      default:
        provider = new Cesium.UrlTemplateImageryProvider({
          url,
          maximumLevel: 18,
        })
        break
    }

    const imageryLayer = this._viewer.imageryLayers.addImageryProvider(provider)
    imageryLayer.alpha = opacity

    const info: LayerInfo = {
      id: layerId,
      name: layerName_,
      type: '影像',
      visible: true,
      color: '#06B6D4',
    }
    this._cesiumRefs.set(layerId, { imageryLayer })
    this._layers.push(info)
    return info
  }

  // ==================== CZML DataSource ====================

  async loadCzml(params: LoadCzmlParams): Promise<LayerInfo> {
    const { id, name, data, url, sourceUri, clampToGround } = params

    if (!data && !url) throw new Error('Either "data" or "url" must be provided')

    const layerId = id ?? `czml_${Date.now()}`

    // 幂等：先移除同 id 图层
    this.removeLayer(layerId)

    const loadOptions: { sourceUri?: string } = {}
    if (sourceUri) loadOptions.sourceUri = sourceUri

    const ds = await Cesium.CzmlDataSource.load(url ?? data!, loadOptions)

    const displayName = name || ds.name || (url ? `CZML (${url.split('/').pop()})` : 'CZML Data')

    if (clampToGround) {
      for (const entity of ds.entities.values) {
        if (entity.billboard) {
          entity.billboard.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.CLAMP_TO_GROUND)
        }
        if (entity.point) {
          entity.point.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.CLAMP_TO_GROUND)
        }
        if (entity.label) {
          entity.label.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.CLAMP_TO_GROUND)
        }
        if (entity.model) {
          entity.model.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.CLAMP_TO_GROUND)
        }
      }
    }

    this._viewer.dataSources.add(ds)

    if (params.flyTo !== false) {
      this._viewer.flyTo(ds, { duration: 1.5 })
    }

    const info: LayerInfo = {
      id: layerId,
      name: displayName,
      type: 'CZML',
      visible: true,
      color: '#8B5CF6',
    }
    this._cesiumRefs.set(layerId, { dataSource: ds })
    this._layers.push(info)
    return info
  }

  // ==================== KML/KMZ DataSource ====================

  async loadKml(params: LoadKmlParams): Promise<LayerInfo> {
    const { id, name, url, data, sourceUri, clampToGround } = params

    if (!url && !data) throw new Error('Either "url" or "data" must be provided')

    const layerId = id ?? `kml_${Date.now()}`

    // 幂等：先移除同 id 图层
    this.removeLayer(layerId)

    const loadOptions: Record<string, unknown> = {
      camera: this._viewer.scene.camera,
      canvas: this._viewer.scene.canvas,
    }
    if (sourceUri) loadOptions.sourceUri = sourceUri
    if (clampToGround) loadOptions.clampToGround = true

    const source = url ?? new Blob([data!], { type: 'application/xml' })
    const ds = await Cesium.KmlDataSource.load(source, loadOptions)

    const displayName = name || ds.name || (url ? `KML (${url.split('/').pop()})` : 'KML Data')

    this._viewer.dataSources.add(ds)

    if (params.flyTo !== false) {
      this._viewer.flyTo(ds, { duration: 1.5 })
    }

    const info: LayerInfo = {
      id: layerId,
      name: displayName,
      type: 'KML',
      visible: true,
      color: '#F59E0B',
    }
    this._cesiumRefs.set(layerId, { dataSource: ds })
    this._layers.push(info)
    return info
  }

  // ==================== Basemap ====================

  setBasemap(params: SetBasemapParams): string {
    const basemap = params.basemap ?? 'dark'
    this._viewer.imageryLayers.removeAll()

    switch (basemap) {
      case 'satellite':
        this._viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            maximumLevel: 18,
          }),
        )
        break
      case 'standard':
        this._viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            maximumLevel: 19,
          }),
        )
        break
      case 'dark':
      default:
        this._viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            maximumLevel: 18,
          }),
        )
        this._viewer.scene.backgroundColor = parseColor('#0B1120')
        this._viewer.scene.globe.baseColor = parseColor('#0B1120')
        break
    }
    return basemap
  }
}

// ==================== Helpers ====================

function applyChoroplethStyle(
  ds: Cesium.GeoJsonDataSource,
  field: string,
  breaks: number[],
  colors: string[],
  opacity: number,
) {
  const entities = ds.entities.values
  for (const entity of entities) {
    const props = entity.properties
    if (!props) continue
    const raw = props[field]?.getValue(Cesium.JulianDate.now())
    const val = typeof raw === 'number' ? raw : parseFloat(raw)
    if (isNaN(val)) continue

    let classIdx = colors.length - 1
    for (let i = 1; i < breaks.length; i++) {
      if (val <= breaks[i]!) {
        classIdx = Math.min(i - 1, colors.length - 1)
        break
      }
    }
    const fillColor = parseColor(colors[classIdx] ?? '#3B82F6').withAlpha(opacity)
    const strokeColor = parseColor('#333333').withAlpha(0.6)

    if (entity.polygon) {
      entity.polygon.material = new Cesium.ColorMaterialProperty(fillColor)
      entity.polygon.outlineColor = new Cesium.ConstantProperty(strokeColor)
      entity.polygon.outlineWidth = new Cesium.ConstantProperty(1)
    } else if (entity.polyline) {
      entity.polyline.material = new Cesium.ColorMaterialProperty(fillColor)
    } else if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(fillColor)
    } else if (entity.billboard) {
      entity.billboard.color = new Cesium.ConstantProperty(fillColor)
    }
  }
}

// 聚类/分类着色的默认调色板（12色，对色觉友好）
const CATEGORY_PALETTE = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
  '#E11D48', '#84CC16',
]

function applyCategoryStyle(
  ds: Cesium.GeoJsonDataSource,
  field: string,
  customColors: string[] | undefined,
  opacity: number,
) {
  const palette = customColors?.length ? customColors : CATEGORY_PALETTE
  const entities = ds.entities.values
  for (const entity of entities) {
    const props = entity.properties
    if (!props) continue
    const raw = props[field]?.getValue(Cesium.JulianDate.now())
    const val = raw !== undefined && raw !== null ? Number(raw) : -1
    // -1 (noise in DBSCAN) → 灰色
    const cssColor = val < 0 ? '#6B7280' : (palette[val % palette.length] ?? '#6B7280')
    const fillColor = parseColor(cssColor).withAlpha(opacity)
    const strokeColor = parseColor(cssColor).withAlpha(Math.min(opacity + 0.2, 1))

    if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(fillColor)
      entity.point.pixelSize = new Cesium.ConstantProperty(10)
      entity.point.outlineColor = new Cesium.ConstantProperty(strokeColor)
      entity.point.outlineWidth = new Cesium.ConstantProperty(1)
    } else if (entity.billboard) {
      entity.billboard.color = new Cesium.ConstantProperty(fillColor)
    } else if (entity.polygon) {
      entity.polygon.material = new Cesium.ColorMaterialProperty(fillColor)
      entity.polygon.outlineColor = new Cesium.ConstantProperty(strokeColor)
    } else if (entity.polyline) {
      entity.polyline.material = new Cesium.ColorMaterialProperty(fillColor)
      entity.polyline.width = new Cesium.ConstantProperty(3)
    }
  }
}

function applyRandomColorStyle(ds: Cesium.GeoJsonDataSource, opacity: number) {
  const entities = ds.entities.values
  for (const entity of entities) {
    const hue = Math.random()
    const sat = 0.5 + Math.random() * 0.4
    const light = 0.4 + Math.random() * 0.25
    const fillColor = Cesium.Color.fromHsl(hue, sat, light, opacity)
    const strokeColor = Cesium.Color.fromHsl(hue, sat, light, Math.min(opacity + 0.3, 1))
    applyColorToEntity(entity, fillColor, strokeColor)
  }
}

function applyGradientStyle(
  ds: Cesium.GeoJsonDataSource,
  gradient: [string, string],
  opacity: number,
) {
  const startColor = parseColor(gradient[0])
  const endColor = parseColor(gradient[1])
  const entities = ds.entities.values
  const total = Math.max(entities.length - 1, 1)
  for (let i = 0; i < entities.length; i++) {
    const t = i / total
    const r = startColor.red + (endColor.red - startColor.red) * t
    const g = startColor.green + (endColor.green - startColor.green) * t
    const b = startColor.blue + (endColor.blue - startColor.blue) * t
    const fillColor = new Cesium.Color(r, g, b, opacity)
    const strokeColor = new Cesium.Color(r, g, b, Math.min(opacity + 0.3, 1))
    applyColorToEntity(entities[i]!, fillColor, strokeColor)
  }
}

function applyColorToEntity(entity: Cesium.Entity, fillColor: Cesium.Color, strokeColor: Cesium.Color) {
  if (entity.polygon) {
    entity.polygon.material = new Cesium.ColorMaterialProperty(fillColor)
    entity.polygon.outlineColor = new Cesium.ConstantProperty(strokeColor)
  } else if (entity.polyline) {
    entity.polyline.material = new Cesium.ColorMaterialProperty(fillColor)
  } else if (entity.point) {
    entity.point.color = new Cesium.ConstantProperty(fillColor)
  } else if (entity.billboard) {
    entity.billboard.color = new Cesium.ConstantProperty(fillColor)
  }
}

export function detectGeometryType(geojson: Record<string, unknown>): string {
  const features = (geojson as any)?.features
  if (!features?.length) return '未知'
  const t: string = features[0]?.geometry?.type ?? ''
  if (t.includes('Point')) return '点'
  if (t.includes('Line')) return '线'
  if (t.includes('Polygon')) return '面'
  return t || '未知'
}

function detectGeometryTypeFromDataSource(ds: Cesium.GeoJsonDataSource): string {
  const entities = ds.entities.values
  if (!entities.length) return '未知'
  const e = entities[0]!
  if (e.point || e.billboard) return '点'
  if (e.polyline) return '线'
  if (e.polygon) return '面'
  return '未知'
}

/** 生成圆点 canvas 图片（用于替换默认 pin 图标） */
function createCircleImage(size: number, cssColor: string, alpha: number): HTMLCanvasElement {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const px = Math.round(size * dpr)
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')!
  const r = px / 2
  // 填充
  ctx.beginPath()
  ctx.arc(r, r, r - 2 * dpr, 0, Math.PI * 2)
  const c = parseColor(cssColor).withAlpha(alpha)
  ctx.fillStyle = `rgba(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)},${c.alpha})`
  ctx.fill()
  // 白色描边
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 1.5 * dpr
  ctx.stroke()
  return canvas
}

/** 使用 heatmap.js 生成热力图 canvas */
function generateHeatmapCanvas(
  points: Array<{ lon: number; lat: number; weight: number }>,
  radius: number,
  bounds: { west: number; south: number; east: number; north: number },
  opts: {
    gradient?: Record<number, string>,
    blur?: number,
    maxOpacity?: number,
    minOpacity?: number,
    resolution?: number,
  } = {},
): HTMLCanvasElement | null {
  if (!points.length) return null

  const SIZE = opts.resolution ?? 512
  const { west, south, east, north } = bounds
  const w = east - west
  const h = north - south

  // 创建临时容器
  const container = document.createElement('div')
  container.style.cssText = `width:${SIZE}px;height:${SIZE}px;position:fixed;left:-9999px;top:-9999px;`
  document.body.appendChild(container)

  try {
    const heatmapInstance = h337.create({
      container,
      radius: Math.max(radius, 10),
      maxOpacity: opts.maxOpacity ?? 0.8,
      minOpacity: opts.minOpacity ?? 0,
      blur: opts.blur ?? 0.85,
      gradient: opts.gradient ?? { 0.25: 'rgb(0,0,255)', 0.55: 'rgb(0,255,0)', 0.85: 'yellow', 1.0: 'rgb(255,0,0)' },
    })

    const maxW = Math.max(...points.map(p => p.weight))
    const data = points.map(p => ({
      x: Math.round(((p.lon - west) / w) * SIZE),
      y: Math.round(((north - p.lat) / h) * SIZE),
      value: p.weight,
    }))

    heatmapInstance.setData({ max: maxW || 1, data })

    // 从 heatmap.js 容器中提取 canvas
    const heatCanvas = container.querySelector('canvas')
    if (!heatCanvas) return null

    // 复制到独立 canvas（脱离 heatmap.js 容器引用）
    const result = document.createElement('canvas')
    result.width = SIZE
    result.height = SIZE
    const ctx = result.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(heatCanvas, 0, 0)
    return result
  } finally {
    document.body.removeChild(container)
  }
}
