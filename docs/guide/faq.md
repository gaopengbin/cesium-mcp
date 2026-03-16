# FAQ

## Connection Issues

### WebSocket connection failed

**Symptom**: The browser console shows `WebSocket connection to 'ws://localhost:9100' failed`.

**Solutions**:
1. Make sure `cesium-mcp-runtime` is running: `npx cesium-mcp-runtime`
2. Check the port — if port 9100 is in use, set a custom port:
   ```bash
   CESIUM_WS_PORT=9200 npx cesium-mcp-runtime
   ```
   And update the bridge config accordingly:
   ```js
   new CesiumBridge(viewer, { wsUrl: 'ws://localhost:9200' })
   ```
3. If using HTTPS, the browser blocks mixed content (wss:// is required). Use a reverse proxy or tunnel (e.g. ngrok).

### Bridge connects but tools don't work

**Symptom**: The runtime log shows `browser connected`, but AI tool calls return errors.

**Solutions**:
1. Ensure the CesiumJS Viewer is fully initialized before creating the bridge
2. Check the browser console for JavaScript errors
3. Verify the `sessionId` matches between bridge and runtime (default: `'default'`)

## Tool Issues

### "No browser connected" error

The runtime can't find a connected browser session.

1. Open your CesiumJS app in the browser
2. Check that the bridge initialization code is running (look for `[CesiumBridge] connected` in browser console)
3. If using multiple tabs, set unique `sessionId` for each

### Only some tools are available

By default, only core toolsets are enabled. To enable all 49 tools:

```bash
CESIUM_TOOLSETS=all npx cesium-mcp-runtime
```

Or use dynamic discovery — ask your AI agent: *"List available toolsets"*, then *"Enable the animation toolset"*.

### flyTo doesn't animate

If `flyTo` jumps instead of animating, check:
1. The `duration` parameter (default: 2 seconds)
2. CesiumJS scene mode — 2D mode doesn't support smooth fly-to
3. Some AI clients have short timeouts — increase the MCP timeout if needed

## Configuration

### How to use a Cesium Ion access token?

Set your token in the CesiumJS app before creating the Viewer:

```js
Cesium.Ion.defaultAccessToken = 'YOUR_TOKEN_HERE'
```

The bridge doesn't handle tokens — they are managed by your CesiumJS application.

### How to change the WebSocket port?

Set the `CESIUM_WS_PORT` environment variable:

```bash
CESIUM_WS_PORT=9200 npx cesium-mcp-runtime
```

### Can I use remote/cloud mode?

Yes. The runtime supports Streamable HTTP mode for remote access:

```bash
npx cesium-mcp-runtime --mode http --port 3000
```

Or use the hosted endpoint at `https://mcp.gpb.cc`.

## Compatibility

### Which CesiumJS versions are supported?

cesium-mcp v1.139.x targets CesiumJS ~1.139.0. The bridge uses stable CesiumJS APIs and generally works with CesiumJS 1.100+, but newer features (like 3D Tiles styling) may require recent versions.

### Which AI clients work?

Any MCP-compatible client works:
- **Claude Desktop** — full support
- **VS Code GitHub Copilot** — full support
- **Cursor** — full support
- **Windsurf** — full support
- **Custom clients** — any implementation following the [MCP specification](https://modelcontextprotocol.io/)

### Does it work with TypeScript?

Yes. All packages ship with TypeScript declarations. The bridge exports all type definitions:

```ts
import type { BridgeCommand, EntityOptions, LayerInfo } from 'cesium-mcp-bridge'
```
