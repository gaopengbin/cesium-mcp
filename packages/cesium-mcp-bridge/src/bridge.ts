import * as Cesium from 'cesium'
import type {
  BridgeCommand,
  BridgeResult,
  FlyToParams,
  SetViewParams,
  ViewState,
  ZoomToExtentParams,
  AddGeoJsonLayerParams,
  AddHeatmapParams,
  AddLabelParams,
  AddMarkerParams,
  AddPolylineParams,
  AddPolygonParams,
  AddModelParams,
  UpdateEntityParams,
  RemoveEntityParams,
  SetBasemapParams,
  Load3dTilesParams,
  LoadTerrainParams,
  LoadImageryServiceParams,
  LoadCzmlParams,
  LoadKmlParams,
  PlayTrajectoryParams,
  ScreenshotResult,
  HighlightParams,
  MeasureParams,
  MeasureResult,
  GetEntityPropertiesParams,
  EntityPropertiesResult,
  ExportSceneResult,
  GetLayerSchemaParams,
  LayerSchemaResult,
  UpdateLayerStyleParams,
  LayerInfo,
  BridgeEventHandler,
  BridgeEventType,
  LookAtTransformParams,
  StartOrbitParams,
  SetCameraOptionsParams,
  AddBillboardParams,
  AddBoxParams,
  AddCorridorParams,
  AddCylinderParams,
  AddEllipseParams,
  AddRectangleParams,
  AddWallParams,
  CreateAnimationParams,
  ControlAnimationParams,
  RemoveAnimationParams,
  UpdateAnimationPathParams,
  TrackEntityParams,
  ControlClockParams,
  SetGlobeLightingParams,
  SetSceneOptionsParams,
  SetPostProcessParams,
  BatchAddEntitiesParams,
  QueryEntitiesParams,
  SaveViewpointParams,
  LoadViewpointParams,
} from './types'
import { flyTo, setView, getView, zoomToExtent, saveViewpoint, loadViewpoint, listViewpoints } from './commands/view'
import { LayerManager } from './commands/layer'
import { addLabels, addMarker, addPolyline, addPolygon, addModel, updateEntity, removeEntity, batchAddEntities, queryEntities, getEntityProperties } from './commands/entity'
import { screenshot, highlight, measure } from './commands/interaction'
import { playTrajectory as playTrajectoryCmd } from './commands/trajectory'
import { lookAtTransform as lookAtTransformCmd, startOrbit as startOrbitCmd, stopOrbit as stopOrbitCmd, setCameraOptions as setCameraOptionsCmd, type OrbitHandler } from './commands/camera'
import { addBillboard as addBillboardCmd, addBox as addBoxCmd, addCorridor as addCorridorCmd, addCylinder as addCylinderCmd, addEllipse as addEllipseCmd, addRectangle as addRectangleCmd, addWall as addWallCmd } from './commands/entity-types'
import { createAnimation as createAnimationCmd, controlAnimation as controlAnimationCmd, removeAnimation as removeAnimationCmd, listAnimations as listAnimationsCmd, updateAnimationPath as updateAnimationPathCmd, trackEntity as trackEntityCmd, controlClock as controlClockCmd, setGlobeLighting as setGlobeLightingCmd, type AnimationMap } from './commands/animation'
import { setSceneOptions as setSceneOptionsCmd, setPostProcess as setPostProcessCmd } from './commands/scene'

/**
 * CesiumBridge — AI Agent 操控 Cesium 的统一执行层
 *
 * 所有 Cesium 操作通过此类暴露，支持两种调用方式：
 * 1. 类型安全的方法调用：bridge.flyTo({...})
 * 2. 命令分发（兼容 MCP/SSE）：bridge.execute({ action: 'flyTo', params: {...} })
 */
export class CesiumBridge {
  private _viewer: Cesium.Viewer
  private _layerManager: LayerManager
  private _eventHandlers: Map<BridgeEventType, Set<BridgeEventHandler>> = new Map()
  private _orbitHandler: OrbitHandler | null = null
  private _animations: AnimationMap = new Map()

