import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'
import { buildModuleUrl, EllipsoidTerrainProvider, ImageryLayer, TileMapServiceImageryProvider, Viewer } from 'cesium'
import type { Entity } from 'cesium'
import { CesiumBridge } from 'cesium-mcp-bridge'
import type { EntityPropertiesResult } from 'cesium-mcp-bridge'
import { readToolData } from './tool-result.js'
import { createDemoPlan, executeDemoPlan, removeDemoResources } from './demos.js'
import type { DemoId, DemoPlan, DemoResources } from './demos.js'
import { createMapMessage } from './conversation.js'
import { resolvePresentation, translate } from './i18n.js'
import type { Locale } from './i18n.js'
import { initialWorkspace, transitionWorkspace } from './workspace.js'
import type { WorkspaceState } from './workspace.js'

const app = new App({ name: 'Cesium Map', version: '1.0.0' }, {}, { autoResize: true })
const element = (id: string) => document.getElementById(id)!
const button = (id: string) => element(id) as HTMLButtonElement
let locale: Locale = 'en'
let feedbackText = '在 Codex 原生聊天中描述想做什么，地图会随对话更新。'
let connectionState = 'loading'
let connectionText = '等待地图会话'
let mapErrorText = ''
const t = (text: string) => translate(text, locale)
const feedback = (text: string) => { feedbackText = text; element('feedback').textContent = t(text) }
const controls = ['new-york', 'marker', 'world', 'basemap-map', 'basemap-satellite', 'demo-choropleth', 'demo-buildings', 'demo-heatmap']
const places = [
  { id: 'new-york', name: '纽约', landmark: '曼哈顿', aliases: ['new york', 'nyc', 'manhattan'], longitude: -74.009, latitude: 40.7148, height: 12_000 },
  { id: 'san-francisco', name: '旧金山', landmark: '市区', aliases: ['san francisco', 'sf'], longitude: -122.414, latitude: 37.77635, height: 12_000 },
  { id: 'los-angeles', name: '洛杉矶', landmark: '市中心', aliases: ['los angeles', 'la'], longitude: -118.2515, latitude: 34.0455, height: 12_000 },
]
let viewer: Viewer | undefined
let bridge: CesiumBridge | undefined
let connectionToken: string | undefined
let connected = false
let contextTimer: ReturnType<typeof setTimeout> | undefined
let sessionId = ''
let selectedEntity: EntityPropertiesResult | null = null
let stopped = false
let contextQueue: Promise<unknown> = Promise.resolve()
let removeSelectionListener: (() => void) | undefined
let removeCameraListener: (() => void) | undefined
let removeTileListener: (() => void) | undefined
let removeImageryListener: (() => void) | undefined
let removeImageryRemovalListener: (() => void) | undefined
const imageryErrors = new Map<ImageryLayer, string>()
const imageryListeners = new Map<ImageryLayer, () => void>()
let busy = false
let basemapLoading = false
let generation = 0
let activeDemo: DemoPlan | undefined
let displayedDemo: DemoPlan | undefined
let demoState = '正在运行'
let demoSummary = '正在准备场景…'
let demoResources: DemoResources = { layers: [], entities: [] }
let mapContext: Record<string, unknown> = {}
let workspace: WorkspaceState = initialWorkspace
function resizeMap() {
  if (!viewer || viewer.isDestroyed()) return
  viewer.resize()
  viewer.scene.requestRender()
}

new ResizeObserver(resizeMap).observe(element('globe'))

function renderWorkspace() {
  element('workspace').dataset.layout = workspace.layout
  button('workspace-home').hidden = workspace.layout === 'home'
  button('workspace-resume').hidden = workspace.layout !== 'home'
  const expanded = workspace.layout === 'expanded'
  button('map-expand').setAttribute('aria-expanded', String(expanded))
  button('map-expand').setAttribute('aria-label', t(expanded ? '收起地图' : '展开地图'))
  element('map-expand-label').textContent = t(expanded ? '收起' : '展开')
}

