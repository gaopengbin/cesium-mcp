<img width="2172" height="724" alt="ChatGPT Image 2026年7月5日 22_13_19" src="https://github.com/user-attachments/assets/098dcbef-e0bc-4214-8adf-b80a29e50e65" />
<div align="center">
  <p><strong>The minimum-overhead way to add AI commands to CesiumJS</strong></p>

  <p><a href="packages/cesium-mcp-bridge/">cesium-mcp-bridge</a> is a protocol-agnostic command dispatcher with 60+ tools, drivable from <strong>browser-only agents</strong>, <strong>WebMCP browser agents</strong>, <strong>function calling</strong>, or <strong>MCP</strong> — your choice.</p>

  <p>Four integration paths: <a href="examples/browser-agent/">Browser Agent</a> (simplest, zero backend) · WebMCP (page-local browser tools) · function calling (embed in your web app) · <a href="packages/cesium-mcp-runtime/">MCP runtime</a> (Claude Desktop / Cursor / Dify)</p>

  <p><a href="https://cesium-browser-agent.pages.dev/"><strong>Try it now</strong></a> — open the live browser demo, no install, no signup.</p>

  <p>
    <a href="https://gaopengbin.github.io/cesium-mcp/">Website</a> &middot;
    <a href="README.zh-CN.md">中文</a> &middot;
    <a href="https://gaopengbin.github.io/cesium-mcp/guide/getting-started.html">Getting Started</a> &middot;
    <a href="https://gaopengbin.github.io/cesium-mcp/api/bridge.html">API Reference</a>
  </p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-155EEF?style=flat-square" alt="License: MIT"></a>
    <a href="https://github.com/gaopengbin/cesium-mcp/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/gaopengbin/cesium-mcp/ci.yml?branch=main&label=CI&style=flat-square" alt="CI"></a>
    <a href="https://github.com/gaopengbin/cesium-mcp/stargazers"><img src="https://img.shields.io/github/stars/gaopengbin/cesium-mcp?style=flat-square" alt="GitHub stars"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-runtime"><img src="https://img.shields.io/npm/dm/cesium-mcp-runtime?label=runtime%20downloads&style=flat-square" alt="Runtime downloads"></a>
  </p>

  <p>
    <a href="https://www.npmjs.com/package/cesium-mcp-bridge"><img src="https://img.shields.io/badge/bridge-npm-528bff?style=for-the-badge&logo=npm&logoColor=white" alt="bridge npm"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-runtime"><img src="https://img.shields.io/badge/runtime-npm-155EEF?style=for-the-badge&logo=npm&logoColor=white" alt="runtime npm"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-dev"><img src="https://img.shields.io/badge/dev-npm-364fc7?style=for-the-badge&logo=npm&logoColor=white" alt="dev npm"></a>
  </p>
</div>

---

## Demo

https://github.com/user-attachments/assets/8a40565a-fcdd-47bf-ae67-bc870611c908

## Packages & Entry Points

