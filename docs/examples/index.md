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

### Analysis

> "Take a screenshot of the current view"

The agent calls `screenshot` and receives a base64-encoded image.

> "What layers are currently loaded?"

The agent reads the `cesium://scene/layers` resource.

## Integration with GeoAgent

Cesium MCP was originally developed as part of [GeoAgent](https://github.com/gaopengbin/GIS-AI), a full-stack GIS AI platform. It can be used as the 3D visualization backend:

```
GeoAgent (FastAPI) ──HTTP POST──► cesium-mcp-runtime ──WebSocket──► Browser
```

Use the HTTP Push API at `POST http://localhost:9100/push` to send commands from any backend system.
