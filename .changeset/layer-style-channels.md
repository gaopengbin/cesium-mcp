---
'cesium-mcp-bridge': patch
'cesium-mcp-runtime': patch
'cesium-mcp-dev': patch
---

feat(layer): split updateLayerStyle into entity/imagery/primitive channels

Replace the single untyped layerStyle param with three typed style channels:

- `layerStyle` — entity layer style, including mutually-exclusive GeoJSON
  thematic styles (choropleth / category / randomColor / gradient)
- `imageryStyle` — imagery visual style (alpha, brightness, contrast, hue,
  saturation, gamma); visibility stays controlled by setLayerVisibility
- `primitiveStyle` — GeoJSON Primitive material style (color, opacity,
  outlineColor, outlineWidth, pointSize, lineWidth)

Runtime adds zod schemas with mutual-exclusion refinement; the bridge keeps
matching validation guards for non-MCP callers.
