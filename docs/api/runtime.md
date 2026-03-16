# cesium-mcp-runtime

> MCP Server (stdio) — 44 tools (11 toolsets) + 2 resources, with dynamic discovery.

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

Tools are organized into **11 toolsets**. By default, 4 core toolsets are enabled (~19 tools). Set `CESIUM_TOOLSETS=all` for everything, or let the AI discover and activate toolsets dynamically.

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
| `geolocation` | 1 | — | Geocoding — convert address/place name to coordinates (Nominatim/OSM) |

### Dynamic Discovery

When not in `all` mode, two meta-tools are always available:

| Tool | Description |
|------|-------------|
| `list_toolsets` | List all toolset groups with enabled status |
| `enable_toolset` | Dynamically enable a toolset at runtime |

### View

#### `flyTo`

Animate camera to a position with smooth transition.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `longitude` | `number` | ✅ | — | Longitude (-180 to 180) |
| `latitude` | `number` | ✅ | — | Latitude (-90 to 90) |
| `height` | `number` | — | `50000` | Camera height in meters |
| `heading` | `number` | — | `0` | Heading in degrees, 0 = North |
| `pitch` | `number` | — | `-45` | Pitch in degrees, -90 = straight down |
| `duration` | `number` | — | `2` | Flight animation duration in seconds |

#### `setView`

Instantly set camera position and orientation (no animation).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `longitude` | `number` | ✅ | — | Longitude (-180 to 180) |
| `latitude` | `number` | ✅ | — | Latitude (-90 to 90) |
| `height` | `number` | — | `50000` | Height in meters |
| `heading` | `number` | — | `0` | Heading in degrees |
| `pitch` | `number` | — | `-90` | Pitch in degrees |
| `roll` | `number` | — | `0` | Roll in degrees |

#### `getView`

Return current camera position and orientation. No parameters.

**Returns:** `{ longitude, latitude, height, heading, pitch, roll }`

#### `zoomToExtent`

Fit view to a geographic bounding box.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `west` | `number` | ✅ | — | West boundary longitude |
| `south` | `number` | ✅ | — | South boundary latitude |
| `east` | `number` | ✅ | — | East boundary longitude |
| `north` | `number` | ✅ | — | North boundary latitude |
| `duration` | `number` | — | `2` | Animation duration in seconds |

### Entity

#### `addMarker`

Add a point marker with optional label. Returns `entityId`.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `longitude` | `number` | ✅ | — | Longitude (-180 to 180) |
| `latitude` | `number` | ✅ | — | Latitude (-90 to 90) |
| `label` | `string` | — | — | Label text |
| `color` | `string` | — | `"#3B82F6"` | CSS color |
| `size` | `number` | — | `12` | Point size in pixels |
| `id` | `string` | — | auto | Custom layer ID |

#### `addLabel`

Add text labels to GeoJSON features (display attribute values).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `data` | `object` | ✅ | — | GeoJSON FeatureCollection |
| `field` | `string` | ✅ | — | Property field name for label text |
| `style` | `object` | — | — | Label style (font, fillColor, outlineColor, scale) |

#### `addModel`

Place a 3D model (glTF/GLB) at a position. Returns `entityId`.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `longitude` | `number` | ✅ | — | Longitude (-180 to 180) |
| `latitude` | `number` | ✅ | — | Latitude (-90 to 90) |
| `height` | `number` | — | `0` | Height in meters |
| `url` | `string` | ✅ | — | glTF/GLB model URL |
| `scale` | `number` | — | `1` | Scale factor |
| `heading` | `number` | — | `0` | Heading in degrees |
| `pitch` | `number` | — | `0` | Pitch in degrees |
| `roll` | `number` | — | `0` | Roll in degrees |
| `label` | `string` | — | — | Model label text |

#### `addPolygon`

