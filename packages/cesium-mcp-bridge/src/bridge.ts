import * as Cesium from 'cesium'
import { validateCesiumToolInput } from 'cesium-mcp-contracts'
import type {
  BridgeCommand,
  BridgeResult,
  FlyToParams,
  SetViewParams,
  ViewState,
  ZoomToExtentParams,
  AddGeoJsonLayerParams,
  AddGeoJsonPrimitiveParams,
  AddHeatmapParams,
  AddLabelParams,
  AddMarkerParams,
  AddPolylineParams,
  AddPolygonParams,
  AddModelParams,
  UpdateEntityParams,
  SetBasemapParams,
  Load3dTilesParams,
  AddGaussianSplatParams,
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
  UpdateAnimationPathParams,
  TrackEntityParams,
  ControlClockParams,
  SetGlobeLightingParams,
  SetSceneOptionsParams,
  SetPostProcessParams,
  SetEdgeDisplayModeParams,
  SetEdgeDisplayModeResult,
  BatchAddEntitiesParams,
  QueryEntitiesParams,
  SaveViewpointParams,
  LoadViewpointParams,
} from './types'
import { flyTo, setView, getView, zoomToExtent, saveViewpoint, loadViewpoint, listViewpoints, clearViewpoints } from './commands/view'
import { LayerManager } from './commands/layer'
import { addLabels, addMarker, addPolyline, addPolygon, addModel, updateEntity, removeEntity, batchAddEntities, queryEntities, getEntityProperties } from './commands/entity'
import { screenshot, highlight, measure } from './commands/interaction'
import { playTrajectory as playTrajectoryCmd } from './commands/trajectory'
import { lookAtTransform as lookAtTransformCmd, startOrbit as startOrbitCmd, stopOrbit as stopOrbitCmd, setCameraOptions as setCameraOptionsCmd, type OrbitHandler } from './commands/camera'
import { addBillboard as addBillboardCmd, addBox as addBoxCmd, addCorridor as addCorridorCmd, addCylinder as addCylinderCmd, addEllipse as addEllipseCmd, addRectangle as addRectangleCmd, addWall as addWallCmd } from './commands/entity-types'
import { createAnimation as createAnimationCmd, controlAnimation as controlAnimationCmd, removeAnimation as removeAnimationCmd, listAnimations as listAnimationsCmd, updateAnimationPath as updateAnimationPathCmd, trackEntity as trackEntityCmd, controlClock as controlClockCmd, setGlobeLighting as setGlobeLightingCmd, type AnimationMap } from './commands/animation'
import { setSceneOptions as setSceneOptionsCmd, setPostProcess as setPostProcessCmd, setEdgeDisplayMode as setEdgeDisplayModeCmd } from './commands/scene'
import { createDefaultBridgeExecutors } from './executors/executor-registry'
import { internalBridgeExecutors } from './executors/internal'

export type BridgeExecutor = (
  params: Record<string, unknown>,
  bridge: CesiumBridge,
) => BridgeResult | Promise<BridgeResult>

export interface CesiumBridgeOptions {
  /** Validate shared browser-tool input contracts before dispatch. Defaults to true. */
  validateInputs?: boolean
  /** Override selected commands without replacing the default dispatcher. */
  executors?: Readonly<Record<string, BridgeExecutor>>
}

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
  private _validateInputs: boolean
  private _executors: Map<string, BridgeExecutor>
  private _operationAbortController = new AbortController()
  private _disposed = false

  constructor(viewer: Cesium.Viewer, options: CesiumBridgeOptions = {}) {
    this._viewer = viewer
    this._layerManager = new LayerManager(viewer)
    this._validateInputs = options.validateInputs ?? true
    this._executors = new Map(Object.entries({
      ...createDefaultBridgeExecutors(),
      ...internalBridgeExecutors,
      ...options.executors,
    }))
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
      if (this._disposed) {
        return { success: false, error: 'CesiumBridge has been disposed' }
      }
      const p = (cmd.params ?? {}) as Record<string, any>
      if (this._validateInputs) {
        const validation = validateCesiumToolInput(cmd.action, p)
        if (!validation.valid) {
          const detail = validation.issues
            .map(issue => `${issue.path} ${issue.message}`)
            .join('; ')
          return {
            success: false,
            error: `Invalid parameters for "${cmd.action}": ${detail}`,
          }
        }
      }

      const executor = this._executors.get(cmd.action)
      if (executor) return await executor(p, this)

      return { success: false, error: `未知指令: ${cmd.action}` }
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

  addGeoJsonPrimitive(params: AddGeoJsonPrimitiveParams): Promise<LayerInfo> {
    return this._layerManager.addGeoJsonPrimitive(params)
  }

  addHeatmap(params: AddHeatmapParams): Promise<LayerInfo> {
    return this._layerManager.addHeatmap(params)
  }

  removeLayer(id: string): void {
    this._layerManager.removeLayer(id)
    this._emit('layerRemoved', { id })
  }

  clearAll(): { removedLayers: number; removedEntities: number } {
    this._stopManagedActivity()
    // 清除所有图层和实体
    const result = this._layerManager.clearAll()
    this._emit('layerRemoved', { id: '*' })
    return result
  }

  /**
   * Release timers, camera motion, page-local state, and event handlers owned by
   * this Bridge. The Viewer and scene content remain owned by the application.
   */
  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this._operationAbortController.abort()
    this._viewer.camera?.cancelFlight?.()
    this._stopManagedActivity()
    clearViewpoints(this._viewer)
    this._layerManager.dispose()
    this._eventHandlers.clear()
    this._executors.clear()
  }

  private _stopManagedActivity(): void {
    for (const [, t] of this._activeTrajectories) {
      t.stop()
    }
    this._activeTrajectories.clear()
    if (this._orbitHandler) {
      stopOrbitCmd(this._orbitHandler)
      this._orbitHandler = null
    }
    this._animations.clear()
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

  load3dGaussianSplat(params: AddGaussianSplatParams): Promise<LayerInfo> {
    return this._layerManager.addGaussianSplat(params)
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
    const layerId = `marker_${entity.id}`
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
    const layerId = `polyline_${entity.id}`
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
    const layerId = `polygon_${entity.id}`
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
    const layerId = `model_${entity.id}`
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
    return screenshot(this._viewer, this._operationAbortController.signal)
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
    const layerId = `${type}_${entity.id}`
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

  setEdgeDisplayMode(params: SetEdgeDisplayModeParams): SetEdgeDisplayModeResult {
    return setEdgeDisplayModeCmd(this._viewer, this._layerManager, params)
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
    return listViewpoints(this._viewer)
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
    if (this._disposed) return () => {}
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
