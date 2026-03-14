---
layout: home

hero:
  name: Cesium MCP
  text: Let AI Agents Control a 3D Globe
  tagline: MCP integration for CesiumJS — camera, layers, entities, analysis, all through natural language.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/gaopengbin/cesium-mcp
    - theme: alt
      text: API Reference
      link: /api/bridge

features:
  - icon: 🌍
    title: 19 MCP Tools
    details: Camera control, GeoJSON/3D Tiles/terrain/imagery layers, markers, drawing, measurement, heatmaps, viewshed analysis, and more.
  - icon: 🤖
    title: Works with Any MCP Client
    details: Claude Desktop, VS Code Copilot, Cursor, Windsurf — any MCP-compatible AI agent can control Cesium in real-time.
  - icon: 🔧
    title: Three Packages, One Ecosystem
    details: Bridge (browser SDK), Runtime (MCP server), Dev (coding assistant) — each installable independently via npm.
  - icon: ⚡
    title: WebSocket Real-Time
    details: Sub-second command execution. AI agent sends MCP tool call → Runtime translates → Bridge executes on CesiumJS Viewer.
  - icon: 📦
    title: Zero Config
    details: '`npx cesium-mcp-runtime` starts the server. Add the bridge to your CesiumJS app. Connect your AI agent. Done.'
  - icon: 🎯
    title: Version-Locked to CesiumJS
    details: Major.minor tracks CesiumJS (e.g. 1.139.x targets Cesium ~1.139.0). No version guessing.
---

## How It Works

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

1. **AI Agent** sends natural language → MCP client translates to tool calls
2. **cesium-mcp-runtime** receives MCP tool calls via stdio, forwards as WebSocket commands
3. **cesium-mcp-bridge** executes commands on the CesiumJS Viewer in the browser
4. Results flow back through the same chain

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`cesium-mcp-bridge`](https://www.npmjs.com/package/cesium-mcp-bridge) | Browser SDK — embeds in your CesiumJS app | [![npm](https://img.shields.io/npm/v/cesium-mcp-bridge)](https://www.npmjs.com/package/cesium-mcp-bridge) |
| [`cesium-mcp-runtime`](https://www.npmjs.com/package/cesium-mcp-runtime) | MCP Server — 19 tools + 2 resources | [![npm](https://img.shields.io/npm/v/cesium-mcp-runtime)](https://www.npmjs.com/package/cesium-mcp-runtime) |
| [`cesium-mcp-dev`](https://www.npmjs.com/package/cesium-mcp-dev) | IDE MCP Server — API helper for coding assistants | [![npm](https://img.shields.io/npm/v/cesium-mcp-dev)](https://www.npmjs.com/package/cesium-mcp-dev) |
