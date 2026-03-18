# cesium-mcp-runtime

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
