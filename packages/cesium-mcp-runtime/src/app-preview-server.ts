import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import { toNodeHandler } from '@modelcontextprotocol/node'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createMcpHandler } from '@modelcontextprotocol/server'
import type { McpHttpHandler } from '@modelcontextprotocol/server'
import { readCesiumAppAsset } from './mcp-app.js'
import { cesiumMapOrigins, cesiumMapDataOrigins } from './mcp-app-policy.js'
import { createPreviewAgentServer, runPreviewAgent } from './preview-agent.js'
import type { AgentEntry } from './preview-agent.js'

// Dedicated ports keep the preview isolated from a user's existing map sessions.
process.env.CESIUM_WS_PORT ??= '19310'
const port = Number(process.env.CESIUM_APP_PREVIEW_PORT ?? '19311')
const sandboxPort = Number(process.env.CESIUM_APP_SANDBOX_PORT ?? '19312')
const { main, createCesiumMcpHttpHandler } = await import('./index.js')
await main(['--transport', 'http', '--port', process.env.MCP_HTTP_PORT ?? '19410'])
const handler = createCesiumMcpHttpHandler()
const mcp = toNodeHandler(handler)
const agentHandlers = new Map<string, McpHttpHandler>()
const activeChats = new Set<string>()
const cesiumRoot = resolve(dirname(fileURLToPath(import.meta.resolve('cesium/package.json'))), 'Build', 'Cesium')
const mimeTypes: Record<string, string> = {
  '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
}
const mapOrigins = [...cesiumMapOrigins, ...cesiumMapDataOrigins()]

function serveCesiumAsset(path: string, res: import('node:http').ServerResponse): boolean {
  if (!path.startsWith('/vendor/cesium/')) return false
  const file = resolve(cesiumRoot, decodeURIComponent(path.slice('/vendor/cesium/'.length)))
  if (!file.startsWith(cesiumRoot + sep)) throw new Error('Invalid asset path')
  const content = readFileSync(file)
  res.writeHead(200, { 'Content-Type': mimeTypes[extname(file)] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*' })
  res.end(content)
  return true
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (path === '/mcp') {
    await mcp(req, res)
    return
  }
  try {
    if (path.startsWith('/agent-mcp/')) {
      const agent = agentHandlers.get(path.slice('/agent-mcp/'.length))
      if (!agent) { res.writeHead(404); res.end('Conversation has ended'); return }
      await toNodeHandler(agent)(req, res)
      return
    }
    if (path === '/chat' && req.method === 'POST') {
      if (req.headers.origin !== `http://127.0.0.1:${port}` || !req.headers['content-type']?.startsWith('application/json')) {
        res.writeHead(403); res.end('Invalid preview origin'); return
      }
      let body = ''
      for await (const chunk of req) {
        body += chunk.toString()
        if (Buffer.byteLength(body) > 64 * 1024) throw new Error('Conversation input is too long')
      }
      const input = JSON.parse(body) as { text: string; context: Record<string, unknown>; history: AgentEntry[] }
      const sessionId = input.context?.sessionId
      if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000 || typeof sessionId !== 'string' || !Array.isArray(input.history)) {
        throw new Error('Invalid conversation input')
      }
      if (activeChats.has(sessionId)) { res.writeHead(409); res.end('This map is already responding'); return }
      activeChats.add(sessionId)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 180_000)
      res.on('close', () => controller.abort())
      const client = new Client({ name: 'Cesium conversation tools', version: '1.0.0' })
      const token = randomUUID()
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' })
      const emit = (entry: AgentEntry) => { if (!controller.signal.aborted) res.write(JSON.stringify(entry) + '\n') }
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)))
        const { tools } = await client.listTools()
        const agent = createMcpHandler(() => createPreviewAgentServer(tools, async params => {
          emit({ role: 'tool', text: `正在执行 ${params.name}` })
          const result = await client.callTool(params)
          emit({ role: 'tool', text: `${params.name} ${result.isError ? '执行失败' : '已完成'}` })
          return result
        }, sessionId), { legacy: 'stateless' })
        agentHandlers.set(token, agent)
        await runPreviewAgent(`http://127.0.0.1:${port}/agent-mcp/${token}`, input.text, input.context, input.history, emit, controller.signal)
        if (controller.signal.aborted && !res.destroyed) res.write(JSON.stringify({ role: 'error', text: '回复已停止或超时，可以继续发送消息。' }) + '\n')
      } catch (error) {
        emit({ role: 'error', text: error instanceof Error ? error.message : '对话未完成，请重试。' })
      } finally {
        clearTimeout(timeout)
        const agent = agentHandlers.get(token)
        agentHandlers.delete(token)
        await agent?.close()
        await client.close()
        activeChats.delete(sessionId)
        res.end()
      }
      return
    }
    if (serveCesiumAsset(path, res)) return
    if (path === '/' || path === '/map-preview.js') {
      const content = readCesiumAppAsset(path === '/' ? 'map-preview.html' : 'map-preview.js')
        .replace('<!-- SANDBOX_ORIGIN -->', `<span id="sandbox-origin" hidden>http://127.0.0.1:${sandboxPort}/</span>`)
      res.writeHead(200, { 'Content-Type': path === '/' ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8' })
      res.end(content)
      return
    }
    res.writeHead(404)
    res.end('Not found')
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(error instanceof Error ? error.message : String(error))
  }
})
server.listen(port, '127.0.0.1', () => console.log(`Cesium MCP Apps preview: http://127.0.0.1:${port}`))

const sandbox = createServer((req, res) => {
  try {
    if (serveCesiumAsset(new URL(req.url ?? '/', 'http://localhost').pathname, res)) return
  } catch {
    res.writeHead(404)
    res.end('Asset not found')
    return
  }
  if (req.url !== '/') {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  const content = readCesiumAppAsset('map-app.html')
    .split('https://cesium.com/downloads/cesiumjs/releases/1.145/Build/Cesium/')
    .join(`http://127.0.0.1:${sandboxPort}/vendor/cesium/`)
  const assetOrigin = `http://127.0.0.1:${sandboxPort}`
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': [
      "default-src 'none'",
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: ${assetOrigin}`,
      `style-src 'self' 'unsafe-inline' ${assetOrigin}`,
      `img-src 'self' data: blob: ${assetOrigin} ${mapOrigins.join(' ')}`,
      `font-src 'self' data: ${assetOrigin}`,
      `connect-src blob: ${assetOrigin} ${mapOrigins.join(' ')}`,
      'worker-src blob:',
      "object-src 'none'",
      "base-uri 'none'",
      "frame-src 'none'",
    ].join('; '),
  })
  res.end(content)
})
sandbox.listen(sandboxPort, '127.0.0.1')
