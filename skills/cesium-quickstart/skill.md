---
name: cesium-quickstart
description: Guide users through their first interaction with the Cesium 3D globe via MCP tools
user_invocable: true
---

# Cesium MCP Quick Start

This plugin gives you control over a 3D globe in the browser. The viewer should already be open at http://localhost:9101.

## Available Tool Categories

| Category | Examples |
|----------|----------|
| Camera | flyTo, setView, getView, startOrbit |
| Entities | addMarker, addPolygon, addPolyline, addModel |
| Layers | addGeoJsonLayer, load3dTiles, loadImageryService |
| Style | updateLayerStyle (color, show, 3D Tiles conditional) |
| Animation | createAnimation, controlAnimation, controlClock |
| Scene | setSceneOptions, setPostProcess, setGlobeLighting |
| Query | queryEntities, getEntityProperties, getLayerSchema |
| Interaction | screenshot, highlight, measure |
| Discovery | list_toolsets, enable_toolset |

## First Steps

Try these commands in order:

1. "Fly to Tokyo" — camera navigation
2. "Add a marker at the Eiffel Tower" — entity creation
3. "Load Cesium OSM Buildings" — load3dTiles with ionAssetId 96188
4. "Take a screenshot" — capture current view

## Tips

- Use `list_toolsets` to see all available tool groups
- Use `enable_toolset` to activate additional tools (camera, animation, scene, etc.)
- All 60+ tools are enabled by default in this plugin
- The viewer auto-reconnects if you restart the MCP server
