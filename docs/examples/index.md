# Examples

## Minimal Example

A complete single-file example is included in [`examples/minimal/`](https://github.com/gaopengbin/cesium-mcp/tree/main/examples/minimal).

```bash
git clone https://github.com/gaopengbin/cesium-mcp.git
cd cesium-mcp/examples/minimal
# Open index.html in a browser
```

## Common AI Agent Interactions

Once your CesiumJS app has the bridge connected and the runtime is running, you can ask your AI agent to perform tasks like these:

### Camera Control

> "Fly to the Great Wall of China at 5000 meters altitude"

The agent calls `flyTo` with coordinates `{ longitude: 116.57, latitude: 40.43, height: 5000 }`.

> "Show me a top-down view of Manhattan"

The agent calls `flyTo` with `{ longitude: -74.006, latitude: 40.7128, height: 10000, pitch: -90 }`.

### Layer Management

> "Load the earthquake data from USGS"

```json
{
  "tool": "addGeoJsonLayer",
  "params": {
    "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    "name": "USGS Earthquakes"
  }
}
```

> "Add a heatmap showing population density"

```json
{
  "tool": "addHeatmap",
  "params": {
    "points": [
      { "longitude": 116.4, "latitude": 39.9, "value": 21540000 },
      { "longitude": 121.47, "latitude": 31.23, "value": 24280000 }
    ],
    "name": "Population Density",
    "radius": 50
  }
}
```

### 3D Data

> "Load the New York City 3D buildings"

```json
{
  "tool": "load3dTiles",
  "params": {
    "url": "https://assets.cesium.com/96188/tileset.json",
    "name": "NYC Buildings"
  }
}
```

### Entity Creation

> "Add a red marker at the Eiffel Tower"

```json
{
  "tool": "addMarker",
  "params": {
    "longitude": 2.2945,
    "latitude": 48.8584,
    "name": "Eiffel Tower",
    "color": "#FF0000"
  }
}
```

> "Draw a line from London to Paris"

```json
{
  "tool": "addPolyline",
  "params": {
    "positions": [
      { "longitude": -0.1276, "latitude": 51.5074 },
      { "longitude": 2.3522, "latitude": 48.8566 }
    ],
    "name": "London-Paris",
    "color": "#00BFFF",
    "width": 3
  }
}
```

### Trajectory Animation

> "Create a flight trajectory from New York to London"

```json
{
  "tool": "playTrajectory",
  "params": {
    "positions": [
      { "longitude": -74.006, "latitude": 40.7128, "height": 10000 },
      { "longitude": -40.0, "latitude": 50.0, "height": 10000 },
      { "longitude": -0.1276, "latitude": 51.5074, "height": 10000 }
    ],
    "duration": 10,
    "modelUrl": "https://assets.cesium.com/831744/CesiumAir.glb",
    "name": "NY-London Flight"
  }
}
```

### Analysis

> "Take a screenshot of the current view"

The agent calls `screenshot` and receives a base64-encoded image.

> "What layers are currently loaded?"

The agent reads the `cesium://scene/layers` resource.

## Integration with GeoAgent

If you're building a full-stack GIS AI application, you can embed `cesium-mcp-runtime` into your agent workflow. The Runtime's HTTP Push API allows backend systems to send commands directly to the browser:

```bash
curl -X POST http://localhost:9100/api/command \
  -H "Content-Type: application/json" \
  -d '{"action": "flyTo", "params": {"longitude": -74.006, "latitude": 40.7128}}'
```
