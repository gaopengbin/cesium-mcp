# Architecture

## Overview

Cesium MCP consists of three independent packages that form a complete pipeline from AI agent to 3D globe:

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

## Package Roles

### cesium-mcp-bridge (Browser)

The bridge runs **inside the browser** alongside your CesiumJS application. It:

- Connects to the runtime via WebSocket
- Receives JSON-RPC commands
- Executes CesiumJS API calls (camera, layers, entities, etc.)
- Returns results back through the WebSocket

**Two calling styles:**
- **Type-safe methods**: `bridge.flyTo({ longitude: 2.29, latitude: 48.86, height: 1000 })`
- **JSON command dispatch**: `bridge.execute({ action: 'flyTo', params: { ... } })`

### cesium-mcp-runtime (Node.js)

The runtime is a **Node.js MCP server** that acts as a translator between the AI agent and the browser. It:

- Exposes 19 MCP tools and 2 resources via stdio
- Runs a WebSocket server (default port 9100)
- Translates MCP tool calls into bridge commands
- Supports multi-session routing for multiple browser tabs

### cesium-mcp-dev (Node.js)

The dev server is a standalone **IDE assistant** that doesn't require a running globe. It provides:

- CesiumJS API documentation lookup (12 core classes)
- Code snippet generation for common patterns
- Entity template builder for generating configurations

## Data Flow

### AI Agent → Globe (Tool Call)

```
1. User: "Add a GeoJSON layer of earthquake data"
2. AI Agent → MCP tool call: addGeoJsonLayer({ url: "...", name: "earthquakes" })
3. Runtime receives tool call via stdio
4. Runtime sends WebSocket command: { action: "addGeoJsonLayer", params: { ... } }
5. Bridge executes: viewer.dataSources.add(Cesium.GeoJsonDataSource.load(...))
6. Bridge returns: { success: true, layerId: "..." }
7. Result flows back: Bridge → Runtime → AI Agent
8. AI Agent: "I've added the earthquake data layer to the map."
```

### Globe → AI Agent (Resource Read)

```
1. AI Agent reads resource: cesium://scene/camera
2. Runtime forwards request to bridge via WebSocket
3. Bridge reads: viewer.camera.positionCartographic
4. Bridge returns: { longitude: 2.29, latitude: 48.86, height: 1000 }
5. AI Agent receives camera state for context-aware decisions
```

## Session Routing

Multiple browser tabs can connect to the same runtime. Each connection uses a `sessionId`:

```
Browser Tab 1 (sessionId: "project-a") ──┐
                                         ├── cesium-mcp-runtime ── AI Agent
Browser Tab 2 (sessionId: "project-b") ──┘
```

The runtime routes MCP tool calls to the session matching `DEFAULT_SESSION_ID`.

## Version Strategy

All three packages share the same version number using [changesets](https://github.com/changesets/changesets) with **fixed** versioning mode.

**Major.minor** tracks CesiumJS:
- `cesium-mcp-*@1.139.x` targets `cesium@~1.139.0`

**Patch** versions iterate independently for MCP feature updates.
