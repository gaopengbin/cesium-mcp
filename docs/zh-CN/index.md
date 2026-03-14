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
    title: 19 个 MCP 工具
    details: 相机控制、GeoJSON 图层、3D Tiles、地形、影像、标记、热力图、通视分析等 — 开箱即用。
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

```
┌──────────────┐   stdio    ┌──────────────────┐  WebSocket  ┌──────────────────┐
│  AI 智能体   │ ◄────────► │  cesium-mcp-     │ ◄─────────► │  cesium-mcp-     │
│  (Claude,    │   MCP      │  runtime         │   JSON-RPC  │  bridge          │
│   Cursor…)   │            │  (Node.js)       │             │  (浏览器)        │
└──────────────┘            └──────────────────┘             └──────────────────┘
                                                                     │
                                                              ┌──────▼──────┐
                                                              │  CesiumJS   │
                                                              │  Viewer     │
                                                              └─────────────┘
```

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
| [`cesium-mcp-runtime`](https://www.npmjs.com/package/cesium-mcp-runtime) | MCP 服务器 — 19 个工具和 2 个资源 | [![npm](https://img.shields.io/npm/v/cesium-mcp-runtime?color=1a1a2e&labelColor=e2e8f0)](https://www.npmjs.com/package/cesium-mcp-runtime) |
| [`cesium-mcp-dev`](https://www.npmjs.com/package/cesium-mcp-dev) | IDE MCP 服务器 — Cesium API 文档与代码生成 | [![npm](https://img.shields.io/npm/v/cesium-mcp-dev?color=1a1a2e&labelColor=e2e8f0)](https://www.npmjs.com/package/cesium-mcp-dev) |

</div>