function navigateWorkspace(action: Parameters<typeof transitionWorkspace>[1]) {
  const next = transitionWorkspace(workspace, action)
  if (next.layout === workspace.layout) return
  workspace = next
  renderWorkspace()
  window.scrollTo({ top: 0 })
  requestAnimationFrame(resizeMap)
  void publishContext(true)
}

function updateHostDimensions() {
  const dimensions = app.getHostContext()?.containerDimensions
  const height = dimensions && ('height' in dimensions ? dimensions.height : dimensions.maxHeight)
  element('workspace').style.setProperty('--workspace-height', `${typeof height === 'number' && height > 0 ? height : 780}px`)
}

async function sendToHost(text: string, context = mapContext) {
  const currentGeneration = generation
  const result = await app.sendMessage(createMapMessage(t(text), context, locale))
  if (stopped || generation !== currentGeneration) throw new Error('地图会话已更换，请重新操作。')
  if (result.isError) throw new Error('对话未发送，请保留输入后重试。')
  navigateWorkspace('map')
}

button('workspace-home').onclick = () => { navigateWorkspace('home') }
button('workspace-resume').onclick = () => { navigateWorkspace('map') }
button('map-expand').onclick = async () => {
  const expanding = workspace.layout !== 'expanded'
  navigateWorkspace(expanding ? 'expand' : 'restore')
  const mode = expanding ? 'fullscreen' : 'inline'
  if (app.getHostContext()?.availableDisplayModes?.includes('fullscreen')) {
    await app.requestDisplayMode({ mode }).catch(showError)
  }
}
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && workspace.layout === 'expanded') button('map-expand').click()
})

function setConnection(state: string, text: string) {
  connectionState = state
  connectionText = text
  element('connection').dataset.state = state
  element('connection').textContent = t(text)
  for (const id of controls) button(id).disabled = state !== 'ready' || busy
  button('ask').disabled = state !== 'ready' || !selectedEntity || busy || !app.getHostCapabilities()?.message
  button('demo-ask').disabled = state !== 'ready' || !activeDemo || busy || !app.getHostCapabilities()?.message
  button('demo-clear').disabled = state !== 'ready' || busy || !demoResources.layers.length && !demoResources.entities.length
}

function showError(error: unknown) {
  feedback(error instanceof Error ? error.message : String(error))
}

function updateSelection(entity: Entity | undefined, publish = true) {
  try {
    selectedEntity = entity && bridge ? bridge.getEntityProperties({ entityId: entity.id }) : null
  } catch {
    selectedEntity = null
  }
  const tile = bridge?.layerManager.getSelectedTileFeature()
  if (!entity && tile) selectedEntity = { entityId: tile.layerId, name: String(tile.properties.name ?? tile.layerId), type: 'vector-tile', properties: tile.properties, graphicProperties: {} }
  const label = entity?.label?.text?.getValue(viewer?.clock.currentTime)
  if (selectedEntity && !selectedEntity.name && typeof label === 'string') selectedEntity.name = label
  const demoBuilding = demoResources.entities.indexOf(selectedEntity?.entityId ?? '')
  if (selectedEntity && !selectedEntity.name && demoBuilding >= 0) selectedEntity.name = `规划建筑 ${demoBuilding + 1}`
  element('selection-title').textContent = t(selectedEntity?.name ?? selectedEntity?.entityId ?? '在地图上选择一个对象')
  const position = selectedEntity?.position
  const height = selectedEntity?.graphicProperties?.extrudedHeight
  const value = selectedEntity?.properties?.value
  const weight = selectedEntity?.properties?.weight
  const attributes = [
    typeof height === 'number' ? t(`高度 ${height} 米`) : '',
    typeof value === 'number' ? t(`数值 ${value}`) : '',
    typeof weight === 'number' ? t(`权重 ${weight}`) : '',
  ].filter(Boolean)
  element('selection-detail').textContent = selectedEntity
    ? [t(selectedEntity.type), ...attributes, position ? `${position.longitude.toFixed(5)}, ${position.latitude.toFixed(5)}` : ''].filter(Boolean).join(' · ')
    : t('添加标记或点击对象，把它交给聊天分析。')
  button('ask').disabled = !selectedEntity || busy || !connected || !app.getHostCapabilities()?.message
  const properties = element('selection-properties')
  properties.replaceChildren()
  properties.hidden = selectedEntity?.type !== 'vector-tile'
  if (!properties.hidden) {
    for (const [key, value] of Object.entries(selectedEntity?.properties ?? {})) {
      const label = document.createElement('dt')
      const content = document.createElement('dd')
      label.textContent = key
      content.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value)
      properties.append(label, content)
    }
  }
  if (publish) publishContext()
}

