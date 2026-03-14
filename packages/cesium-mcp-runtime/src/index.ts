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

  httpServer.listen(WS_PORT, () => {
    console.error(`[cesium-mcp-runtime] HTTP + WebSocket server on http://localhost:${WS_PORT}`)
    console.error(`[cesium-mcp-runtime] POST /api/command — 推送地图命令`)
    console.error(`[cesium-mcp-runtime] GET  /api/status  — 连接状态`)
  })
}

// ==================== MCP Server ====================

const server = new McpServer({
  name: 'cesium-mcp-runtime',
  version: '0.1.0',
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

// ==================== Tools ====================

// — flyTo
server.tool(
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
  async (params) => {
    const result = await sendToBrowser('flyTo', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addGeoJsonLayer
server.tool(
  'addGeoJsonLayer',
  '添加 GeoJSON 图层到地图（支持 Point/Line/Polygon，可配置颜色/分级/分类渲染）',
  {
    id: z.string().optional().describe('图层ID（不传则自动生成）'),
    name: z.string().optional().describe('图层显示名称'),
    data: z.record(z.unknown()).describe('GeoJSON FeatureCollection 对象'),
    style: z.record(z.unknown()).optional().describe('样式配置（color, opacity, pointSize, choropleth, category）'),
  },
  async (params) => {
    const result = await sendToBrowser('addGeoJsonLayer', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addLabel
server.tool(
  'addLabel',
  '为 GeoJSON 要素添加文本标注（显示属性值）',
  {
    data: z.record(z.unknown()).describe('GeoJSON FeatureCollection 对象'),
    field: z.string().describe('用作标注文本的属性字段名（如 "name"、"population"）'),
    style: z.record(z.unknown()).optional().describe('标注样式（font, fillColor, outlineColor, scale 等）'),
  },
  async (params) => {
    const result = await sendToBrowser('addLabel', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addHeatmap
server.tool(
  'addHeatmap',
  '添加热力图图层（基于 GeoJSON 点数据生成热力可视化）',
  {
    data: z.record(z.unknown()).describe('GeoJSON Point FeatureCollection'),
    radius: z.number().default(30).describe('热力影响半径（像素）'),
  },
  async (params) => {
    const result = await sendToBrowser('addHeatmap', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — removeLayer
server.tool(
  'removeLayer',
  '从地图上移除指定图层（按图层ID）',
  { id: z.string().describe('要移除的图层ID（可通过 listLayers 获取）') },
  async (params) => {
    const result = await sendToBrowser('removeLayer', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — setBasemap
server.tool(
  'setBasemap',
  '切换底图风格（暗色/卫星影像/标准）',
  { basemap: z.enum(['dark', 'satellite', 'standard']).describe('底图类型：dark=暗色, satellite=卫星影像, standard=标准') },
  async (params) => {
    const result = await sendToBrowser('setBasemap', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — screenshot
server.tool(
  'screenshot',
  '截取当前地图视图（返回 base64 PNG）',
  {},
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
server.tool(
  'highlight',
  '高亮指定图层的要素',
  {
    layerId: z.string().describe('图层ID'),
    featureIndex: z.number().optional().describe('要素索引（不传则高亮全部）'),
    color: z.string().default('#FFFF00').describe('高亮颜色（CSS 格式）'),
  },
  async (params) => {
    const result = await sendToBrowser('highlight', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — setView
server.tool(
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
  async (params) => {
    const result = await sendToBrowser('setView', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — getView
server.tool(
  'getView',
  '获取当前相机视角信息（经纬度、高度、角度）',
  {},
  async () => {
    const result = await sendToBrowser('getView', {})
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  },
)

// — zoomToExtent
server.tool(
  'zoomToExtent',
  '缩放到指定地理范围',
  {
    west: z.number().describe('西边界经度（度）'),
    south: z.number().describe('南边界纬度（度）'),
    east: z.number().describe('东边界经度（度）'),
    north: z.number().describe('北边界纬度（度）'),
    duration: z.number().optional().default(2).describe('动画时长（秒）'),
  },
  async (params) => {
    const result = await sendToBrowser('zoomToExtent', { bbox: [params.west, params.south, params.east, params.north], duration: params.duration })
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — addMarker
server.tool(
  'addMarker',
  '在指定经纬度添加标注点',
  {
    longitude: z.number().describe('经度（-180 ~ 180）'),
    latitude: z.number().describe('纬度（-90 ~ 90）'),
    label: z.string().optional().describe('标注文本'),
    color: z.string().optional().default('#3B82F6').describe('标注颜色（CSS 格式）'),
    size: z.number().optional().default(12).describe('点大小（像素）'),
  },
  async (params) => {
    const result = await sendToBrowser('addMarker', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — setLayerVisibility
server.tool(
  'setLayerVisibility',
  '设置图层可见性',
  {
    id: z.string().describe('图层ID'),
    visible: z.boolean().describe('是否可见'),
  },
  async (params) => {
    const result = await sendToBrowser('setLayerVisibility', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — listLayers
server.tool(
  'listLayers',
  '获取当前所有图层列表（含 ID、名称、类型、可见性）',
  {},
  async () => {
    const result = await sendToBrowser('listLayers', {})
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  },
)

// — updateLayerStyle
server.tool(
  'updateLayerStyle',
  '修改已有图层的样式（颜色、透明度、标注样式等）',
  {
    layerId: z.string().describe('图层ID'),
    labelStyle: z.record(z.unknown()).optional().describe('标注样式（font, fillColor, outlineColor, outlineWidth, scale 等）'),
    layerStyle: z.record(z.unknown()).optional().describe('图层样式（color, opacity, strokeWidth, pointSize）'),
  },
  async (params) => {
    const result = await sendToBrowser('updateLayerStyle', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — playTrajectory
server.tool(
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
  async (params) => {
    const result = await sendToBrowser('playTrajectory', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — load3dTiles
server.tool(
  'load3dTiles',
  '加载 3D Tiles 数据集（如建筑白膜、城市模型）',
  {
    id: z.string().optional().describe('图层ID'),
    name: z.string().optional().describe('图层名称'),
    url: z.string().describe('tileset.json 的 URL'),
    maximumScreenSpaceError: z.number().optional().default(16).describe('最大屏幕空间误差（值越小越精细）'),
    heightOffset: z.number().optional().describe('高度偏移（米）'),
  },
  async (params) => {
    const result = await sendToBrowser('load3dTiles', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — loadTerrain
server.tool(
  'loadTerrain',
  '加载或切换地形（平坦/ArcGIS/CesiumIon/自定义 URL）',
  {
    provider: z.enum(['flat', 'arcgis', 'cesiumion']).describe('地形提供者类型'),
    url: z.string().optional().describe('自定义地形服务 URL'),
    cesiumIonAssetId: z.number().optional().describe('Cesium Ion 资产ID（provider=cesiumion 时需要）'),
  },
  async (params) => {
    const result = await sendToBrowser('loadTerrain', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// — loadImageryService
server.tool(
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
  async (params) => {
    const result = await sendToBrowser('loadImageryService', params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)

// ==================== 启动 ====================

async function main() {
  startServer()

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`[cesium-mcp-runtime] MCP Server running (stdio), 19 tools registered`)
}

main().catch((err) => {
  console.error('[cesium-mcp-runtime] Fatal:', err)
  process.exit(1)
})
