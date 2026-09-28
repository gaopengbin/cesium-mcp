# Resource Handles

Large GeoJSON and CZML payloads should not be repeated through every model tool call. Cesium MCP can store the payload once and pass a compact `resourceId` to later visualization tools.

```text
GeoJSON / CZML payload
        ↓ storeResource
session-scoped resourceId
        ↓ addGeoJsonLayer / loadCzml / addHeatmap / ...
adapter resolves data
        ↓
unchanged Cesium Bridge action
```

The resource layer belongs to the MCP or WebMCP adapter. It does not change the browser Bridge protocol and it does not mix transient payloads with Cesium scene state.

## MCP runtime

`storeResource`, `listResources`, and `deleteResource` are always available independently of toolset selection:

```json
{
  "name": "storeResource",
  "arguments": {
    "kind": "geojson",
    "data": {
      "type": "FeatureCollection",
      "features": []
    }
  }
}
```

Use the returned ID instead of repeating `data`:

```json
{
  "name": "addGeoJsonLayer",
  "arguments": {
    "resourceId": "resource_mabc_1",
    "name": "Boundaries"
  }
}
```

Runtime stores are isolated by browser `sessionId`. The same ID is not visible to a different browser session.

## WebMCP and function calling

Resource tools are opt-in for existing applications, so the default 15-tool surface remains unchanged:

```ts
const registration = await registerCesiumViewerWebMcp(viewer, {
  enableResources: true,
})

const stored = registration.resourceStore!.register({
  kind: 'geojson',
  data: largeFeatureCollection,
})
```

An application may also provide its own store:

```ts
const resourceStore = createCesiumResourceStore()

await registerCesiumViewerWebMcp(viewer, {
  resourceStore,
  toolsets: 'all',
})
```

The hosted Browser Agent enables these tools and shares one page-local store between native WebMCP and its built-in function-calling agent.

## Supported consumers

| Resource kind | Tools accepting `resourceId` |
|---|---|
| `geojson` | `addGeoJsonLayer`, `addGeoJsonPrimitive`, `addLabel`, `addHeatmap` |
| `czml` | `loadCzml` |
| `json` | Reserved for application and future analysis tools |

## Lifecycle and limits

- In-memory and intentionally ephemeral; resources are not scene persistence.
- Default expiry: 30 minutes after registration.
- Default capacity: 100 resources per store.
- Default maximum: 10 MiB per resource.
- `listResources` returns metadata only, never the stored payload.
- This store is suitable for one Runtime process or one browser page. Multi-instance deployments should provide a shared storage adapter in a future implementation.

Existing `data` and `url` inputs remain fully compatible. `resourceId` is mutually exclusive with both.
