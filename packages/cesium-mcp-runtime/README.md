# cesium-mcp-runtime

> MCP Server that enables AI Agents to control a Cesium globe in real-time via the Model Context Protocol.

[![npm version](https://img.shields.io/npm/v/cesium-mcp-runtime.svg)](https://www.npmjs.com/package/cesium-mcp-runtime)
[![license](https://img.shields.io/npm/l/cesium-mcp-runtime.svg)](LICENSE)

## Architecture

```
AI Agent <--MCP stdio--> cesium-mcp-runtime <--WebSocket--> Browser (cesium-mcp-bridge)
```

The runtime acts as a bridge between MCP-compatible AI clients (Claude Desktop, VS Code Copilot, Cursor, etc.) and a browser running CesiumJS. It translates MCP tool calls into WebSocket commands that [cesium-mcp-bridge](https://www.npmjs.com/package/cesium-mcp-bridge) executes.

## Install & Run

```bash
# Run directly with npx
npx cesium-mcp-runtime

# Or install globally
npm install -g cesium-mcp-runtime
cesium-mcp-runtime
```

## MCP Client Configuration

### Claude Desktop

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["cesium-mcp-runtime"],
      "env": {
        "CESIUM_WS_PORT": "9100",
        "DEFAULT_SESSION_ID": "default"
      }
    }
  }
}
```

### VS Code (Copilot)

In `.vscode/mcp.json`:

```json
{
  "servers": {
    "cesium": {
      "command": "npx",
      "args": ["cesium-mcp-runtime"],
      "env": {
        "DEFAULT_SESSION_ID": "default"
      }
    }
  }
}
```

### Cursor

In `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["cesium-mcp-runtime"]
    }
  }
}
```

## MCP Tools (19)

### View

| Tool | Description |
|------|-------------|
| `flyTo` | Fly to coordinates (lon, lat, height, heading, pitch, roll, duration) |
| `setView` | Set camera position instantly |
| `getView` | Get current camera state |
| `zoomToExtent` | Zoom to bounding box (west, south, east, north) |
| `screenshot` | Capture map as base64 PNG |

### Layers

| Tool | Description |
|------|-------------|
| `addGeoJsonLayer` | Add GeoJSON with styling (choropleth, category, etc.) |
| `addHeatmap` | Generate heatmap from point data |
| `addMarker` | Add a marker at coordinates |
| `addLabel` | Add text labels to the map |
| `removeLayer` | Remove layer by ID |
| `setLayerVisibility` | Toggle layer visibility |
| `listLayers` | List all layers |
| `updateLayerStyle` | Change layer color/opacity/width |
| `setBasemap` | Switch basemap |
| `highlight` | Highlight layer features |

### 3D Data

| Tool | Description |
|------|-------------|
| `load3dTiles` | Load 3D Tiles from URL or Ion asset ID |
| `loadTerrain` | Set terrain provider |
| `loadImageryService` | Add imagery service (WMS/WMTS/XYZ) |

### Animation

| Tool | Description |
|------|-------------|
| `playTrajectory` | Animate entity along coordinate path |

## MCP Resources

| URI | Description |
|-----|-------------|
| `cesium://scene/camera` | Current camera position, heading, pitch, roll |
| `cesium://scene/layers` | List of all loaded layers with types and visibility |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CESIUM_WS_PORT` | `9100` | WebSocket server port |
| `DEFAULT_SESSION_ID` | `default` | Preferred browser session for MCP tool routing |

## Browser-Side Setup

Your browser page needs to connect to the runtime via WebSocket and relay commands to `cesium-mcp-bridge`:

```typescript
import { CesiumBridge } from 'cesium-mcp-bridge'

const bridge = new CesiumBridge(viewer)
const ws = new WebSocket('ws://localhost:9100?session=default')

ws.onmessage = async (event) => {
  const { id, method, params } = JSON.parse(event.data)
  try {
    const result = await bridge.execute({ action: method, params })
    ws.send(JSON.stringify({ id, result }))
  } catch (error) {
    ws.send(JSON.stringify({ id, error: { message: String(error) } }))
  }
}
```

## Session Routing

Multiple browser tabs can connect to a single runtime using different session IDs:

```
Tab A: ws://localhost:9100?session=geoagent
Tab B: ws://localhost:9100?session=demo
```

MCP tool calls are routed to the session matching `DEFAULT_SESSION_ID`. If that session is unavailable, the first connected session is used as fallback.

## HTTP Push API

The runtime also exposes an HTTP endpoint for non-MCP integrations (e.g., FastAPI backend):

```bash
curl -X POST http://localhost:9100/push \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "default", "command": {"action": "flyTo", "params": {"longitude": 116.39, "latitude": 39.91}}}'
```

## Compatibility

| cesium-mcp-runtime | cesium-mcp-bridge | Cesium |
|--------------------|-------------------|--------|
| 1.139.x | 1.139.x | ~1.139.0 |

## License

MIT
