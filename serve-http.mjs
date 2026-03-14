/**
 * cesium-mcp Streamable HTTP Server
 * 
 * 通过 HTTP 暴露 MCP 工具，供 Smithery/远程客户端连接。
 * 部署方式：node serve-http.mjs，配合 Cloudflare Tunnel 暴露到公网。
 */
import { createServer } from 'node:http'
import { createSandboxServer } from './packages/cesium-mcp-runtime/dist/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { randomUUID } from 'node:crypto'

const PORT = parseInt(process.env.MCP_HTTP_PORT ?? '8787')

// 存储活跃的 transport（每个 session 一个）
const transports = new Map()

const httpServer = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id')
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // 健康检查
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', name: 'cesium-mcp-runtime', tools: 19, sessions: transports.size }))
    return
  }

  // MCP endpoint
  if (req.url === '/mcp') {
    const sessionId = req.headers['mcp-session-id']

    if (req.method === 'POST') {
      // 新会话或现有会话
      let transport = sessionId ? transports.get(sessionId) : null

      if (!transport) {
        // 创建新 transport 和 server 实例
        transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
        const server = createSandboxServer()

        transport.onclose = () => {
          const sid = transport.sessionId
          if (sid) transports.delete(sid)
        }

        await server.connect(transport)

        // 在 handleRequest 后保存 sessionId
        await transport.handleRequest(req, res)
        if (transport.sessionId) {
          transports.set(transport.sessionId, transport)
        }
        return
      }

      await transport.handleRequest(req, res)
      return
    }

    if (req.method === 'GET') {
      // SSE stream for notifications
      const transport = sessionId ? transports.get(sessionId) : null
      if (transport) {
        await transport.handleRequest(req, res)
        return
      }
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing or invalid session ID' }))
      return
    }

    if (req.method === 'DELETE') {
      // Close session
      const transport = sessionId ? transports.get(sessionId) : null
      if (transport) {
        await transport.handleRequest(req, res)
        transports.delete(sessionId)
        return
      }
      res.writeHead(404)
      res.end()
      return
    }
  }

  res.writeHead(404)
  res.end('Not Found')
})

httpServer.listen(PORT, () => {
  console.log(`[cesium-mcp-http] Streamable HTTP MCP server on http://localhost:${PORT}`)
  console.log(`[cesium-mcp-http] MCP endpoint: http://localhost:${PORT}/mcp`)
  console.log(`[cesium-mcp-http] Health check: http://localhost:${PORT}/health`)
})
