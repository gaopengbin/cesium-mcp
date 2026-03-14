# cesium-mcp-bridge

> Browser SDK — embeds in your CesiumJS app, receives commands via WebSocket.

[![npm](https://img.shields.io/npm/v/cesium-mcp-bridge)](https://www.npmjs.com/package/cesium-mcp-bridge)

## Installation

```bash
npm install cesium-mcp-bridge
```

**Peer dependency**: `cesium@~1.139.0`

## Initialization

```js
import { CesiumBridge } from 'cesium-mcp-bridge'

const viewer = new Cesium.Viewer('cesiumContainer')
const bridge = new CesiumBridge(viewer, {
  wsUrl: 'ws://localhost:9100',   // Runtime WebSocket URL
  sessionId: 'default',           // Session ID for routing
})
```

## Commands (19)

### View Control

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `flyTo` | Animate camera to a position | `longitude`, `latitude`, `height`, `heading`, `pitch`, `roll`, `duration` |
| `setView` | Instantly set camera position | `longitude`, `latitude`, `height`, `heading`, `pitch`, `roll` |
| `getView` | Get current camera state | — |
| `zoomToExtent` | Zoom to geographic bounds | `west`, `south`, `east`, `north` |

### Layer Management

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `addGeoJsonLayer` | Load GeoJSON data | `url` or `data`, `name`, `style` |
| `addHeatmap` | Create heatmap visualization | `points`, `name`, `radius`, `gradient` |
| `removeLayer` | Remove a layer by ID | `layerId` |
| `setLayerVisibility` | Show/hide a layer | `layerId`, `visible` |
| `listLayers` | List all loaded layers | — |
| `updateLayerStyle` | Change layer styling | `layerId`, `style` |
| `setBasemap` | Switch imagery base layer | `provider`, `url` |

### 3D Scene

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `load3dTiles` | Load 3D Tileset | `url`, `name`, `maximumScreenSpaceError` |
| `loadTerrain` | Set terrain provider | `url`, `provider` |
| `loadImageryService` | Add imagery layer | `url`, `provider`, `name` |

### Entities

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `addMarker` | Add point marker | `longitude`, `latitude`, `name`, `icon`, `color` |
| `addLabel` | Add text label | `longitude`, `latitude`, `text`, `font`, `color` |

### Animation

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `playTrajectory` | Animate along a path | `positions`, `duration`, `loop` |

### Interaction

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `screenshot` | Capture current view | `width`, `height`, `format` |
| `highlight` | Highlight features | `layerId`, `featureId`, `color` |

## Two Calling Styles

### Style 1: Type-safe Methods

```typescript
const result = await bridge.flyTo({
  longitude: 116.4,
  latitude: 39.9,
  height: 5000,
  duration: 2,
})
```

### Style 2: JSON Command Dispatch

```typescript
const result = await bridge.execute({
  action: 'flyTo',
  params: {
    longitude: 116.4,
    latitude: 39.9,
    height: 5000,
    duration: 2,
  },
})
```

## Events

```typescript
bridge.on('layerAdded', (layer) => console.log('Layer added:', layer))
bridge.on('layerRemoved', (layerId) => console.log('Removed:', layerId))
bridge.on('error', (err) => console.error('Bridge error:', err))
```

## TypeScript Types

```typescript
import type {
  BridgeCommand,
  BridgeResult,
  FlyToParams,
  SetViewParams,
  AddGeoJsonLayerParams,
  AddHeatmapParams,
  Load3dTilesParams,
  PlayTrajectoryParams,
  LayerInfo,
  HighlightParams,
} from 'cesium-mcp-bridge'
```
