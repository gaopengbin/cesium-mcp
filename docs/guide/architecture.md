# Architecture

## Overview

Cesium MCP consists of three independent packages that form a complete pipeline from AI agent to 3D globe:

<div class="architecture-diagram">
  <div class="arch-node agent">
    <div class="arch-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a3 3 0 0 0-3 3v1H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3V5a3 3 0 0 0-3-3z"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><path d="M9 16h6"/></svg></div>
    <div class="arch-label">AI Agent</div>
    <div class="arch-sub">Claude, Cursor, VS Code…</div>
  </div>
  <div class="arch-arrow">
    <span class="arch-protocol">stdio / MCP</span>
    <span class="arch-line"><svg viewBox="0 0 60 12" width="60" height="12"><defs><marker id="al" viewBox="0 0 6 6" refX="0" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M6 0L0 3L6 6" fill="var(--vp-c-text-3)"/></marker><marker id="ar" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L6 3L0 6" fill="var(--vp-c-text-3)"/></marker></defs><line x1="2" y1="6" x2="58" y2="6" stroke="var(--vp-c-text-3)" stroke-width="1.5" marker-start="url(#al)" marker-end="url(#ar)"/></svg></span>
  </div>
  <div class="arch-node runtime">
    <div class="arch-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="18" rx="3"/><line x1="2" y1="8" x2="22" y2="8"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor"/><circle cx="8.5" cy="5.5" r="1" fill="currentColor"/><path d="M7 13l3 2-3 2"/><line x1="12" y1="17" x2="16" y2="17"/></svg></div>
    <div class="arch-label">cesium-mcp-runtime</div>
    <div class="arch-sub">Node.js MCP Server</div>
  </div>
  <div class="arch-arrow">
    <span class="arch-protocol">WebSocket</span>
    <span class="arch-line"><svg viewBox="0 0 60 12" width="60" height="12"><line x1="2" y1="6" x2="58" y2="6" stroke="var(--vp-c-text-3)" stroke-width="1.5" marker-start="url(#al)" marker-end="url(#ar)"/></svg></span>
  </div>
  <div class="arch-node bridge">
    <div class="arch-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 16c0-4 3.5-7 8-7s8 3 8 7"/><rect x="3" y="15" width="4" height="5" rx="1"/><rect x="17" y="15" width="4" height="5" rx="1"/><circle cx="12" cy="6" r="3"/></svg></div>
    <div class="arch-label">cesium-mcp-bridge</div>
    <div class="arch-sub">Browser SDK</div>
  </div>
  <div class="arch-arrow">
    <span class="arch-protocol">API</span>
    <span class="arch-line"><svg viewBox="0 0 60 12" width="60" height="12"><defs><marker id="ar2" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L6 3L0 6" fill="var(--vp-c-text-3)"/></marker></defs><line x1="2" y1="6" x2="58" y2="6" stroke="var(--vp-c-text-3)" stroke-width="1.5" marker-end="url(#ar2)"/></svg></span>
  </div>
  <div class="arch-node viewer">
    <div class="arch-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="10" ry="4"/><path d="M12 2c3 2.5 3 17.5 0 20"/><path d="M12 2c-3 2.5-3 17.5 0 20"/></svg></div>
    <div class="arch-label">CesiumJS Viewer</div>
    <div class="arch-sub">3D Globe</div>
  </div>
</div>

<style>
.architecture-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 1.5rem 0;
  flex-wrap: nowrap;
  max-width: 100%;
  box-sizing: border-box;
}
.arch-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.8rem 0.6rem;
  border-radius: 10px;
  border: 2px solid;
  text-align: center;
  background: var(--vp-c-bg-soft);
  flex: 1;
  min-width: 0;
  max-width: 180px;
}
.arch-node.agent { border-color: #4FC3F7; }
.arch-node.runtime { border-color: #FFB74D; }
.arch-node.bridge { border-color: #81C784; }
.arch-node.viewer { border-color: #E57373; }
.arch-icon { margin-bottom: 0.3rem; color: var(--vp-c-text-2); display: flex; }
.arch-node.agent .arch-icon { color: #4FC3F7; }
.arch-node.runtime .arch-icon { color: #FFB74D; }
.arch-node.bridge .arch-icon { color: #81C784; }
.arch-node.viewer .arch-icon { color: #E57373; }
.arch-label { font-weight: 600; font-size: 0.75rem; color: var(--vp-c-text-1); white-space: nowrap; }
.arch-sub { font-size: 0.65rem; color: var(--vp-c-text-2); margin-top: 0.15rem; white-space: nowrap; }
.arch-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 0.15rem;
  flex-shrink: 1;
  min-width: 50px;
}
.arch-protocol { font-size: 0.65rem; color: var(--vp-c-text-3); white-space: nowrap; margin-bottom: 0.1rem; }
.arch-line { display: flex; align-items: center; }
@media (max-width: 640px) {
  .architecture-diagram { flex-direction: column; gap: 0.3rem; padding: 1rem 0; }
  .arch-node { max-width: 200px; }
  .arch-arrow { transform: rotate(90deg); padding: 0.2rem 0; }
}
</style>

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

- Exposes **58 MCP tools** (organized into **12 toolsets**) + 2 resources via stdio
- Runs a WebSocket + HTTP server (default port 9100)
- Translates MCP tool calls into bridge commands
- Supports multi-session routing for multiple browser tabs
- Provides HTTP Push API (`POST /api/command`) for backend integration

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

## Toolsets & Dynamic Discovery

58 tools are organized into **12 toolsets** to manage LLM tool selection complexity:

| Toolset | Tools | Default |
|---------|-------|---------|
| `view` | 7 | Yes |
| `entity` | 9 | Yes |
| `layer` | 6 | Yes |
| `interaction` | 2 | Yes |
| `camera` | 4 | — |
| `entity-ext` | 7 | — |
| `animation` | 8 | — |
| `tiles` | 3 | — |
| `trajectory` | 1 | — |
| `heatmap` | 1 | — |
| `geolocation` | 1 | — |

By default, 4 core toolsets (~24 tools) are enabled. The remaining toolsets can be activated via:

1. **Environment variable**: `CESIUM_TOOLSETS=all` enables everything
2. **Dynamic Discovery**: Two meta-tools (`list_toolsets`, `enable_toolset`) allow the AI agent to discover and activate toolsets at runtime — no user configuration needed

```
AI: "I need to create an animation"
→ calls list_toolsets → sees animation toolset is disabled
→ calls enable_toolset("animation") → 8 animation tools become available
→ calls createAnimation(...)
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
