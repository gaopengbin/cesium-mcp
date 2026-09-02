# Spatial Context Experiment

The spatial-context route gives an AI agent a grounded description of the Cesium scene before it decides what to do. It is deliberately narrower than a persistent "world model": the first slice normalizes managed layers and entities, answers bounded spatial questions, and reports the evidence behind every answer.

> This API is experimental. It is excluded from the stable 61-tool inventory and from `toolsets: 'all'`.

## Run the live evaluation scene

The repository includes an offline-friendly urban-flood response lab with a
school, hospital, shelter, fire station, pump station, gauge, bridge, community,
river, two evacuation routes, and a forecast flood zone. It loads all 12 GeoJSON
features through a resource handle, registers six perception tools plus the
independent observer-camera tool, and
evaluates nine assertions in the browser:

```bash
npm run dev -w examples/spatial-context-experiment
```

Open <http://127.0.0.1:4175/>. Use **Expand flood warning area** to keep the
facilities fixed while the forecast polygon changes. The live `within` result
changes from `false` to `true`. The page also checks evidence quality,
current-view context, and
`resourceId -> layerId -> objectId` lineage.

The interactive product surface now keeps only the full-screen map and one chat
panel. Dashboard assertions remain available to automated tests but are hidden
from normal users. The chat calls the hosted model and exposes each resulting
map-tool execution. A fast 250 ms ray-safety loop commits a detour immediately;
the flight never waits for visual inference. A separate event-driven loop then
captures up to three bounded JPEGs for detection and route verification. It
keeps one belief across the flight, fuses only requested visual candidates with
matching rays, and lets occupied evidence expire to `stale`. Only the initial
positive fusion invokes the slower planning model. Invalid visual-model output
degrades to `unknown` instead of becoming a spatial claim.