Add a polygon area with fill and outline. Returns `entityId`.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `coordinates` | `number[][]` | ✅ | — | Ring coordinates `[[lon, lat, height?], ...]` |
| `color` | `string` | — | `"#3B82F6"` | Fill color (CSS) |
| `outlineColor` | `string` | — | `"#FFFFFF"` | Outline color |
| `opacity` | `number` | — | `0.6` | Fill opacity (0–1) |
| `extrudedHeight` | `number` | — | — | Extrusion height in meters |
| `clampToGround` | `boolean` | — | `true` | Clamp to terrain |
| `label` | `string` | — | — | Polygon label text |

#### `addPolyline`

Add a polyline (path/route). Returns `entityId`.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `coordinates` | `number[][]` | ✅ | — | Coordinates `[[lon, lat, height?], ...]` |
| `color` | `string` | — | `"#3B82F6"` | Line color (CSS) |
| `width` | `number` | — | `3` | Line width in pixels |
| `clampToGround` | `boolean` | — | `true` | Clamp to terrain |
| `label` | `string` | — | — | Polyline label text |

#### `updateEntity`

Update properties of an existing entity.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entityId` | `string` | ✅ | — | Entity ID to update |
| `position` | `object` | — | — | New position `{ longitude, latitude, height? }` |
| `label` | `string` | — | — | New label text |
| `color` | `string` | — | — | New color (CSS) |
| `scale` | `number` | — | — | New scale factor |
| `show` | `boolean` | — | — | Visibility |

#### `removeEntity`

Remove a single entity by ID.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entityId` | `string` | ✅ | — | Entity ID to remove |

### Layer

#### `addGeoJsonLayer`

Load GeoJSON data as a layer with optional styling.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `data` | `object` | ✅ | — | GeoJSON FeatureCollection |
| `id` | `string` | — | auto | Layer ID |
| `name` | `string` | — | — | Display name |
| `style` | `object` | — | — | Style config (color, opacity, pointSize, choropleth, category) |

#### `listLayers`

List all currently loaded layers. No parameters.

**Returns:** `[{ id, name, type, visible, color }]`

#### `removeLayer`

Remove a layer by ID.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | `string` | ✅ | — | Layer ID (from `listLayers`) |

#### `setLayerVisibility`

Toggle layer visibility.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | `string` | ✅ | — | Layer ID |
| `visible` | `boolean` | ✅ | — | Whether layer is visible |

#### `updateLayerStyle`

Modify layer styling properties.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `layerId` | `string` | ✅ | — | Layer ID |
| `labelStyle` | `object` | — | — | Label style (font, fillColor, outlineColor, outlineWidth, scale) |
| `layerStyle` | `object` | — | — | Layer style (color, opacity, strokeWidth, pointSize) |

#### `setBasemap`

Switch the base imagery layer.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `basemap` | `string` | ✅ | — | `"dark"` \| `"satellite"` \| `"standard"` |

### Camera

#### `lookAtTransform`

Orbit-style camera aim at a target position.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `longitude` | `number` | ✅ | — | Target longitude |
| `latitude` | `number` | ✅ | — | Target latitude |
| `height` | `number` | — | `0` | Target height in meters |
| `heading` | `number` | — | `0` | Camera heading in degrees |
| `pitch` | `number` | — | `-45` | Camera pitch in degrees |
| `range` | `number` | — | `1000` | Distance from target in meters |

#### `startOrbit`

Start orbiting the camera around the current view center.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `speed` | `number` | — | `0.005` | Rotation speed (radians/tick) |
| `clockwise` | `boolean` | — | `true` | Orbit direction |

#### `stopOrbit`

Stop the camera orbit animation. No parameters.

#### `setCameraOptions`

Configure camera controller options.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `enableRotate` | `boolean` | — | — | Enable rotation |
| `enableTranslate` | `boolean` | — | — | Enable translation |
| `enableZoom` | `boolean` | — | — | Enable zoom |
| `enableTilt` | `boolean` | — | — | Enable tilt |
| `enableLook` | `boolean` | — | — | Enable look |
| `minimumZoomDistance` | `number` | — | — | Min zoom distance (meters) |
| `maximumZoomDistance` | `number` | — | — | Max zoom distance (meters) |
| `enableInputs` | `boolean` | — | — | Enable/disable all inputs |

