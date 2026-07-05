---
'cesium-mcp-bridge': patch
'cesium-mcp-runtime': patch
'cesium-mcp-dev': patch
---

fix(entity): derive layerId from Cesium entity.id to avoid collisions in batchAddEntities

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
`id ?? \`type_\${Date.now()}\`` pattern because they are naturally spaced by
awaited fetch/load and already accept an explicit id override.

Also wraps the batchAddEntities loop with Cesium's official batch-insert
optimization: `viewer.entities.suspendEvents()` / `resumeEvents()`, so
`collectionChanged` fires once for the whole batch instead of per entity.
