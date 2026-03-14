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
  SetBasemapParams,
  Load3dTilesParams,
  LoadTerrainParams,
  LoadImageryServiceParams,
  PlayTrajectoryParams,
  ScreenshotResult,
  HighlightParams,
  UpdateLayerStyleParams,
  LayerInfo,
  BridgeEventHandler,
  BridgeEventType,
} from './types'
import { flyTo, setView, getView, zoomToExtent } from './commands/view'
import { LayerManager } from './commands/layer'
import { addLabels, addMarker } from './commands/entity'
import { screenshot, highlight } from './commands/interaction'
import { playTrajectory as playTrajectoryCmd } from './commands/trajectory'

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
          return { success: true }
        case 'setView':
          this.setView(p as SetViewParams)
          return { success: true }
        case 'getView':
          return { success: true, data: this.getView() }
        case 'zoomToExtent':
          await this.zoomToExtent(p as ZoomToExtentParams)
          return { success: true }
        case 'addGeoJsonLayer': {
          const info = await this.addGeoJsonLayer(p as AddGeoJsonLayerParams)
          return { success: true, data: info }
        }
        case 'addHeatmap': {
          const info = await this.addHeatmap(p as AddHeatmapParams)
          return { success: true, data: info }
        }
        case 'addLabel': {
          const count = this.addLabel(p as AddLabelParams & { data: Record<string, unknown> })
          return { success: true, data: { labelCount: count } }
        }
        case 'addMarker': {
          const entity = this.addMarker(p as AddMarkerParams)
          return { success: true, data: { entityId: entity.id } }
        }
        case 'removeLayer':
          this.removeLayer(p.id as string)
          return { success: true }
        case 'setBasemap': {
          const basemap = this.setBasemap(p as SetBasemapParams)
          return { success: true, data: { basemap } }
        }
        case 'setLayerVisibility':
          this.setLayerVisibility(p.id as string, p.visible as boolean)
          return { success: true }
        case 'updateLayerStyle': {
          const ok = this.updateLayerStyle(p as UpdateLayerStyleParams)
          return { success: ok, error: ok ? undefined : `图层未找到或不支持样式修改: ${(p as any).layerId}` }
        }
        case 'screenshot': {
          const result = await this.screenshot()
          return { success: true, data: result }
        }
        case 'highlight':
          this.highlight(p as HighlightParams)
          return { success: true }
        case 'load3dTiles': {
          const info = await this.load3dTiles(p as Load3dTilesParams)
          return { success: true, data: info }
        }
        case 'loadTerrain':
          this.loadTerrain(p as LoadTerrainParams)
          return { success: true }
        case 'loadImageryService': {
          const info = await this.loadImageryService(p as LoadImageryServiceParams)
          return { success: true, data: info }
        }
        case 'playTrajectory': {
          const result = this.playTrajectory(p as PlayTrajectoryParams)
          return { success: true, data: { entityId: result.entityId } }
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

  loadImageryService(params: LoadImageryServiceParams): LayerInfo {
    return this._layerManager.loadImageryService(params)
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
  private _attachLabelsToDataSource(ds: Cesium.GeoJsonDataSource, params: AddLabelParams): number {
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
      color: params.color ?? '#3B82F6',
    }
    this._layerManager.setCesiumRefs(layerId, { entity })
    this._layerManager.layers.push(info)
    this._emit('layerAdded', info)
    return entity
  }

  // ==================== Interaction ====================

  screenshot(): Promise<ScreenshotResult> {
    return screenshot(this._viewer)
  }

  highlight(params: HighlightParams): void {
    highlight(this._viewer, this._layerManager, params)
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