function updateViewCaption() {
  if (!bridge) return
  const view = bridge.getView()
  const place = places.find(item => Math.abs(item.longitude - view.longitude) < .25 && Math.abs(item.latitude - view.latitude) < .25)
  element('view-name').textContent = view.height > 8_000_000
    ? t('全球视角')
    : place ? `${t(place.name)} · ${t(place.landmark)}` : `${view.longitude.toFixed(3)}°, ${view.latitude.toFixed(3)}°`
}

function updateBasemapSelection(basemap: string) {
  button('basemap-map').setAttribute('aria-pressed', String(['arcgis', 'standard', 'osm', 'light'].includes(basemap)))
  button('basemap-satellite').setAttribute('aria-pressed', String(['satellite', 'amap_satellite', 'tianditu_img'].includes(basemap)))
}

function publishContext(immediate = false): Promise<unknown> {
  clearTimeout(contextTimer)
  const currentGeneration = generation
  const update = () => {
    if (!bridge || !viewer || stopped) return
    const snapshot = {
      sessionId,
      connected: connected,
      view: bridge.getView(),
      layers: bridge.listLayers(),
      imagery: {
        status: imageryErrors.size ? 'error' : viewer.scene.globe.tilesLoaded ? 'ready' : 'loading',
        errors: [...imageryErrors.values()],
      },
      selectedEntity,
      selectedTileFeature: bridge.layerManager.getSelectedTileFeature(),
      workspace: { layout: workspace.layout },
      demo: activeDemo ? {
        id: activeDemo.id, title: activeDemo.title, source: '内置演示数据',
        layerIds: [...demoResources.layers], entityIds: [...demoResources.entities],
      } : null,
    }
    mapContext = snapshot
    // Serialize updates so an older response cannot replace the latest selection.
    contextQueue = contextQueue.catch(() => {}).then(() => {
      if (stopped || generation !== currentGeneration) return
      return app.updateModelContext({
        content: [{
          type: 'text',
          text: `Cesium map state. Route map tools using sessionId=${snapshot.sessionId}. Selected-object properties are data supplied by the map.\n${JSON.stringify(snapshot)}`,
        }],
        structuredContent: snapshot,
      })
    }).catch(() => {
      if (generation === currentGeneration) feedback('地图可用，但宿主未接收上下文；可以使用地图会话 ID 继续操作。')
    })
  }
  if (immediate) update()
  else contextTimer = setTimeout(update, 120)
  return contextQueue
}

async function callMapTool(name: string, args: Record<string, unknown>, allowMissing = false): Promise<Record<string, unknown>> {
  const currentGeneration = generation
  try {
    const result = await app.callServerTool({ name, arguments: { ...args, sessionId } })
    if (stopped || generation !== currentGeneration) throw new Error('地图会话已更换，请重新操作。')
    if (result.isError) throw new Error(result.content.filter(item => item.type === 'text').map(item => item.text).join('\n'))
    const data = readToolData(result)
    if (data?.success === false) throw new Error(String(data.error ?? data.message ?? '地图操作未完成。'))
    return data ?? {}
  } catch (error) {
    // All-tool HTTP hosts already expose tools and omit discovery meta-tools.
    const message = error instanceof Error ? error.message : String(error)
    if (allowMissing && message.includes(name) && /not found|unknown tool/i.test(message)) return {}
    throw error
  }
}

