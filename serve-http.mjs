/**
 * Backward-compatible HTTP launcher.
 *
 * Prefer `npx cesium-mcp-runtime --transport http --port 8787` for new
 * deployments. This file now delegates to the same MCP SDK v2 runtime entry
 * so it cannot drift into a second transport implementation.
 */
import { main } from './packages/cesium-mcp-runtime/dist/index.js'

const port = process.env.MCP_HTTP_PORT ?? '8787'

main(['--transport', 'http', '--port', port]).catch(error => {
  console.error('[cesium-mcp-http] Fatal:', error)
  process.exit(1)
})
