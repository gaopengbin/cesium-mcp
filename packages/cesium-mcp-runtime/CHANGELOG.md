# cesium-mcp-runtime

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