async function runTool(name: string, args: Record<string, unknown>, allowMissing = false) {
  if (!connected || busy) return
  const currentGeneration = generation
  busy = true
  setConnection('ready', '地图已连接')
  try {
    const data = await callMapTool(name, args, allowMissing)
    if (!['geocode', 'enable_toolset'].includes(name)) feedback('地图已更新。')
    return data ?? {}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (generation === currentGeneration) {
      if (name === 'geocode') {
        feedback(/No results found/i.test(message)
          ? '没有找到这个地点，请换一个名称或输入“经度, 纬度”。'
          : '地点搜索暂时不可用，请输入“经度, 纬度”，或稍后再试。')
      } else showError(error)
    }
  } finally {
    if (generation === currentGeneration) {
      busy = false
      setConnection(connected ? 'ready' : 'error', connected ? '地图已连接' : '连接已断开')
    }
  }
}

function dispose() {
  generation += 1
  stopped = true
  clearTimeout(contextTimer)
  removeSelectionListener?.()
  removeCameraListener?.()
  removeTileListener?.()
  removeImageryListener?.()
  removeImageryRemovalListener?.()
  for (const remove of imageryListeners.values()) remove()
  imageryListeners.clear()
  imageryErrors.clear()
  const token = connectionToken
  connectionToken = undefined
  connected = false
  if (token) void app.callServerTool({ name: 'disconnectCesiumMap', arguments: { sessionId, token } }).catch(() => {})
  bridge?.dispose()
  if (viewer && !viewer.isDestroyed()) viewer.destroy()
  viewer = undefined
  bridge = undefined
  busy = false
  basemapLoading = false
  activeDemo = undefined
  displayedDemo = undefined
  demoResources = { layers: [], entities: [] }
  mapContext = {}
  workspace = initialWorkspace
  renderWorkspace()
  element('demo-panel').hidden = true
}

async function openMap(input: unknown) {
  if (!input || typeof input !== 'object') return
  const data = input as Record<string, unknown>
  if (typeof data.sessionId !== 'string') return
  if (viewer && connected && data.sessionId === sessionId) return
  dispose()
  const currentGeneration = generation
  stopped = false
  applyHostPresentation()
  selectedEntity = null
  sessionId = data.sessionId
  element('session').textContent = sessionId
  element('map-error').hidden = true
  mapErrorText = ''
  if (window.origin === 'null') throw new Error('Cesium 需要支持 Worker 的独立来源沙盒。请由宿主提供稳定的 UI 来源，或使用仓库的本地预览。')
  const baseLayer = new ImageryLayer(await TileMapServiceImageryProvider.fromUrl(
    buildModuleUrl('Assets/Textures/NaturalEarthII'),
  ).catch(error => { throw new Error(`默认底图加载失败：${error instanceof Error ? error.message : String(error)}`) }))
  if (stopped || generation !== currentGeneration) return
  viewer = new Viewer('globe', {
    baseLayer,
    terrainProvider: new EllipsoidTerrainProvider(),
    animation: false,
    timeline: false,
    geocoder: false,
    baseLayerPicker: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    // The object panel provides selection feedback without Knockout bindings.
    selectionIndicator: false,
    requestRenderMode: true,
  })
  viewer.scene.globe.depthTestAgainstTerrain = false
  viewer.scene.renderError.addEventListener((_scene, error) => {
    setConnection('error', '地图渲染失败')
    showError(error)
  })
  bridge = new CesiumBridge(viewer)
  bridge.setView({ longitude: places[0].longitude, latitude: places[0].latitude, height: 12_000, pitch: -90 })
  updateViewCaption()
  updateSelection(undefined)
  removeSelectionListener = viewer.selectedEntityChanged.addEventListener(updateSelection)
  bridge.on('tileFeatureSelected', () => {
    if (!viewer || !bridge) return
    const tile = bridge.layerManager.getSelectedTileFeature()
    if (tile) {
      viewer.selectedEntity = undefined
      updateSelection(undefined)
    } else {
      updateSelection(viewer.selectedEntity)
    }
  })
  removeCameraListener = viewer.camera.moveEnd.addEventListener(() => { updateViewCaption(); void publishContext() })
  const watchImagery = (layer: ImageryLayer) => {
    const provider = layer.imageryProvider
    if (!provider) return
    imageryListeners.set(layer, provider.errorEvent.addEventListener(() => {
      const message = '底图瓦片加载失败。请检查宿主允许的来源、网络连接和服务授权。'
      imageryErrors.set(layer, message)
      feedback(message)
      publishContext()
    }))
  }
  watchImagery(baseLayer)
  removeImageryListener = viewer.imageryLayers.layerAdded.addEventListener(watchImagery)
  removeImageryRemovalListener = viewer.imageryLayers.layerRemoved.addEventListener(layer => {
    imageryListeners.get(layer)?.()
    imageryListeners.delete(layer)
    imageryErrors.delete(layer)
  })
  removeTileListener = viewer.scene.globe.tileLoadProgressEvent.addEventListener(remaining => {
    if (basemapLoading && remaining === 0 && viewer?.scene.globe.tilesLoaded) {
      feedback(imageryErrors.size ? '底图瓦片加载失败。请检查网络连接和服务授权。' : '底图已加载。')
      basemapLoading = false
    }
    void publishContext()
  })
  bridge.setBasemap({ basemap: 'satellite' })
  updateBasemapSelection('satellite')

  setConnection('loading', '正在连接地图')
  const connection = await callTransport('connectCesiumMap', { sessionId }).catch(error => {
    throw new Error(`地图会话连接失败：${error instanceof Error ? error.message : String(error)}`)
  })
  const token = String(connection.token)
  if (stopped || generation !== currentGeneration) {
    void app.callServerTool({ name: 'disconnectCesiumMap', arguments: { sessionId: data.sessionId, token } }).catch(() => {})
    return
  }
  connectionToken = token
  connected = true
  setConnection('ready', '地图已连接')
  feedback('可以通过聊天定位、添加图层或修改对象。')
  publishContext()
  void exchangeCommands(currentGeneration, sessionId, token)
}

