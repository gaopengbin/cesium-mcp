# Cesium WebMCP Integration

A focused npm + Vite example for adding native WebMCP tools to an existing CesiumJS application. It is intentionally separate from the hosted browser-agent demo and does not include an AI chat UI or an MCP server.

## Run

```bash
npm install
npm run dev
```

Enable Chrome's WebMCP testing flag for localhost, then open the page and inspect DevTools → Application → WebMCP.

## Integration boundary

An existing CesiumJS application installs only `cesium-mcp-webmcp`. The package's `/viewer` entry includes the Bridge dependency, while the root entry keeps the low-level adapter available for custom executors.

```ts
import { CesiumBridge } from 'cesium-mcp-webmcp/viewer'
import { registerCesiumWebMcp } from 'cesium-mcp-webmcp'

const bridge = new CesiumBridge(viewer)
const executor = {
  execute(command) {
    if (command.action === 'geocode') return yourGeocoder(command.params)
    return bridge.execute(command)
  },
}

const registration = await registerCesiumWebMcp(executor, {
  toolsets: 'all',
})
```

- `cesium-mcp-webmcp/viewer` provides the packaged Cesium Bridge.
- `cesium-mcp-webmcp` registers transport-neutral contracts on `document.modelContext`.
- The application owns credentials and optional services such as geocoding.
- Call `registration.unregister()` when the page or component is unmounted.

For a smaller surface, use `toolsets: ['view', 'entity', 'layer']`. Never expose Cesium ion or model-provider credentials as page tools.
