import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { hostHeaderValidation, toNodeHandler } from '@modelcontextprotocol/node'

import { createCesiumMcpHttpHandler, sweepPublicMapSessions } from './index.js'
import { readAppSessionBody } from './app-session-body.js'

/** Public process exposes only MCP, not the local WebSocket/control/preview endpoints. */
export function createPublicMapServer(): Server {
  const mcp = toNodeHandler(createCesiumMcpHttpHandler({ publicMode: true }))
  const validateHost = hostHeaderValidation(['laogao.xyz', 'localhost', '127.0.0.1'])
  const rate = new Map<string, { count: number; reset: number }>()
  const timer = setInterval(() => {
    sweepPublicMapSessions()
    for (const [ip, entry] of rate) if (entry.reset <= Date.now()) rate.delete(ip)
  }, 60_000)
  timer.unref()
  const server = createServer(async (req, res) => {
    if (!validateHost(req, res)) return
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'cesium-map', version: '0.1.0' }))
      return
    }
    if (path !== '/mcp') { res.writeHead(404); res.end('Not found'); return }
    const origin = req.headers.origin
    if (origin && !['https://laogao.xyz', 'https://chatgpt.com', 'https://chat.openai.com', 'https://platform.openai.com'].includes(origin)) {
      res.writeHead(403); res.end('Origin is not allowed'); return
    }
    if (Number(req.headers['content-length'] ?? 0) > 9 * 1024 * 1024) {
      res.writeHead(413); res.end('Request is too large'); return
    }
    // Nginx overwrites this header. Direct access is restricted to loopback.
    const ip = String(req.headers['x-real-ip'] ?? req.socket.remoteAddress)
    let entry = rate.get(ip)
    if (!entry || entry.reset <= Date.now()) {
      if (rate.size >= 5000 && !entry) { res.writeHead(503); res.end('Please try again later'); return }
      entry = { count: 0, reset: Date.now() + 60_000 }
      rate.set(ip, entry)
    }
    if (++entry.count > 900) { res.writeHead(429, { 'Retry-After': '60' }); res.end('Please try again later'); return }
    try {
      const body = req.method === 'POST' ? JSON.parse(await readAppSessionBody(req)) : undefined
      await mcp(req, res, body)
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'App exchange is too large'
      if (!res.headersSent) res.writeHead(tooLarge ? 413 : error instanceof SyntaxError ? 400 : 500)
      res.end(tooLarge ? 'Request is too large' : 'MCP request could not be completed')
    }
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.on('close', () => clearInterval(timer))
  return server
}
