# Cesium WebMCP Integration

A focused npm + Vite example for adding native WebMCP tools to an existing CesiumJS application. It is intentionally separate from the hosted browser-agent demo and does not include an AI chat UI or an MCP server.

## Run

```bash
npm install
npm run dev
```

Enable Chrome's WebMCP testing flag for localhost, then open the page and inspect DevTools → Application → WebMCP.

## Integration boundary

```ts
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

- `cesium-mcp-bridge` executes Cesium commands.
- `cesium-mcp-webmcp` registers transport-neutral contracts on `document.modelContext`.
- The application owns credentials and optional services such as geocoding.
- Call `registration.unregister()` when the page or component is unmounted.

For a smaller surface, use `toolsets: ['view', 'entity', 'layer']`. Never expose Cesium ion or model-provider credentials as page tools.
