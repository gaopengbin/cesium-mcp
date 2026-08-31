# Spatial Context Experiment

A real Cesium Viewer test scene for the experimental `perception` and `observer`
toolsets. It has three deliberately separate modes:

- **Deterministic scenario** loads a 12-feature urban-flood response fixture
  through the public resource-handle and WebMCP adapter path.
- **Live GIS** loads NASA GIBS Blue Marble through WMS and the USGS M2.5+
  past-day GeoJSON feed, then validates the remote objects in Spatial Context.
- **Closed-loop flight** samples the real Himalaya DEM, follows a verified
  baseline route, senses a previously unknown no-fly zone with five finite
  Cesium rays, and locally replans the executed trajectory while flying.

## Run

```bash
npm run dev -w examples/spatial-context-experiment
```

Open <http://127.0.0.1:4175/>.

The user-facing surface is intentionally only a full-screen Cesium map and one
conversation panel. The older assertion dashboard remains hidden as an
automation fixture. Chat requests use the existing hosted Workers AI endpoint;
every model-selected map tool is shown in the conversation. During the flight,
the first blocking ray event creates a separate model request for a left/right
maneuver. Local clearance validation accepts or rejects that answer, and an
explicit safety-fallback message appears if the model times out or fails.

The current model decision consumes structured ray measurements, not the POV
pixels. The UI therefore does not claim visual-model perception yet.

The page automatically checks:

1. the six perception tools are available without changing the stable tool inventory;
2. the scene contains one managed layer and 12 normalized GeoJSON objects;
3. high-risk objects can be queried by properties;
4. nearby object context includes the hospital and emergency shelter;
5. point-in-polygon and point-distance relations return exact evidence;
6. route/polygon intersection changes across stages and stays explicitly approximate;
7. the current camera view can be translated into view bounds and scene objects;
8. `resourceId -> layerId -> objectId` lineage survives the full loading path.

Select **Live GIS** to exercise a second eight-check path against current remote
data. It verifies the two managed service layers, normalized earthquake count,
stable strongest-event ID, explicit `depthKm` semantics, current view context,
resource lineage, and feed freshness. The remote request completes before the
page mutates the scene, so a service outage leaves the deterministic lab intact.

The live mode requires internet access but no API key. Its sources are:

- NASA GIBS WMS: <https://earthdata.nasa.gov/gibs>
- USGS real-time GeoJSON feeds: <https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php>

Select **AI closed-loop flight** to compare the green baseline route with the
blue executed path. A red no-fly volume appears only after the flight is under
way. The sensor uses public Cesium APIs: `Globe.pick` for currently loaded
terrain and `IntersectionTests.raySphere` for the injected zone and loaded
3D Tiles/Model bounding volumes. The observation log records the hit distance,
left/right clearance, chosen detour, and eventual return to the baseline route.
This is intentionally bounded perception: it does not claim to see unloaded
content or infer arbitrary semantics from pixels.

Use **Expand flood warning area** to keep the school and hospital fixed while
mutating the forecast polygon. The next spatial snapshot changes the exact
`within` result from `false` to `true`, matching a realistic risk-update flow.

When the browser supports WebMCP, the page also registers only the six
experimental perception tools and one independent observer-camera tool. Use
**Run one AI field observation** to return structured facts, readiness, snapshot
freshness, and a PNG from a hidden Viewer without moving the application camera.
In Live GIS mode, the Observer also reuses the managed NASA imagery provider and
targets the strongest USGS event by stable `objectId`.
The in-page checks work in any modern browser
because they execute the same generated WebMCP tool adapters directly.

## Machine-readable evaluation

```bash
npm run eval:spatial-context
```

The command evaluates both the baseline and expanded forecast stages and writes
`artifacts/spatial-context-eval.json`. CI runs the same evaluation.
