# WebMCP Browser Integration

Use WebMCP when you want a compatible browser agent to discover and call Cesium tools that belong to the current page. The tools run through the same `cesium-mcp-bridge` command layer, but no `cesium-mcp-runtime`, WebSocket server, or desktop MCP client is required.

> WebMCP is currently an experimental Chrome feature. The hosted demo is enrolled in the Chrome 149–156 Origin Trial. For localhost development, enable the WebMCP testing flags described below.

## Try the hosted demo

Open the [Cesium Agent Lab](https://cesium-browser-agent.pages.dev/) in Chrome. The status panel should report **WebMCP ready — 61 page tools registered**.

The demo has two independent AI paths:

- A compatible browser agent can discover the page's WebMCP tools.
- The built-in chat demonstrates a hosted function-calling agent and remains available when WebMCP is unavailable.

The hosted chat is a convenience for the demo, not a requirement for using `cesium-mcp-webmcp` in your own application.

## Install in an existing Cesium app

```bash
npm install cesium cesium-mcp-bridge cesium-mcp-webmcp
```

Register the tools after creating your Cesium viewer:

```ts
import { CesiumBridge } from 'cesium-mcp-bridge'
import { registerCesiumWebMcp } from 'cesium-mcp-webmcp'

const bridge = new CesiumBridge(viewer)

const registration = await registerCesiumWebMcp(bridge, {
  toolsets: 'all',
  excludeTools: ['geocode'],
})

// Call this when the page or component is unmounted.
registration.unregister()
```

`registerCesiumWebMcp()` registers the 15-tool `core` selection by default. Use `toolsets: 'all'` for all 61 browser-safe tools, or select only what the page needs:

```ts
await registerCesiumWebMcp(bridge, {
  toolsets: ['view', 'entity', 'layer'],
})
```

The 12 available toolsets are `view`, `entity`, `layer`, `camera`, `entity-ext`, `animation`, `scene`, `tiles`, `interaction`, `trajectory`, `heatmap`, and `geolocation`.

## Application-owned operations

The bridge directly executes 60 of the 61 browser-safe contracts. `geocode` needs an application-provided handler because it calls an external service:

```ts
const executor = {
  execute(command) {
    if (command.action === 'geocode') {
      return yourGeocoder(command.params)
    }

    return bridge.execute(command)
  },
}

await registerCesiumWebMcp(executor, { toolsets: 'all' })
```

`setIonToken` is intentionally not exposed as a page tool. Cesium ion tokens and model-provider API keys remain application-owned secrets. Do not place private keys in tool schemas, tool results, or browser storage.

## Test on localhost

1. Open `chrome://flags/#enable-webmcp-testing` and enable WebMCP testing.
2. Enable `chrome://flags/#devtools-webmcp-support` to inspect tools in DevTools.
3. Restart Chrome.
4. Run the standalone example:

```bash
npm install
npm run build
npm run dev -w examples/webmcp-integration
```

5. Open the local URL and inspect **DevTools → Application → WebMCP**.

For an HTTPS production origin during the trial period, register that exact origin for the Chrome WebMCP Origin Trial and provide its token through the page metadata or response header.

## Capability detection and cleanup

WebMCP is not available in every browser. Keep the application usable without it and treat registration as an enhancement:

```ts
if ('modelContext' in document) {
  const registration = await registerCesiumWebMcp(bridge)
  // Store registration and unregister it during teardown.
}
```

The package targets the native `document.modelContext` API and does not install a polyfill.

## What this package does not include

- No backend MCP server
- No WebSocket transport
- No AI model or chat interface
- No CesiumJS runtime bundle
- No credential management

For desktop clients such as Claude Desktop, Cursor, or VS Code, use [`cesium-mcp-runtime`](/guide/getting-started). For a complete npm + Vite integration, see [`examples/webmcp-integration`](https://github.com/gaopengbin/cesium-mcp/tree/main/examples/webmcp-integration).
