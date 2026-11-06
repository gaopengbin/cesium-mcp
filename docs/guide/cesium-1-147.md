# CesiumJS 1.147 support

This development branch uses **CesiumJS ~1.147.0** with engine 26.5.0, widgets 16.3.1, core 0.1.1 and gltf 0.1.1. Node **22.17.0+** is required. The package version is independent of the CesiumJS version. Older Cesium peer ranges are removed for this release; upgrade your embedded Viewer alongside the Bridge.

## New MCP / WebMCP capabilities

Enable `bim` for model data and `geometry` for new editing/rendering tools. Both are optional toolsets discoverable through `list_toolsets` / `enable_toolset`.

| Release capability | Integration |
| --- | --- |
| IonAssetElementService / ElementService | Bounded official REST queries and aggregates with native SDK result parity tests; getBimTree and getBimElementParents expose hierarchy |
| IonSnapService | snapBimElement uses the official SDK for server refinement, converts decimal IDs to hex without Number, and requires geolocated untransformed geometry |
| Scene.snap | snapToGeometry returns real edge/surface positions; measureSnappedDistance measures 3D straight-line meters between two real snaps |
| vectorBlendOption and mutable buffer blending | setTilesetOptions for tilesets; updateVectorCollection and addGeoJsonPrimitive for owned buffers |
| BufferPrimitive.pickObject | addGeoJsonPrimitive accepts pickMetadata, configured before first render; picking returns properties through getSelectedTileFeature |
| BufferPrimitiveCollection.setPositions | updateVectorCollection edits complete consecutive primitive ranges on owned GeoJSON buffers, preserving vertex counts/topology |
| Polygon clipping with holes | setClippingPolygons replaces/removes local globe or managed tileset clipping, including hole rings and inverse mode |
| KHR_materials_emissive_strength | Supported by the upgraded renderer when loading model/tileset assets; tested with rendered pixel comparison |
| Cache, lighting, point-cloud and shader fixes | Adopted from the pinned official engine. Cache options, dynamic environment lighting and point-cloud culling are exposed through setTilesetOptions |
| @cesium/core split / internal @cesium/gltf move | Dependencies resolved and locked; project imports remain through the public cesium entry, without private GltfPipeline imports |

`updateVectorCollection` accepts geographic [longitude, latitude, optional height] vertices. It updates **owned GeoJSON primitives**, not server-streamed source datasets. Polygon ring boundaries and vertex counts cannot change. Invalid range/vertex counts are rejected before changing buffers or blend mode. Pick objects are locked by Cesium after first render, so metadata is set at layer creation, not mutated later.

Snapping uses CSS pixel coordinates relative to the canvas. A miss stays a miss; tools do not fabricate an approximate point or distance. GPU snapping requires WebGL support. Server refinement additionally requires a readable ion BIM asset and rejects display transforms which would invalidate precision.

## Validation boundaries

`npm run test:bim` runs a real Cesium Viewer through MCP HTTP, stdio and WebMCP, including SDK parity, model-tree traversal, geometry snapping, native buffers, clipping, tile unload/reload highlighting, visible tiles with zero cache budget, and emissive-strength rendered pixels. Data is explicitly synthetic; the deterministic tests use a local API fixture. A separate live acceptance script has also passed against official public assets 6093105 and 6093184 without intercepting cloud responses.

The river tests separately cover public-domain Natural Earth data, MVT/vector 3D Tiles, draping, feature properties, style changes and the MCP Apps panel. The draped-picking adapter remains experimental and bounded to visible tiles/200,000 vertices; it was rechecked against 1.147 rather than silently removed.

The mixed point/polygon picking case runs on the ellipsoid. MVT points retain native altitude rather than being draped; an altitude-zero point is correctly occluded by the artificial 100 km terrain used in the separate line/polygon draping fixture. Combining those fixture flags does not constitute a valid point-clamping test.

The engine includes upstream lighting, point-cloud and shader fixes; not every upstream bug has a dedicated reproduction here. This is not a promise to expose every low-level math symbol as a tool.

Cesium ion's **cloud Clipping Assist asset generation** and version-change jobs are separate server products, not local CesiumJS clipping. No cloud assets are created by these tools. Private-asset validation still requires a readable BIM asset ID; an unsuccessful asset list is not evidence of an empty account.
