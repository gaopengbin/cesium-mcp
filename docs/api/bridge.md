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

## Commands (43)

### View Control

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `flyTo` | Animate camera to a position | `longitude`, `latitude`, `height`, `heading`, `pitch`, `roll`, `duration` |
| `setView` | Instantly set camera position | `longitude`, `latitude`, `height`, `heading`, `pitch`, `roll` |
| `getView` | Get current camera state | — |
| `zoomToExtent` | Zoom to geographic bounds | `west`, `south`, `east`, `north` |

### Entity

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `addMarker` | Add point marker | `longitude`, `latitude`, `label`, `color`, `size` |
| `addLabel` | Add text labels | `data`, `field`, `style` |
| `addPolyline` | Add polyline (path/route) | `coordinates`, `color`, `width`, `clampToGround` |
| `addPolygon` | Add polygon area | `coordinates`, `color`, `outlineColor`, `opacity`, `extrudedHeight` |
| `addModel` | Place 3D model (glTF/GLB) | `longitude`, `latitude`, `url`, `scale`, `heading`, `pitch`, `roll` |
| `updateEntity` | Update entity properties | `entityId`, `position`, `color`, `label`, `scale`, `show` |
| `removeEntity` | Remove a single entity | `entityId` |

### Layer Management

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `addGeoJsonLayer` | Load GeoJSON data | `url` or `data`, `name`, `style` |
| `listLayers` | List all loaded layers | — |
| `removeLayer` | Remove a layer by ID | `layerId` |
| `setLayerVisibility` | Show/hide a layer | `layerId`, `visible` |
| `updateLayerStyle` | Change layer styling | `layerId`, `style` |
| `setBasemap` | Switch imagery base layer | `provider`, `url` |

### Camera (advanced)

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `lookAtTransform` | Orbit-style camera aim | `longitude`, `latitude`, `height`, `heading`, `pitch`, `range` |
| `startOrbit` | Start camera orbit | `speed`, `direction` |
| `stopOrbit` | Stop orbit animation | — |
| `setCameraOptions` | Configure camera controller | `enableRotate`, `enableZoom`, `enableTilt` |

### Extended Entity Types

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `addBillboard` | Add image icon | `longitude`, `latitude`, `image`, `scale` |
| `addBox` | Add 3D box | `position`, `dimensions`, `material` |
| `addCorridor` | Add corridor | `positions`, `width`, `material` |
| `addCylinder` | Add cylinder/cone | `position`, `length`, `topRadius`, `bottomRadius` |
| `addEllipse` | Add ellipse | `position`, `semiMajorAxis`, `semiMinorAxis` |
| `addRectangle` | Add rectangle | `west`, `south`, `east`, `north`, `material` |
| `addWall` | Add wall | `positions`, `maximumHeights`, `minimumHeights` |

### Animation

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `createAnimation` | Create waypoint animation | `entityId`, `waypoints`, `model` |
| `controlAnimation` | Play/pause animation | `entityId`, `action` |
| `removeAnimation` | Remove animation entity | `entityId` |
| `listAnimations` | List active animations | — |
| `updateAnimationPath` | Update path visuals | `entityId`, `show`, `width`, `color` |
| `trackEntity` | Camera follows entity | `entityId` |
| `controlClock` | Configure clock | `startTime`, `stopTime`, `multiplier` |
| `setGlobeLighting` | Globe lighting control | `enableLighting`, `enableFog` |

### 3D Scene

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `load3dTiles` | Load 3D Tileset | `url`, `name`, `maximumScreenSpaceError` |
| `loadTerrain` | Set terrain provider | `url`, `provider` |
| `loadImageryService` | Add imagery layer | `url`, `provider`, `name` |

### Interaction

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `screenshot` | Capture current view | `width`, `height`, `format` |
| `highlight` | Highlight features | `layerId`, `featureId`, `color` |

### Other

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `playTrajectory` | Animate along a path | `positions`, `duration`, `loop` |
| `addHeatmap` | Create heatmap visualization | `points`, `name`, `radius`, `gradient` |

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
  AddPolylineParams,
  AddPolygonParams,
  AddModelParams,
  UpdateEntityParams,
  RemoveEntityParams,
  Load3dTilesParams,
  PlayTrajectoryParams,
  LayerInfo,
  HighlightParams,
  ColorInput,
  // Camera
  LookAtTransformParams,
  StartOrbitParams,
  SetCameraOptionsParams,
  // Entity Types
  AddBillboardParams,
  AddBoxParams,
  AddCorridorParams,
  AddCylinderParams,
  AddEllipseParams,
  AddRectangleParams,
  AddWallParams,
  MaterialSpec,
  MaterialInput,
  OrientationInput,
  PositionDegrees,
  // Animation
  CreateAnimationParams,
  ControlAnimationParams,
  RemoveAnimationParams,
  UpdateAnimationPathParams,
  TrackEntityParams,
  ControlClockParams,
  SetGlobeLightingParams,
  AnimationWaypoint,
  AnimationInfo,
} from 'cesium-mcp-bridge'
```
