/**
 * cesium-mcp-runtime — MCP Server for Cesium
 *
 * 通过标准 MCP 协议暴露 Cesium 操控工具，
 * 通过 WebSocket 桥接到浏览器中的 cesium-mcp-bridge 执行。
 *
 * 架构：
 *   AI Agent ←→ MCP Server (stdio) ←→ WebSocket ←→ Browser (cesium-mcp-bridge)
 *   Backend  ←→ HTTP POST /api/command  ←→ WebSocket ←→ Browser (cesium-mcp-bridge)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { WebSocketServer, WebSocket, type RawData } from 'ws'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { toolDescriptions as _enToolDesc, paramDescriptions as _enParamDesc } from './locales/en.js'
import { toolDescriptions as _zhToolDesc, paramDescriptions as _zhParamDesc } from './locales/zh-CN.js'

// ==================== WebSocket Bridge ====================

const WS_PORT = parseInt(process.env.CESIUM_WS_PORT ?? '9100')

/** 按 sessionId 管理已连接的浏览器 */
const browserClients = new Map<string, WebSocket>()

/** 等待浏览器响应的 pending requests */
const pendingRequests = new Map<string, {
  resolve: (result: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}>()

let requestIdCounter = 0

const DEFAULT_SESSION_ID = process.env.DEFAULT_SESSION_ID ?? 'default'

function getDefaultBrowser(): WebSocket | null {
  if (browserClients.size === 0) return null
  // 优先返回绑定的 session 连接
  const preferred = browserClients.get(DEFAULT_SESSION_ID)
  if (preferred && preferred.readyState === WebSocket.OPEN) return preferred
  // fallback: 返回第一个可用连接
  return browserClients.values().next().value ?? null
}

function sendToBrowser(action: string, params: Record<string, unknown>, timeoutMs = 30000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = getDefaultBrowser()
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('无浏览器连接。请先在浏览器中打开 GeoAgent 并连接 WebSocket。'))
      return
    }

    const reqId = `req_${++requestIdCounter}`
    const timer = setTimeout(() => {
      pendingRequests.delete(reqId)
      reject(new Error(`浏览器响应超时（${timeoutMs}ms）`))
    }, timeoutMs)

    pendingRequests.set(reqId, { resolve, reject, timer })

    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: reqId,
      method: action,
      params,
    }))
  })
}

/** 将命令推送到指定 session 的浏览器（fire-and-forget，不等待响应） */
function pushToBrowser(sessionId: string, command: { action: string; params: Record<string, unknown> }): boolean {
  const ws = browserClients.get(sessionId) ?? getDefaultBrowser()
  if (!ws || ws.readyState !== WebSocket.OPEN) return false
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: `push_${++requestIdCounter}`,
    method: command.action,
    params: command.params,
  }))
  return true
}

/** HTTP 请求处理：POST /api/command */
function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url?.startsWith('/api/command')) {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        const sessionId: string = payload.sessionId ?? 'default'
        const commands: Array<{ action: string; params: Record<string, unknown> }> =
          Array.isArray(payload.commands) ? payload.commands : [payload.command]

        let sent = 0
        for (const cmd of commands) {
          if (cmd && pushToBrowser(sessionId, cmd)) sent++
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, sent, total: commands.length }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
      }
    })
    return
  }

  // GET /api/status — 连接状态
  if (req.method === 'GET' && req.url?.startsWith('/api/status')) {
    const sessions = Array.from(browserClients.keys())
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, sessions, connections: sessions.length }))
    return
  }

  res.writeHead(404)
  res.end('Not Found')
}

function startServer() {
  const httpServer = createServer(handleHttpRequest)
  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const sessionId = new URL(req.url ?? '/', `http://localhost`).searchParams.get('session') ?? 'default'
    console.error(`[ws] 浏览器连接: session=${sessionId}`)
    browserClients.set(sessionId, ws)

    ws.on('message', (raw: RawData) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.id && pendingRequests.has(msg.id)) {
          const pending = pendingRequests.get(msg.id)!
          pendingRequests.delete(msg.id)
          clearTimeout(pending.timer)
          if (msg.error) {
            pending.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
          } else {
            pending.resolve(msg.result)
          }
        }
      } catch { /* ignore parse errors */ }
    })

    ws.on('close', () => {
      console.error(`[ws] 浏览器断开: session=${sessionId}`)
      browserClients.delete(sessionId)
    })
  })

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[cesium-mcp-runtime] Port ${WS_PORT} already in use, WebSocket server disabled`)
    } else {
      console.error(`[cesium-mcp-runtime] HTTP server error:`, err.message)
    }
  })

  httpServer.listen(WS_PORT, () => {
    console.error(`[cesium-mcp-runtime] HTTP + WebSocket server on http://localhost:${WS_PORT}`)
    console.error(`[cesium-mcp-runtime] POST /api/command — 推送地图命令`)
    console.error(`[cesium-mcp-runtime] GET  /api/status  — 连接状态`)
  })
}

// ==================== MCP Server ====================

const server = new McpServer({
  name: 'cesium-mcp-runtime',
  version: '1.139.7',
  title: 'Cesium MCP Runtime',
  description: 'AI-powered 3D globe control via MCP — camera, layers, entities, animation, and interaction with CesiumJS.',
  websiteUrl: 'https://github.com/gaopengbin/cesium-mcp',
}, {
  instructions: 'Cesium MCP Runtime provides tools for controlling a CesiumJS 3D globe via AI. A browser with cesium-mcp-bridge must be connected via WebSocket for command execution. Use view tools (flyTo, setView) to navigate, entity tools to add markers/polygons/models, layer tools to manage GeoJSON/3D Tiles, and animation tools for time-based animations.',
})

// ==================== Resources ====================

server.resource(
  'camera',
  'cesium://scene/camera',
  { description: '当前相机状态（经纬度、高度、角度）', mimeType: 'application/json' },
  async () => {
    try {
      const result = await sendToBrowser('getView', {})
      return { contents: [{ uri: 'cesium://scene/camera', text: JSON.stringify(result), mimeType: 'application/json' }] }
    } catch {
      return { contents: [{ uri: 'cesium://scene/camera', text: '{"error":"no browser connected"}', mimeType: 'application/json' }] }
    }
  },
)

