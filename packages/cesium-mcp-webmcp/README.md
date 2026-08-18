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
import { isWebMcpSupported, registerCesiumWebMcp } from 'cesium-mcp-webmcp'

const bridge = new CesiumBridge(viewer)
const registration = isWebMcpSupported()
  ? await registerCesiumWebMcp(bridge, {
      toolsets: 'all',
      excludeTools: ['geocode'],
    })
  : undefined

// Remove only the tools owned by this registration.
registration?.unregister()
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

Use `buildCesiumWebMcpTools()` when an application needs to inspect the final WebMCP payloads or register them manually with additional browser-specific options:

```typescript
import { buildCesiumWebMcpTools } from 'cesium-mcp-webmcp'

const tools = buildCesiumWebMcpTools(bridge, {
  toolsets: ['view', 'entity'],
})
```

## React StrictMode

Pass an external abort signal from the component lifecycle. Cleanup aborts the active batch immediately, unregisters tools that were already added, and prevents a superseded StrictMode mount from continuing with the remaining names:

```typescript
useEffect(() => {
  if (!viewer || !isWebMcpSupported()) return

  const controller = new AbortController()
  void registerCesiumWebMcp(new CesiumBridge(viewer), {
    toolsets: 'all',
    signal: controller.signal,
  }).catch(error => {
    if (!controller.signal.aborted) console.error(error)
  })

  return () => controller.abort()
}, [viewer])
```

## Browser bundle

The package also publishes a Cesium-free IIFE bundle:

```html
<script src="./node_modules/cesium-mcp-webmcp/dist/cesium-mcp-webmcp.browser.global.js"></script>
<script>
  await CesiumMcpWebMcp.registerCesiumWebMcp(executor, { toolsets: 'all' })
</script>
```

The global is named `CesiumMcpWebMcp`. This package targets the native WebMCP API and deliberately does not install or bundle third-party polyfills.
