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

Slow corridor evidence is revision-bound through the generic
`WorldTaskRuntime`, so repeated verification cycles reuse one candidate result
and a newer plan cannot accept stale work. CPU-side corridor construction yields
cooperatively. The ArcGIS level-12 tile fetches, LERC decoding, and height
interpolation run in a dedicated Worker through `WorldWorkerExecutor`, using
transferable typed buffers in both directions. The ArcGIS protocol and flight
safety certificate remain adapter concerns; Worker lifecycle, request
correlation, cancellation, and stale-result prevention remain domain-neutral.

The independent Observer uses Cesium's request-render mode and stays dormant
between event-driven captures. CPU corridor work checks the cooperative frame
budget in small batches, and UI progress is published at 10 Hz rather than once
per render frame. The fast camera and local ray-safety loop therefore do not
wait for hidden rendering, visual inference, or diagnostic DOM updates.

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

## Run the isolated embodied-world lab

The walking lab requires Node.js 22 or newer. From the repository root:

```bash
cd experiments/embodied-world-lab
npm ci
npm run dev
```

Open <http://127.0.0.1:4185/>. Vite binds that exact address with
`strictPort: true`, so startup fails instead of silently choosing another port
when 4185 is occupied. Internet access is required for ArcGIS elevation, Esri
imagery, and the hosted planning endpoint. If ArcGIS elevation fails, the lab
explicitly degrades to ellipsoid rendering plus a zero-height field. If the
hosted planner fails or times out, local fallback control remains available.
Esri imagery is presentation input only and is not planner evidence.

The lab is intentionally absent from the root `workspaces` list and keeps an
independent `package-lock.json`. Consequently, root `npm run build` and
`npm run typecheck` do not cover it. Verify it from its own directory:

```bash
npm run typecheck
npm run build
```

The root Vitest configuration does include the lab's unit tests:

```bash
cd ../..
npx vitest run experiments/embodied-world-lab/src
```

Those tests use fake controllers and synthetic snapshots. They do not launch a
Cesium browser scene, contact the hosted model, or prove end-to-end arrival.
Although dependencies are lockfile-isolated, the lab imports
`packages/cesium-mcp-spatial/src` directly, so it is not a standalone release.

### Evidence, planner, and fallback boundaries

- The live evidence is the controller pose, ENU velocity, grounding state,
  actor-space Rapier ray fan, and executed trail. ArcGIS terrain contributes a
  startup 13 x 13 grid sampled at 35 m spacing; later height and slope candidates
  are bilinear interpolation from that bounded grid, not fresh remote samples on
  every control pass.
- Start, goal, landslide center, 22 m radius, and 105 m sensor range are
  deterministic fixture configuration. The landslide becomes visible through a
  bearing/range calculation against that known geometry. Rapier can constrain
  candidate clearance, but it does not discover the fixture. No image is sent to
  a visual model.
- The fast pass runs from Cesium `preUpdate` and is throttled to at most once
  every 50 ms, so "20 Hz" is an upper-rate description rather than a fixed
  scheduling guarantee. The automatic high/near camera is a presentation view,
  not the independent Observer used by the flight experiment.
- The hosted endpoint receives only the bounded `EmbodiedWorldSnapshot` and one
  `commit_motion_intent` tool schema. The service selects the actual model and
  reports its name when available; the lab does not pin a model name. Chat text
  and screenshots are not sent to this endpoint.
- Before each hosted request, the lab activates a local fallback as a 16-second
  provisional plan so movement does not wait for the network. A matching hosted
  result may replace it only while the revision still matches and pose-derived
  goal distance/bearing stay within bounded drift; stale results are dropped. Requests time out
  after 15 seconds. Errors commit an 8-second local fallback and start a
  30-second hosted retry cooldown. The local safety loop can override both
  hosted and fallback intent.

### Dependency and audit boundary

The isolated lock uses `cesium@~1.143.0`,
`cesium-player-controller@0.2.1`, and
`@dimforge/rapier3d-compat@^0.14.0`. Its overrides pin
`@cesium/engine@26.1.0` and `@cesium/widgets@16.1.0` because
`cesium@1.143.0` declares caret ranges for those subpackages. The controller's
peer range is only `cesium >=1.120.0`; the overrides are a lab compatibility
lock, not controller requirements.

On 2026-09-04, `npm audit --omit=dev` in the lab reported five high-severity
findings and `No fix available`. The resolved path is
`cesium-player-controller -> @loaders.gl/gltf -> @loaders.gl/textures ->
texture-compressor -> image-size@0.7.5`, covered by
[GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
and [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
This is a transitive dependency audit result, not proof of a direct controller
exploit. Loading only the bundled Fox binary reduces the current input surface
but does not clear the advisories. The controller's `streaming-terrain` path
uses Cesium private internals; the current lab uses static `terrain` mode.

> Manual verification record, 2026-09-04: one browser run reached the target,
> reported a rounded closest landslide-boundary clearance of 6 m, and showed no
> browser errors. This records one observed run; it is not a promise that every
> run, network condition, or future dependency state will arrive successfully.

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
  -> optional EmbodiedActuator for continuous character/vehicle control
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
- an engine-neutral embodied-actuation contract with normalized movement/look
  axes, plus an experimental structural adapter for `cesium-player-controller`
  input, pose, velocity, grounding, and physics-world center-ray evidence. The
  adapter is structurally tested with fake controller state; the example page
  does not instantiate the external controller.
- an isolated embodied mountain-walking lab that uses ArcGIS elevation when
  available, Esri presentation imagery, an up-to-20 Hz local safety pass,
  actor-space Rapier ray evidence, revision-bound hosted planning with a local
  provisional plan, presentation-camera selection, and executed-path clearance
  reporting. Its exact run, dependency, audit, fallback, and fixture boundaries
  are documented above.

The embodied lab deliberately mixes bounded scene evidence with deterministic
fixture geometry. Terrain candidates are interpolated from a startup sample,
while pose, velocity, grounding, Rapier hits, and the executed trail come from
the running scene. The composer handles stop/view locally and treats any other
non-empty text as the same fixed start command; it does not send arbitrary chat
text to the hosted model. No arbitrary visual understanding is claimed.

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
6. ✅ Add continuous embodied control in an isolated walking scene and record
   one successful 2026-09-04 browser run, while keeping third-party physics and
   controller dependencies outside the core package. This does not establish a
   repeatable end-to-end guarantee.
7. Stabilize a public actor-space sensor contract, bounded scan policy, and a
   second vehicle/aircraft actuator before promoting experiment code into the
   package runtime.
8. Consider a persistent world graph only when real use cases require cross-scene memory.
