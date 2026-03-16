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
    title: 44 MCP Tools
    details: Camera control, GeoJSON layers, 3D Tiles, terrain, imagery, entity management, trajectory animation, heatmaps, geocoding, and more — organized into 11 toolsets with dynamic discovery.
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

## Demo

<video src="https://raw.githubusercontent.com/gaopengbin/cesium-mcp/main/examples/video/demo.mp4" controls width="100%" style="border-radius: 8px; margin: 1rem 0;"></video>

## Architecture

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
| [`cesium-mcp-runtime`](https://www.npmjs.com/package/cesium-mcp-runtime) | MCP Server — 44 tools (11 toolsets) and 2 resources for AI agents | [![npm](https://img.shields.io/npm/v/cesium-mcp-runtime?color=1a1a2e&labelColor=e2e8f0)](https://www.npmjs.com/package/cesium-mcp-runtime) |
| [`cesium-mcp-dev`](https://www.npmjs.com/package/cesium-mcp-dev) | IDE MCP Server — Cesium API docs and code generation | [![npm](https://img.shields.io/npm/v/cesium-mcp-dev?color=1a1a2e&labelColor=e2e8f0)](https://www.npmjs.com/package/cesium-mcp-dev) |

</div>
