import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { AppSessionRequest } from './mcp-app-session.js'
import { cesiumMapOrigins, cesiumMapDataOrigins } from './mcp-app-policy.js'
import { cesiumMapIcons } from './map-icon.js'

export const cesiumAppUri = 'ui://cesium-mcp/map-v10.html'

export function cesiumAppDomain(configuredDomain?: string): string | undefined {
  if (!configuredDomain) return undefined
  const url = new URL(configuredDomain)
  const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new Error('CESIUM_APP_DOMAIN must use HTTPS or loopback HTTP')
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CESIUM_APP_DOMAIN must be an origin without credentials, path, query, or fragment')
  }
  return url.origin
}

export function readCesiumAppAsset(name: 'map-app.html' | 'map-preview.html' | 'map-preview.js'): string {
  // Source runs and npm-installed runs use the same built artifact.
  const folder = import.meta.url.endsWith('.ts') ? '../dist/' : './'
  try {
    return readFileSync(fileURLToPath(new URL(`${folder}${name}`, import.meta.url)), 'utf8')
  } catch {
    throw new Error('Cesium MCP App assets are missing. Build cesium-mcp-runtime before opening the map.')
  }
}

export function registerCesiumApp(
  server: McpServer,
  handleSession: (operation: 'connect' | 'exchange' | 'disconnect', request: AppSessionRequest) => Promise<Record<string, unknown>>,
  openSession: (existing?: string) => string = existing => existing ?? `map-${randomUUID()}`,
): void {
  const domain = cesiumAppDomain(process.env.CESIUM_APP_DOMAIN)
  const origins = [...cesiumMapOrigins, ...cesiumMapDataOrigins()]
  const resourceMeta = () => ({
    'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] },
    ui: {
      prefersBorder: false,
      ...(domain ? { domain } : {}),
      csp: {
        connectDomains: origins,
        resourceDomains: [...origins, 'blob:'],
      },
    },
  })

  registerAppResource(server, 'Cesium map', cesiumAppUri, {
    description: 'Interactive CesiumJS map with session routing and selected-object context.',
    _meta: resourceMeta(),
  }, async () => ({
    contents: [{
      uri: cesiumAppUri,
      mimeType: RESOURCE_MIME_TYPE,
      text: readCesiumAppAsset('map-app.html'),
      _meta: resourceMeta(),
    }],
  }))

  registerAppTool(server, 'openCesiumMap', {
    title: 'Cesium Map',
    // ext-apps forwards standard MCP fields but does not yet type `icons`.
    ...{ icons: cesiumMapIcons },
    description: 'Open an interactive 3D map beside the conversation. Pass the returned sessionId to every map tool. Call once to open the map, then wait until its browser session connects before sending commands. Optionally reopen a known session.',
    inputSchema: z.object({ sessionId: z.string().min(1).max(128).optional() }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    _meta: {
      ui: { resourceUri: cesiumAppUri, visibility: ['model', 'app'] },
      'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] },
    },
  }, async ({ sessionId }) => {
    const connection = {
      sessionId: openSession(sessionId),
      transport: 'mcp',
    }
    return {
      content: [{
        type: 'text',
        text: `Cesium map session: ${connection.sessionId}. Use this sessionId for subsequent map tools. The map will publish its view and selected entity as context after connecting.`,
      }],
      structuredContent: connection,
    }
  })

  const sessionId = z.string().min(1).max(128)
  const token = z.string().uuid()
  const schemas = {
    connect: z.object({ sessionId }),
    exchange: z.object({
      sessionId, token,
      results: z.array(z.object({
        id: z.string(), result: z.unknown().optional(), error: z.object({ message: z.string() }).optional(),
      })).max(100).optional(),
    }),
    disconnect: z.object({ sessionId, token }),
  }
  for (const operation of ['connect', 'exchange', 'disconnect'] as const) {
    const name = { connect: 'connectCesiumMap', exchange: 'exchangeCesiumMap', disconnect: 'disconnectCesiumMap' }[operation]
    registerAppTool(server, name, {
      description: `Internal map app transport: ${operation}.`,
      inputSchema: schemas[operation],
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { visibility: ['app'] } },
    }, async (request: AppSessionRequest): Promise<CallToolResult> => {
      try {
        const structuredContent = await handleSession(operation, request)
        return { content: [], structuredContent }
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }
      }
    })
  }
}
