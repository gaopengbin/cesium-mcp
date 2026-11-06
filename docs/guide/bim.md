# BIM elements and quantity statistics

The optional `bim` toolset connects the official Cesium ion Asset Elements REST API to the current Viewer. The renderer baseline is CesiumJS 1.147. Query transport uses the same official REST routes, with bounded responses and cancellation; native IonAssetElementService response parity is checked locally.

Enable `bim` using `enable_toolset`, or set `CESIUM_TOOLSETS=view,layer,tiles,bim,interaction`. The same contracts are available through Bridge and WebMCP (`toolsets: 'bim'` or `'all'`).

## Prerequisites

Use an ion asset **backed by a BIM/CAD database**, readable with your configured ion token. A generic photogrammetry tileset, a local IFC file, or a rendered GeoJSON layer is insufficient. Load it with `load3dTiles({ id: 'design', ionAssetId: YOUR_ASSET_ID })`; the Bridge records the ion ID privately alongside that exact layer. URL-only layers cannot be used to query arbitrary account assets.

Set the token using the existing local `CESIUM_ION_TOKEN` configuration / `setIonToken`, or `Cesium.Ion.defaultAccessToken` in an embedded app. BIM commands read the current browser token and `Cesium.Ion.defaultServer`. Tokens are not command arguments or returned results. The query client sends bearer headers, omits cookies/referrers, rejects redirects, bounds responses to 4 MiB, and excludes arguments/results from telemetry.

## Query → quantities → map

```js
// Examples are Bridge commands; MCP tools have identical names/arguments.
await bridge.execute({ action: 'queryBimElements', params: {
  layerId: 'design', top: 50, filter: { 'IFC Class Name': 'ifcwall' },
} })
// Follow continuationToken until absent. List rows may omit full properties.
await bridge.execute({ action: 'getBimElement', params: {
  layerId: 'design', elementId: '3298534886898',
} })
await bridge.execute({ action: 'aggregateBimElements', params: {
  layerId: 'design', propertyKeys: ['Quantity.Net Volume'],
  filter: { 'IFC Class Name': 'ifcwall' },
} })
await bridge.execute({ action: 'filterBimElements', params: {
  layerId: 'design', filter: { 'IFC Class Name': 'ifcwall' }, color: '#ff8800',
} })
await bridge.execute({ action: 'focusBimElements', params: {
  layerId: 'design', elementIds: ['3298534886898'], duration: 0,
} })
```

Property names above are examples. Discover exact names and units from `getBimElement`; do not assume every model has a volume field. Server statistics cover **all matching elements**, independent of the current page or loaded tiles. `total` counts matched elements; an aggregation's `count` counts numeric values of that property. Non-numeric/absent values can produce count 0, null min/max/avg and sum 0. Sums retain source units; there is no unit conversion or guarantee that mixed units are meaningful.

`selectBimElements` highlights explicit `elementIds`; `isolate: true` hides others. `filterBimElements` retrieves the complete matching set before changing the scene (default limit 5,000; maximum 10,000). Failure, cancellation, incomplete pagination or an oversized result preserves the prior selection. Empty matches hide everything. Narrow the filter for large selections; aggregate statistics have no client-side element cap.

Selection styles preserve the original visibility conditions and also apply to future streamed tiles. `clearBimSelection` restores the original style; `updateLayerStyle` intentionally replaces the selection. These operations are per layer/Viewer. Focus combines actual geographic bounds, accounts for the layer's model matrix and reports unlocated elements. No valid locations means no camera movement. Bridge/WebMCP AbortSignal cancellation is supported; MCP client cancellation does not currently propagate through the existing browser WebSocket transport. Multi-request filter/focus work has a 25-second deadline.

Click a model component, call `getSelectedTileFeature`, then pass `data.feature.properties.element` to `getBimElement`. IDs are decimal **strings**, including values beyond JavaScript's safe integer range; never convert them to Number.

## Local validation

Run `npm run test:bim` after building. It exercises real MCP HTTP/WebSocket and WebMCP calls against a local two-component 3D Tiles model, including pagination, source units, whole-model aggregation, rendered highlight/filter/restore, and click-to-element lookup. Fixtures are synthetic and use official REST response shapes; this is not evidence that a particular private cloud asset or token works.

References: [ion service API](https://cesium.com/learn/cesiumjs/ref-doc/IonAssetElementService.html), [official REST implementation](https://github.com/CesiumGS/cesium/blob/1.147/packages/engine/Source/Scene/IonAssetElementService.js).

## Model trees and precise snapping

`getBimTree` reads roots or children by opaque nodeKey. `getBimElementParents` returns root-first lineage. `snapBimElement` uses native IonSnapService with lossless decimal-to-hex element ID conversion. It requires geolocated BIM database geometry with no additional modelMatrix/heightOffset. No hit returns snapped=false. Server refinement has passed real read-only acceptance on the official public Snowdon Towers samples 6093105 and 6093184, as well as local contract coverage. Private account access remains separate.

Run `npm run test:bim:live` for the structural public sample, or `node scripts/test-bim-live.mjs --public-sample --asset 6093184` for the architectural IFC model. Public mode uses the CesiumJS default sample token explicitly permitted by the [official tutorial](https://cesium.com/learn/bim-cad/bim-cad-asset-elements-api/). It does not create or modify ion assets, and never intercepts cloud responses. Reports and screenshots are written to `artifacts/bim-live/<assetId>/`.

Live service routing differs: element queries/trees use `/v1/assets/{id}/...`, while ECEF and native precise-snap calls use `/assets/{id}/...`. This distinction is covered by both live acceptance and deterministic regression tests.