async function callTransport(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      app.callServerTool({ name, arguments: args }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('地图连接超时。请重新打开地图。')), 10_000)
      }),
    ])
    if (result.isError) throw new Error(result.content.filter(item => item.type === 'text').map(item => item.text).join('\n'))
    return readToolData(result) ?? {}
  } finally {
    clearTimeout(timer)
  }
}

async function exchangeCommands(currentGeneration: number, mapSession: string, token: string) {
  let results: { id: string; result?: unknown; error?: { message: string } }[] = []
  try {
    while (!stopped && generation === currentGeneration) {
      let response: Record<string, unknown>
      try {
        response = await callTransport('exchangeCesiumMap', { sessionId: mapSession, token, results })
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('Map session is not connected;')) throw error
        if (stopped || generation !== currentGeneration) return
        connected = false
        setConnection('loading', '正在恢复地图连接')
        const connection = await callTransport('connectCesiumMap', { sessionId: mapSession })
        token = String(connection.token)
        if (stopped || generation !== currentGeneration) {
          void app.callServerTool({ name: 'disconnectCesiumMap', arguments: { sessionId: mapSession, token } }).catch(() => {})
          return
        }
        connectionToken = token
        results = []
        connected = true
        setConnection('ready', '地图已连接')
        feedback('地图连接已恢复。')
        publishContext()
        continue
      }
      if (stopped || generation !== currentGeneration || !bridge) return
      results = []
      const commands = response.commands as { id: string; method: string; params?: Record<string, unknown> }[]
      for (const command of commands ?? []) {
        try {
          if (!['getView', 'listLayers', 'queryEntities', 'getEntityProperties', 'screenshot'].includes(command.method)) navigateWorkspace('map')
          if (command.method === 'setBasemap') {
            basemapLoading = true
            feedback('底图配置已切换，正在加载瓦片。')
          }
          const result = await bridge.execute({ action: command.method, params: command.params ?? {} })
          if (command.method === 'setBasemap' && result.success) updateBasemapSelection(String(command.params?.basemap))
          if (stopped || generation !== currentGeneration) return
          results.push({ id: command.id, result })
        } catch (error) {
          results.push({ id: command.id, error: { message: error instanceof Error ? error.message : String(error) } })
        }
      }
      if (commands?.length) {
        updateSelection(viewer?.selectedEntity)
        viewer?.scene.requestRender()
      }
    }
  } catch (error) {
    if (stopped || generation !== currentGeneration) return
    connected = false
    setConnection('error', '地图连接已断开')
    showError(error)
    publishContext()
  }
}