| Module | Role | Status | Links |
|--------|------|--------|-------|
| **cesium-mcp-bridge** | Protocol-agnostic command dispatcher (60+ tools) with WebMCP registration | Mainline, actively iterated | [![npm](https://img.shields.io/npm/v/cesium-mcp-bridge)](https://www.npmjs.com/package/cesium-mcp-bridge) · [source](packages/cesium-mcp-bridge/) |
| **examples/browser-agent** | Browser-only AI agent with automatic WebMCP exposure | Recommended | [example](examples/browser-agent/) · [live demo](https://cesium-browser-agent.pages.dev/) |
| **cesium-mcp-runtime** | MCP server (stdio + HTTP) | Stable, slow updates | [![npm](https://img.shields.io/npm/v/cesium-mcp-runtime)](https://www.npmjs.com/package/cesium-mcp-runtime) · [source](packages/cesium-mcp-runtime/) |
| **cesium-mcp-dev** | CesiumJS API knowledge base for coding assistants | Maintained | [![npm](https://img.shields.io/npm/v/cesium-mcp-dev)](https://www.npmjs.com/package/cesium-mcp-dev) · [source](packages/cesium-mcp-dev/) |

> **Which one?** Personal project or quick try → browser-agent. Let a compatible browser agent discover page-local Cesium tools → WebMCP. Existing web app embedding an AI assistant → bridge + your own function calling. Calling from Claude Desktop / Cursor / Dify → MCP runtime.

## Architecture

```mermaid
flowchart LR
  subgraph clients ["AI Drivers (pick one)"]
    BA["Browser Agent\n(in the same page)"]
    WM["WebMCP Agent\n(browser-provided)"]
    FC["Your web app\nfunction calling"]
    MCP["Claude / Cursor / Dify\nvia MCP runtime"]
  end

  subgraph core ["cesium-mcp-bridge (browser)"]
    B["60+ tools\nprotocol-agnostic dispatcher"]
    C["CesiumJS Viewer"]
  end

  BA -- "in-page call" --> B
  WM -- "document.modelContext" --> B
  FC -- "in-page call" --> B
  MCP -- "WebSocket / JSON-RPC" --> B
  B --> C

  style clients fill:#1e293b,stroke:#528bff,color:#e2e8f0
  style core fill:#1e293b,stroke:#12B76A,color:#e2e8f0
```

The bridge is the only required piece. Pick whichever driver matches your scenario — they all hit the same 60+ tools. On WebMCP-capable browsers, `registerWebMcpTools()` exposes Bridge commands directly through `document.modelContext` without adding an MCP transport or backend server.

## Quick Start

### Path 0 — Try in 30 seconds (browser agent, recommended)

Open the [live demo](https://cesium-browser-agent.pages.dev/), paste an OpenAI-compatible API key, and ask:
> *"Fly to the Eiffel Tower and drop a red marker"*

Fork the [examples/browser-agent](examples/browser-agent/) folder to deploy your own.

### Path 1 — Expose Cesium tools through WebMCP (Chrome 149+ experimental)

The browser-agent example automatically registers its 15 page tools when `document.modelContext` is available:

```bash
npm run build -w packages/cesium-mcp-bridge
npx serve . -l 4173
```

Open `http://localhost:4173/examples/browser-agent/`, click **Start**, then inspect or execute the tools in DevTools → Application → WebMCP. Enable `#enable-webmcp-testing` and `#devtools-webmcp-support` in `chrome://flags` for local testing.

For custom integrations, import `registerWebMcpTools` from `cesium-mcp-bridge`; see the [Bridge WebMCP API and example](packages/cesium-mcp-bridge/README.md#webmcp).

### Path 2 — Embed in your own web app (function calling)

```bash
npm install cesium-mcp-bridge
```

```js
import { CesiumBridge } from 'cesium-mcp-bridge';

const bridge = new CesiumBridge(viewer);
// Then: send the bridge's tool schema to any LLM that supports function/tool calling,
// route the model's tool calls to bridge.execute(name, params).
```

See [examples/browser-agent/index.html](examples/browser-agent/index.html) for a complete loop with OpenAI-compatible APIs.

### Path 3 — Use from Claude Desktop / Cursor / Dify (MCP)

Install bridge as in Path 2, then start the MCP runtime:

```bash
# stdio mode (Claude Desktop, VS Code, Cursor)
npx cesium-mcp-runtime

# HTTP mode (Dify, remote/cloud MCP clients)
npx cesium-mcp-runtime --transport http --port 3000
```

MCP client config:

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

## 58 Available Tools

Tools are organized into **12 toolsets**. Default mode enables 4 core toolsets (~31 tools). Set `CESIUM_TOOLSETS=all` for everything, or let the AI discover and activate toolsets dynamically at runtime.

> **i18n**: Tool descriptions default to English. Set `CESIUM_LOCALE=zh-CN` for Chinese.

| Toolset | Tools |
|---------|-------|
| **view** (default) | `flyTo`, `setView`, `getView`, `zoomToExtent`, `saveViewpoint`, `loadViewpoint`, `listViewpoints`, `exportScene` |
| **entity** (default) | `addMarker`, `addLabel`, `addModel`, `addPolygon`, `addPolyline`, `updateEntity`, `removeEntity`, `batchAddEntities`, `queryEntities`, `getEntityProperties` |
| **layer** (default) | `addGeoJsonLayer`, `listLayers`, `removeLayer`, `clearAll`, `setLayerVisibility`, `updateLayerStyle`, `getLayerSchema`, `setBasemap` |
| **interaction** (default) | `screenshot`, `highlight`, `measure` |
| camera | `lookAtTransform`, `startOrbit`, `stopOrbit`, `setCameraOptions` |
| entity-ext | `addBillboard`, `addBox`, `addCorridor`, `addCylinder`, `addEllipse`, `addRectangle`, `addWall` |
| animation | `createAnimation`, `controlAnimation`, `removeAnimation`, `listAnimations`, `updateAnimationPath`, `trackEntity`, `controlClock`, `setGlobeLighting` |
| tiles | `load3dTiles`, `loadTerrain`, `loadImageryService`, `loadCzml`, `loadKml` |
| trajectory | `playTrajectory` |
| heatmap | `addHeatmap` |
| scene | `setSceneOptions`, `setPostProcess` |
| geolocation | `geocode` |

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

Version format: `{CesiumMajor}.{CesiumMinor}.{MCPPatch}`

| Segment | Meaning | Example |
|---------|---------|--------|
| `1.139` | Tracks CesiumJS version — built & tested against Cesium `~1.139.0` | `1.139.8` → Cesium 1.139 |
| `.8` | MCP patch — independent iterations for new tools, bug fixes, docs | `1.139.7` → `1.139.8` |

When CesiumJS releases a new minor version (e.g. 1.140), we will bump accordingly: `1.140.0`.

## Related Projects

- [mapbox-mcp](https://github.com/gaopengbin/mapbox-mcp) — AI control for Mapbox GL JS
- [openlayers-mcp](https://github.com/gaopengbin/openlayers-mcp) — AI control for OpenLayers

## Star History

<a href="https://star-history.com/#gaopengbin/cesium-mcp&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=gaopengbin/cesium-mcp&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=gaopengbin/cesium-mcp&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=gaopengbin/cesium-mcp&type=Date" />
 </picture>
</a>

## License

[MIT](LICENSE)