server.resource(
  'layers',
  'cesium://scene/layers',
  { description: '当前已加载的图层列表（ID、名称、类型、可见性）', mimeType: 'application/json' },
  async () => {
    try {
      const result = await sendToBrowser('listLayers', {})
      return { contents: [{ uri: 'cesium://scene/layers', text: JSON.stringify(result), mimeType: 'application/json' }] }
    } catch {
      return { contents: [{ uri: 'cesium://scene/layers', text: '{"error":"no browser connected"}', mimeType: 'application/json' }] }
    }
  },
)

// ==================== Toolsets (工具分组管理) ====================

const TOOLSETS: Record<string, string[]> = {
  view: ['flyTo', 'setView', 'getView', 'zoomToExtent', 'saveViewpoint', 'loadViewpoint', 'listViewpoints'],
  entity: ['addMarker', 'addLabel', 'addModel', 'addPolygon', 'addPolyline', 'updateEntity', 'removeEntity', 'batchAddEntities', 'queryEntities'],
  layer: ['addGeoJsonLayer', 'listLayers', 'removeLayer', 'setLayerVisibility', 'updateLayerStyle', 'setBasemap'],
  camera: ['lookAtTransform', 'startOrbit', 'stopOrbit', 'setCameraOptions'],
  'entity-ext': ['addBillboard', 'addBox', 'addCorridor', 'addCylinder', 'addEllipse', 'addRectangle', 'addWall'],
  animation: ['createAnimation', 'controlAnimation', 'removeAnimation', 'listAnimations', 'updateAnimationPath', 'trackEntity', 'controlClock', 'setGlobeLighting'],
  tiles: ['load3dTiles', 'loadTerrain', 'loadImageryService'],
  interaction: ['screenshot', 'highlight'],
  trajectory: ['playTrajectory'],
  heatmap: ['addHeatmap'],
  geolocation: ['geocode'],
}

const TOOLSET_DESCRIPTIONS: Record<string, string> = {
  view: 'Camera view controls (flyTo, setView, getView, zoomToExtent) and viewpoint bookmarks (save, load, list)',
  entity: 'Core entity operations (marker, label, model, polygon, polyline, update, remove) plus batch add and query',
  layer: 'Layer management (GeoJSON, list, remove, visibility, style, basemap)',
  camera: 'Advanced camera controls (lookAt, orbit, camera options)',
  'entity-ext': 'Extended entity types (billboard, box, corridor, cylinder, ellipse, rectangle, wall)',
  animation: 'Animation system (create/control animations, track entities, clock, lighting)',
  tiles: '3D Tiles, terrain, and imagery services',
  interaction: 'User interaction (screenshot, highlight)',
  trajectory: 'Trajectory playback',
  heatmap: 'Heatmap visualization',
  geolocation: 'Geocoding — convert address/place name to coordinates (Nominatim/OSM)',
}

const DEFAULT_TOOLSETS = ['view', 'entity', 'layer', 'interaction']

const _tsEnv = process.env.CESIUM_TOOLSETS?.trim()
const _allMode = _tsEnv === 'all'
const _enabledSets = new Set<string>(
  _allMode
    ? Object.keys(TOOLSETS)
    : _tsEnv
      ? _tsEnv.split(',').map(s => s.trim()).filter(s => s in TOOLSETS)
      : DEFAULT_TOOLSETS,
)

const _enabledTools = new Set<string>()
for (const setName of _enabledSets) {
  for (const tool of TOOLSETS[setName]!) {
    _enabledTools.add(tool)
  }
}

// Store all tool definitions for lazy registration (Dynamic Discovery)
const _toolDefs = new Map<string, unknown[]>()

// i18n: select locale based on CESIUM_LOCALE env var (default: en)
const _localeKey = process.env.CESIUM_LOCALE?.trim().toLowerCase()
const _toolDesc = _localeKey === 'zh-cn' ? _zhToolDesc : _enToolDesc
const _paramDesc = _localeKey === 'zh-cn' ? _zhParamDesc : _enParamDesc

/** Register tool only if it belongs to an enabled toolset */
const _registerTool = ((...args: unknown[]) => {
  const name = args[0] as string
  // Apply locale overrides for tool description + param descriptions
  if (_toolDesc[name]) args[1] = _toolDesc[name]
  const paramOverrides = _paramDesc[name]
  if (paramOverrides && typeof args[2] === 'object' && args[2] !== null) {
    const schema = args[2] as Record<string, z.ZodTypeAny>
    for (const [key, desc] of Object.entries(paramOverrides)) {
      if (schema[key]) schema[key] = schema[key].describe(desc)
    }
  }
  _toolDefs.set(name, args)
  if (_enabledTools.has(name)) {
    ;(server.tool as Function).apply(server, args)
  }
}) as typeof server.tool

/** Dynamically enable a toolset — registers its tools lazily */
function _enableToolset(setName: string): string[] {
  const tools = TOOLSETS[setName]
  if (!tools) return []
  const added: string[] = []
  for (const toolName of tools) {
    if (!_enabledTools.has(toolName)) {
      _enabledTools.add(toolName)
      const def = _toolDefs.get(toolName)
      if (def) {
        ;(server.tool as Function).apply(server, def)
        added.push(toolName)
      }
    }
  }
  _enabledSets.add(setName)
  return added
}

// ==================== Tools ====================

