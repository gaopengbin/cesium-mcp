#!/usr/bin/env node

import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { buildDevMcpServer } from './server.js'
import { createNodeTelemetry } from 'cesium-mcp-telemetry/node'

declare const __VERSION__: string
const telemetry = createNodeTelemetry({ product: 'dev', version: typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev', enabled: !process.argv.includes('--no-telemetry') })

serveStdio(() => buildDevMcpServer(telemetry))
telemetry.record('started')
console.error('[cesium-mcp-dev] MCP Server running (stdio), 3 tools registered')
