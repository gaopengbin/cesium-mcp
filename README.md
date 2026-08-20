<img width="2172" height="724" alt="ChatGPT Image 2026年7月5日 22_13_19" src="https://github.com/user-attachments/assets/098dcbef-e0bc-4214-8adf-b80a29e50e65" />
<div align="center">
  <p><strong>A protocol-agnostic Cesium AI control runtime for MCP, WebMCP, function calling, and browser agents</strong></p>

  <p><a href="packages/cesium-mcp-bridge/">cesium-mcp-bridge</a> is the protocol-agnostic Cesium command executor. Separate adapters expose it to <strong>browser-only agents</strong>, <strong>WebMCP browser agents</strong>, <strong>function calling</strong>, or <strong>MCP</strong> — your choice.</p>

  <p>Four integration paths: <a href="examples/browser-agent/">Browser Agent</a> (simplest, zero backend) · WebMCP (page-local browser tools) · function calling (embed in your web app) · <a href="packages/cesium-mcp-runtime/">MCP runtime</a> (Claude Desktop / Cursor / Dify)</p>

  <p>The local Runtime is only required for external MCP hosts. Browser Agent, WebMCP, and function-calling integrations execute the same commands directly in the web application.</p>

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
| **cesium-mcp-contracts** | Transport-neutral names, descriptions, and JSON Schemas for browser tools | New shared layer | [source](packages/cesium-mcp-contracts/) |
| **cesium-mcp-bridge** | Protocol- and transport-free Cesium command executor (60+ commands) | Mainline, actively iterated | [![npm](https://img.shields.io/npm/v/cesium-mcp-bridge)](https://www.npmjs.com/package/cesium-mcp-bridge) · [source](packages/cesium-mcp-bridge/) |
| **cesium-mcp-webmcp** | One-package Viewer integration plus the native `document.modelContext` adapter | Browser integration | [source](packages/cesium-mcp-webmcp/) |
| **examples/webmcp-integration** | Focused npm + Vite integration without a chat UI or MCP server | Developer example | [example](examples/webmcp-integration/) |
| **examples/browser-agent** | Browser-only AI agent with automatic WebMCP exposure | Recommended | [example](examples/browser-agent/) · [live demo](https://cesium-browser-agent.pages.dev/) |
| **cesium-mcp-runtime** | MCP server (stdio + HTTP) | Stable MCP SDK v2 | [![npm](https://img.shields.io/npm/v/cesium-mcp-runtime)](https://www.npmjs.com/package/cesium-mcp-runtime) · [source](packages/cesium-mcp-runtime/) |
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

  CONTRACTS["cesium-mcp-contracts\ntool definitions"]
  WEBMCP["cesium-mcp-webmcp\nnative adapter"]

  subgraph core ["cesium-mcp-bridge (browser)"]
    B["60+ tools\nprotocol-agnostic dispatcher"]
    C["CesiumJS Viewer"]
  end

  CONTRACTS -.-> BA
  CONTRACTS -.-> WEBMCP
  BA -- "in-page call" --> B
  WM -- "document.modelContext" --> WEBMCP
  WEBMCP --> B
  FC -- "in-page call" --> B
  MCP -- "WebSocket / JSON-RPC" --> B
  B --> C

  style clients fill:#1e293b,stroke:#528bff,color:#e2e8f0
  style core fill:#1e293b,stroke:#12B76A,color:#e2e8f0
```

The bridge remains the execution core, while contracts and protocol adapters stay separate. Pick whichever driver matches your scenario — they all reach the same Cesium command layer. On WebMCP-capable browsers, `cesium-mcp-webmcp` can expose 61 browser-safe commands in 12 selectable toolsets through `document.modelContext` without adding an MCP transport or backend server.

### Relationship to the CesiumGS AI ecosystem

CesiumGS's newer AI work is split between [`cesiumjs-ai-starter-app`](https://github.com/CesiumGS/cesiumjs-ai-starter-app), a deployable application template, and [`cesiumjs-skills`](https://github.com/CesiumGS/cesiumjs-skills), development-time guidance for coding agents. The earlier [`cesium-ai-integrations`](https://github.com/CesiumGS/cesium-ai-integrations) repository contains the first-generation experiments and community contributions that helped explore this space.

`cesium-mcp` is an independent runtime and integration toolkit, not a continuation of the earlier WebSocket-only reference architecture. Its reusable Bridge and shared contracts work unchanged across browser-only function calling, native WebMCP, standard MCP over stdio/HTTP, and embedded desktop shells. A local WebSocket bridge is used only when an external MCP host needs to reach a live browser Viewer; it is not required for the hosted demo or page-local integrations.

The project author was an early contributor to `CesiumGS/cesium-ai-integrations`, contributing the Imagery server, Terrain server, and unified MCP Gateway. Those experiments informed this project's multi-protocol architecture, while the implementation, release lifecycle, and roadmap remain independent.

## Quick Start

### Path 0 — Try in 30 seconds (browser agent, recommended)

Open the [live demo](https://cesium-browser-agent.pages.dev/) and ask—the hosted model is ready without a browser API key:
> *"Fly to the Eiffel Tower and drop a red marker"*

Fork the [examples/browser-agent](examples/browser-agent/) folder to deploy your own.

### Path 1 — Expose Cesium tools through WebMCP (Chrome 149+ experimental)

The browser-agent example automatically registers all 61 browser-safe page tools when `document.modelContext` is available. Its built-in chat uses automatic toolset routing to keep each normal request at 20 tools or fewer, while still offering explicit core, single-toolset, and all-61 modes:

```bash
npm run build -w packages/cesium-mcp-bridge
npm run build -w packages/cesium-mcp-webmcp
npx serve . -l 4173
```

Open `http://localhost:4173/examples/browser-agent/`, click **Start**, then inspect or execute the tools in DevTools → Application → WebMCP. Enable `#enable-webmcp-testing` and `#devtools-webmcp-support` in `chrome://flags` for local testing.

Application developers install the adapter separately. End users only open the integrated website; they do not install npm packages or run an MCP server.

```bash
npm install cesium-mcp-webmcp
```

```js
import { registerCesiumViewerWebMcp } from 'cesium-mcp-webmcp/viewer'

const registration = await registerCesiumViewerWebMcp(viewer, {
  toolsets: 'all',
  excludeTools: ['geocode'], // add your own browser geocoder to expose this tool
})

// Later, if the page is unmounted:
registration.unregister()
```

See the [WebMCP adapter API](packages/cesium-mcp-webmcp/README.md) for custom integrations.
For a complete npm + Vite application, start from the [WebMCP integration example](examples/webmcp-integration/).

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

Ordinary MCP users need only the Runtime package. It includes the browser Bridge bundle and a built-in Viewer at `http://localhost:9100/`; install `cesium-mcp-bridge` separately only when integrating a custom page.

```bash
# Stable channel — npm latest, MCP SDK v2
npx -y cesium-mcp-runtime

# HTTP mode
npx -y cesium-mcp-runtime --transport http --port 3000
```

The stable release serves existing MCP `2025-11-25` clients and the new
`2026-07-28` protocol from the same stdio/HTTP entry. It uses the stable
TypeScript SDK v2 and passes the official `server-stateless` conformance
scenario (28/28).

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

## 62 Available Command Tools

Tools are organized into **12 toolsets**. Default mode enables 4 core toolsets (30 tools). Set `CESIUM_TOOLSETS=all` for everything, or let the AI discover and activate toolsets dynamically at runtime.

> **Canonical contracts**: Tool descriptions default to English; set `CESIUM_LOCALE=zh-CN` for Chinese. Titles, behavior annotations, localized descriptions, defaults, input validation, MCP output schemas, and structured results all come from the shared JSON Schemas in `cesium-mcp-contracts`. Text `content` remains available for older clients.

| Toolset | Tools |
|---------|-------|
| **view** (default) | `flyTo`, `setView`, `getView`, `zoomToExtent`, `saveViewpoint`, `loadViewpoint`, `listViewpoints`, `exportScene` |
| **entity** (default) | `addMarker`, `addLabel`, `addModel`, `addPolygon`, `addPolyline`, `updateEntity`, `removeEntity`, `batchAddEntities`, `queryEntities`, `getEntityProperties` |
| **layer** (default) | `addGeoJsonLayer`, `addGeoJsonPrimitive`, `listLayers`, `removeLayer`, `clearAll`, `setLayerVisibility`, `updateLayerStyle`, `getLayerSchema`, `setBasemap` |
| **interaction** (default) | `screenshot`, `highlight`, `measure` |
| camera | `lookAtTransform`, `startOrbit`, `stopOrbit`, `setCameraOptions` |
| entity-ext | `addBillboard`, `addBox`, `addCorridor`, `addCylinder`, `addEllipse`, `addRectangle`, `addWall` |
| animation | `createAnimation`, `controlAnimation`, `removeAnimation`, `listAnimations`, `updateAnimationPath`, `trackEntity`, `controlClock`, `setGlobeLighting` |
| tiles | `load3dTiles`, `load3dGaussianSplat`, `loadTerrain`, `loadImageryService`, `loadCzml`, `loadKml`, `setEdgeDisplayMode` |
| trajectory | `playTrajectory` |
| heatmap | `addHeatmap` |
| scene | `setSceneOptions`, `setPostProcess`, `setIonToken` (Runtime only) |
| geolocation | `geocode` |

## Examples

See [examples/minimal/](examples/minimal/) for a complete working demo.

## Development

```bash
git clone https://github.com/gaopengbin/cesium-mcp.git
cd cesium-mcp
npm install
npm run build
npm test
npm run test:contracts
npm run test:routing
npm run test:e2e:packed
```

`test:contracts` is the focused parity gate for MCP Runtime metadata, WebMCP registration, Function Calling definitions, and the 60-tool Bridge Executor Registry.
`test:routing` evaluates bilingual and multi-intent Browser Agent requests across all 12 toolsets, checking required-tool recall and the 20-tool automatic-routing budget.
`test:e2e:packed` builds npm tarballs, installs them in a clean temporary project, opens the real Cesium Viewer, and verifies a Runtime-WebSocket-Bridge command round trip.

## Version Policy

Version format: `{CesiumMajor}.{CesiumMinor}.{MCPPatch}`

| Segment | Meaning | Example |
|---------|---------|--------|
| `1.143` | Tracks CesiumJS version — built & tested against Cesium `~1.143.0` | `1.143.0` → Cesium 1.143 |
| `.x` | MCP patch — independent iterations for new tools, bug fixes, docs | `1.143.0` → `1.143.1` |

Official CesiumJS releases are reviewed before the compatibility baseline is bumped; the project does not automatically claim support for a newer release without Bridge verification.

## Related Projects

- [mapbox-mcp](https://github.com/gaopengbin/mapbox-mcp) — AI control for Mapbox GL JS
- [openlayers-mcp](https://github.com/gaopengbin/openlayers-mcp) — AI control for OpenLayers

## Star History

[![Star History Chart](https://raw.githubusercontent.com/gaopengbin/cesium-mcp/star-history-data/.github/star-history/chart.svg)](https://github.com/gaopengbin/cesium-mcp)

## License

[MIT](LICENSE)
