# cesium-mcp-runtime

> MCP Server (stdio) — 43 tools (10 toolsets) + 2 resources, with dynamic discovery.

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

## MCP Tools (43 + 2 meta)

Tools are organized into **10 toolsets**. By default, 4 core toolsets are enabled (~19 tools). Set `CESIUM_TOOLSETS=all` for everything, or let the AI discover and activate toolsets dynamically.

### Toolsets

| Toolset | Tools | Default | Description |
|---------|-------|---------|-------------|
| `view` | 4 | Yes | Camera view controls |
| `entity` | 7 | Yes | Core entity operations |
| `layer` | 6 | Yes | Layer management |
| `interaction` | 2 | Yes | Screenshot & highlight |
| `camera` | 4 | — | Advanced camera controls (orbit, lookAt) |
| `entity-ext` | 7 | — | Extended entity types (box, cylinder, wall, etc.) |
| `animation` | 8 | — | Animation system (waypoints, clock, tracking) |
| `tiles` | 3 | — | 3D Tiles, terrain, imagery services |
| `trajectory` | 1 | — | Trajectory playback |
| `heatmap` | 1 | — | Heatmap visualization |

### Dynamic Discovery

When not in `all` mode, two meta-tools are always available:

| Tool | Description |
|------|-------------|
| `list_toolsets` | List all toolset groups with enabled status |
| `enable_toolset` | Dynamically enable a toolset at runtime |

### View

| Tool | Description |
|------|-------------|
| `flyTo` | Animate camera to longitude/latitude/height with optional heading/pitch/roll |
| `setView` | Instantly set camera position and orientation |
| `getView` | Return current camera position, heading, pitch, roll |
| `zoomToExtent` | Fit view to geographic bounding box |

### Entity

| Tool | Description |
|------|-------------|
| `addMarker` | Add a point marker with label |
| `addLabel` | Add a text label at a position |
| `addModel` | Place a 3D model (glTF/GLB) at a position |
| `addPolygon` | Add polygon area with fill and outline |
| `addPolyline` | Add polyline (path/route) on the map |
| `updateEntity` | Update entity properties |
| `removeEntity` | Remove a single entity by ID |

### Layer

| Tool | Description |
|------|-------------|
| `addGeoJsonLayer` | Load GeoJSON from URL or inline data |
| `listLayers` | List all currently loaded layers |
| `removeLayer` | Remove a layer by ID |
| `setLayerVisibility` | Toggle layer visibility |
| `updateLayerStyle` | Modify layer styling properties |
| `setBasemap` | Switch the base imagery layer |

### Camera

| Tool | Description |
|------|-------------|
| `lookAtTransform` | Orbit-style camera aim at a position (heading/pitch/range) |
| `startOrbit` | Start orbiting the camera around current center |
| `stopOrbit` | Stop orbit animation |
| `setCameraOptions` | Configure camera controller (enable/disable rotation, zoom, tilt) |

### Extended Entity Types

| Tool | Description |
|------|-------------|
| `addBillboard` | Add an image icon at a position |
| `addBox` | Add a 3D box with dimensions and material |
| `addCorridor` | Add a corridor (path with width) |
| `addCylinder` | Add a cylinder or cone |
| `addEllipse` | Add an ellipse (oval) |
| `addRectangle` | Add a rectangle by geographic bounds |
| `addWall` | Add a wall along positions |

### Animation

| Tool | Description |
|------|-------------|
| `createAnimation` | Create time-based animation with waypoints |
| `controlAnimation` | Play or pause animation |
| `removeAnimation` | Remove an animation entity |
| `listAnimations` | List all active animations |
| `updateAnimationPath` | Update animation path visual properties |
| `trackEntity` | Follow an entity with the camera |
| `controlClock` | Configure Cesium clock (time range, speed) |
| `setGlobeLighting` | Enable/disable globe lighting and atmospheric effects |

### 3D Data

| Tool | Description |
|------|-------------|
| `load3dTiles` | Load a 3D Tileset (buildings, terrain mesh, etc.) |
| `loadTerrain` | Set the terrain provider |
| `loadImageryService` | Add a WMS/WMTS/TMS imagery layer |

### Interaction

| Tool | Description |
|------|-------------|
| `screenshot` | Capture the current globe view as an image |
| `highlight` | Highlight specific features |

### Other

| Tool | Toolset | Description |
|------|---------|-------------|
| `playTrajectory` | trajectory | Animate an entity along a path over time |
| `addHeatmap` | heatmap | Create heatmap overlay from point data |

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
| `CESIUM_TOOLSETS` | *(not set)* | Toolset activation: omit for defaults, `all` for everything, or comma-separated list |

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
