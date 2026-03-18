# cesium-mcp-runtime

**English** | [中文](README.zh-CN.md)

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

## MCP Tools (58 + 2 meta)

Tools are organized into **12 toolsets**. By default, 4 core toolsets are enabled (~31 tools). Additional toolsets can be activated via environment variable or dynamically by the AI agent at runtime.

### Toolsets Overview

| Toolset | Tools | Default | Description |
|---------|-------|---------|-------------|
| `view` | 8 | Yes | Camera view controls + viewpoint bookmarks + scene export |
| `entity` | 10 | Yes | Core entity operations + batch, query & property inspection |
| `layer` | 8 | Yes | Layer management (GeoJSON, schema, style, basemap) |
| `interaction` | 3 | Yes | Screenshot, highlight & measurement |
| `camera` | 4 | — | Advanced camera controls (orbit, lookAt) |
| `entity-ext` | 7 | — | Extended entity types (box, cylinder, wall, etc.) |
| `animation` | 8 | — | Animation system (waypoints, clock, tracking, lighting) |
| `tiles` | 5 | — | 3D Tiles, terrain, imagery services, CZML & KML |
| `trajectory` | 1 | — | Trajectory playback |
| `heatmap` | 1 | — | Heatmap visualization |
| `scene` | 2 | — | Scene options & post-processing |
| `geolocation` | 1 | — | Geocoding — convert address/place name to coordinates (Nominatim/OSM) |

### Toolset Configuration

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["cesium-mcp-runtime"],
      "env": {
        "CESIUM_TOOLSETS": "all"
      }
    }
  }
}
```

| `CESIUM_TOOLSETS` value | Result |
|-------------------------|--------|
| *(not set)* | Default 4 toolsets (~31 tools + 2 meta-tools) |
| `view,entity,camera,animation` | Only specified toolsets + 2 meta-tools |
| `all` | All 58 tools, no meta-tools |

### Dynamic Discovery (meta-tools)

When not in `all` mode, two meta-tools are always available so the AI can discover and activate additional capabilities on demand:

| Tool | Description |
|------|-------------|
| `list_toolsets` | List all toolset groups with enabled status and tool names |
| `enable_toolset` | Dynamically enable a toolset — new tools become immediately available |

### View

| Tool | Description |
|------|-------------|
| `flyTo` | Fly to coordinates (lon, lat, height, heading, pitch, roll, duration) |
| `setView` | Set camera position instantly |
| `getView` | Get current camera state |
| `zoomToExtent` | Zoom to bounding box (west, south, east, north) |

### Entity

| Tool | Description |
|------|-------------|
| `addMarker` | Add a marker at coordinates |
| `addLabel` | Add text labels to the map |
| `addModel` | Add 3D model (glTF/GLB or Ion asset) |
| `addPolygon` | Add polygon with styling |
| `addPolyline` | Add polyline with styling |
| `updateEntity` | Update entity properties |
| `removeEntity` | Remove entity by ID |

### Layer

| Tool | Description |
|------|-------------|
| `addGeoJsonLayer` | Add GeoJSON with styling (choropleth, category, etc.) |
| `listLayers` | List all layers |
| `removeLayer` | Remove layer by ID |
| `setLayerVisibility` | Toggle layer visibility |
| `updateLayerStyle` | Change layer color/opacity/width |
| `setBasemap` | Switch basemap |

### Camera *(toolset: camera)*

| Tool | Description |
|------|-------------|
| `lookAtTransform` | Orbit-style camera aim at a position (heading/pitch/range) |
| `startOrbit` | Start orbiting the camera around current center |
| `stopOrbit` | Stop orbit animation |
| `setCameraOptions` | Configure camera controller (enable/disable rotation, zoom, tilt) |

### Extended Entity Types *(toolset: entity-ext)*

| Tool | Description |
|------|-------------|
| `addBillboard` | Add an image icon at a position |
| `addBox` | Add a 3D box with dimensions and material |
| `addCorridor` | Add a corridor (path with width) |
| `addCylinder` | Add a cylinder or cone |
| `addEllipse` | Add an ellipse (oval) |
| `addRectangle` | Add a rectangle by geographic bounds |
| `addWall` | Add a wall along positions |

### Animation *(toolset: animation)*

| Tool | Description |
|------|-------------|
| `createAnimation` | Create time-based animation with waypoints (moving entity along path) |
| `controlAnimation` | Play or pause the current animation |
| `removeAnimation` | Remove an animation entity |
| `listAnimations` | List all active animations |
| `updateAnimationPath` | Update animation path visual properties |
| `trackEntity` | Follow an entity with the camera |
| `controlClock` | Configure Cesium clock (time range, speed, animation state) |
| `setGlobeLighting` | Enable/disable globe lighting and atmospheric effects |

### Tiles & Data *(toolset: tiles)*

| Tool | Description |
|------|-------------|
| `load3dTiles` | Load 3D Tiles from URL or Ion asset ID |
| `loadTerrain` | Set terrain provider |
| `loadImageryService` | Add imagery service (WMS/WMTS/XYZ) |

### Interaction *(toolset: interaction)*

| Tool | Description |
|------|-------------|
| `screenshot` | Capture map as base64 PNG |
| `highlight` | Highlight layer features |

### Other

| Tool | Toolset | Description |
|------|---------|-------------|
| `playTrajectory` | trajectory | Animate entity along coordinate path |
| `addHeatmap` | heatmap | Generate heatmap from point data |

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
| `CESIUM_TOOLSETS` | *(not set)* | Toolset activation: omit for defaults, `all` for everything, or comma-separated list |
| `CESIUM_LOCALE` | `en` | Tool description language: `en` (English, default) or `zh-CN` (Chinese) |

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