### Extended Entity Types

#### `addBillboard`

Add an image icon at a position.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `longitude` | `number` | ✅ | — | Longitude |
| `latitude` | `number` | ✅ | — | Latitude |
| `height` | `number` | — | `0` | Height in meters |
| `image` | `string` | ✅ | — | Image URL |
| `name` | `string` | — | — | Billboard name |
| `scale` | `number` | — | `1.0` | Scale factor |
| `color` | `ColorInput` | — | — | Tint color |
| `pixelOffset` | `{x, y}` | — | — | Pixel offset |
| `heightReference` | `string` | — | — | `"NONE"` \| `"CLAMP_TO_GROUND"` \| `"RELATIVE_TO_GROUND"` |

#### `addBox`

Add a 3D box entity.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `longitude` | `number` | ✅ | — | Longitude |
| `latitude` | `number` | ✅ | — | Latitude |
| `height` | `number` | — | `0` | Height in meters |
| `dimensions` | `object` | ✅ | — | `{ width, length, height }` in meters |
| `name` | `string` | — | — | Box name |
| `material` | `MaterialInput` | — | — | Material (color, image, etc.) |
| `outline` | `boolean` | — | `true` | Show outline |
| `outlineColor` | `ColorInput` | — | — | Outline color |
| `fill` | `boolean` | — | `true` | Show fill |
| `orientation` | `object` | — | — | `{ heading, pitch, roll }` in degrees |

#### `addCorridor`

Add a corridor (path with width).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `positions` | `PositionDegrees[]` | ✅ | — | Array of `{ longitude, latitude, height? }` |
| `width` | `number` | ✅ | — | Width in meters |
| `name` | `string` | — | — | Corridor name |
| `material` | `MaterialInput` | — | — | Material |
| `cornerType` | `string` | — | — | `"ROUNDED"` \| `"MITERED"` \| `"BEVELED"` |
| `height` | `number` | — | — | Height above ground |
| `extrudedHeight` | `number` | — | — | Extruded height |
| `outline` | `boolean` | — | — | Show outline |

#### `addCylinder`

Add a cylinder or cone.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `longitude` | `number` | ✅ | — | Longitude |
| `latitude` | `number` | ✅ | — | Latitude |
| `height` | `number` | — | `0` | Height in meters |
| `length` | `number` | ✅ | — | Cylinder height in meters |
| `topRadius` | `number` | ✅ | — | Top radius in meters |
| `bottomRadius` | `number` | ✅ | — | Bottom radius in meters |
| `name` | `string` | — | — | Name |
| `material` | `MaterialInput` | — | — | Material |
| `outline` | `boolean` | — | `true` | Show outline |
| `slices` | `number` | — | `128` | Number of slices |

#### `addEllipse`

Add an ellipse (oval).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `longitude` | `number` | ✅ | — | Center longitude |
| `latitude` | `number` | ✅ | — | Center latitude |
| `height` | `number` | — | `0` | Height in meters |
| `semiMajorAxis` | `number` | ✅ | — | Semi-major axis in meters |
| `semiMinorAxis` | `number` | ✅ | — | Semi-minor axis in meters |
| `name` | `string` | — | — | Name |
| `material` | `MaterialInput` | — | — | Material |
| `extrudedHeight` | `number` | — | — | Extruded height |
| `rotation` | `number` | — | — | Rotation in radians |
| `outline` | `boolean` | — | — | Show outline |

#### `addRectangle`

Add a rectangle by geographic bounds.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `west` | `number` | ✅ | — | West longitude |
| `south` | `number` | ✅ | — | South latitude |
| `east` | `number` | ✅ | — | East longitude |
| `north` | `number` | ✅ | — | North latitude |
| `name` | `string` | — | — | Name |
| `material` | `MaterialInput` | — | — | Material |
| `height` | `number` | — | — | Height |
| `extrudedHeight` | `number` | — | — | Extruded height |
| `outline` | `boolean` | — | — | Show outline |

