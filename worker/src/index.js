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
      version: '1.139.4',
      title: 'Cesium MCP Runtime',
      description: 'AI-powered 3D globe control via MCP — camera, layers, entities, animation, and interaction with CesiumJS.',
      websiteUrl: 'https://github.com/gaopengbin/cesium-mcp',
    },
    instructions: 'Cesium MCP Runtime provides tools for controlling a CesiumJS 3D globe via AI. A browser with cesium-mcp-bridge must be connected via WebSocket for command execution. Use view tools (flyTo, setView) to navigate, entity tools to add markers/polygons/models, layer tools to manage GeoJSON/3D Tiles, and animation tools for time-based animations.',
    card: SERVER_CARD,
    capabilities: {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
    },
    installHint: 'npx cesium-mcp-runtime',
    prompts: [
      {
        name: 'cesium-quickstart',
        description: 'Quick reference for using Cesium MCP tools',
      },
    ],
  },
  dev: {
    info: {
      name: 'cesium-mcp-dev',
      version: '1.139.4',
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

// Tool annotations for Smithery quality scoring
const TOOL_ANNOTATIONS = {
  flyTo: { title: 'Fly To Location', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  setView: { title: 'Set View', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  getView: { title: 'Get View', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  zoomToExtent: { title: 'Zoom to Extent', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  addGeoJsonLayer: { title: 'Add GeoJSON Layer', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  addLabel: { title: 'Add Label', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  addHeatmap: { title: 'Add Heatmap', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  removeLayer: { title: 'Remove Layer', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  setBasemap: { title: 'Set Basemap', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  screenshot: { title: 'Screenshot', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  highlight: { title: 'Highlight', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  addMarker: { title: 'Add Marker', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  addPolyline: { title: 'Add Polyline', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  addPolygon: { title: 'Add Polygon', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  addModel: { title: 'Add Model', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  updateEntity: { title: 'Update Entity', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  removeEntity: { title: 'Remove Entity', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  setLayerVisibility: { title: 'Set Layer Visibility', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  listLayers: { title: 'List Layers', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  updateLayerStyle: { title: 'Update Layer Style', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  playTrajectory: { title: 'Play Trajectory', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  load3dTiles: { title: 'Load 3D Tiles', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  loadTerrain: { title: 'Load Terrain', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  loadImageryService: { title: 'Load Imagery Service', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  lookAtTransform: { title: 'Look At Transform', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  startOrbit: { title: 'Start Orbit', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  stopOrbit: { title: 'Stop Orbit', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  setCameraOptions: { title: 'Set Camera Options', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  addBillboard: { title: 'Add Billboard', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  addBox: { title: 'Add Box', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  addCorridor: { title: 'Add Corridor', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  addCylinder: { title: 'Add Cylinder', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  addEllipse: { title: 'Add Ellipse', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  addRectangle: { title: 'Add Rectangle', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  addWall: { title: 'Add Wall', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  createAnimation: { title: 'Create Animation', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  controlAnimation: { title: 'Control Animation', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  removeAnimation: { title: 'Remove Animation', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  listAnimations: { title: 'List Animations', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  updateAnimationPath: { title: 'Update Animation Path', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  trackEntity: { title: 'Track Entity', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  controlClock: { title: 'Control Clock', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  setGlobeLighting: { title: 'Set Globe Lighting', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  list_toolsets: { title: 'List Toolsets', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  enable_toolset: { title: 'Enable Toolset', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
        instructions: srv.instructions,
      })

    case 'notifications/initialized':
      return null // notification, no response

    case 'tools/list':
      return jsonRpcResponse(id, {
        tools: srv.card.tools.map(t => ({
          ...t,
          annotations: TOOL_ANNOTATIONS[t.name] || undefined,
        })),
      })

    case 'resources/list':
      return jsonRpcResponse(id, {
        resources: srv.card.resources || [],
      })

    case 'prompts/list':
      return jsonRpcResponse(id, { prompts: srv.prompts || [] })

    case 'prompts/get':
      if (params?.name === 'cesium-quickstart') {
        return jsonRpcResponse(id, {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: 'Cesium MCP Quick Start Guide:\n\n1. Camera: flyTo(lng, lat) to navigate, setView for instant move, getView to read position\n2. Entities: addMarker for points, addPolygon/addPolyline for shapes, addModel for 3D models\n3. Layers: addGeoJsonLayer for vector data, load3dTiles for 3D city models\n4. Animation: createAnimation with waypoints, controlAnimation to play/pause\n5. Interaction: screenshot to capture view, highlight to emphasize features\n6. Discovery: list_toolsets to see tool groups, enable_toolset to activate more',
            },
          }],
        })
      }
      return jsonRpcError(id, -32602, `Unknown prompt: ${params?.name}`)

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
