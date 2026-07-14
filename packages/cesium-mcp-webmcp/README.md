# cesium-mcp-webmcp

Native WebMCP registration for Cesium browser tools. This package owns only the `document.modelContext` adapter and uses transport-neutral contracts from `cesium-mcp-contracts`.

It does not include CesiumJS, the Cesium execution bridge, a backend MCP server, or a WebMCP polyfill.

## Install

```bash
npm install cesium cesium-mcp-bridge cesium-mcp-webmcp
```

## Usage

```typescript
import { CesiumBridge } from 'cesium-mcp-bridge'
import { registerCesiumWebMcp } from 'cesium-mcp-webmcp'

const bridge = new CesiumBridge(viewer)
const registration = await registerCesiumWebMcp(bridge, {
  toolsets: 'all',
  excludeTools: ['geocode'],
})

// Remove only the tools owned by this registration.
registration.unregister()
```

`registerCesiumWebMcp()` defaults to the 15-contract `core` selection. Pass `toolsets: 'all'` for all 61 browser-safe tools, one toolset name, or an array such as `['view', 'entity', 'layer']`. To register a custom contract subset, pass `tools`, or call the lower-level `registerWebMcpTools()` function.

```typescript
import { registerCesiumWebMcp } from 'cesium-mcp-webmcp'

await registerCesiumWebMcp(bridge, {
  toolsets: ['view', 'entity', 'layer'],
})
```

An explicit `tools` array takes precedence over `toolsets`, and `excludeTools` removes individual contracts afterward. The Bridge directly executes 60 of the 61 browser-safe contracts. `geocode` needs an application-provided executor handler, as shown by the browser-agent example. `setIonToken` is never part of the browser-safe collection because credentials should remain application-owned.

The executor is structural: any object implementing `execute({ action, params })` can be used. A backend `cesium-mcp-runtime` process is not required.

## Browser bundle

The package also publishes a Cesium-free IIFE bundle:

```html
<script src="./node_modules/cesium-mcp-webmcp/dist/cesium-mcp-webmcp.browser.global.js"></script>
<script>
  await CesiumMcpWebMcp.registerCesiumWebMcp(executor, { toolsets: 'all' })
</script>
```

The global is named `CesiumMcpWebMcp`. This package targets the native WebMCP API and deliberately does not install or bundle third-party polyfills.
