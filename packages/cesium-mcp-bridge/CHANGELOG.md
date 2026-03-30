# cesium-mcp-bridge

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