// — flyTo
_registerTool(
  'flyTo',
  '飞行到指定经纬度位置（带动画过渡）',
  {
    longitude: z.number().describe('经度（-180 ~ 180）'),
    latitude: z.number().describe('纬度（-90 ~ 90）'),
    height: z.number().default(50000).describe('相机高度（米），默认 50000'),
    heading: z.number().default(0).describe('航向角（度），0 为正北'),
    pitch: z.number().default(-45).describe('俯仰角（度），-90 为正下方'),
    duration: z.number().default(2).describe('飞行动画时长（秒）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Fly To Location' },
  async (params) => {
    const result = await sendToBrowser('flyTo', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addGeoJsonLayer
_registerTool(
  'addGeoJsonLayer',
  '添加 GeoJSON 图层到地图（支持 Point/Line/Polygon，可配置颜色/分级/分类渲染）。data 和 url 二选一',
  {
    id: z.string().optional().describe('图层ID（不传则自动生成）'),
    name: z.string().optional().describe('图层显示名称'),
    data: z.record(z.unknown()).optional().describe('GeoJSON FeatureCollection 对象（与 url 二选一）'),
    url: z.string().optional().describe('GeoJSON 文件 URL（与 data 二选一，浏览器端 fetch 加载）'),
    style: z.record(z.unknown()).optional().describe('样式配置（color, opacity, pointSize, choropleth, category）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add GeoJSON Layer' },
  async (params) => {
    const result = await sendToBrowser('addGeoJsonLayer', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addLabel
_registerTool(
  'addLabel',
  '为 GeoJSON 要素添加文本标注（显示属性值）',
  {
    data: z.record(z.unknown()).describe('GeoJSON FeatureCollection 对象'),
    field: z.string().describe('用作标注文本的属性字段名（如 "name"、"population"）'),
    style: z.record(z.unknown()).optional().describe('标注样式（font, fillColor, outlineColor, scale 等）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Label' },
  async (params) => {
    const result = await sendToBrowser('addLabel', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addHeatmap
_registerTool(
  'addHeatmap',
  '添加热力图图层（基于 GeoJSON 点数据生成热力可视化）',
  {
    data: z.record(z.unknown()).describe('GeoJSON Point FeatureCollection'),
    radius: z.number().default(30).describe('热力影响半径（像素）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Heatmap' },
  async (params) => {
    const result = await sendToBrowser('addHeatmap', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — removeLayer
_registerTool(
  'removeLayer',
  '从地图上移除指定图层（按图层ID）',
  { id: z.string().describe('要移除的图层ID（可通过 listLayers 获取）') },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: 'Remove Layer' },
  async (params) => {
    const result = await sendToBrowser('removeLayer', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — setBasemap
_registerTool(
  'setBasemap',
  '切换底图风格（暗色/卫星影像/标准）',
  { basemap: z.enum(['dark', 'satellite', 'standard']).describe('底图类型：dark=暗色, satellite=卫星影像, standard=标准') },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Set Basemap' },
  async (params) => {
    const result = await sendToBrowser('setBasemap', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — screenshot
_registerTool(
  'screenshot',
  '截取当前地图视图（返回 base64 PNG）',
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Screenshot' },
  async () => {
    const result = await sendToBrowser('screenshot', {})
    const data = result as { dataUrl?: string } | null
    if (data?.dataUrl) {
      return { content: [{ type: 'image' as const, data: data.dataUrl.replace(/^data:image\/\w+;base64,/, ''), mimeType: 'image/png' }] }
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — highlight
_registerTool(
  'highlight',
  '高亮指定图层的要素',
  {
    layerId: z.string().describe('图层ID'),
    featureIndex: z.number().optional().describe('要素索引（不传则高亮全部）'),
    color: z.string().default('#FFFF00').describe('高亮颜色（CSS 格式）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Highlight' },
  async (params) => {
    const result = await sendToBrowser('highlight', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — setView
_registerTool(
  'setView',
  '瞬间切换到指定经纬度视角（无动画）',
  {
    longitude: z.number().describe('经度（-180 ~ 180）'),
    latitude: z.number().describe('纬度（-90 ~ 90）'),
    height: z.number().optional().default(50000).describe('高度（米）'),
    heading: z.number().optional().default(0).describe('航向角（度）'),
    pitch: z.number().optional().default(-90).describe('俯仰角（度）'),
    roll: z.number().optional().default(0).describe('翻滚角（度）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Set View' },
  async (params) => {
    const result = await sendToBrowser('setView', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — getView
_registerTool(
  'getView',
  '获取当前相机视角信息（经纬度、高度、角度）',
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Get View' },
  async () => {
    const result = await sendToBrowser('getView', {})
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  },
)

// — zoomToExtent
_registerTool(
  'zoomToExtent',
  '缩放到指定地理范围',
  {
    west: z.number().describe('西边界经度（度）'),
    south: z.number().describe('南边界纬度（度）'),
    east: z.number().describe('东边界经度（度）'),
    north: z.number().describe('北边界纬度（度）'),
    duration: z.number().optional().default(2).describe('动画时长（秒）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Zoom to Extent' },
  async (params) => {
    const result = await sendToBrowser('zoomToExtent', { bbox: [params.west, params.south, params.east, params.north], duration: params.duration })
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addMarker
_registerTool(
  'addMarker',
  '在指定经纬度添加标注点，返回 layerId 供后续操作',
  {
    longitude: z.number().describe('经度（-180 ~ 180）'),
    latitude: z.number().describe('纬度（-90 ~ 90）'),
    label: z.string().optional().describe('标注文本'),
    color: z.string().optional().default('#3B82F6').describe('标注颜色（CSS 格式）'),
    size: z.number().optional().default(12).describe('点大小（像素）'),
    id: z.string().optional().describe('自定义图层ID（不传则自动生成）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Marker' },
  async (params) => {
    const result = await sendToBrowser('addMarker', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addPolyline
_registerTool(
  'addPolyline',
  '在地图上添加折线（路径、线段），返回 entityId',
  {
    coordinates: z.array(z.array(z.number())).describe('折线坐标数组 [[lon, lat, height?], ...]'),
    color: z.string().optional().default('#3B82F6').describe('线条颜色（CSS 格式）'),
    width: z.number().optional().default(3).describe('线条宽度（像素）'),
    clampToGround: z.boolean().optional().default(true).describe('是否贴地'),
    label: z.string().optional().describe('折线标注文本'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Polyline' },
  async (params) => {
    const result = await sendToBrowser('addPolyline', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addPolygon
_registerTool(
  'addPolygon',
  '在地图上添加多边形区域（面积、边界），返回 entityId',
  {
    coordinates: z.array(z.array(z.number())).describe('多边形外环坐标 [[lon, lat, height?], ...]'),
    color: z.string().optional().default('#3B82F6').describe('填充颜色（CSS 格式）'),
    outlineColor: z.string().optional().default('#FFFFFF').describe('描边颜色'),
    opacity: z.number().optional().default(0.6).describe('填充透明度（0~1）'),
    extrudedHeight: z.number().optional().describe('拉伸高度（米），可用于创建立体效果'),
    clampToGround: z.boolean().optional().default(true).describe('是否贴地'),
    label: z.string().optional().describe('多边形标注文本'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Polygon' },
  async (params) => {
    const result = await sendToBrowser('addPolygon', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addModel
_registerTool(
  'addModel',
  '在指定经纬度放置 3D 模型（glTF/GLB），返回 entityId',
  {
    longitude: z.number().describe('经度（-180 ~ 180）'),
    latitude: z.number().describe('纬度（-90 ~ 90）'),
    height: z.number().optional().default(0).describe('放置高度（米）'),
    url: z.string().describe('glTF/GLB 模型文件 URL'),
    scale: z.number().optional().default(1).describe('模型缩放比例'),
    heading: z.number().optional().default(0).describe('航向角（度），0=正北'),
    pitch: z.number().optional().default(0).describe('俯仰角（度）'),
    roll: z.number().optional().default(0).describe('翻滚角（度）'),
    label: z.string().optional().describe('模型标注文本'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Model' },
  async (params) => {
    const result = await sendToBrowser('addModel', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — updateEntity
_registerTool(
  'updateEntity',
  '更新已有实体的属性（位置、颜色、标签、缩放、可见性）',
  {
    entityId: z.string().describe('实体ID（addMarker/addPolyline 等返回的 entityId）'),
    position: z.object({
      longitude: z.number().describe('经度（-180 ~ 180）'),
      latitude: z.number().describe('纬度（-90 ~ 90）'),
      height: z.number().optional().describe('高度（米）'),
    }).optional().describe('新位置坐标'),
    label: z.string().optional().describe('新标注文本'),
    color: z.string().optional().describe('新颜色（CSS 格式）'),
    scale: z.number().optional().describe('新缩放比例'),
    show: z.boolean().optional().describe('是否显示'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Update Entity' },
  async (params) => {
    const result = await sendToBrowser('updateEntity', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — removeEntity
_registerTool(
  'removeEntity',
  '移除单个实体（通过 entityId）',
  {
    entityId: z.string().describe('要移除的实体ID'),
  },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: 'Remove Entity' },
  async (params) => {
    const result = await sendToBrowser('removeEntity', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — batchAddEntities
_registerTool(
  'batchAddEntities',
  '批量添加多个实体（一次调用创建多个 marker/polyline/polygon/model 等），返回所有 entityId',
  {
    entities: z.array(z.object({
      type: z.enum(['marker', 'polyline', 'polygon', 'model', 'billboard', 'box', 'cylinder', 'ellipse', 'rectangle', 'wall', 'corridor']).describe('实体类型'),
    }).passthrough()).describe('实体定义数组，每个元素包含 type 字段和该类型所需的参数'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Batch Add Entities' },
  async (params) => {
    const result = await sendToBrowser('batchAddEntities', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — queryEntities
_registerTool(
  'queryEntities',
  '查询已有实体 — 按名称、类型、空间范围过滤，返回 entityId/name/type/position 列表',
  {
    name: z.string().optional().describe('名称模糊匹配（不区分大小写）'),
    type: z.enum(['marker', 'polyline', 'polygon', 'model', 'billboard', 'box', 'cylinder', 'ellipse', 'rectangle', 'wall', 'corridor', 'label', 'unknown']).optional().describe('按实体类型过滤'),
    bbox: z.array(z.number()).length(4).optional().describe('空间范围过滤 [west, south, east, north]（度）'),
  },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Query Entities' },
  async (params) => {
    const result = await sendToBrowser('queryEntities', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — saveViewpoint
_registerTool(
  'saveViewpoint',
  '保存当前视角为书签（名称 → 视角状态），可通过 loadViewpoint 恢复',
  {
    name: z.string().describe('书签名称（唯一标识，重复则覆盖）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Save Viewpoint' },
  async (params) => {
    const result = await sendToBrowser('saveViewpoint', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — loadViewpoint
_registerTool(
  'loadViewpoint',
  '恢复已保存的视角书签（带飞行动画），返回保存的视角状态',
  {
    name: z.string().describe('书签名称'),
    duration: z.number().optional().default(2).describe('飞行动画时长（秒），0 表示瞬移'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Load Viewpoint' },
  async (params) => {
    const result = await sendToBrowser('loadViewpoint', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — listViewpoints
_registerTool(
  'listViewpoints',
  '列出所有已保存的视角书签',
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'List Viewpoints' },
  async () => {
    const result = await sendToBrowser('listViewpoints', {})
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — setLayerVisibility
_registerTool(
  'setLayerVisibility',
  '设置图层可见性',
  {
    id: z.string().describe('图层ID'),
    visible: z.boolean().describe('是否可见'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Set Layer Visibility' },
  async (params) => {
    const result = await sendToBrowser('setLayerVisibility', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — listLayers
_registerTool(
  'listLayers',
  '获取当前所有图层列表（含 ID、名称、类型、可见性）',
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'List Layers' },
  async () => {
    const result = await sendToBrowser('listLayers', {})
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  },
)

// — updateLayerStyle
_registerTool(
  'updateLayerStyle',
  '修改已有图层的样式（颜色、透明度、标注样式等）',
  {
    layerId: z.string().describe('图层ID'),
    labelStyle: z.record(z.unknown()).optional().describe('标注样式（font, fillColor, outlineColor, outlineWidth, scale 等）'),
    layerStyle: z.record(z.unknown()).optional().describe('图层样式（color, opacity, strokeWidth, pointSize）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Update Layer Style' },
  async (params) => {
    const result = await sendToBrowser('updateLayerStyle', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — playTrajectory
_registerTool(
  'playTrajectory',
  '播放移动轨迹动画',
  {
    id: z.string().optional().describe('轨迹图层ID'),
    name: z.string().optional().describe('轨迹名称'),
    coordinates: z.array(z.array(z.number())).describe('轨迹坐标数组 [[lon, lat, alt?], ...]'),
    durationSeconds: z.number().optional().default(10).describe('动画时长（秒）'),
    trailSeconds: z.number().optional().default(2).describe('尾迹长度（秒）'),
    label: z.string().optional().describe('移动体标签'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Play Trajectory' },
  async (params) => {
    const result = await sendToBrowser('playTrajectory', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — load3dTiles
_registerTool(
  'load3dTiles',
  '加载 3D Tiles 数据集（如建筑白膜、城市模型）',
  {
    id: z.string().optional().describe('图层ID'),
    name: z.string().optional().describe('图层名称'),
    url: z.string().describe('tileset.json 的 URL'),
    maximumScreenSpaceError: z.number().optional().default(16).describe('最大屏幕空间误差（值越小越精细）'),
    heightOffset: z.number().optional().describe('高度偏移（米）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Load 3D Tiles' },
  async (params) => {
    const result = await sendToBrowser('load3dTiles', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — loadTerrain
_registerTool(
  'loadTerrain',
  '加载或切换地形（平坦/ArcGIS/CesiumIon/自定义 URL）',
  {
    provider: z.enum(['flat', 'arcgis', 'cesiumion']).describe('地形提供者类型'),
    url: z.string().optional().describe('自定义地形服务 URL'),
    cesiumIonAssetId: z.number().optional().describe('Cesium Ion 资产ID（provider=cesiumion 时需要）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Load Terrain' },
  async (params) => {
    const result = await sendToBrowser('loadTerrain', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — loadImageryService
_registerTool(
  'loadImageryService',
  '加载影像服务图层（WMS/WMTS/XYZ/ArcGIS MapServer）',
  {
    id: z.string().optional().describe('图层ID'),
    name: z.string().optional().describe('图层名称'),
    url: z.string().describe('影像服务 URL'),
    serviceType: z.enum(['wms', 'wmts', 'xyz', 'arcgis_mapserver']).describe('服务类型'),
    layerName: z.string().optional().describe('WMS/WMTS 图层名'),
    opacity: z.number().optional().default(1.0).describe('透明度（0~1）'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Load Imagery Service' },
  async (params) => {
    const result = await sendToBrowser('loadImageryService', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// ==================== Camera Tools (融合官方 Camera Server) ====================

// — lookAtTransform
_registerTool(
  'lookAtTransform',
  'Look at a specific position from a given heading/pitch/range (orbit-style camera)',
  {
    longitude: z.number().describe('Target longitude (degrees)'),
    latitude: z.number().describe('Target latitude (degrees)'),
    height: z.number().optional().default(0).describe('Target height (meters)'),
    heading: z.number().optional().default(0).describe('Camera heading (degrees), 0=North'),
    pitch: z.number().optional().default(-45).describe('Camera pitch (degrees), -90=straight down'),
    range: z.number().optional().default(1000).describe('Distance from target (meters)'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Look At Transform' },
  async (params) => {
    const result = await sendToBrowser('lookAtTransform', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — startOrbit
_registerTool(
  'startOrbit',
  'Start orbiting the camera around the current view center',
  {
    speed: z.number().optional().default(0.005).describe('Rotation speed (radians per tick)'),
    clockwise: z.boolean().optional().default(true).describe('Orbit direction'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Start Orbit' },
  async (params) => {
    const result = await sendToBrowser('startOrbit', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — stopOrbit
_registerTool(
  'stopOrbit',
  'Stop the camera orbit animation',
  {},
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Stop Orbit' },
  async () => {
    const result = await sendToBrowser('stopOrbit', {})
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — setCameraOptions
_registerTool(
  'setCameraOptions',
  'Configure camera controller options (enable/disable rotation, zoom, tilt, etc.)',
  {
    enableRotate: z.boolean().optional().describe('Enable camera rotation'),
    enableTranslate: z.boolean().optional().describe('Enable camera translation'),
    enableZoom: z.boolean().optional().describe('Enable camera zoom'),
    enableTilt: z.boolean().optional().describe('Enable camera tilt'),
    enableLook: z.boolean().optional().describe('Enable camera look'),
    minimumZoomDistance: z.number().optional().describe('Minimum zoom distance (meters)'),
    maximumZoomDistance: z.number().optional().describe('Maximum zoom distance (meters)'),
    enableInputs: z.boolean().optional().describe('Enable/disable all camera inputs'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Set Camera Options' },
  async (params) => {
    const result = await sendToBrowser('setCameraOptions', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// ==================== Entity Type Tools (融合官方 Entity Server) ====================

const colorSchema = z.union([
  z.string().describe('CSS color string (e.g. "#FF0000", "red")'),
  z.object({ red: z.number().describe('Red channel (0-1)'), green: z.number().describe('Green channel (0-1)'), blue: z.number().describe('Blue channel (0-1)'), alpha: z.number().optional().describe('Alpha channel (0-1)') }).describe('RGBA color object'),
]).optional()

const materialSchema = z.union([
  z.string().describe('CSS color string'),
  z.object({ red: z.number().describe('Red (0-1)'), green: z.number().describe('Green (0-1)'), blue: z.number().describe('Blue (0-1)'), alpha: z.number().optional().describe('Alpha (0-1)') }).describe('RGBA color'),
  z.object({
    type: z.enum(['color', 'image', 'checkerboard', 'stripe', 'grid']).describe('Material type'),
    color: z.union([z.string(), z.object({ red: z.number().describe('Red (0-1)'), green: z.number().describe('Green (0-1)'), blue: z.number().describe('Blue (0-1)'), alpha: z.number().optional().describe('Alpha (0-1)') })]).optional().describe('Base color'),
    image: z.string().optional().describe('Image URL'),
    evenColor: z.union([z.string(), z.object({ red: z.number().describe('Red (0-1)'), green: z.number().describe('Green (0-1)'), blue: z.number().describe('Blue (0-1)'), alpha: z.number().optional().describe('Alpha (0-1)') })]).optional().describe('Even color for checkerboard/stripe'),
    oddColor: z.union([z.string(), z.object({ red: z.number().describe('Red (0-1)'), green: z.number().describe('Green (0-1)'), blue: z.number().describe('Blue (0-1)'), alpha: z.number().optional().describe('Alpha (0-1)') })]).optional().describe('Odd color for checkerboard/stripe'),
    orientation: z.enum(['horizontal', 'vertical']).optional().describe('Stripe orientation'),
    cellAlpha: z.number().optional().describe('Cell alpha for grid material'),
  }).describe('Complex material specification'),
]).optional()

const orientationSchema = z.object({
  heading: z.number().describe('Heading (degrees)'),
  pitch: z.number().describe('Pitch (degrees)'),
  roll: z.number().describe('Roll (degrees)'),
}).optional()

const positionDegreesSchema = z.object({
  longitude: z.number().describe('Longitude (degrees)'),
  latitude: z.number().describe('Latitude (degrees)'),
  height: z.number().optional().describe('Height above ground (meters)'),
})

// — addBillboard
_registerTool(
  'addBillboard',
  'Add a billboard (image icon) at a position on the globe',
  {
    longitude: z.number().describe('Longitude (degrees)'),
    latitude: z.number().describe('Latitude (degrees)'),
    height: z.number().optional().default(0).describe('Height (meters)'),
    name: z.string().optional().describe('Billboard name'),
    image: z.string().describe('Image URL for the billboard'),
    scale: z.number().optional().default(1.0).describe('Scale factor'),
    color: colorSchema.describe('Tint color'),
    pixelOffset: z.object({ x: z.number(), y: z.number() }).optional().describe('Pixel offset from position'),
    horizontalOrigin: z.enum(['CENTER', 'LEFT', 'RIGHT']).optional().describe('Horizontal origin'),
    verticalOrigin: z.enum(['CENTER', 'TOP', 'BOTTOM', 'BASELINE']).optional().describe('Vertical origin'),
    heightReference: z.enum(['NONE', 'CLAMP_TO_GROUND', 'RELATIVE_TO_GROUND']).optional().describe('Height reference'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Billboard' },
  async (params) => {
    const result = await sendToBrowser('addBillboard', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addBox
_registerTool(
  'addBox',
  'Add a 3D box entity at a position',
  {
    longitude: z.number().describe('Longitude (degrees)'),
    latitude: z.number().describe('Latitude (degrees)'),
    height: z.number().optional().default(0).describe('Height (meters)'),
    name: z.string().optional().describe('Box name'),
    dimensions: z.object({
      width: z.number().describe('Width in meters (X)'),
      length: z.number().describe('Length in meters (Y)'),
      height: z.number().describe('Height in meters (Z)'),
    }).describe('Box dimensions'),
    material: materialSchema.describe('Material (color string, RGBA object, or material spec)'),
    outline: z.boolean().optional().default(true).describe('Show outline'),
    outlineColor: colorSchema.describe('Outline color'),
    fill: z.boolean().optional().default(true).describe('Show fill'),
    orientation: orientationSchema.describe('Orientation (heading/pitch/roll in degrees)'),
    heightReference: z.enum(['NONE', 'CLAMP_TO_GROUND', 'RELATIVE_TO_GROUND']).optional().describe('Height reference'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Box' },
  async (params) => {
    const result = await sendToBrowser('addBox', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addCorridor
_registerTool(
  'addCorridor',
  'Add a corridor (path with width) entity',
  {
    name: z.string().optional().describe('Corridor name'),
    positions: z.array(positionDegreesSchema).describe('Array of positions along the corridor'),
    width: z.number().describe('Corridor width in meters'),
    material: materialSchema.describe('Material'),
    cornerType: z.enum(['ROUNDED', 'MITERED', 'BEVELED']).optional().describe('Corner type'),
    height: z.number().optional().describe('Height above ground (meters)'),
    extrudedHeight: z.number().optional().describe('Extruded height (meters)'),
    outline: z.boolean().optional().describe('Show outline'),
    outlineColor: colorSchema.describe('Outline color'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Corridor' },
  async (params) => {
    const result = await sendToBrowser('addCorridor', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addCylinder
_registerTool(
  'addCylinder',
  'Add a cylinder or cone entity at a position',
  {
    longitude: z.number().describe('Longitude (degrees)'),
    latitude: z.number().describe('Latitude (degrees)'),
    height: z.number().optional().default(0).describe('Height (meters)'),
    name: z.string().optional().describe('Cylinder name'),
    length: z.number().describe('Cylinder length/height in meters'),
    topRadius: z.number().describe('Top radius in meters'),
    bottomRadius: z.number().describe('Bottom radius in meters'),
    material: materialSchema.describe('Material'),
    outline: z.boolean().optional().default(true).describe('Show outline'),
    outlineColor: colorSchema.describe('Outline color'),
    fill: z.boolean().optional().default(true).describe('Show fill'),
    orientation: orientationSchema.describe('Orientation (heading/pitch/roll in degrees)'),
    numberOfVerticalLines: z.number().optional().default(16).describe('Number of vertical lines'),
    slices: z.number().optional().default(128).describe('Number of slices'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Cylinder' },
  async (params) => {
    const result = await sendToBrowser('addCylinder', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addEllipse
_registerTool(
  'addEllipse',
  'Add an ellipse (oval) entity at a position',
  {
    longitude: z.number().describe('Center longitude (degrees)'),
    latitude: z.number().describe('Center latitude (degrees)'),
    height: z.number().optional().default(0).describe('Height (meters)'),
    name: z.string().optional().describe('Ellipse name'),
    semiMajorAxis: z.number().describe('Semi-major axis in meters'),
    semiMinorAxis: z.number().describe('Semi-minor axis in meters'),
    material: materialSchema.describe('Material'),
    extrudedHeight: z.number().optional().describe('Extruded height (meters)'),
    rotation: z.number().optional().describe('Rotation (radians)'),
    outline: z.boolean().optional().describe('Show outline'),
    outlineColor: colorSchema.describe('Outline color'),
    fill: z.boolean().optional().default(true).describe('Show fill'),
    stRotation: z.number().optional().describe('Texture rotation (radians)'),
    numberOfVerticalLines: z.number().optional().describe('Number of vertical lines'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Ellipse' },
  async (params) => {
    const result = await sendToBrowser('addEllipse', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addRectangle
_registerTool(
  'addRectangle',
  'Add a rectangle entity defined by geographic bounds',
  {
    name: z.string().optional().describe('Rectangle name'),
    west: z.number().describe('West longitude (degrees)'),
    south: z.number().describe('South latitude (degrees)'),
    east: z.number().describe('East longitude (degrees)'),
    north: z.number().describe('North latitude (degrees)'),
    material: materialSchema.describe('Material'),
    height: z.number().optional().describe('Height (meters)'),
    extrudedHeight: z.number().optional().describe('Extruded height (meters)'),
    rotation: z.number().optional().describe('Rotation (radians)'),
    outline: z.boolean().optional().describe('Show outline'),
    outlineColor: colorSchema.describe('Outline color'),
    fill: z.boolean().optional().default(true).describe('Show fill'),
    stRotation: z.number().optional().describe('Texture rotation (radians)'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Rectangle' },
  async (params) => {
    const result = await sendToBrowser('addRectangle', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addWall
_registerTool(
  'addWall',
  'Add a wall entity along a series of positions',
  {
    name: z.string().optional().describe('Wall name'),
    positions: z.array(positionDegreesSchema).describe('Array of positions along the wall'),
    minimumHeights: z.array(z.number()).optional().describe('Minimum heights at each position'),
    maximumHeights: z.array(z.number()).optional().describe('Maximum heights at each position'),
    material: materialSchema.describe('Material'),
    outline: z.boolean().optional().describe('Show outline'),
    outlineColor: colorSchema.describe('Outline color'),
    fill: z.boolean().optional().default(true).describe('Show fill'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Add Wall' },
  async (params) => {
    const result = await sendToBrowser('addWall', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// ==================== Animation Tools (融合官方 Animation Server) ====================

// — createAnimation
_registerTool(
  'createAnimation',
  'Create a time-based animation with waypoints (moving entity along a path)',
  {
    name: z.string().optional().describe('Animation name'),
    waypoints: z.array(z.object({
      longitude: z.number().describe('Longitude (degrees)'),
      latitude: z.number().describe('Latitude (degrees)'),
      height: z.number().optional().describe('Height (meters)'),
      time: z.string().describe('ISO 8601 timestamp'),
    })).describe('Array of waypoints with positions and timestamps'),
    modelUri: z.string().optional().describe('glTF/GLB model URL, or preset: cesium_man, cesium_air, ground_vehicle, cesium_drone'),
    showPath: z.boolean().optional().default(true).describe('Show trail path'),
    pathWidth: z.number().optional().default(2).describe('Path width (pixels)'),
    pathColor: z.string().optional().default('#00FF00').describe('Path color (CSS)'),
    pathLeadTime: z.number().optional().default(0).describe('Path lead time (seconds)'),
    pathTrailTime: z.number().optional().default(1e10).describe('Path trail time (seconds)'),
    multiplier: z.number().optional().default(1).describe('Clock speed multiplier'),
    shouldAnimate: z.boolean().optional().default(true).describe('Auto-start animation'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Create Animation' },
  async (params) => {
    const result = await sendToBrowser('createAnimation', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — controlAnimation
_registerTool(
  'controlAnimation',
  'Play or pause the current animation',
  {
    action: z.enum(['play', 'pause']).describe('Play or pause'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Control Animation' },
  async (params) => {
    const result = await sendToBrowser('controlAnimation', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — removeAnimation
_registerTool(
  'removeAnimation',
  'Remove an animation entity',
  {
    entityId: z.string().describe('Entity ID of the animation to remove'),
  },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: 'Remove Animation' },
  async (params) => {
    const result = await sendToBrowser('removeAnimation', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — listAnimations
_registerTool(
  'listAnimations',
  'List all active animations',
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'List Animations' },
  async () => {
    const result = await sendToBrowser('listAnimations', {})
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  },
)

// — updateAnimationPath
_registerTool(
  'updateAnimationPath',
  'Update the visual properties of an animation path',
  {
    entityId: z.string().describe('Entity ID of the animation'),
    width: z.number().optional().describe('New path width (pixels)'),
    color: z.string().optional().describe('New path color (CSS)'),
    leadTime: z.number().optional().describe('New lead time (seconds)'),
    trailTime: z.number().optional().describe('New trail time (seconds)'),
    show: z.boolean().optional().describe('Show/hide path'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Update Animation Path' },
  async (params) => {
    const result = await sendToBrowser('updateAnimationPath', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — trackEntity
_registerTool(
  'trackEntity',
  'Track (follow) an entity with the camera, or stop tracking',
  {
    entityId: z.string().optional().describe('Entity ID to track (omit to stop tracking)'),
    heading: z.number().optional().describe('Camera heading (degrees)'),
    pitch: z.number().optional().default(-30).describe('Camera pitch (degrees)'),
    range: z.number().optional().default(500).describe('Camera distance from entity (meters)'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Track Entity' },
  async (params) => {
    const result = await sendToBrowser('trackEntity', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — controlClock
_registerTool(
  'controlClock',
  'Configure the Cesium clock (time range, speed, animation state)',
  {
    action: z.enum(['configure', 'setTime', 'setMultiplier']).describe('Clock action'),
    startTime: z.string().optional().describe('ISO 8601 start time (for configure)'),
    stopTime: z.string().optional().describe('ISO 8601 stop time (for configure)'),
    currentTime: z.string().optional().describe('ISO 8601 current time (for configure)'),
    time: z.string().optional().describe('ISO 8601 time to jump to (for setTime)'),
    multiplier: z.number().optional().describe('Clock speed multiplier (for configure/setMultiplier)'),
    shouldAnimate: z.boolean().optional().describe('Whether clock should animate (for configure)'),
    clockRange: z.enum(['UNBOUNDED', 'CLAMPED', 'LOOP_STOP']).optional().describe('Clock range mode (for configure)'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: 'Control Clock' },
  async (params) => {
    const result = await sendToBrowser('controlClock', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — setGlobeLighting
_registerTool(
  'setGlobeLighting',
  'Enable/disable globe lighting and atmospheric effects',
  {
    enableLighting: z.boolean().optional().describe('Enable globe lighting'),
    dynamicAtmosphereLighting: z.boolean().optional().describe('Enable dynamic atmosphere lighting'),
    dynamicAtmosphereLightingFromSun: z.boolean().optional().describe('Use sun position for atmosphere lighting'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Set Globe Lighting' },
  async (params) => {
    const result = await sendToBrowser('setGlobeLighting', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — geocode (直接 HTTP 请求 Nominatim，不经过 Bridge)
let _lastGeocodeTime = 0
let _proxyDispatcher: object | undefined

// 初始化代理（读取 HTTPS_PROXY / HTTP_PROXY / ALL_PROXY 环境变量）
const _proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY
if (_proxyUrl) {
  import('undici').then(({ ProxyAgent }) => {
    _proxyDispatcher = new ProxyAgent(_proxyUrl)
  }).catch(() => { /* undici not available, skip proxy */ })
}

_registerTool(
  'geocode',
  '将地址、地标或地名转换为地理坐标（经纬度）。使用 OpenStreetMap Nominatim 免费服务，无需 API Key。',
  {
    address: z.string().min(1).describe('地址、地标或地名，例如 "故宫"、"Eiffel Tower"、"东京塔"'),
    countryCode: z.string().length(2).optional().describe('两位 ISO 国家代码限制搜索范围（如 "CN"、"US"、"JP"）'),
  },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: 'Geocode Address' },
  async ({ address, countryCode }) => {
    // Rate limiting: Nominatim 要求至少 1 秒间隔
    const now = Date.now()
    const wait = 1100 - (now - _lastGeocodeTime)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    _lastGeocodeTime = Date.now()

    const params = new URLSearchParams({
      q: address,
      format: 'json',
      addressdetails: '1',
      limit: '1',
    })
    if (countryCode) params.set('countrycodes', countryCode)

    const ua = process.env.OSM_USER_AGENT || 'cesium-mcp-runtime/1.0'
    const fetchOptions: RequestInit & { dispatcher?: object } = {
      headers: { 'User-Agent': ua },
    }
    if (_proxyDispatcher) fetchOptions.dispatcher = _proxyDispatcher

    const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, fetchOptions)
    if (!resp.ok) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: `Nominatim API error: ${resp.status}` }) }], isError: true }
    }
    const data = await resp.json() as Array<{
      lat: string; lon: string; display_name: string;
      boundingbox?: [string, string, string, string];
      address?: Record<string, string>;
    }>

    if (!data.length) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: `No results found for: ${address}` }) }] }
    }

    const item = data[0]!
    const result = {
      success: true,
      longitude: parseFloat(item.lon),
      latitude: parseFloat(item.lat),
      displayName: item.display_name,
      boundingBox: item.boundingbox ? {
        south: parseFloat(item.boundingbox[0]),
        north: parseFloat(item.boundingbox[1]),
        west: parseFloat(item.boundingbox[2]),
        east: parseFloat(item.boundingbox[3]),
      } : undefined,
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  },
)

// ==================== Prompts ====================

server.prompt(
  'cesium-quickstart',
  'Quick reference for using Cesium MCP tools',
  async () => ({
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Cesium MCP Quick Start Guide:

1. **Camera**: flyTo(lng, lat) to navigate, setView for instant move, getView to read current position
2. **Entities**: addMarker for points, addPolygon/addPolyline for shapes, addModel for 3D models
3. **Layers**: addGeoJsonLayer for vector data, load3dTiles for 3D city models, loadImageryService for WMS/WMTS
4. **Animation**: createAnimation with waypoints for moving entities, controlAnimation to play/pause
5. **Interaction**: screenshot to capture view, highlight to emphasize features
6. **Discovery**: list_toolsets to see available tool groups, enable_toolset to activate more tools

All entity/layer operations return an ID for subsequent updates or removal.`,
      },
    }],
  }),
)

// ==================== Meta-tools (Dynamic Discovery) ====================

if (!_allMode) {
  server.tool(
    'list_toolsets',
    'List all available tool groups and their enabled status. Call this to discover additional capabilities before asking the user to configure anything.',
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'List Toolsets' },
    async () => {
      const groups = Object.entries(TOOLSETS).map(([name, tools]) => ({
        name,
        description: TOOLSET_DESCRIPTIONS[name] ?? '',
        tools: tools.length,
        enabled: _enabledSets.has(name),
        toolNames: tools,
      }))
      return { content: [{ type: 'text' as const, text: JSON.stringify(groups, null, 2) }] }
    },
  )

  server.tool(
    'enable_toolset',
    'Enable a tool group to make its tools available. Call list_toolsets first to see available groups.',
    {
      toolset: z.string().describe('Name of the toolset to enable (e.g. "camera", "animation", "entity-ext")'),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Enable Toolset' },
    async ({ toolset }) => {
      if (!(toolset in TOOLSETS)) {
        return {
          content: [{ type: 'text' as const, text: `Unknown toolset "${toolset}". Available: ${Object.keys(TOOLSETS).join(', ')}` }],
          isError: true,
        }
      }
      if (_enabledSets.has(toolset)) {
        return { content: [{ type: 'text' as const, text: `Toolset "${toolset}" is already enabled.` }] }
      }
      const added = _enableToolset(toolset)
      server.sendToolListChanged?.()
      return {
        content: [{
          type: 'text' as const,
          text: `Enabled toolset "${toolset}" — ${added.length} new tools available: ${added.join(', ')}`,
        }],
      }
    },
  )
}

// ==================== Smithery Sandbox ====================

/**
 * Smithery 扫描时使用的无副作用服务器实例。
 * 返回带有相同工具/资源元数据的独立 McpServer，
 * 不启动 WebSocket，不连接 transport。
 */
export function createSandboxServer() {
  // Register all tools for sandbox scanning
  for (const setName of Object.keys(TOOLSETS)) {
    if (!_enabledSets.has(setName)) _enableToolset(setName)
  }
  return server
}

// ==================== 启动 ====================

export async function main() {
  startServer()

  const transport = new StdioServerTransport()
  await server.connect(transport)
  const metaCount = _allMode ? 0 : 2
  console.error(`[cesium-mcp-runtime] MCP Server running (stdio), ${_enabledTools.size + metaCount} tools registered (toolsets: ${[..._enabledSets].join(', ')})`)
}
