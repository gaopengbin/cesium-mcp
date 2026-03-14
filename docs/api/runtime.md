# cesium-mcp-runtime

> MCP Server (stdio) — exposes 19 tools + 2 resources to any MCP client.

[![npm](https://img.shields.io/npm/v/cesium-mcp-runtime)](https://www.npmjs.com/package/cesium-mcp-runtime)

## Installation & Run

```bash
npx cesium-mcp-runtime
```

Or install globally:

```bash
npm install -g cesium-mcp-runtime
cesium-mcp-runtime
```

## MCP Client Configuration

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-runtime"]
    }
  }
}
```

### VS Code (GitHub Copilot)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "cesium-mcp": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-runtime"]
    }
  }
}
```

### Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-runtime"]
    }
  }
}
```

## MCP Tools (19)

### View

| Tool | Description |
|------|-------------|
| `flyTo` | Animate camera to longitude/latitude/height with optional heading/pitch/roll |
| `setView` | Instantly set camera position and orientation |
| `getView` | Return current camera position, heading, pitch, roll |
| `zoomToExtent` | Fit view to geographic bounding box |
| `screenshot` | Capture the current globe view as an image |

### Layers

| Tool | Description |
|------|-------------|
| `addGeoJsonLayer` | Load GeoJSON from URL or inline data |
| `addHeatmap` | Create heatmap overlay from point data |
| `addMarker` | Add a point marker with label |
| `addLabel` | Add a text label at a position |
| `removeLayer` | Remove a layer by ID |
| `setLayerVisibility` | Toggle layer visibility |
| `listLayers` | List all currently loaded layers |
| `updateLayerStyle` | Modify layer styling properties |
| `setBasemap` | Switch the base imagery layer |
| `highlight` | Highlight specific features |

### 3D Data

| Tool | Description |
|------|-------------|
| `load3dTiles` | Load a 3D Tileset (buildings, terrain mesh, etc.) |
| `loadTerrain` | Set the terrain provider |
| `loadImageryService` | Add a WMS/WMTS/TMS imagery layer |

### Animation

| Tool | Description |
|------|-------------|
| `playTrajectory` | Animate an entity along a path over time |

## MCP Resources (2)

| URI | Description |
|-----|-------------|
| `cesium://scene/camera` | Current camera state (position, orientation) |
| `cesium://scene/layers` | List of all loaded layers with metadata |

Resources are read-only and can be polled by the AI agent for context-aware decisions.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CESIUM_WS_PORT` | `9100` | WebSocket server port for bridge connections |
| `DEFAULT_SESSION_ID` | `default` | Which browser session to route MCP calls to |

## Session Routing

Multiple browser tabs can connect simultaneously. Each bridge instance registers with a `sessionId`:

```
Tab 1: sessionId = "project-a"
Tab 2: sessionId = "project-b"
```

The runtime routes MCP tool calls to the session matching `DEFAULT_SESSION_ID`.

## HTTP Push API

For non-MCP integrations (e.g., FastAPI backends), the runtime exposes an HTTP endpoint:

```bash
curl -X POST http://localhost:9100/push \
  -H "Content-Type: application/json" \
  -d '{"action": "flyTo", "params": {"longitude": 2.29, "latitude": 48.86, "height": 1000}}'
```
