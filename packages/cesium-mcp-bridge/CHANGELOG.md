# cesium-mcp-bridge

## 1.145.1

## 1.145.0

### Minor Changes

- [`33daff9`](https://github.com/gaopengbin/cesium-mcp/commit/33daff93c32e74d5476dd8d9461b33bf3ad88139) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Close the canonical output-contract loop across Contracts, Bridge, and MCP Runtime. Shared tools now advertise their canonical output schemas, return MCP structured content alongside legacy text content, and validate browser execution results with an opt-out for custom integrations. Screenshot calls also preserve their PNG image content while exposing structured metadata.

### Patch Changes

- Updated dependencies [[`33daff9`](https://github.com/gaopengbin/cesium-mcp/commit/33daff93c32e74d5476dd8d9461b33bf3ad88139)]:
  - cesium-mcp-contracts@0.6.0

## 1.144.1

## 1.144.0

### Minor Changes

- [`87bb9d2`](https://github.com/gaopengbin/cesium-mcp/commit/87bb9d22f66922b272348b534eb575993e85beb0) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Complete the domain executor registry for all 60 browser-safe Bridge tools, remove the central command switch, and preserve the internal Ion-token compatibility command outside the shared AI tool surface.

### Patch Changes

- [`0740204`](https://github.com/gaopengbin/cesium-mcp/commit/0740204eab9d031704f01a04a21e2a62a4c68425) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Move interaction, scene, and tiles command paths into domain executor registries while preserving existing command results and override behavior.

- [`477f4f7`](https://github.com/gaopengbin/cesium-mcp/commit/477f4f7d66a0a38d1e8a61e8fb330710ca726310) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Move the entity and layer command paths into domain executor registries with shared-contract coverage tests and unchanged command result shapes.

- [`6316dcf`](https://github.com/gaopengbin/cesium-mcp/commit/6316dcf1bc3e0c0bc8d5bae6dd1c281808fdb12e) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Move the view and advanced-camera command paths into domain executor registries while preserving command results and user override precedence.

- [`98f980b`](https://github.com/gaopengbin/cesium-mcp/commit/98f980bf447f2091625ed4772b7fb02235159529) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Isolate browser sessions with exact fail-closed routing and response ownership, and strengthen Bridge disposal by cancelling pending viewer activity and releasing internal references.

- [`b2b9c92`](https://github.com/gaopengbin/cesium-mcp/commit/b2b9c92db6034e8ecb6c17f5a139ec6bf960bb30) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Add shared runtime input validation, per-command Bridge executor overrides, per-Viewer state isolation, and an idempotent Bridge lifecycle cleanup API.

- Updated dependencies [[`b2b9c92`](https://github.com/gaopengbin/cesium-mcp/commit/b2b9c92db6034e8ecb6c17f5a139ec6bf960bb30)]:
  - cesium-mcp-contracts@0.5.0

## 1.143.4

## 1.143.4-next.1

## 1.143.4-next.0

### Patch Changes

- Rebuild the browser bundle with the existing heatmap.js strict-mode patch
  applied, avoiding assignment to the read-only `ImageData.data` property.

## 1.143.3

### Patch Changes

- [`2c9bfd9`](https://github.com/gaopengbin/cesium-mcp/commit/2c9bfd958503cb6d6eedaecc694bc4ac497a80ea) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Use the shared JSON Schemas as the executable source for Runtime validation and defaults, align contract fields with Bridge support and CesiumJS 1.143 behavior, and expose the corrected schemas through WebMCP.

## 1.143.2

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
