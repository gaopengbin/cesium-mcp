/**
 * cesium-mcp-runtime demo server
 *
 * 仅启动 HTTP + WebSocket 服务器（不启动 MCP stdio transport），
 * 用于配合 demo/index.html 进行本地测试。
 *
 * 用法：npx tsx src/demo-server.ts
 */

import { WebSocketServer, WebSocket, type RawData } from 'ws'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

const WS_PORT = parseInt(process.env.CESIUM_WS_PORT ?? '9100')

const browserClients = new Map<string, WebSocket>()
let requestIdCounter = 0

function getDefaultBrowser(): WebSocket | null {
  if (browserClients.size === 0) return null
  return browserClients.values().next().value ?? null
}

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

function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
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

        console.log(`[http] POST /api/command → sent ${sent}/${commands.length} to session=${sessionId}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, sent, total: commands.length }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
      }
    })
    return
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/status')) {
    const sessions = Array.from(browserClients.keys())
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, sessions, connections: sessions.length }))
    return
  }

  res.writeHead(404)
  res.end('Not Found')
}

const httpServer = createServer(handleHttpRequest)
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const sessionId = new URL(req.url ?? '/', `http://localhost`).searchParams.get('session') ?? 'default'
  console.log(`[ws] 浏览器连接: session=${sessionId}`)
  browserClients.set(sessionId, ws)

  ws.on('message', (raw: RawData) => {
    try {
      const msg = JSON.parse(raw.toString())
      console.log(`[ws] ← 浏览器响应:`, JSON.stringify(msg).slice(0, 120))
    } catch { /* ignore */ }
  })

  ws.on('close', () => {
    console.log(`[ws] 浏览器断开: session=${sessionId}`)
    browserClients.delete(sessionId)
  })
})

httpServer.listen(WS_PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════════╗`)
  console.log(`  ║  cesium-mcp-runtime Demo Server              ║`)
  console.log(`  ╠══════════════════════════════════════════════╣`)
  console.log(`  ║  HTTP + WS : http://localhost:${WS_PORT}            ║`)
  console.log(`  ║  POST      : /api/command                    ║`)
  console.log(`  ║  GET       : /api/status                     ║`)
  console.log(`  ║  WS        : ws://localhost:${WS_PORT}?session=xxx  ║`)
  console.log(`  ╚══════════════════════════════════════════════╝`)
  console.log(`\n  打开 demo/index.html 或 npm run demo 启动测试页面\n`)
})