#### `addWall`

Add a wall along positions.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `positions` | `PositionDegrees[]` | ✅ | — | Array of `{ longitude, latitude, height? }` |
| `name` | `string` | — | — | Name |
| `minimumHeights` | `number[]` | — | — | Min heights at each position |
| `maximumHeights` | `number[]` | — | — | Max heights at each position |
| `material` | `MaterialInput` | — | — | Material |
| `outline` | `boolean` | — | — | Show outline |

### Animation

#### `createAnimation`

Create a time-based animation with waypoints (moving entity along a path).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `waypoints` | `object[]` | ✅ | — | `[{ longitude, latitude, height?, time }]` — `time` is ISO 8601 |
| `name` | `string` | — | — | Animation name |
| `modelUri` | `string` | — | — | glTF URL or preset: `cesium_man`, `cesium_air`, `ground_vehicle`, `cesium_drone` |
| `showPath` | `boolean` | — | `true` | Show trail path |
| `pathWidth` | `number` | — | `2` | Path width in pixels |
| `pathColor` | `string` | — | `"#00FF00"` | Path color (CSS) |
| `pathLeadTime` | `number` | — | `0` | Path lead time in seconds |
| `pathTrailTime` | `number` | — | `1e10` | Path trail time in seconds |
| `multiplier` | `number` | — | `1` | Clock speed multiplier |
| `shouldAnimate` | `boolean` | — | `true` | Auto-start animation |

#### `controlAnimation`

Play or pause the current animation.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `action` | `string` | ✅ | — | `"play"` \| `"pause"` |

#### `removeAnimation`

Remove an animation entity.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entityId` | `string` | ✅ | — | Entity ID of animation to remove |

#### `listAnimations`

List all active animations. No parameters.

**Returns:** `[{ entityId, name?, startTime, stopTime, exists }]`

#### `updateAnimationPath`

Update visual properties of an animation path.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entityId` | `string` | ✅ | — | Animation entity ID |
| `width` | `number` | — | — | Path width in pixels |
| `color` | `string` | — | — | Path color (CSS) |
| `leadTime` | `number` | — | — | Lead time in seconds |
| `trailTime` | `number` | — | — | Trail time in seconds |
| `show` | `boolean` | — | — | Show/hide path |

#### `trackEntity`

