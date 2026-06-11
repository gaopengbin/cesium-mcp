# cesium-mcp-dev

## 1.142.1

### Patch Changes

- [`2739034`](https://github.com/gaopengbin/cesium-mcp/commit/2739034f9ee06fe1f0ebfff2f2250b3666292f62) Thanks [@gaopengbin](https://github.com/gaopengbin)! - feat(layer): split updateLayerStyle into entity/imagery/primitive channels

  Replace the single untyped layerStyle param with three typed style channels:

  - `layerStyle` — entity layer style, including mutually-exclusive GeoJSON
    thematic styles (choropleth / category / randomColor / gradient)
  - `imageryStyle` — imagery visual style (alpha, brightness, contrast, hue,
    saturation, gamma); visibility stays controlled by setLayerVisibility
  - `primitiveStyle` — GeoJSON Primitive material style (color, opacity,
    outlineColor, outlineWidth, pointSize, lineWidth)

  Runtime adds zod schemas with mutual-exclusion refinement; the bridge keeps
  matching validation guards for non-MCP callers.

## 1.139.8

### Patch Changes

- chore: version bump to align with cesium-mcp-runtime v1.139.8

## 1.139.7

### Patch Changes

- chore: version bump to align with cesium-mcp-runtime v1.139.7

## 1.139.6

### Patch Changes

- chore: version bump to align with cesium-mcp-runtime v1.139.6

## 1.139.5

## 1.139.4

## 1.139.3

## 1.139.1

### Patch Changes

- fix: addMarker auto-generates layerId, updateLayerStyle supports marker entities and labelStyle/layerStyle params, zoomToExtent uses individual number params for OpenAI compatibility
