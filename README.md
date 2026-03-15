<div align="center">
  <img src="docs/public/logo.svg" alt="Cesium MCP" width="120">

  <h1>Cesium MCP</h1>

  <p><strong>AI-Powered 3D Globe Control via Model Context Protocol</strong></p>

  <p>Connect any MCP-compatible AI agent to <a href="https://cesium.com/">CesiumJS</a> — camera, layers, entities, spatial analysis, all through natural language.</p>

  <p>
    <a href="https://gaopengbin.github.io/cesium-mcp/">Website</a> &middot;
    <a href="README.zh-CN.md">中文</a> &middot;
    <a href="https://gaopengbin.github.io/cesium-mcp/guide/getting-started.html">Getting Started</a> &middot;
    <a href="https://gaopengbin.github.io/cesium-mcp/api/bridge.html">API Reference</a>
  </p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
    <a href="https://github.com/gaopengbin/cesium-mcp/actions/workflows/ci.yml"><img src="https://github.com/gaopengbin/cesium-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-bridge"><img src="https://img.shields.io/npm/v/cesium-mcp-bridge?label=bridge" alt="npm bridge"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-runtime"><img src="https://img.shields.io/npm/v/cesium-mcp-runtime?label=runtime" alt="npm runtime"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-dev"><img src="https://img.shields.io/npm/v/cesium-mcp-dev?label=dev" alt="npm dev"></a>
    <a href="https://glama.ai/mcp/servers/gaopengbin/cesium-mcp"><img src="https://glama.ai/mcp/servers/gaopengbin/cesium-mcp/badges/card.svg" alt="cesium-mcp MCP server"></a>
  </p>
</div>

---

## Demo

https://github.com/user-attachments/assets/8a40565a-fcdd-47bf-ae67-bc870611c908

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [cesium-mcp-bridge](packages/cesium-mcp-bridge/) | Browser SDK — embeds in your CesiumJS app, receives commands via WebSocket | [![npm](https://img.shields.io/npm/v/cesium-mcp-bridge)](https://www.npmjs.com/package/cesium-mcp-bridge) |
| [cesium-mcp-runtime](packages/cesium-mcp-runtime/) | MCP Server (stdio) — 43 tools (10 toolsets) + 2 resources, dynamic discovery | [![npm](https://img.shields.io/npm/v/cesium-mcp-runtime)](https://www.npmjs.com/package/cesium-mcp-runtime) |
| [cesium-mcp-dev](packages/cesium-mcp-dev/) | IDE MCP Server — CesiumJS API helper for coding assistants | [![npm](https://img.shields.io/npm/v/cesium-mcp-dev)](https://www.npmjs.com/package/cesium-mcp-dev) |

## Architecture

```
┌──────────────┐   stdio    ┌──────────────────┐  WebSocket  ┌──────────────────┐
│  AI Agent    │ ◄────────► │  cesium-mcp-     │ ◄─────────► │  cesium-mcp-     │
│  (Claude,    │   MCP      │  runtime         │   JSON-RPC  │  bridge          │
│   Cursor…)   │            │  (Node.js)       │             │  (Browser)       │
└──────────────┘            └──────────────────┘             └──────────────────┘
                                                                     │
                                                              ┌──────▼──────┐
                                                              │  CesiumJS   │
                                                              │  Viewer     │
                                                              └─────────────┘
```

## Quick Start

### 1. Install the bridge in your CesiumJS app

```bash
npm install cesium-mcp-bridge
```

```js
import { CesiumMcpBridge } from 'cesium-mcp-bridge';

const bridge = new CesiumMcpBridge(viewer, { port: 9100 });
bridge.connect();
```

### 2. Start the MCP runtime

```bash
npx cesium-mcp-runtime
```

### 3. Connect your AI agent

Add to your MCP client config (e.g. Claude Desktop):

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

Now ask your AI: *"Fly to the Eiffel Tower and add a red marker"*

## 43 Available Tools

Tools are organized into **10 toolsets**. Default mode enables 4 core toolsets (~19 tools). Set `CESIUM_TOOLSETS=all` for everything, or let the AI discover and activate toolsets dynamically at runtime.

| Toolset | Tools |
|---------|-------|
| **view** (default) | `flyTo`, `setView`, `getView`, `zoomToExtent` |
| **entity** (default) | `addMarker`, `addLabel`, `addModel`, `addPolygon`, `addPolyline`, `updateEntity`, `removeEntity` |
| **layer** (default) | `addGeoJsonLayer`, `listLayers`, `removeLayer`, `setLayerVisibility`, `updateLayerStyle`, `setBasemap` |
| **interaction** (default) | `screenshot`, `highlight` |
| camera | `lookAtTransform`, `startOrbit`, `stopOrbit`, `setCameraOptions` |
| entity-ext | `addBillboard`, `addBox`, `addCorridor`, `addCylinder`, `addEllipse`, `addRectangle`, `addWall` |
| animation | `createAnimation`, `controlAnimation`, `removeAnimation`, `listAnimations`, `updateAnimationPath`, `trackEntity`, `controlClock`, `setGlobeLighting` |
| tiles | `load3dTiles`, `loadTerrain`, `loadImageryService` |
| trajectory | `playTrajectory` |
| heatmap | `addHeatmap` |

> **Relationship with CesiumGS official MCP servers**: The `camera`, `entity-ext`, and `animation` toolsets natively fuse capabilities from [CesiumGS/cesium-mcp-server](https://github.com/CesiumGS/cesium-mcp-server) (Camera Server, Entity Server, Animation Server) into this project's unified bridge architecture. This means you get all official functionality plus additional tools — in a single MCP server, without running multiple processes.

## Examples

See [examples/minimal/](examples/minimal/) for a complete working demo.

## Development

```bash
git clone https://github.com/gaopengbin/cesium-mcp.git
cd cesium-mcp
npm install
npm run build
```

## Version Policy

The major.minor version tracks CesiumJS (e.g. `1.139.x` targets Cesium `~1.139.0`). Patch versions are independent for MCP feature iterations.

## License

[MIT](LICENSE)
