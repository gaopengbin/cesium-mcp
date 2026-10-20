# Use ion MCP assets in a live map

The official [Cesium ion MCP server](https://cesium.com/learn/ion/mcp/) manages cloud assets. Cesium MCP Runtime controls a connected CesiumJS Viewer. An Agent can use both servers in the same conversation: find an accessible asset in ion, then pass its ID to the live map.

## Connect and authorize

Follow Cesium's [client connection guide](https://cesium.com/learn/ion/connect-your-ai-client/) for `https://mcp.ion.cesium.com`. Sign in through OAuth in the browser. The official server requests asset and label read/write permissions; review the consent screen yourself.

The map's streaming credentials are separate. For the Runtime's browser Viewer, configure `CESIUM_ION_TOKEN` locally before starting the Runtime. For an application using the Bridge SDK, configure `Cesium.Ion.defaultAccessToken` in that application's browser setup. Use a streaming token with `assets:read` and access to the selected asset. Token URL restrictions must also allow the Viewer origin. Never paste tokens into prompts or tracked configuration.

This workflow uses the browser Viewer. The MCP Apps panel has its own browser state and does not automatically inherit the browser Viewer's startup token. Official ion MCP OAuth authorization also does not configure the map's CesiumJS token.

## Find, load, and verify

1. On **official ion MCP**, call `search_assets` with a real search term, `type: "3DTILES"`, and `status: "COMPLETE"`. If an asset is still processing, use `get_asset` or `wait_for_asset` and check its terminal status. A timeout or tiling error is not a ready asset.
2. On **our Runtime**, connect the browser Viewer configured above and use `listSessions` to identify its connected session. Preserve that `sessionId` for every map call; opening an MCP Apps panel creates a separate browser state. Enable the `tiles` toolset with `enable_toolset` if needed.
3. Call `loadVectorTiles` for vector 3D Tiles, or `load3dTiles` for a mesh/point-cloud asset. Use the real numeric asset ID returned by ion, not an example asset ID.

For vector 3D Tiles, the arguments have this shape (the variables come from the preceding tool results):

```js
{
  sessionId: mapSessionId,
  source: 'tileset',
  id: 'ion-vectors',
  name: asset.name,
  ionAssetId: asset.id,
  flyTo: true,
}
```

4. Check the loading tool's success result, then call `getLayerSchema` for the returned layer ID. `metadata.ionAssetId` records the original load input. Compare it with the ID returned by official ion MCP. This ID is provenance, not proof of account ownership or current permission. Attribute fields are sampled from loaded tiles and may be empty until content streams in.
5. Click a visible feature, call `getSelectedTileFeature`, and use its `layerId` in `updateLayerStyle`. Build expressions only from the returned real properties. Read back `getLayerSchema.metadata.tileStyle` to verify the applied expressions.

The official `get_tileset` tool returns root tileset JSON for inspection. Do not treat that JSON as a hosted URL, or copy endpoint credentials into a load request. Loading by asset ID lets CesiumJS resolve and refresh its own streaming resource.

## Boundaries and failures

| Result | Next action |
| --- | --- |
| Official MCP returns 401/403 | Reauthenticate or check the ion account's permissions. |
| The map returns 401/403/404 for the same ID | Check the Viewer's streaming token, allowed asset IDs and allowed origins. A 404 alone does not establish that the asset is public or nonexistent. Keep the previously loaded layer. |
| No clicked feature | Wait for visible content and click it; selection is not a whole-dataset query. |
| BIM element query is unavailable | Official BIM element tools only support assets created with `import_imodel`. An arbitrary clicked property is not automatically the official `elementId`. |
| A protected MVT service needs request headers | `loadVectorTiles` currently accepts a URL, without a headers parameter. Configure authentication in the hosting application or an approved gateway; do not put credentials in Agent arguments. |

The official [MVT tutorial](https://cesium.com/learn/cesiumjs-learn/load-mapbox-vector-tiles-in-cesiumjs/) covers URL templates, coverage, stable IDs, styling, picking and draping. Our [vector tiles guide](./vector-tiles) maps these capabilities to MCP tools. Existing Mapbox style JSON is not automatically translated into Cesium styles.

## Local regression check

After building, with the Natural Earth fixture prepared as described in the vector tiles guide:

```powershell
$env:ION_FIXTURE = '1'
$env:RUNTIME_ENTRY = 'packages/cesium-mcp-runtime/dist/cli.js'
node scripts/test-vector-tiles.mjs
Remove-Item Env:ION_FIXTURE, Env:RUNTIME_ENTRY
```

Run this separately from `MVT=1` and `HYDRORIVERS=1`. It uses the real browser `IonResource` path with a simulated endpoint, loads public river geometry, verifies asset-ID readback through MCP, clicks a river, changes its style, and removes the layer. Its report is `artifacts/vector-tiles/installed-ion-fixture-results.json`. It verifies local interoperability mechanics; it does not authenticate to a live ion account or exercise the official ion MCP tools.
