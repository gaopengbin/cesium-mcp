# Vector tiles

`loadVectorTiles` connects vector 3D Tiles and native MVT sources to the same layer lifecycle. Enable the `tiles` toolset first. The `layer` toolset provides styling, visibility, schema lookup and selection metadata.

```json
{
  "source": "mvt",
  "id": "rivers",
  "url": "https://your-tile-server.example/{z}/{x}/{y}.pbf",
  "minZoom": 6,
  "maxZoom": 12,
  "extent": [85, 25, 89, 29],
  "featureIdProperty": "river_id",
  "clampTarget": "terrain",
  "tileStyle": {
    "color": { "conditions": [["Number(${ORD_FLOW}) <= 3", "color('#38bdf8')"], ["true", "color('#22c55e')"]] },
    "lineWidth": "5.0 - clamp(Number(${ORD_FLOW}), 0.0, 10.0) * 0.4"
  }
}
```

Use real fields from your source. `ORD_FLOW` belongs to HydroRIVERS; the public Natural Earth test fixture has `name`, `scalerank` and `ne_id`, without discharge or flow-order measurements.

For vector 3D Tiles use `source: "tileset"` and either `url` or `ionAssetId`. The [official HydroRIVERS example](https://github.com/CesiumGS/cesium/blob/main/packages/sandcastle/gallery/3d-tiles-property-lod-river/main.js) uses asset `5135960`; access depends on the browser's ion token and account permissions. A missing or inaccessible asset returns an error.

Click a rendered feature, then call `getSelectedTileFeature`. It returns a JSON snapshot of metadata and the managed `layerId`, or `feature: null`. Clicking empty space, hiding/removing the layer, clearing the map, or disposing the Bridge clears selection. It does not query the entire source dataset. Values with integer precision beyond JSON numbers are represented as strings.

An Agent can use the returned `layerId` with `updateLayerStyle`:

```json
{ "layerId": "rivers", "tileStyle": { "color": "color('#ff8800')", "lineWidth": 7 } }
```

Styles apply to the layer; use conditions on real attributes or the MVT `_layer` property for feature groups. `color`, `show`, `lineWidth`, `pointSize`, `pointOutlineColor`, and `pointOutlineWidth` are supported. A style update preserves unspecified expressions. `getLayerSchema` samples loaded features and returns the applied expressions in `metadata.tileStyle`. `setLayerVisibility`, `zoomToLayer`, `removeLayer`, and `clearAll` work for both source formats. A failed replacement preserves the original layer.

## Runtime and browser support

- This checkout renders with CesiumJS 1.145 (engine 26.3, widgets 16.2). Vector support remains experimental. Both source formats accept `clampTarget`: `none` (default), `terrain`, `3d-tiles`, or `ground` (terrain and 3D Tiles). `clampToGround: true` is a terrain shortcut; an explicit target takes precedence. Reload a layer to change its target. Receiving tilesets loaded with `load3dTiles` are connected to the same scene automatically.
- MVT URLs must use the `/{z}/{x}/{y}` path order. Query-only XYZ templates cannot be decoded correctly by this provider and are rejected.
- Draped line/polygon picking uses a compatibility adapter for Cesium 1.145's currently displayed vector buffers and the clicked surface depth. It honours hidden features and polygon holes, with a 200,000-vertex click budget; this is not a full-dataset spatial query. It requires depth-based position picking and must be reviewed on a renderer upgrade. Point features use native picking and retain the renderer's point-height behaviour.
- Bridge requests follow-up rendering frames after restyling. After a viewport resize, it reapplies draped styles once the new surface tiles are loaded so cached surface colours do not revert. The browser panel test checks actual screenshot pixels; it needs Python with Pillow in addition to Chrome and Playwright.
- MVT zoom defaults to 0–6. Higher zooms need a bounded extent, and coverage is capped at 50,000 deepest-level tiles to avoid allocating an enormous hierarchy.
- Tile servers must allow browser CORS. For custom sources in an MCP Apps panel, configure `CESIUM_MAP_DATA_ORIGINS` with comma-separated HTTPS origins, or HTTP loopback origins for local testing. Restart the Runtime and reopen the panel so its host receives the updated content policy. The host can impose additional restrictions.
- Ordinary browser integrations set `Cesium.Ion.defaultAccessToken` in the browser. The built-in Runtime viewer reads `CESIUM_ION_TOKEN`. Do not put a token into tracked source or pass one as an Agent prompt.

## Local acceptance test

Download the public-domain [Natural Earth river source](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_rivers_lake_centerlines.geojson) into `artifacts/vector-tiles/natural-earth-rivers.geojson`, then build the contracts, Bridge and Runtime.

```powershell
node scripts/test-vector-tiles.mjs
$env:DRAPE = '1'
node scripts/test-vector-tiles.mjs
$env:MVT = '1'
node scripts/test-vector-tiles.mjs
```

The test serves actual river coordinates and attributes as local vector glTF / MVT, starts an isolated Runtime, renders in Chrome, physically clicks a feature, reads it through the Runtime, restyles, reads back the style, hides and removes the layer. `DRAPE=1` uses artificial constant-height terrain to independently verify rendered heights; it is not a real elevation dataset. Reports and screenshots are saved under `artifacts/vector-tiles`. They validate local integration, not HydroRIVERS access or a production deployment. `node scripts/test-vector-tiles-app.mjs` also checks the MCP Apps panel, narrow-screen layout and ordinary entity selection.

For a real model tool loop, clear `DRAPE`, set `AGENT=1` and run `node --import tsx scripts/test-vector-tiles.mjs`. This requires a working, logged-in local Codex CLI; a model timeout is recorded as a failed Agent test. The local preview uses an ephemeral HTTPS provider configuration and does not change the user's Codex settings.

Alternatively set `AGENT=workers-ai` to use this project's existing browser Agent endpoint. It calls real Runtime MCP tools against the rendered river and verifies the final rendered color. This mode sends the clicked public feature metadata to that endpoint and consumes its model quota.

Set `TARGET=3d-tiles` or `TARGET=ground` together with `DRAPE=1` to test an artificial raised receiving tileset. `MIXED=1` adds clearly labelled synthetic point/polygon QA fixtures alongside the real river test.

`node scripts/preview-vector-tiles.mjs` leaves a local interactive river preview at `http://127.0.0.1:19351/`, with the current map assistant and public river fixtures. Stop its process to close the preview services.