Switch to **Live GIS** to run a separate, non-deterministic integration path.
The page fetches the [USGS M2.5+ past-day GeoJSON feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)
and loads [NASA GIBS](https://earthdata.nasa.gov/gibs) Blue Marble through WMS.
No API key is required. Eight browser assertions verify that both service layers
entered the Viewer, the USGS objects were normalized and indexed, the strongest
event has a stable `objectId`, depth remains explicit `depthKm` metadata rather
than being mistaken for Cesium height, lineage survives, and the feed is fresh.
The remote fetch completes before scene mutation, so a network or service error
leaves the deterministic fixture in place.

Switch to **AI closed-loop flight** for the third integration path. It samples
ArcGIS World Elevation across a Himalaya corridor and first creates a
terrain-safe baseline route. During playback, a five-ray finite sensor fan
checks the currently loaded terrain with `Globe.pick` and checks the unexpected
no-fly volume plus loaded 3D Tiles/Model bounding volumes with
`IntersectionTests.raySphere`. The obstacle is injected only after takeoff, so
the flight must sense it, choose the clearer side, execute a local detour, and
rejoin the baseline. The green route remains the plan; the blue line is the
actual closed-loop trajectory.

The flight path deliberately demonstrates bounded world awareness rather than
omniscience. The visible trace separates `SENSE -> ACT` safety from
`SENSE -> VISION -> BELIEF -> PLAN/VERIFY`. Observer pixels are sent only for
bounded event-driven cycles under strict size limits and are retained only as
SHA-256 artifact references. A visual clear result, missing object, partial
load, or unmatched ray remains unknown. The system reports its 15 km sensor
range, cannot discover unloaded geometry, and does not treat pixel
interpretation as world truth.

The same two-stage scenario also has a machine-readable evaluation:

```bash
npm run eval:spatial-context
```

It writes `artifacts/spatial-context-eval.json` and fails when either the
baseline or expanded forecast stage violates the expected contracts. CI runs
the same command.

## Try it with WebMCP

The one-package Viewer API can opt in to the experimental `perception` and
`observer` toolsets:

```ts
import { registerCesiumViewerWebMcp } from 'cesium-mcp-webmcp'

const registration = await registerCesiumViewerWebMcp(viewer, {
  experimentalToolsets: ['perception', 'observer'],
})
```

This adds six read-only tools:

- `observeScene` — return one grounded observation with structured facts, scene readiness, snapshot freshness, and optional independent visual evidence.
- `describeScene` — aggregate and optionally list normalized scene objects.
- `querySpatialObjects` — filter objects by meaning, source, layer, bounds, distance, or properties.
- `getObjectContext` — inspect one object and its nearest neighbors.
- `querySpatialRelation` — evaluate `distance`, `near`, `intersects`, `within`, `contains`, or `overlaps`.
- `getViewContext` — describe the camera bounds and managed objects intersecting the current view.

Normal WebMCP registration is unchanged. The experimental tools are only exposed when `experimentalToolsets` is present.

### Create one grounded observation

`observeScene` is the recommended agent entry point. It combines the existing
spatial snapshot and independent Observer into one response instead of asking an
agent to coordinate two unrelated calls:

```ts
await observeScene({
  scope: 'view',
  includeObjects: true,
  imageMode: 'auto',
})
```

Structured facts are always returned first. `imageMode: 'auto'` captures a PNG
only when there is an explicit target or a local view lacks enough structured
identity; use `always` for a visual inspection and `never` for a low-cost
structured observation. Every result also reports:

- scene `readiness` as `ready`, `partial`, `loading`, or `unknown`, including
  pending data-source, globe-tile, and managed 3D Tiles reasons;
- a stable `snapshotRevision`, plus whether the scene changed while visual
  evidence was being captured;
- visual evidence status as `captured`, `skipped`, or `unavailable`;
- an overall evidence quality that drops to `unknown` for incomplete loading and
  `approximate` when the scene changes during the observation.

A visual timeout therefore does not discard usable structured facts, and an
unloaded scene is not reported as a complete observation.

### Capture what the AI sees

`captureObserverView` lazily creates a hidden Cesium Viewer with its own camera
and canvas. It mirrors managed Point, LineString, and Polygon geometry from the
current spatial snapshot and reuses managed imagery providers when available.
The target can be a coordinate pair or a stable
spatial `objectId` returned by the perception tools:

```ts
await captureObserverView({
  targetObjectId: 'entity:urban-flood-response:school_1',
  preset: 'detail',
})
```

`overview`, `detail`, and `eye-level` provide useful starting views. Explicit
`range`, `heading`, `pitch`, or `targetHeight` values override the selected
preset. The tool returns:

- a PNG data URL for WebMCP hosts;
- a native `image/png` content block plus compact text evidence from MCP Runtime,
  without duplicating the base64 bytes into the text context;
- observer camera and target metadata;
- view bounds and spatial object IDs intersecting those bounds;
- `userCameraUnchanged: true`, verified against the application camera before
  and after capture.

The lab exposes the combined path as **Run one AI field observation** and targets
the school by its spatial object ID with the `detail` preset. In Live GIS mode it
targets the strongest USGS event, uses a 650 km regional view, waits for NASA WMS
tiles, and still verifies `userCameraUnchanged: true`. The result remains
deliberately marked `quality: 'derived'`: it does not yet mirror 3D Tiles,
terrain, post-processing, or pixel-perfect application styling.

## Try it with MCP Runtime

The runtime keeps perception and observer out of its normal and `all` selections. Opt in explicitly:

```powershell
$env:CESIUM_TOOLSETS = 'view,entity,layer,interaction,perception,observer'
npx cesium-mcp-runtime
```

For Streamable HTTP, select it per endpoint:

```text
http://localhost:9200/mcp?toolsets=perception,observer
```

## Evidence-aware answers

Spatial results carry two fields that an agent should not ignore:

| Field | Meaning |
| --- | --- |
| `quality` | `exact`, `derived`, `approximate`, or `unknown` |
| `basis` | The computation used, such as `point-in-polygon`, `geodesic-point`, or `bounding-box` |

For example, a point-in-polygon answer based on actual entity coordinates is `exact`. A road/polygon intersection in the first slice uses bounding boxes and is therefore explicitly `approximate`.

## Architecture

```text
Cesium Viewer
  -> cesium-mcp-bridge scene adapter
  -> cesium-mcp-spatial object model and index
  -> unified observeScene contract with readiness and snapshot revision
  -> optional lazy independent Observer Viewer and PNG evidence
  -> strict visual grounding of local candidate IDs
  -> belief fusion: visible object + matching forward Cesium ray
  -> persistent belief revisions with short evidence validity
  -> immediate local safety actuation + slower planning/verification
  -> WebMCP or MCP Runtime (explicit opt-in)
```

The object model and contracts are protocol-neutral. WebMCP and MCP Runtime use
the same six perception contracts, one observer contract, and stable Bridge
actions.

## Current coverage and limits

The first slice supports:

- Bridge-managed Entities and GeoJSON/CZML data-source entities;
- Point, LineString, Polygon, and Rectangle-derived geometry;
- source lineage from `resourceId` to `layerId` to `objectId` when available;
- semantic type hints from `semanticType`, `category`, `class`, or `kind` properties;
- snapshot-based queries and evidence-aware relations;
- scene readiness, stable snapshot revisions, and observation-change detection;
- one structured-first observation result with optional visual evidence;
- a deterministic emergency-response evaluation fixture.
- a live NASA GIBS WMS + USGS GeoJSON browser integration with safe fallback;
- managed imagery reuse in the independent Observer Viewer.
- a two-speed grounded flight loop with an independent POV, five finite Cesium
  rays, immediate local safety actuation, up to three visual belief revisions,
  conservative multimodal fusion, and a separate executed path.

It does not yet claim:

- pixel-perfect visibility or occlusion beyond the grounded candidate boxes;
- unloaded 3D Tiles feature discovery;
- exact line/polygon and polygon/polygon topology;
- persistent identity across arbitrary external scene mutations;
- antimeridian-spanning view bounds.
- semantic understanding of arbitrary pixels or obstacles outside the loaded
  scene and configured sensor range.

## Planned progression

1. ✅ Stabilize object IDs, provenance, and the six perception contracts with two-stage evaluations.
2. ✅ Add an isolated Observer Viewer for independent, camera-safe PNG evidence.
3. ✅ Add readiness, stable snapshot revisions, and change detection to the unified observation loop; next add incremental invalidation and measure refresh cost on large scenes.
4. ✅ Reuse managed imagery providers in observer captures; next mirror loaded 3D Tiles and terrain.
5. ✅ Add a two-speed grounded flight loop that combines immediate ray safety,
   persistent multi-observation belief, public Cesium intersections, bounded
   visual planning/verification, and visible execution evidence.
6. Consider a persistent world graph only when real use cases require cross-scene memory.
