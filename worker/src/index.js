/**
 * Cesium MCP - Cloudflare Worker
 * 
 * Minimal MCP Streamable HTTP endpoint for Smithery registration.
 * Exposes tool/resource metadata; actual execution requires local runtime.
 */

import SERVER_CARD from '../server-card.json'

const SERVER_INFO = {
  name: 'cesium-mcp-runtime',
  version: '1.139.2',
}

const CAPABILITIES = {
  tools: { listChanged: false },
  resources: { subscribe: false, listChanged: false },
}

function jsonRpcResponse(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function handleRpcRequest(req) {
  const { method, id, params } = req

  switch (method) {
    case 'initialize':
      return jsonRpcResponse(id, {
        protocolVersion: '2025-03-26',
        serverInfo: SERVER_INFO,
        capabilities: CAPABILITIES,
      })

    case 'notifications/initialized':
      return null // notification, no response

    case 'tools/list':
      return jsonRpcResponse(id, {
        tools: SERVER_CARD.tools,
      })

    case 'resources/list':
      return jsonRpcResponse(id, {
        resources: SERVER_CARD.resources || [],
      })

    case 'prompts/list':
      return jsonRpcResponse(id, { prompts: [] })

    // Tool calls return an error since this is a metadata-only endpoint
    case 'tools/call':
      return jsonRpcError(id, -32000,
        'This is a metadata endpoint. Install cesium-mcp-runtime locally: npx cesium-mcp-runtime')

    case 'ping':
      return jsonRpcResponse(id, {})

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`)
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

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

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json(
        { status: 'ok', name: SERVER_INFO.name, version: SERVER_INFO.version, tools: SERVER_CARD.tools.length },
        { headers: corsHeaders }
      )
    }

    // Static server card (for Smithery fallback scanning)
    if (url.pathname === '/.well-known/mcp/server-card.json') {
      return Response.json(SERVER_CARD, { headers: corsHeaders })
    }

    // MCP Streamable HTTP endpoint
    if (url.pathname === '/mcp') {
      if (request.method === 'POST') {
        const body = await request.json()
        const sessionId = request.headers.get('mcp-session-id') || crypto.randomUUID()

        // Handle single request or batch
        const requests = Array.isArray(body) ? body : [body]
        const responses = []

        for (const req of requests) {
          const resp = handleRpcRequest(req)
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
