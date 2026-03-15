/**
 * Cesium MCP - Cloudflare Worker
 * 
 * Minimal MCP Streamable HTTP endpoint for Smithery registration.
 * Exposes tool/resource metadata; actual execution requires local runtime.
 */

import SERVER_CARD from '../server-card.json'
import DEV_SERVER_CARD from '../dev-server-card.json'

const SERVERS = {
  runtime: {
    info: {
      name: 'cesium-mcp-runtime',
      version: '1.139.2',
      description: 'MCP server for CesiumJS 3D globe — 24 tools for map visualization, layer management, entity management, and camera control.',
    },
    card: SERVER_CARD,
    capabilities: {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
    },
    installHint: 'npx cesium-mcp-runtime',
  },
  dev: {
    info: {
      name: 'cesium-mcp-dev',
      version: '1.139.2',
      description: 'Cesium MCP for Development — IDE AI assistant tools for Cesium API docs lookup, code generation, and Entity builder.',
    },
    card: DEV_SERVER_CARD,
    capabilities: {
      tools: { listChanged: false },
    },
    installHint: 'npx cesium-mcp-dev',
  },
}

function jsonRpcResponse(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function handleRpcRequest(req, srv) {
  const { method, id, params } = req

  switch (method) {
    case 'initialize':
      return jsonRpcResponse(id, {
        protocolVersion: '2025-03-26',
        serverInfo: srv.info,
        capabilities: srv.capabilities,
      })

    case 'notifications/initialized':
      return null // notification, no response

    case 'tools/list':
      return jsonRpcResponse(id, {
        tools: srv.card.tools,
      })

    case 'resources/list':
      return jsonRpcResponse(id, {
        resources: srv.card.resources || [],
      })

    case 'prompts/list':
      return jsonRpcResponse(id, { prompts: [] })

    // Tool calls return an error since this is a metadata-only endpoint
    case 'tools/call':
      return jsonRpcError(id, -32000,
        `This is a metadata endpoint. Install locally: ${srv.installHint}`)

    case 'ping':
      return jsonRpcResponse(id, {})

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`)
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id',
      'Access-Control-Expose-Headers': 'mcp-session-id',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // Determine which server to use based on hostname or path prefix
    const isDev = url.hostname.startsWith('dev-') || url.hostname.startsWith('dev.') || path.startsWith('/dev')
    const srv = isDev ? SERVERS.dev : SERVERS.runtime
    const basePath = isDev ? '/dev' : ''

    // Health check
    if (path === '/' || path === '/health' || path === `${basePath}/health`) {
      return Response.json(
        { status: 'ok', name: srv.info.name, version: srv.info.version, tools: srv.card.tools.length },
        { headers: corsHeaders }
      )
    }

    // Static server card
    if (path === '/.well-known/mcp/server-card.json') {
      return Response.json(srv.card, { headers: corsHeaders })
    }

    // MCP Streamable HTTP endpoint
    if (path === '/mcp' || path === `${basePath}/mcp`) {
      if (request.method === 'POST') {
        const body = await request.json()
        const sessionId = request.headers.get('mcp-session-id') || crypto.randomUUID()

        // Handle single request or batch
        const requests = Array.isArray(body) ? body : [body]
        const responses = []

        for (const req of requests) {
          const resp = handleRpcRequest(req, srv)
          if (resp) responses.push(resp)
        }

        if (responses.length === 0) {
          return new Response(null, { status: 202, headers: { ...corsHeaders, 'mcp-session-id': sessionId } })
        }

        const result = responses.length === 1 ? responses[0] : responses
        return Response.json(result, {
          headers: { ...corsHeaders, 'mcp-session-id': sessionId },
        })
      }

      if (request.method === 'GET') {
        // SSE endpoint for server-initiated notifications (not needed for metadata-only)
        return new Response('event: ping\ndata: {}\n\n', {
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        })
      }

      if (request.method === 'DELETE') {
        return new Response(null, { status: 200, headers: corsHeaders })
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders })
  },
}