  constructor(viewer: Cesium.Viewer) {
    this._viewer = viewer
    this._layerManager = new LayerManager(viewer)
  }

  get viewer(): Cesium.Viewer {
    return this._viewer
  }

  get layerManager(): LayerManager {
    return this._layerManager
  }

  // ==================== 命令分发（MCP/SSE 兼容） ====================

  async execute(cmd: BridgeCommand): Promise<BridgeResult> {
    try {
      const p = cmd.params as Record<string, any>
      switch (cmd.action) {
        case 'flyTo':
          await this.flyTo(p as FlyToParams)
          return { success: true, message: 'Camera flew to target position' }
        case 'setView':
          this.setView(p as SetViewParams)
          return { success: true, message: 'Camera view set' }
        case 'getView':
          return { success: true, data: this.getView(), message: 'Current view state retrieved' }
        case 'zoomToExtent':
          await this.zoomToExtent(p as ZoomToExtentParams)
          return { success: true, message: 'Zoomed to extent' }
        case 'addGeoJsonLayer': {
          const info = await this.addGeoJsonLayer(p as AddGeoJsonLayerParams)
          return { success: true, data: info, message: `GeoJSON layer '${info.name}' added` }
        }
        case 'addHeatmap': {
          const info = await this.addHeatmap(p as AddHeatmapParams)
          return { success: true, data: info, message: `Heatmap '${info.name}' added` }
        }
        case 'addLabel': {
          const count = this.addLabel(p as AddLabelParams & { data: Record<string, unknown> })
          return { success: true, data: { labelCount: count }, message: `${count} labels added` }
        }
        case 'addMarker': {
          const entity = this.addMarker(p as AddMarkerParams)
          return { success: true, data: { entityId: entity.id }, message: 'Marker added' }
        }
        case 'addPolyline': {
          const entity = this.addPolyline(p as AddPolylineParams)
          return { success: true, data: { entityId: entity.id }, message: 'Polyline added' }
        }
        case 'addPolygon': {
          const entity = this.addPolygon(p as AddPolygonParams)
          return { success: true, data: { entityId: entity.id }, message: 'Polygon added' }
        }
        case 'addModel': {
          const entity = this.addModel(p as AddModelParams)
          return { success: true, data: { entityId: entity.id }, message: 'Model added' }
        }
        case 'updateEntity': {
          const ok = this.updateEntity(p as UpdateEntityParams)
          return { success: ok, message: ok ? 'Entity updated' : undefined, error: ok ? undefined : `Entity not found: ${(p as any).entityId}` }
        }
        case 'removeEntity': {
          const ok = this.removeEntity((p as RemoveEntityParams).entityId)
          return { success: ok, message: ok ? 'Entity removed' : undefined, error: ok ? undefined : `Entity not found: ${(p as any).entityId}` }
        }
        case 'removeLayer':
          this.removeLayer(p.id as string)
          return { success: true, message: `Layer '${p.id}' removed` }
        case 'clearAll': {
          const result = this.clearAll()
          return { success: true, data: result, message: `Cleared ${result.removedLayers} layers and ${result.removedEntities} entities` }
        }
        case 'setBasemap': {
          const basemap = this.setBasemap(p as SetBasemapParams)
          return { success: true, data: { basemap }, message: `Basemap set to '${basemap}'` }
        }
        case 'setLayerVisibility':
          this.setLayerVisibility(p.id as string, p.visible as boolean)
          return { success: true, message: `Layer '${p.id}' visibility set to ${p.visible}` }
        case 'updateLayerStyle': {
          const ok = this.updateLayerStyle(p as UpdateLayerStyleParams)
          return { success: ok, message: ok ? 'Layer style updated' : undefined, error: ok ? undefined : `图层未找到或不支持样式修改: ${(p as any).layerId}` }
        }
        case 'screenshot': {
          const result = await this.screenshot()
          return { success: true, data: result, message: 'Screenshot captured' }
        }
        case 'highlight':
          this.highlight(p as HighlightParams)
          return { success: true, message: (p as HighlightParams).clear ? 'Highlight cleared' : 'Features highlighted' }
        case 'measure': {
          const result = this.measure(p as MeasureParams)
          return { success: true, data: result, message: `Measurement complete: ${result.value} ${result.unit}` }
        }
        case 'load3dTiles': {
          const info = await this.load3dTiles(p as Load3dTilesParams)
          return { success: true, data: info, message: `3D Tiles '${info.name}' loaded` }
        }
        case 'loadTerrain':
          this.loadTerrain(p as LoadTerrainParams)
          return { success: true, message: 'Terrain provider updated' }
        case 'loadImageryService': {
          const info = await this.loadImageryService(p as LoadImageryServiceParams)
          return { success: true, data: info, message: `Imagery service '${info.name}' loaded` }
        }
        case 'loadCzml': {
          const info = await this.loadCzml(p as LoadCzmlParams)
          return { success: true, data: info, message: `CZML data source '${info.name}' loaded` }
        }
        case 'loadKml': {
          const info = await this.loadKml(p as LoadKmlParams)
          return { success: true, data: info, message: `KML data source '${info.name}' loaded` }
        }
        case 'playTrajectory': {
          const result = this.playTrajectory(p as PlayTrajectoryParams)
          return { success: true, data: { entityId: result.entityId }, message: 'Trajectory playback started' }
        }
        case 'listLayers': {
          const layers = this.listLayers()
          return { success: true, data: { layers }, message: `${layers.length} layers found` }
        }
        case 'getLayerSchema': {
          const result = this.getLayerSchema(p as GetLayerSchemaParams)
          return { success: true, data: result, message: `Layer '${result.layerName}' has ${result.fields.length} fields, ${result.entityCount} entities` }
        }
        // ==================== Camera (融合官方) ====================
        case 'lookAtTransform':
          this.lookAtTransform(p as LookAtTransformParams)
          return { success: true, message: 'Camera lookAtTransform applied' }
        case 'startOrbit':
          this.startOrbit(p as StartOrbitParams)
          return { success: true, message: 'Orbit started' }
        case 'stopOrbit':
          this.stopOrbit()
          return { success: true, message: 'Orbit stopped' }
        case 'setCameraOptions':
          this.setCameraOptions(p as SetCameraOptionsParams)
          return { success: true, message: 'Camera options updated' }
        // ==================== Entity Types (融合官方) ====================
        case 'addBillboard': {
          const entity = this.addBillboard(p as AddBillboardParams)
          return { success: true, data: { entityId: entity.id }, message: 'Billboard added' }
        }
        case 'addBox': {
          const entity = this.addBox(p as AddBoxParams)
          return { success: true, data: { entityId: entity.id }, message: 'Box added' }
        }
        case 'addCorridor': {
          const entity = this.addCorridor(p as AddCorridorParams)
          return { success: true, data: { entityId: entity.id }, message: 'Corridor added' }
        }
        case 'addCylinder': {
          const entity = this.addCylinder(p as AddCylinderParams)
          return { success: true, data: { entityId: entity.id }, message: 'Cylinder added' }
        }
        case 'addEllipse': {
          const entity = this.addEllipse(p as AddEllipseParams)
          return { success: true, data: { entityId: entity.id }, message: 'Ellipse added' }
        }
        case 'addRectangle': {
          const entity = this.addRectangle(p as AddRectangleParams)
          return { success: true, data: { entityId: entity.id }, message: 'Rectangle added' }
        }
        case 'addWall': {
          const entity = this.addWall(p as AddWallParams)
          return { success: true, data: { entityId: entity.id }, message: 'Wall added' }
        }
        // ==================== Animation (融合官方) ====================
        case 'createAnimation': {
          const entity = this.createAnimation(p as CreateAnimationParams)
          return { success: true, data: { entityId: entity.id }, message: 'Animation created' }
        }
        case 'controlAnimation':
          this.controlAnimation((p as ControlAnimationParams).action)
          return { success: true, message: `Animation ${(p as ControlAnimationParams).action}` }
        case 'removeAnimation': {
          const ok = this.removeAnimation((p as RemoveAnimationParams).entityId)
          return { success: ok, message: ok ? 'Animation removed' : undefined, error: ok ? undefined : `Animation entity not found: ${(p as any).entityId}` }
        }
        case 'listAnimations': {
          const animations = this.listAnimations()
          return { success: true, data: { animations }, message: `${animations.length} animations found` }
        }
        case 'updateAnimationPath': {
          const ok = this.updateAnimationPath(p as UpdateAnimationPathParams)
          return { success: ok, message: ok ? 'Animation path updated' : undefined, error: ok ? undefined : 'Entity or path not found' }
        }
        case 'trackEntity':
          this.trackEntity(p as TrackEntityParams)
          return { success: true, message: (p as TrackEntityParams).entityId ? `Tracking entity ${(p as TrackEntityParams).entityId}` : 'Tracking stopped' }
        case 'controlClock':
          this.controlClock(p as ControlClockParams)
          return { success: true, message: `Clock ${(p as ControlClockParams).action} applied` }
        case 'setGlobeLighting':
          this.setGlobeLighting(p as SetGlobeLightingParams)
          return { success: true, message: 'Globe lighting updated' }
        // ==================== Scene & Post-Processing ====================
        case 'setSceneOptions':
          this.setSceneOptions(p as SetSceneOptionsParams)
          return { success: true, message: 'Scene options updated' }
        case 'setPostProcess':
          this.setPostProcess(p as SetPostProcessParams)
          return { success: true, message: 'Post-processing effects updated' }
        case 'setIonToken':
          Cesium.Ion.defaultAccessToken = p.token as string
          return { success: true, message: 'Cesium Ion access token updated' }
        // ==================== Batch & Query ====================
        case 'batchAddEntities': {
          const result = this.batchAddEntities(p as BatchAddEntitiesParams)
          return { success: true, data: result, message: `${result.entityIds.length} entities added` }
        }
        case 'queryEntities': {
          const entities = this.queryEntities(p as QueryEntitiesParams)
          return { success: true, data: { entities }, message: `${entities.length} entities found` }
        }
        case 'getEntityProperties': {
          const result = this.getEntityProperties(p as GetEntityPropertiesParams)
          return { success: true, data: result, message: `Properties for entity '${result.entityId}'` }
        }
        // ==================== Viewpoint Bookmarks ====================
        case 'saveViewpoint': {
          const state = this.saveViewpoint(p as SaveViewpointParams)
          return { success: true, data: state, message: `Viewpoint '${(p as SaveViewpointParams).name}' saved` }
        }
        case 'loadViewpoint': {
          const state = this.loadViewpoint(p as LoadViewpointParams)
          if (!state) return { success: false, error: `Viewpoint '${(p as LoadViewpointParams).name}' not found` }
          return { success: true, data: state, message: `Viewpoint '${(p as LoadViewpointParams).name}' loaded` }
        }
        case 'listViewpoints': {
          const viewpoints = this.listViewpoints()
          return { success: true, data: { viewpoints }, message: `${viewpoints.length} viewpoints saved` }
        }
        case 'exportScene': {
          const result = this.exportScene()
          return { success: true, data: result, message: 'Scene exported' }
        }
        default:
          return { success: false, error: `未知指令: ${cmd.action}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }

  // ==================== View ====================

  flyTo(params: FlyToParams): Promise<void> {
    return flyTo(this._viewer, params)
  }

  setView(params: SetViewParams): void {
    setView(this._viewer, params)
  }

  getView(): ViewState {
    return getView(this._viewer)
  }

  zoomToExtent(params: ZoomToExtentParams): Promise<void> {
    return zoomToExtent(this._viewer, params)
  }

  // ==================== Layer ====================

  addGeoJsonLayer(params: AddGeoJsonLayerParams): Promise<LayerInfo> {
    return this._layerManager.addGeoJsonLayer(params)
  }

  addHeatmap(params: AddHeatmapParams): Promise<LayerInfo> {
    return this._layerManager.addHeatmap(params)
  }

  removeLayer(id: string): void {
    this._layerManager.removeLayer(id)
    this._emit('layerRemoved', { id })
  }

  clearAll(): { removedLayers: number; removedEntities: number } {
    // 停止所有轨迹动画
    for (const [id, t] of this._activeTrajectories) {
      t.stop()
    }
    this._activeTrajectories.clear()
    // 停止轨道动画
    if (this._orbitHandler) {
      stopOrbitCmd(this._orbitHandler)
      this._orbitHandler = null
    }
    // 清除动画
    this._animations.clear()
    // 清除所有图层和实体
    const result = this._layerManager.clearAll()
    this._emit('layerRemoved', { id: '*' })
    return result
  }

  setLayerVisibility(id: string, visible: boolean): void {
    this._layerManager.setLayerVisibility(id, visible)
  }

  toggleLayer(id: string): void {
    this._layerManager.toggleLayer(id)
  }

  zoomToLayer(id: string): void {
    this._layerManager.zoomToLayer(id)
  }

  updateLayerStyle(params: UpdateLayerStyleParams): boolean {
    return this._layerManager.updateLayerStyle(params)
  }

  listLayers(): LayerInfo[] {
    return this._layerManager.listLayers()
  }

  getLayerSchema(params: GetLayerSchemaParams): LayerSchemaResult {
    return this._layerManager.getLayerSchema(params)
  }

  setBasemap(params: SetBasemapParams): string {
    return this._layerManager.setBasemap(params)
  }

  // ==================== 3D Scene ====================

  load3dTiles(params: Load3dTilesParams): Promise<LayerInfo> {
    return this._layerManager.load3dTiles(params)
  }

  loadTerrain(params: LoadTerrainParams): void {
    this._layerManager.loadTerrain(params)
  }

  loadImageryService(params: LoadImageryServiceParams): Promise<LayerInfo> {
    return this._layerManager.loadImageryService(params)
  }

  loadCzml(params: LoadCzmlParams): Promise<LayerInfo> {
    return this._layerManager.loadCzml(params)
  }

  loadKml(params: LoadKmlParams): Promise<LayerInfo> {
    return this._layerManager.loadKml(params)
  }

  // ==================== Trajectory ====================

  private _activeTrajectories = new Map<string, { stop: () => void; pause: () => void; resume: () => void; isPlaying: () => boolean }>()

  playTrajectory(params: PlayTrajectoryParams): { entityId: string; stop: () => void } {
    const id = params.id ?? `trajectory_${Date.now()}`
    // 停止已有同 id 的动画
    const existing = this._activeTrajectories.get(id)
    if (existing) existing.stop()

    const result = playTrajectoryCmd(this._viewer, { ...params, id })
    this._activeTrajectories.set(id, { stop: result.stop, pause: result.pause, resume: result.resume, isPlaying: result.isPlaying })

    // 注册为图层
    const layerId = `trajectory_${id}`
    const info: LayerInfo = {
      id: layerId,
      name: params.name ?? `轨迹 - ${id}`,
      type: '轨迹',
      visible: true,
      color: '#F59E0B',
    }
    this._layerManager.setCesiumRefs(layerId, {
      movingEntity: result.movingEntity,
      trailEntity: result.trailEntity,
      trajectoryId: id,
    })
    this._layerManager.layers.push(info)
    this._emit('layerAdded', info)

    return result
  }

  stopTrajectory(id: string): void {
    const t = this._activeTrajectories.get(id)
    if (t) {
      t.stop()
      this._activeTrajectories.delete(id)
    }
  }

  pauseTrajectory(id: string): void {
    this._activeTrajectories.get(id)?.pause()
  }

  resumeTrajectory(id: string): void {
    this._activeTrajectories.get(id)?.resume()
  }

  toggleTrajectory(id: string): boolean {
    const t = this._activeTrajectories.get(id)
    if (!t) return false
    if (t.isPlaying()) { t.pause() } else { t.resume() }
    return t.isPlaying()
  }

  isTrajectoryPlaying(id: string): boolean {
    return this._activeTrajectories.get(id)?.isPlaying() ?? false
  }

  // ==================== Entity ====================

  addLabel(params: AddLabelParams & { data?: Record<string, unknown> }): number {
    const data = params.data
    if (!data) return 0

    // 优先检查是否已有同 dataRefId 的 GeoJSON 图层 → 将标注附加到现有实体上
    if (params.dataRefId) {
      const existingRefs = this._layerManager.getCesiumRefs(params.dataRefId)
      if (existingRefs?.dataSource) {
        return this._attachLabelsToDataSource(existingRefs.dataSource, params)
      }
    }

    const entities = addLabels(this._viewer, data, params)
    // 关联到图层以支持删除/显隐
    const layerId = params.dataRefId ? `label_${params.dataRefId}` : `label_${Date.now()}`
    const info: LayerInfo = {
      id: layerId,
      name: `标注 - ${params.field}`,
      type: '标注',
      visible: true,
      color: params.style?.fillColor ?? '#FFFFFF',
    }
    this._layerManager.setCesiumRefs(layerId, { labelEntities: entities })
    this._layerManager.layers.push(info)
    this._emit('layerAdded', info)
    return entities.length
  }

  /** 将标注附加到现有 GeoJsonDataSource 的实体上（圆点+文字同图层） */
  private _attachLabelsToDataSource(ds: Cesium.GeoJsonDataSource | Cesium.CzmlDataSource | Cesium.KmlDataSource, params: AddLabelParams): number {
    const { field, style } = params
    const font = style?.font ?? '12px sans-serif'
    const fillColor = style?.fillColor
      ? Cesium.Color.fromCssColorString(style.fillColor)
      : Cesium.Color.WHITE
    const outlineColor = style?.outlineColor
      ? Cesium.Color.fromCssColorString(style.outlineColor)
      : Cesium.Color.BLACK
    const outlineWidth = style?.outlineWidth ?? 2
    const pixelOffset = style?.pixelOffset
      ? new Cesium.Cartesian2(style.pixelOffset[0], style.pixelOffset[1])
      : new Cesium.Cartesian2(0, -16)

    let count = 0
    const entities = ds.entities.values
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!
      if (!e.properties || !e.position) continue
      const val = e.properties[field]?.getValue(Cesium.JulianDate.now())
      if (val == null || val === '') continue
      e.label = new Cesium.LabelGraphics({
        text: String(val),
        font,
        fillColor,
        outlineColor,
        outlineWidth,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset,
        scale: style?.scale ?? 1.0,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      })
      count++
    }
    return count
  }

  addMarker(params: AddMarkerParams): Cesium.Entity {
    const entity = addMarker(this._viewer, params)
    const layerId = `marker_${Date.now()}`
    const info: LayerInfo = {
      id: layerId,
      name: params.label ?? layerId,
      type: '标注点',
      visible: true,
      color: typeof params.color === 'string' ? params.color : '#3B82F6',
    }
    this._layerManager.setCesiumRefs(layerId, { entity })
    this._layerManager.layers.push(info)
    this._emit('layerAdded', info)
    return entity
  }

  addPolyline(params: AddPolylineParams): Cesium.Entity {
    const entity = addPolyline(this._viewer, params)
    const layerId = `polyline_${Date.now()}`
    const info: LayerInfo = {
      id: layerId,
      name: params.label ?? layerId,
      type: '折线',
      visible: true,
      color: typeof params.color === 'string' ? params.color : '#3B82F6',
    }
    this._layerManager.setCesiumRefs(layerId, { entity })
    this._layerManager.layers.push(info)
    this._emit('layerAdded', info)
    return entity
  }

  addPolygon(params: AddPolygonParams): Cesium.Entity {
    const entity = addPolygon(this._viewer, params)
    const layerId = `polygon_${Date.now()}`
    const info: LayerInfo = {
      id: layerId,
      name: params.label ?? layerId,
      type: '多边形',
      visible: true,
      color: typeof params.color === 'string' ? params.color : '#3B82F6',
    }
    this._layerManager.setCesiumRefs(layerId, { entity })
    this._layerManager.layers.push(info)
    this._emit('layerAdded', info)
    return entity
  }

  addModel(params: AddModelParams): Cesium.Entity {
    const entity = addModel(this._viewer, params)
    const layerId = `model_${Date.now()}`
    const info: LayerInfo = {
      id: layerId,
      name: params.label ?? layerId,
      type: '模型',
      visible: true,
      color: '#8B5CF6',
    }
    this._layerManager.setCesiumRefs(layerId, { entity })
    this._layerManager.layers.push(info)
    this._emit('layerAdded', info)
    return entity
  }

  updateEntity(params: UpdateEntityParams): boolean {
    return updateEntity(this._viewer, params)
  }

  removeEntity(entityId: string): boolean {
    const entity = this._viewer.entities.getById(entityId)
    if (!entity) return false
    const ok = removeEntity(this._viewer, entityId)
    if (ok) {
      const layerId = this._layerManager.untrackByEntity(entity)
      if (layerId) this._emit('layerRemoved', { id: layerId })
    }
    return ok
  }

  getEntityProperties(params: GetEntityPropertiesParams): EntityPropertiesResult {
    return getEntityProperties(this._viewer, params)
  }

  // ==================== Interaction ====================

  screenshot(): Promise<ScreenshotResult> {
    return screenshot(this._viewer)
  }

  highlight(params: HighlightParams): void {
    highlight(this._viewer, this._layerManager, params)
  }

  measure(params: MeasureParams): MeasureResult {
    return measure(this._viewer, params)
  }

  // ==================== Camera (融合官方 Camera Server) ====================

  lookAtTransform(params: LookAtTransformParams): void {
    lookAtTransformCmd(this._viewer, params)
  }

  startOrbit(params: StartOrbitParams): void {
    this._orbitHandler = startOrbitCmd(this._viewer, params, this._orbitHandler ?? undefined)
  }

  stopOrbit(): void {
    stopOrbitCmd(this._orbitHandler ?? undefined)
    this._orbitHandler = null
  }

  setCameraOptions(params: SetCameraOptionsParams): void {
    setCameraOptionsCmd(this._viewer, params)
  }

  // ==================== Entity Types (融合官方 Entity Server) ====================

  private _registerEntityLayer(entity: Cesium.Entity, type: string, name?: string, color?: string): Cesium.Entity {
    const layerId = `${type}_${Date.now()}`
    const info: LayerInfo = {
      id: layerId,
      name: name ?? entity.name ?? layerId,
      type,
      visible: true,
      color: color ?? '#3B82F6',
    }
    this._layerManager.setCesiumRefs(layerId, { entity })
    this._layerManager.layers.push(info)
    this._emit('layerAdded', info)
    return entity
  }

  addBillboard(params: AddBillboardParams): Cesium.Entity {
    return this._registerEntityLayer(addBillboardCmd(this._viewer, params), 'billboard', params.name)
  }

  addBox(params: AddBoxParams): Cesium.Entity {
    return this._registerEntityLayer(addBoxCmd(this._viewer, params), 'box', params.name)
  }

  addCorridor(params: AddCorridorParams): Cesium.Entity {
    return this._registerEntityLayer(addCorridorCmd(this._viewer, params), 'corridor', params.name)
  }

  addCylinder(params: AddCylinderParams): Cesium.Entity {
    return this._registerEntityLayer(addCylinderCmd(this._viewer, params), 'cylinder', params.name)
  }

  addEllipse(params: AddEllipseParams): Cesium.Entity {
    return this._registerEntityLayer(addEllipseCmd(this._viewer, params), 'ellipse', params.name)
  }

  addRectangle(params: AddRectangleParams): Cesium.Entity {
    return this._registerEntityLayer(addRectangleCmd(this._viewer, params), 'rectangle', params.name)
  }

  addWall(params: AddWallParams): Cesium.Entity {
    return this._registerEntityLayer(addWallCmd(this._viewer, params), 'wall', params.name)
  }

  // ==================== Animation (融合官方 Animation Server) ====================

  createAnimation(params: CreateAnimationParams): Cesium.Entity {
    const entity = createAnimationCmd(this._viewer, params, this._animations)
    const layerId = `animation_${entity.id}`
    const info: LayerInfo = {
      id: layerId,
      name: params.name ?? `Animation - ${entity.id}`,
      type: 'animation',
      visible: true,
      color: params.pathColor ?? '#00FF00',
    }
    this._layerManager.setCesiumRefs(layerId, { entity })
    this._layerManager.layers.push(info)
    this._emit('layerAdded', info)
    return entity
  }

  controlAnimation(action: 'play' | 'pause'): void {
    controlAnimationCmd(this._viewer, action)
  }

  removeAnimation(entityId: string): boolean {
    const ok = removeAnimationCmd(this._viewer, entityId, this._animations)
    if (ok) {
      const layerId = `animation_${entityId}`
      const idx = this._layerManager.layers.findIndex(l => l.id === layerId)
      if (idx >= 0) this._layerManager.layers.splice(idx, 1)
      this._emit('layerRemoved', { id: layerId })
    }
    return ok
  }

  listAnimations() {
    return listAnimationsCmd(this._viewer, this._animations)
  }

  updateAnimationPath(params: UpdateAnimationPathParams): boolean {
    return updateAnimationPathCmd(this._viewer, params)
  }

  trackEntity(params: TrackEntityParams): void {
    trackEntityCmd(this._viewer, params)
  }

  controlClock(params: ControlClockParams): void {
    controlClockCmd(this._viewer, params)
  }

  setGlobeLighting(params: SetGlobeLightingParams): void {
    setGlobeLightingCmd(this._viewer, params)
  }

  // ==================== Scene & Post-Processing ====================

  setSceneOptions(params: SetSceneOptionsParams): void {
    setSceneOptionsCmd(this._viewer, params)
  }

  setPostProcess(params: SetPostProcessParams): void {
    setPostProcessCmd(this._viewer, params)
  }

  // ==================== Batch & Query ====================

  batchAddEntities(params: BatchAddEntitiesParams) {
    return batchAddEntities(this._viewer, params.entities, {
      addMarker: (p) => this.addMarker(p),
      addPolyline: (p) => this.addPolyline(p),
      addPolygon: (p) => this.addPolygon(p),
      addModel: (p) => this.addModel(p),
      addBillboard: (p) => this.addBillboard(p),
      addBox: (p) => this.addBox(p),
      addCylinder: (p) => this.addCylinder(p),
      addEllipse: (p) => this.addEllipse(p),
      addRectangle: (p) => this.addRectangle(p),
      addWall: (p) => this.addWall(p),
      addCorridor: (p) => this.addCorridor(p),
    })
  }

  queryEntities(params: QueryEntitiesParams) {
    return queryEntities(this._viewer, params)
  }

  // ==================== Viewpoint Bookmarks ====================

  saveViewpoint(params: SaveViewpointParams) {
    return saveViewpoint(this._viewer, params)
  }

  loadViewpoint(params: LoadViewpointParams) {
    return loadViewpoint(this._viewer, params)
  }

  listViewpoints() {
    return listViewpoints()
  }

  exportScene(): ExportSceneResult {
    return {
      view: this.getView(),
      layers: this.listLayers(),
      entities: this.queryEntities({}),
      timestamp: new Date().toISOString(),
    }
  }

  // ==================== Events ====================

  on(event: BridgeEventType, handler: BridgeEventHandler): () => void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set())
    }
    this._eventHandlers.get(event)!.add(handler)
    return () => {
      this._eventHandlers.get(event)?.delete(handler)
    }
  }

  private _emit(event: BridgeEventType, data: unknown): void {
    this._eventHandlers.get(event)?.forEach(fn => fn({ type: event, data }))
  }
}