const duration = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1.2
button('new-york').onclick = () => { void runTool('flyTo', { longitude: places[0].longitude, latitude: places[0].latitude, height: places[0].height, pitch: -90, duration: duration() }) }
button('world').onclick = () => { void runTool('flyTo', { longitude: 110, latitude: 30, height: 18_000_000, pitch: -90, duration: duration() }) }
button('marker').onclick = async () => {
  const view = bridge?.getView()
  if (!view) return
  const result = await runTool('addMarker', { longitude: view.longitude, latitude: view.latitude, label: element('view-name').textContent ?? '地图标记', color: '#a6d9c9', size: 16 })
  if (viewer && typeof result?.entityId === 'string') viewer.selectedEntity = viewer.entities.getById(result.entityId)
}
button('basemap-map').onclick = () => { void runTool('setBasemap', { basemap: 'arcgis' }) }
button('basemap-satellite').onclick = () => { void runTool('setBasemap', { basemap: 'satellite' }) }
for (const id of ['choropleth', 'buildings', 'heatmap'] as const) {
  button(`demo-${id}`).onclick = () => { void runDemo(id) }
}

async function runDemo(id: DemoId) {
  if (!connected || busy) return
  const currentGeneration = generation
  const owned = demoResources
  const plan = createDemoPlan(id, `demo-${sessionId}`, duration())
  activeDemo = undefined
  displayedDemo = plan
  busy = true
  setConnection('ready', '地图已连接')
  const panel = element('demo-panel')
  panel.hidden = false
  panel.dataset.state = 'loading'
  element('demo-title').textContent = t(plan.title)
  demoState = '正在运行'
  demoSummary = '正在准备场景…'
  renderDemo()
  element('demo-legend').replaceChildren()
  panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' })
  try {
    await removeDemoResources(owned, callMapTool)
    await executeDemoPlan(plan, callMapTool, owned, (label, index, total) => {
      demoSummary = `${label} · ${index}/${total}`
      element('demo-summary').textContent = t(demoSummary)
    }, () => !stopped && generation === currentGeneration)
    activeDemo = plan
    panel.dataset.state = 'ready'
    demoState = '示例已加载'
    demoSummary = plan.summary
    renderDemo()
    feedback('示例已加载。点击地图对象，或交给 Agent 继续分析。')
    void publishContext(true)
  } catch (error) {
    if (generation !== currentGeneration) return
    panel.dataset.state = 'error'
    demoState = '示例未完成'
    demoSummary = error instanceof Error ? error.message : String(error)
    renderDemo()
    feedback('示例未完成，可重新运行或移除已创建的示例对象。')
  } finally {
    if (generation === currentGeneration) {
      busy = false
      setConnection(connected ? 'ready' : 'error', connected ? '地图已连接' : '连接已断开')
    }
  }
}

button('demo-clear').onclick = async () => {
  if (!connected || busy) return
  const currentGeneration = generation
  const owned = demoResources
  busy = true
  setConnection('ready', '地图已连接')
  try {
    await removeDemoResources(owned, callMapTool)
    if (generation !== currentGeneration) return
    activeDemo = undefined
    displayedDemo = undefined
    element('demo-panel').hidden = true
    if (viewer) updateSelection(viewer.selectedEntity)
    feedback('已移除本次示例，其他地图内容保留。')
    void publishContext(true)
  } catch (error) {
    if (generation === currentGeneration) showError(error)
  } finally {
    if (generation === currentGeneration) {
      busy = false
      setConnection(connected ? 'ready' : 'error', connected ? '地图已连接' : '连接已断开')
    }
  }
}

