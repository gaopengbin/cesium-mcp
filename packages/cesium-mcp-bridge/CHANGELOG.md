# cesium-mcp-bridge

## 1.143.1

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

## 1.139.11

### Patch Changes

- feat: screenshot adds 5s timeout fallback — if postRender doesn't fire, directly captures canvas
- feat: queryEntities computes centroid from polygon/polyline geometry for bbox matching (entities without position property)
- feat: queryEntities uses bounding box intersection instead of point containment for geometry entities
- feat: getEntityProperties extracts description, material color, polygon/polyline coordinates
- feat: getEntityProperties falls back to geometry centroid for position-less entities
- feat: layer schema extracts 3DTiles/Ion metadata (asset version, geometricError, boundingSphere center, ionAssetId)

## 1.139.10

### Patch Changes

- fix: queryEntities now searches DataSource entities (GeoJSON/CZML/KML layers) — previously only checked viewer.entities, missing all layer-loaded features
- fix: getEntityProperties now finds entities across all DataSources
- feat: highlight supports backup/restore — `clear: true` precisely restores original material/color/size
- feat: highlight supports global clear (no layerId) to restore all highlighted entities
- feat: highlight expanded from 3 to 13 entity types (added billboard, model, label, box, cylinder, ellipse, rectangle, wall, corridor)
- refactor: queryEntities deduplicates type detection via shared `detectEntityType` helper

## 1.139.9

### Patch Changes

- fix: use Cesium native APIs for flyTo/setView to fix view centering — target point now precisely centered in viewport at all pitch/heading angles
  - flyTo: replaced manual `_offsetCamera()` with `camera.flyToBoundingSphere` + `HeadingPitchRange`
  - setView: replaced offset approach with `camera.lookAt` + `lookAtTransform(Matrix4.IDENTITY)`

## 1.139.8

### Patch Changes

- feat: 9 new commands — getEntityProperties, clearAll, getLayerSchema, loadCzml, loadKml, measure, exportScene, setSceneOptions, setPostProcess
- feat: 3D Tiles styling support in updateLayerStyle
- docs: comprehensive documentation update

## 1.139.7

### Patch Changes

- chore: version bump to align with cesium-mcp-runtime v1.139.7

## 1.139.6

### Patch Changes

- feat: P0 feature pack — batchAddEntities (bulk entity creation), queryEntities (filter by name/type/bbox), viewpoint bookmarks (save/load/list), GeoJSON URL loading support

## 1.139.5

## 1.139.4

## 1.139.3

### Patch Changes

- feat: fuse CesiumGS official tools — 19 new commands (camera 4, entity-types 7, animation 8), 10 toolsets with dynamic discovery, CESIUM_TOOLSETS env var, comprehensive documentation update

## 1.139.1

### Patch Changes

- fix: addMarker auto-generates layerId, updateLayerStyle supports marker entities and labelStyle/layerStyle params, zoomToExtent uses individual number params for OpenAI compatibility
