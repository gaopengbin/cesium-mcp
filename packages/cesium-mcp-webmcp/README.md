# cesium-mcp-webmcp

Native WebMCP registration for Cesium browser tools. The `/viewer` entry provides a one-package CesiumJS integration, while the package root remains a lightweight `document.modelContext` adapter for custom executors.

It does not bundle CesiumJS, a backend MCP server, or a WebMCP polyfill.

## Install

```bash
npm install cesium-mcp-webmcp
```

`cesium` remains a peer dependency because the host application owns its Viewer. `cesium-mcp-bridge` and the shared contracts are installed automatically.

## One-package Viewer API

```typescript
import {
  isWebMcpSupported,
  registerCesiumViewerWebMcp,
} from 'cesium-mcp-webmcp/viewer'

const registration = isWebMcpSupported()
  ? await registerCesiumViewerWebMcp(viewer, {
      toolsets: 'all',
      excludeTools: ['geocode'],
    })
  : undefined

// Remove only the tools owned by this registration.
registration?.unregister()
```

The returned object includes `registration.bridge` for direct commands. `unregister()` removes the page tools and disposes the package-owned Bridge while leaving the application-owned Viewer intact.

`registerCesiumViewerWebMcp()` defaults to the 15-contract `core` selection. Pass `toolsets: 'all'` for all 61 browser-safe tools, one toolset name, or an array such as `['view', 'entity', 'layer']`. To register a custom contract subset, pass `tools`.

```typescript
import { registerCesiumViewerWebMcp } from 'cesium-mcp-webmcp/viewer'

await registerCesiumViewerWebMcp(viewer, {
  toolsets: ['view', 'entity', 'layer'],
})
```

An explicit `tools` array takes precedence over `toolsets`, and `excludeTools` removes individual contracts afterward. The Bridge directly executes 60 of the 61 browser-safe contracts. `geocode` needs an application-provided executor handler, as shown by the browser-agent example. `setIonToken` is never part of the browser-safe collection because credentials should remain application-owned.

The lower-level adapter remains available from the package root for applications that already own an executor. Any object implementing `execute({ action, params })` can be passed to `registerCesiumWebMcp()`. A backend `cesium-mcp-runtime` process is not required.

Use `buildCesiumWebMcpTools()` when an application needs to inspect the final WebMCP payloads or register them manually with additional browser-specific options:

```typescript
import { buildCesiumWebMcpTools } from 'cesium-mcp-webmcp'
import { CesiumBridge } from 'cesium-mcp-webmcp/viewer'

const bridge = new CesiumBridge(viewer)
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
  void registerCesiumViewerWebMcp(viewer, {
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
