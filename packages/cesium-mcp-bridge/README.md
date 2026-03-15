# cesium-mcp-bridge

**English** | [中文](README.zh-CN.md)

> Unified execution layer for AI Agents to control Cesium 3D maps in the browser.

[![npm version](https://img.shields.io/npm/v/cesium-mcp-bridge.svg)](https://www.npmjs.com/package/cesium-mcp-bridge)
[![license](https://img.shields.io/npm/l/cesium-mcp-bridge.svg)](LICENSE)

## What is this?

`cesium-mcp-bridge` is a lightweight SDK that lets AI Agents (LangChain, LangGraph, Claude, etc.) control a browser-side [CesiumJS](https://cesium.com) globe through a unified command interface. It supports both type-safe method calls and JSON command dispatch.

```
AI Agent --> SSE / MCP / WebSocket --> cesium-mcp-bridge --> Cesium Viewer
```

## Install

```bash
npm install cesium-mcp-bridge cesium
```

> `cesium` is a peer dependency (compatible with `~1.139.0`).

## Quick Start

```typescript
import * as Cesium from 'cesium'
import { CesiumBridge } from 'cesium-mcp-bridge'

const viewer = new Cesium.Viewer('cesiumContainer')
const bridge = new CesiumBridge(viewer)

// Type-safe method call
await bridge.flyTo({ longitude: 116.39, latitude: 39.91, height: 5000 })

// JSON command dispatch (for AI Agent messages)
await bridge.execute({
  action: 'addGeoJsonLayer',
  params: { id: 'cities', name: 'Cities', data: geojson },
})
```

## Commands (43)

### View Control

| Command | Description |
|---------|-------------|
| `flyTo` | Fly to a geographic position with optional heading/pitch/roll |
| `setView` | Set camera position and orientation instantly |
| `getView` | Get current camera state (position, heading, pitch, roll) |
| `zoomToExtent` | Zoom to a bounding rectangle |

### Entity

| Command | Description |
|---------|-------------|
| `addMarker` | Add a point marker |
| `addLabel` | Add text labels at multiple positions |
| `addModel` | Add 3D model (glTF/GLB or Ion asset) |
| `addPolygon` | Add polygon with styling |
| `addPolyline` | Add polyline with styling |
| `updateEntity` | Update entity properties |
| `removeEntity` | Remove entity by ID |

### Layer Management

| Command | Description |
|---------|-------------|
| `addGeoJsonLayer` | Add GeoJSON layer with style options (choropleth, category, etc.) |
| `listLayers` | List all loaded layers with metadata |
| `removeLayer` | Remove a layer by ID |
| `setLayerVisibility` | Show/hide a layer |
| `updateLayerStyle` | Update a layer's style dynamically |
| `setBasemap` | Switch basemap (dark / satellite / standard / custom) |

### Camera (advanced)

| Command | Description |
|---------|-------------|
| `lookAtTransform` | Orbit-style camera aim at a position (heading/pitch/range) |
| `startOrbit` | Start orbiting the camera around current center |
| `stopOrbit` | Stop orbit animation |
| `setCameraOptions` | Configure camera controller (enable/disable rotation, zoom, tilt) |

### Extended Entity Types

| Command | Description |
|---------|-------------|
| `addBillboard` | Add an image icon at a position |
| `addBox` | Add a 3D box with dimensions and material |
| `addCorridor` | Add a corridor (path with width) |
| `addCylinder` | Add a cylinder or cone |
| `addEllipse` | Add an ellipse (oval) |
| `addRectangle` | Add a rectangle by geographic bounds |
| `addWall` | Add a wall along positions |

### Animation

| Command | Description |
|---------|-------------|
| `createAnimation` | Create time-based animation with waypoints |
| `controlAnimation` | Play or pause animation |
| `removeAnimation` | Remove an animation entity |
| `listAnimations` | List all active animations |
| `updateAnimationPath` | Update animation path visual properties |
| `trackEntity` | Follow an entity with the camera |
| `controlClock` | Configure Cesium clock (time range, speed) |
| `setGlobeLighting` | Enable/disable globe lighting and atmospheric effects |

### 3D Scene

| Command | Description |
|---------|-------------|
| `load3dTiles` | Load a 3D Tiles dataset from URL or Cesium Ion |
| `loadTerrain` | Switch terrain provider (flat / arcgis / cesiumion / url) |
| `loadImageryService` | Add WMS / WMTS / XYZ / ArcGIS imagery layer |

### Interaction

| Command | Description |
|---------|-------------|
| `screenshot` | Capture current map view as base64 PNG |
| `highlight` | Highlight features in a layer by index or all |

### Other

| Command | Description |
|---------|-------------|
| `playTrajectory` | Animate an entity along a path with SampledPositionProperty |
| `addHeatmap` | Add a Canvas-based heatmap layer |

## Two Calling Styles

```typescript
// Style 1: Type-safe methods
const layers = bridge.listLayers()
await bridge.flyTo({ longitude: 121.47, latitude: 31.23, height: 3000 })

// Style 2: JSON command dispatch (MCP / SSE compatible)
const result = await bridge.execute({
  action: 'flyTo',
  params: { longitude: 121.47, latitude: 31.23 },
})
```

## Events

```typescript
bridge.on('layerAdded', (e) => console.log('Layer added:', e.data))
bridge.on('layerRemoved', (e) => console.log('Layer removed:', e.data))
bridge.on('error', (e) => console.error('Error:', e.data))
```

## Integration with cesium-mcp-runtime

This package is the browser-side execution engine for [cesium-mcp-runtime](https://www.npmjs.com/package/cesium-mcp-runtime). The runtime connects to the bridge via WebSocket:

```typescript
const ws = new WebSocket('ws://localhost:9100?session=default')
ws.onmessage = async (event) => {
  const { id, method, params } = JSON.parse(event.data)
  const result = await bridge.execute({ action: method, params })
  ws.send(JSON.stringify({ id, result }))
}
```

## Type Exports

```typescript
import type {
  BridgeCommand, BridgeResult, FlyToParams, SetViewParams,
  AddGeoJsonLayerParams, AddHeatmapParams, Load3dTilesParams,
  PlayTrajectoryParams, LayerInfo, HighlightParams,
  // Camera
  LookAtTransformParams, StartOrbitParams, SetCameraOptionsParams,
  // Entity Types
  AddBillboardParams, AddBoxParams, AddCorridorParams,
  AddCylinderParams, AddEllipseParams, AddRectangleParams, AddWallParams,
  MaterialSpec, MaterialInput, OrientationInput, PositionDegrees,
  // Animation
  CreateAnimationParams, ControlAnimationParams, RemoveAnimationParams,
  UpdateAnimationPathParams, TrackEntityParams, ControlClockParams,
  SetGlobeLightingParams, AnimationWaypoint, AnimationInfo,
} from 'cesium-mcp-bridge'
```

## Compatibility

| cesium-mcp-bridge | Cesium |
|-------------------|--------|
| 1.139.x | ~1.139.0 |

## License

MIT
