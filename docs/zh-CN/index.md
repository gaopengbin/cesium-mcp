---
layout: home

hero:
  name: Cesium MCP
  text: AI 驱动的三维地球控制
  tagline: 连接任何 MCP 兼容的 AI 智能体到 CesiumJS。相机、图层、实体、空间分析 — 全部通过自然语言完成。
  image:
    src: /logo.svg
    alt: Cesium MCP
  actions:
    - theme: brand
      text: 快速开始
      link: /zh-CN/guide/getting-started
    - theme: alt
      text: API 参考
      link: /zh-CN/api/bridge

features:
  - icon:
      src: /icons/tools.svg
    title: 49 个 MCP 工具
    details: 相机控制、GeoJSON 图层、3D Tiles、地形、影像、实体管理、轨迹动画、热力图、地理编码等 — 11 个工具集，支持动态发现。
  - icon:
      src: /icons/clients.svg
    title: 全面兼容 MCP 协议
    details: Claude Desktop、VS Code Copilot、Cursor、Windsurf，或任何符合标准的 MCP 客户端。无厂商锁定。
  - icon:
      src: /icons/packages.svg
    title: 三个包，一个生态
    details: Bridge（浏览器 SDK）、Runtime（MCP 服务器）和 Dev（编码助手） — 通过 npm 独立安装。
  - icon:
      src: /icons/realtime.svg
    title: 实时 WebSocket 管线
    details: 亚秒级命令执行。工具调用从 AI 智能体经由 Runtime 到达浏览器 Bridge，结果即时返回。
  - icon:
      src: /icons/terminal.svg
    title: 零配置启动
    details: '一条命令即可启动：`npx cesium-mcp-runtime`。在 CesiumJS 应用中添加 Bridge。连接 AI 智能体。'
  - icon:
      src: /icons/version.svg
    title: 版本锁定 CesiumJS
    details: 主版本号.次版本号跟踪 CesiumJS 发布（1.139.x 对应 Cesium ~1.139.0）。修订版本独立迭代。
---

<div class="home-content">

## 演示

<video src="https://raw.githubusercontent.com/gaopengbin/cesium-mcp/main/examples/video/demo.mp4" controls width="100%" style="border-radius: 8px; margin: 1rem 0;"></video>

## 架构

<div class="architecture-diagram">
  <div class="arch-node agent">
    <div class="arch-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a3 3 0 0 0-3 3v1H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3V5a3 3 0 0 0-3-3z"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><path d="M9 16h6"/></svg></div>
    <div class="arch-label">AI 智能体</div>
    <div class="arch-sub">Claude, Cursor, VS Code…</div>
  </div>
  <div class="arch-arrow">
    <span class="arch-protocol">stdio / MCP</span>
    <span class="arch-line"><svg viewBox="0 0 60 12" width="60" height="12"><defs><marker id="al" viewBox="0 0 6 6" refX="0" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M6 0L0 3L6 6" fill="var(--vp-c-text-3)"/></marker><marker id="ar" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L6 3L0 6" fill="var(--vp-c-text-3)"/></marker></defs><line x1="2" y1="6" x2="58" y2="6" stroke="var(--vp-c-text-3)" stroke-width="1.5" marker-start="url(#al)" marker-end="url(#ar)"/></svg></span>
  </div>
  <div class="arch-node runtime">
    <div class="arch-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="18" rx="3"/><line x1="2" y1="8" x2="22" y2="8"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor"/><circle cx="8.5" cy="5.5" r="1" fill="currentColor"/><path d="M7 13l3 2-3 2"/><line x1="12" y1="17" x2="16" y2="17"/></svg></div>
    <div class="arch-label">cesium-mcp-runtime</div>
    <div class="arch-sub">Node.js MCP 服务器</div>
  </div>
  <div class="arch-arrow">
    <span class="arch-protocol">WebSocket</span>
    <span class="arch-line"><svg viewBox="0 0 60 12" width="60" height="12"><line x1="2" y1="6" x2="58" y2="6" stroke="var(--vp-c-text-3)" stroke-width="1.5" marker-start="url(#al)" marker-end="url(#ar)"/></svg></span>
  </div>
  <div class="arch-node bridge">
    <div class="arch-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 16c0-4 3.5-7 8-7s8 3 8 7"/><rect x="3" y="15" width="4" height="5" rx="1"/><rect x="17" y="15" width="4" height="5" rx="1"/><circle cx="12" cy="6" r="3"/></svg></div>
    <div class="arch-label">cesium-mcp-bridge</div>
    <div class="arch-sub">浏览器 SDK</div>
  </div>
  <div class="arch-arrow">
    <span class="arch-protocol">API</span>
    <span class="arch-line"><svg viewBox="0 0 60 12" width="60" height="12"><defs><marker id="ar2" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L6 3L0 6" fill="var(--vp-c-text-3)"/></marker></defs><line x1="2" y1="6" x2="58" y2="6" stroke="var(--vp-c-text-3)" stroke-width="1.5" marker-end="url(#ar2)"/></svg></span>
  </div>
  <div class="arch-node viewer">
    <div class="arch-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="10" ry="4"/><path d="M12 2c3 2.5 3 17.5 0 20"/><path d="M12 2c-3 2.5-3 17.5 0 20"/></svg></div>
    <div class="arch-label">CesiumJS Viewer</div>
    <div class="arch-sub">三维地球</div>
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

**1.** AI 智能体发送自然语言请求，MCP 客户端将其转换为工具调用。

**2.** `cesium-mcp-runtime` 通过 stdio 接收调用，转发为 WebSocket 命令。

**3.** `cesium-mcp-bridge` 在浏览器中的 CesiumJS Viewer 上执行命令。

**4.** 结果通过同一管线返回给 AI 智能体。

</div>

## 包列表

| 包名 | 描述 | 版本 |
|------|------|------|
| [`cesium-mcp-bridge`](https://www.npmjs.com/package/cesium-mcp-bridge) | 浏览器 SDK — 嵌入你的 CesiumJS 应用 | [![npm](https://img.shields.io/npm/v/cesium-mcp-bridge?color=1a1a2e&labelColor=e2e8f0)](https://www.npmjs.com/package/cesium-mcp-bridge) |
| [`cesium-mcp-runtime`](https://www.npmjs.com/package/cesium-mcp-runtime) | MCP 服务器 — 49 个工具（11 个工具集）和 2 个资源 | [![npm](https://img.shields.io/npm/v/cesium-mcp-runtime?color=1a1a2e&labelColor=e2e8f0)](https://www.npmjs.com/package/cesium-mcp-runtime) |
| [`cesium-mcp-dev`](https://www.npmjs.com/package/cesium-mcp-dev) | IDE MCP 服务器 — Cesium API 文档与代码生成 | [![npm](https://img.shields.io/npm/v/cesium-mcp-dev?color=1a1a2e&labelColor=e2e8f0)](https://www.npmjs.com/package/cesium-mcp-dev) |

</div>