button('demo-ask').onclick = async () => {
  if (!activeDemo || !connected || busy) return
  const currentGeneration = generation
  const plan = activeDemo
  busy = true
  setConnection('ready', '地图已连接')
  try {
    await publishContext(true)
    if (generation !== currentGeneration) return
    await sendToHost(plan.prompt)
    feedback('已把示例与分析请求发送到聊天。')
  } catch (error) {
    if (generation === currentGeneration) showError(error)
  } finally {
    if (generation === currentGeneration) {
      busy = false
      setConnection(connected ? 'ready' : 'error', connected ? '地图已连接' : '连接已断开')
    }
  }
}
function renderDemo() {
  if (!displayedDemo) return
  element('demo-title').textContent = t(displayedDemo.title)
  element('demo-state').textContent = t(demoState)
  element('demo-summary').textContent = t(demoSummary)
  element('demo-legend').replaceChildren()
  for (const item of activeDemo?.legend ?? []) {
    const entry = document.createElement('span')
    const swatch = document.createElement('i')
    swatch.style.background = item.color
    entry.append(swatch, t(item.label))
    element('demo-legend').append(entry)
  }
}

function applyHostPresentation() {
  const context = app.getHostContext()
  const preferences = resolvePresentation(context, navigator.language, matchMedia('(prefers-color-scheme: dark)').matches)
  const changedLocale = locale !== preferences.locale
  locale = preferences.locale
  document.documentElement.lang = locale
  applyDocumentTheme(preferences.theme)
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables)
  if (context?.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts)
  for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-i18n]'))) node.textContent = t(node.dataset.i18n!)
  for (const attribute of ['aria-label', 'title']) {
    for (const node of Array.from(document.querySelectorAll<HTMLElement>(`[data-i18n-${attribute}]`))) {
      node.setAttribute(attribute, t(node.getAttribute(`data-i18n-${attribute}`)!))
    }
  }
  setConnection(connectionState, connectionText)
  feedback(feedbackText)
  if (mapErrorText) element('map-error').textContent = t(mapErrorText)
  renderWorkspace()
  renderDemo()
  updateViewCaption()
  updateSelection(viewer?.selectedEntity, false)
  if (changedLocale && viewer) void publishContext()
  updateHostDimensions()
  requestAnimationFrame(resizeMap)
}

app.onhostcontextchanged = () => {
  applyHostPresentation()
  const mode = app.getHostContext()?.displayMode
  if (mode === 'fullscreen' && workspace.layout !== 'expanded') navigateWorkspace('expand')
  if (mode === 'inline' && workspace.layout === 'expanded' && hostFullscreen) navigateWorkspace('restore')
  hostFullscreen = mode === 'fullscreen'
}
let hostFullscreen = false
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyHostPresentation)
window.addEventListener('languagechange', applyHostPresentation)
applyHostPresentation()

button('ask').onclick = async () => {
  if (!selectedEntity || busy) return
  const selected = selectedEntity
  const currentSession = sessionId
  const currentGeneration = generation
  busy = true
  setConnection('ready', '地图已连接')
  try {
    await publishContext(true)
    if (stopped || generation !== currentGeneration) return
    await sendToHost(selected.type === 'vector-tile'
      ? `请调用 getSelectedTileFeature 读取选中的矢量瓦片要素属性。使用返回的 layerId 调用 updateLayerStyle 的 tileStyle 修改颜色或线宽。当前图层：${selected.entityId}`
      : `请分析选中的 ${t(selected.name ?? selected.entityId)}，通过地图工具读取属性后回答。`, { ...mapContext, sessionId: currentSession, selectedEntity: selected })
    feedback('已把选中对象发送到聊天。')
  } catch (error) {
    if (generation === currentGeneration) showError(error)
  } finally {
    if (generation === currentGeneration) {
      busy = false
      setConnection(connected ? 'ready' : 'error', connected ? '地图已连接' : '连接已断开')
    }
  }
}

app.ontoolresult = result => {
  void openMap(result.structuredContent).catch(error => {
    dispose()
    setConnection('error', '地图未能打开')
    element('map-error').hidden = false
    mapErrorText = error instanceof Error ? error.message : String(error)
    element('map-error').textContent = t(mapErrorText)
  })
}
app.onteardown = async () => { dispose(); return {} }
window.addEventListener('pagehide', dispose)
void app.connect().then(applyHostPresentation).catch(() => {
  setConnection('error', '需要 MCP Apps 宿主')
  feedback('请在支持 MCP Apps 的聊天中调用 openCesiumMap，或打开仓库的本地预览。')
})
