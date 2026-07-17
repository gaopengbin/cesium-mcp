# cesium-mcp-runtime

## 1.143.3

### Patch Changes

- [`2c9bfd9`](https://github.com/gaopengbin/cesium-mcp/commit/2c9bfd958503cb6d6eedaecc694bc4ac497a80ea) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Use the shared JSON Schemas as the executable source for Runtime validation and defaults, align contract fields with Bridge support and CesiumJS 1.143 behavior, and expose the corrected schemas through WebMCP.

- Updated dependencies [[`2c9bfd9`](https://github.com/gaopengbin/cesium-mcp/commit/2c9bfd958503cb6d6eedaecc694bc4ac497a80ea)]:
  - cesium-mcp-contracts@0.4.0

## 1.143.2

### Patch Changes

- [`e1f3eaf`](https://github.com/gaopengbin/cesium-mcp/commit/e1f3eaffc009284ea67da6de2cba39f0aa419b67) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Publish canonical tool titles, MCP behavior annotations, and complete English and Chinese descriptions and parameter hints from the shared contracts package. Runtime tool and toolset registration now consumes that metadata while keeping Runtime-only credential tools separate.

- Updated dependencies [[`e1f3eaf`](https://github.com/gaopengbin/cesium-mcp/commit/e1f3eaffc009284ea67da6de2cba39f0aa419b67)]:
  - cesium-mcp-contracts@0.3.0

## 1.143.1

### Patch Changes

- [`d92a2bb`](https://github.com/gaopengbin/cesium-mcp/commit/d92a2bb0b7d55499174b596f9a41d7b92636f7ea) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Publish the canonical shared tool inventory and toolset definitions, re-export them from the WebMCP adapter, and derive the Runtime toolset manifest from those contracts while keeping credential and MCP discovery tools explicitly separated.

- Updated dependencies [[`d92a2bb`](https://github.com/gaopengbin/cesium-mcp/commit/d92a2bb0b7d55499174b596f9a41d7b92636f7ea)]:
  - cesium-mcp-contracts@0.2.0

## 1.143.0

### Minor Changes

- [`ed91e1a`](https://github.com/gaopengbin/cesium-mcp/commit/ed91e1ac3a81eb7e7e8febe588f17929ad183c2a) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Add transport-neutral Cesium tool contracts and a separate native WebMCP
  adapter package, then wire both into the browser-agent example without coupling
  WebMCP to the Cesium execution bridge or backend runtime. Provide 61 browser-safe
  contracts across 12 selectable WebMCP toolsets while keeping a 15-tool core mode.
  Update the tested
  CesiumJS baseline to 1.143 and refresh the MCP v1 SDK and WebSocket runtime
  dependencies to patched versions.

## 1.142.3

### Patch Changes

- [`4879ed8`](https://github.com/gaopengbin/cesium-mcp/commit/4879ed8053ca60abc1385f19b6129d7f3b6a059a) Thanks [@gaopengbin](https://github.com/gaopengbin)! - fix(entity): derive layerId from Cesium entity.id to avoid collisions in batchAddEntities

  The layer registration path for `addMarker` / `addPolyline` / `addPolygon` /
  `addModel` and the shared `_registerEntityLayer` (billboard / box / cylinder /
  ellipse / rectangle / wall / corridor) previously built `layerId` from
  `Date.now()`. When `batchAddEntities` loops these helpers synchronously within
  the same millisecond, multiple entities collide on the same layerId. The
  consequences: `LayerManager._cesiumRefs` (a Map) silently overwrites the
  earlier Cesium entity reference, `layers` (an Array) accumulates duplicate
  records with the same id, and any subsequent `removeLayer(id)` targets the
  overwritten (last) refs — so users see the wrong entity removed, or an
  "impossible to delete" entry that keeps its Cesium visual around.

  Now each layerId is `${type}_${entity.id}` where entity.id is Cesium's own
  UUID (unique per entity, generated at `new Entity({...})` time). The fix is
  targeted at the five in-memory synchronous paths; the async loaders in
  `LayerManager` (geojson / imagery / 3dtiles / czml / kml / heatmap) keep their
  `id ?? \`type\_\${Date.now()}\`` pattern because they are naturally spaced by
  awaited fetch/load and already accept an explicit id override.

  Also wraps the batchAddEntities loop with Cesium's official batch-insert
  optimization: `viewer.entities.suspendEvents()` / `resumeEvents()`, so
  `collectionChanged` fires once for the whole batch instead of per entity.

## 1.142.2

### Patch Changes

- [`fedeac5`](https://github.com/gaopengbin/cesium-mcp/commit/fedeac5a4bb503410b45398719f2625daf7764c4) Thanks [@gaopengbin](https://github.com/gaopengbin)! - fix(view): resolve flyTo/zoomToExtent promises on cancel and via a fallback timer

  `viewer.camera.flyToBoundingSphere` / `flyTo` may fire neither `complete` nor
  `cancel` when the camera is already near the target or the flight is preempted
  by a subsequent camera command. This left the awaited promise pending forever
  and surfaced as `浏览器响应超时（30000ms）` on the runtime side.

  Both handlers now also resolve on `cancel` and install a `duration + 1s`
  fallback timer as a last resort, so the WebSocket reply is always sent back
  to the runtime.

## 1.142.1

### Patch Changes

- [`2739034`](https://github.com/gaopengbin/cesium-mcp/commit/2739034f9ee06fe1f0ebfff2f2250b3666292f62) Thanks [@gaopengbin](https://github.com/gaopengbin)! - feat(layer): split updateLayerStyle into entity/imagery/primitive channels

  Replace the single untyped layerStyle param with three typed style channels:

  - `layerStyle` — entity layer style, including mutually-exclusive GeoJSON
    thematic styles (choropleth / category / randomColor / gradient)
  - `imageryStyle` — imagery visual style (alpha, brightness, contrast, hue,
    saturation, gamma); visibility stays controlled by setLayerVisibility
  - `primitiveStyle` — GeoJSON Primitive material style (color, opacity,
    outlineColor, outlineWidth, pointSize, lineWidth)

  Runtime adds zod schemas with mutual-exclusion refinement; the bridge keeps
  matching validation guards for non-MCP callers.

## 1.139.12

### Minor Changes

- feat: Streamable HTTP transport support — `--transport http --port 3211`, MCP_TRANSPORT / MCP_HTTP_PORT env vars
- feat: compatible with Dify MCP plugin (junjiem/mcp_sse_agent) via streamable_http transport

### Patch Changes

- fix: prevent WSS unhandled error crash on port conflict
- fix: improve error message — remove GeoAgent reference, show CesiumJS demo URL
- docs: add Dify integration tutorial in examples/dify-integration/

## 1.139.11

### Patch Changes

- chore: bump to align with bridge@1.139.11 (perception capability enhancements)

## 1.139.10

### Patch Changes

- fix: bin path corrected for `npx cesium-mcp-runtime` (`./dist/cli.js` → `dist/cli.js`)

## 1.139.9

### Patch Changes

- fix: highlight tool schema updated — layerId now optional, added `clear` parameter for restoring original styles

## 1.139.8

### Patch Changes

- feat: 9 new tools — getEntityProperties, clearAll, getLayerSchema, loadCzml, loadKml, measure, exportScene, setSceneOptions, setPostProcess
- feat: 3D Tiles styling support in updateLayerStyle (color, conditional, show filter)
- feat: enhanced GeoJSON styling — strokeWidth, randomColor, gradient/choropleth
- docs: comprehensive documentation update — 58 tools / 12 toolsets

## 1.139.7

### Patch Changes

- feat: i18n tool descriptions — CESIUM_LOCALE env var (en/zh-CN), all 49 tool descriptions and parameter hints available in both English and Chinese

## 1.139.6

### Patch Changes

- feat: P0 feature pack — 5 new tools (batchAddEntities, queryEntities, saveViewpoint, loadViewpoint, listViewpoints), enhanced addGeoJsonLayer with URL loading, 11 toolsets / 49 tools

## 1.139.5

### Patch Changes

- feat: add geocode tool with Nominatim/OSM integration — convert address/landmark to coordinates, HTTP proxy support (HTTPS_PROXY/HTTP_PROXY/ALL_PROXY), 11 toolsets / 44 tools

## 1.139.4

### Patch Changes

- fix: handle EADDRINUSE gracefully — prevent server crash when WebSocket port is already in use

## 1.139.3

### Patch Changes

- feat: fuse CesiumGS official tools — 19 new commands (camera 4, entity-types 7, animation 8), 10 toolsets with dynamic discovery, CESIUM_TOOLSETS env var, comprehensive documentation update

## 1.139.1

### Patch Changes

- fix: addMarker auto-generates layerId, updateLayerStyle supports marker entities and labelStyle/layerStyle params, zoomToExtent uses individual number params for OpenAI compatibility
