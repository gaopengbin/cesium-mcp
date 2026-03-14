---
layout: home

hero:
  name: Cesium MCP
  text: AI-Powered 3D Globe Control
  tagline: Connect any MCP-compatible AI agent to CesiumJS. Camera, layers, entities, spatial analysis — all through natural language.
  image:
    src: /logo.svg
    alt: Cesium MCP
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/bridge

features:
  - icon:
      src: /icons/tools.svg
    title: 19 MCP Tools
    details: Camera control, GeoJSON layers, 3D Tiles, terrain, imagery, markers, heatmaps, viewshed analysis, and more — ready to use out of the box.
  - icon:
      src: /icons/clients.svg
    title: Universal MCP Compatibility
    details: Claude Desktop, VS Code Copilot, Cursor, Windsurf, or any standards-compliant MCP client. No vendor lock-in.
  - icon:
      src: /icons/packages.svg
    title: Three Packages, One Ecosystem
    details: Bridge (browser SDK), Runtime (MCP server), and Dev (coding assistant) — each independently installable via npm.
  - icon:
      src: /icons/realtime.svg
    title: Real-Time WebSocket Pipeline
    details: Sub-second command execution. Tool call flows from AI agent through the runtime to the browser bridge, and results return instantly.
  - icon:
      src: /icons/terminal.svg
    title: Zero Configuration
    details: 'One command to start: `npx cesium-mcp-runtime`. Add the bridge to your CesiumJS app. Connect your AI agent. That is it.'
  - icon:
      src: /icons/version.svg
    title: Version-Locked to CesiumJS
    details: Major.minor tracks CesiumJS releases (1.139.x targets Cesium ~1.139.0). Patch versions iterate independently for MCP features.
---

<div class="home-content">

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

<div class="steps">

**1.** Your AI agent sends a natural language request, which the MCP client translates into a tool call.

**2.** `cesium-mcp-runtime` receives the call via stdio and forwards it as a WebSocket command.

**3.** `cesium-mcp-bridge` executes the command on the CesiumJS Viewer in the browser.

**4.** Results flow back through the same pipeline to the AI agent.

</div>

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`cesium-mcp-bridge`](https://www.npmjs.com/package/cesium-mcp-bridge) | Browser SDK — embed in your CesiumJS application | [![npm](https://img.shields.io/npm/v/cesium-mcp-bridge?color=1a1a2e&labelColor=e2e8f0)](https://www.npmjs.com/package/cesium-mcp-bridge) |
| [`cesium-mcp-runtime`](https://www.npmjs.com/package/cesium-mcp-runtime) | MCP Server — 19 tools and 2 resources for AI agents | [![npm](https://img.shields.io/npm/v/cesium-mcp-runtime?color=1a1a2e&labelColor=e2e8f0)](https://www.npmjs.com/package/cesium-mcp-runtime) |
| [`cesium-mcp-dev`](https://www.npmjs.com/package/cesium-mcp-dev) | IDE MCP Server — Cesium API docs and code generation | [![npm](https://img.shields.io/npm/v/cesium-mcp-dev?color=1a1a2e&labelColor=e2e8f0)](https://www.npmjs.com/package/cesium-mcp-dev) |

</div>