Follow an entity with the camera, or stop tracking.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entityId` | `string` | — | — | Entity ID to track (omit to stop) |
| `heading` | `number` | — | — | Camera heading in degrees |
| `pitch` | `number` | — | `-30` | Camera pitch in degrees |
| `range` | `number` | — | `500` | Camera distance in meters |

#### `controlClock`

Configure the Cesium clock.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `action` | `string` | ✅ | — | `"configure"` \| `"setTime"` \| `"setMultiplier"` |
| `startTime` | `string` | — | — | ISO 8601 start time |
| `stopTime` | `string` | — | — | ISO 8601 stop time |
| `currentTime` | `string` | — | — | ISO 8601 current time |
| `time` | `string` | — | — | ISO 8601 time to jump to (for `setTime`) |
| `multiplier` | `number` | — | — | Clock speed multiplier |
| `shouldAnimate` | `boolean` | — | — | Whether clock should animate |
| `clockRange` | `string` | — | — | `"UNBOUNDED"` \| `"CLAMPED"` \| `"LOOP_STOP"` |

#### `setGlobeLighting`

Enable/disable globe lighting and atmospheric effects.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `enableLighting` | `boolean` | — | — | Enable globe lighting |
| `dynamicAtmosphereLighting` | `boolean` | — | — | Dynamic atmosphere lighting |
| `dynamicAtmosphereLightingFromSun` | `boolean` | — | — | Use sun position for atmosphere |

### 3D Data

#### `load3dTiles`

Load a 3D Tileset (buildings, terrain mesh, etc.).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | `string` | ✅ | — | URL to `tileset.json` |
| `id` | `string` | — | auto | Layer ID |
| `name` | `string` | — | — | Display name |
| `maximumScreenSpaceError` | `number` | — | `16` | Max screen space error (lower = more detail) |
| `heightOffset` | `number` | — | — | Height offset in meters |

#### `loadTerrain`

Set the terrain provider.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `provider` | `string` | ✅ | — | `"flat"` \| `"arcgis"` \| `"cesiumion"` |
| `url` | `string` | — | — | Custom terrain service URL |
| `cesiumIonAssetId` | `number` | — | — | Cesium Ion asset ID (for `cesiumion`) |

#### `loadImageryService`

Add a WMS/WMTS/XYZ/ArcGIS imagery layer.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | `string` | ✅ | — | Imagery service URL |
| `serviceType` | `string` | ✅ | — | `"wms"` \| `"wmts"` \| `"xyz"` \| `"arcgis_mapserver"` |
| `id` | `string` | — | auto | Layer ID |
| `name` | `string` | — | — | Display name |
| `layerName` | `string` | — | — | WMS/WMTS layer name |
| `opacity` | `number` | — | `1.0` | Opacity (0–1) |

### Interaction

#### `screenshot`

Capture the current globe view as an image. No parameters.

**Returns:** Base64 PNG image (MCP image content type).

#### `highlight`

Highlight specific features in a layer.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `layerId` | `string` | ✅ | — | Layer ID |
| `featureIndex` | `number` | — | — | Feature index (omit to highlight all) |
| `color` | `string` | — | `"#FFFF00"` | Highlight color (CSS) |

### Other

#### `playTrajectory` <Badge type="info" text="trajectory" />

Animate an entity along a path over time.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `coordinates` | `number[][]` | ✅ | — | Path coordinates `[[lon, lat, alt?], ...]` |
| `id` | `string` | — | auto | Trajectory layer ID |
| `name` | `string` | — | — | Trajectory name |
| `durationSeconds` | `number` | — | `10` | Animation duration in seconds |
| `trailSeconds` | `number` | — | `2` | Trail length in seconds |
| `label` | `string` | — | — | Moving entity label |

#### `addHeatmap` <Badge type="info" text="heatmap" />

Create a heatmap overlay from point data.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `data` | `object` | ✅ | — | GeoJSON Point FeatureCollection |
| `radius` | `number` | — | `30` | Heat influence radius in pixels |

#### `geocode` <Badge type="info" text="geolocation" />

Convert an address, landmark, or place name to geographic coordinates (longitude/latitude). Uses OpenStreetMap Nominatim — no API key required. Supports `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` environment variables for proxy.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `address` | `string` | ✅ | — | Address, landmark, or place name, e.g. "Eiffel Tower", "故宫" |
| `countryCode` | `string` | — | — | 2-letter ISO country code to limit search scope (e.g. `CN`, `US`, `JP`) |

**Returns:** `{ success, longitude, latitude, displayName, boundingBox }`

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
| `OSM_USER_AGENT` | `cesium-mcp-runtime/1.0` | User-Agent header for Nominatim geocode requests |

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

## Common Types

### `ColorInput`

```typescript
type ColorInput =
  | string                        // CSS color: "#FF0000", "red", "rgba(255,0,0,0.5)"
  | { red: number; green: number; blue: number; alpha?: number }  // RGBA 0–1
```

### `MaterialInput`

```typescript
type MaterialInput =
  | ColorInput
  | {
      type: "color" | "image" | "checkerboard" | "stripe" | "grid"
      color?: ColorInput
      image?: string
      evenColor?: ColorInput
      oddColor?: ColorInput
      orientation?: "horizontal" | "vertical"
      cellAlpha?: number
    }
```

### `PositionDegrees`

```typescript
type PositionDegrees = {
  longitude: number   // degrees
  latitude: number    // degrees
  height?: number     // meters
}
```
