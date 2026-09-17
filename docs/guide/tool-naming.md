# Tool naming contract

Cesium MCP uses one public tool inventory across MCP, WebMCP, and function calling. Tool names therefore need to help a model predict both the operation and the Cesium object affected, without relying on transport-specific context.

## Verb rules

| Prefix | Meaning | Examples |
|---|---|---|
| `add` | Create and attach a new scene object from structured parameters | `addMarker`, `addPolygon`, `addGeoJsonPrimitive` |
| `load` | Parse or fetch a named external data format | `loadCzml`, `loadKml` |
| `set` | Replace singleton Viewer state or configuration | `setBasemap`, `setSceneOptions` |
| `update` | Mutate an existing object identified by ID | `updateEntity`, `updateLayerStyle` |
| `remove` | Detach an existing managed object | `removeEntity`, `removeLayer` |
| `get` / `list` / `query` | Read state without changing the scene | `getView`, `listLayers`, `queryEntities` |
| `save` / `restore` | Persist or restore application-owned state | `saveViewpoint` and the proposed `restoreViewpoint` |
| `start` / `stop` / `control` / `play` | Operate a stateful activity | `startOrbit`, `controlClock`, `playTrajectory` |

Names use lower camel case. Format acronyms remain readable in the model-facing title and description even when an existing command keeps historical casing.

## 61-tool audit

The current 61 browser-safe contracts cover 12 toolsets. Fifty-five names follow the rules above without a material semantic conflict. Six names need migration review:

| Current public name | Proposed public name | Stable Bridge action | Reason |
|---|---|---|---|
| `addGeoJsonLayer` | `loadGeoJson` | `addGeoJsonLayer` | It parses inline or remote GeoJSON through a managed data layer; `load` aligns it with CZML and KML. |
| `loadViewpoint` | `restoreViewpoint` | `loadViewpoint` | It restores page-local state rather than loading an external resource. |
| `loadTerrain` | `setTerrainProvider` | `loadTerrain` | Terrain is singleton Viewer state and the operation replaces the provider. |
| `loadImageryService` | `addImageryLayer` | `loadImageryService` | Imagery is appended as a layer and can coexist with other imagery layers. |
| `load3dTiles` | `load3dTileset` | `load3dTiles` | The result is one managed `Cesium3DTileset`; the proposed noun is more precise. |
| `load3dGaussianSplat` | `load3dGaussianSplatTileset` | `load3dGaussianSplat` | The operation also creates a managed tileset rather than an untyped resource. |

`addGeoJsonPrimitive` intentionally remains an `add` operation. It converts GeoJSON geometry into Cesium primitives rather than loading a `GeoJsonDataSource`, so the different prefix communicates a different execution model.

## Public name versus Bridge action

Each canonical contract contains two identifiers:

```ts
interface CesiumToolContract {
  name: string   // exposed to models and protocols
  action?: string // executed by CesiumBridge; defaults to name
}
```

They currently match for all published tools. Protocol adapters dispatch `action`, so a future public rename can keep the existing browser command stable:

```ts
{
  name: 'loadGeoJson',
  action: 'addGeoJsonLayer',
}
```

This separation is not permission to rename tools casually. Public names are part of prompts, saved client configurations, evaluations, and user code.

## Compatibility sequence

No public tool name changes as part of the initial naming-contract work. A later coordinated migration must:

1. measure the candidate names with the same deterministic and real-model evaluations;
2. update MCP, WebMCP, function calling, toolsets, localization, examples, and documentation together;
3. preserve the old Bridge actions;
4. publish an explicit old-to-new migration table and release note;
5. avoid exposing duplicate old and new names to models by default, because aliases enlarge the tool surface and create ambiguous choices;
6. provide an opt-in legacy compatibility surface for clients that still call historical names;
7. remove legacy public aliases only at an announced compatibility boundary.

The naming audit is therefore a release-safety input, not an immediate breaking rename.
