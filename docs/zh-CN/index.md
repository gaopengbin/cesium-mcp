---
layout: home

hero:
  name: Cesium MCP
  text: 让 AI 智能体控制三维地球
  tagline: CesiumJS 的 MCP 集成 — 相机、图层、实体、分析，全部通过自然语言操作。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh-CN/guide/getting-started
    - theme: alt
      text: GitHub 仓库
      link: https://github.com/gaopengbin/cesium-mcp
    - theme: alt
      text: API 参考
      link: /zh-CN/api/bridge

features:
  - icon: 🌍
    title: 19 个 MCP 工具
    details: 相机控制、GeoJSON/3D Tiles/地形/影像图层、标记、绘制、量测、热力图、通视分析等。
  - icon: 🤖
    title: 兼容所有 MCP 客户端
    details: Claude Desktop、VS Code Copilot、Cursor、Windsurf — 任何兼容 MCP 的 AI 智能体都能实时控制 Cesium。
  - icon: 🔧
    title: 三个包，一个生态
    details: Bridge（浏览器 SDK）、Runtime（MCP 服务器）、Dev（编码助手） — 通过 npm 独立安装。
  - icon: ⚡
    title: WebSocket 实时通信
    details: 亚秒级命令执行。AI 智能体发送 MCP 工具调用 → Runtime 转译 → Bridge 在 CesiumJS Viewer 上执行。
  - icon: 📦
    title: 零配置启动
    details: '`npx cesium-mcp-runtime` 即可启动服务器。在 CesiumJS 应用中添加 Bridge。连接 AI 智能体。完成。'
  - icon: 🎯
    title: 版本锁定 CesiumJS
    details: 主版本号.次版本号跟踪 CesiumJS（如 1.139.x 对应 Cesium ~1.139.0）。无需猜测版本。
---

## 工作原理

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

1. **AI 智能体**发送自然语言 → MCP 客户端转换为工具调用
2. **cesium-mcp-runtime** 通过 stdio 接收 MCP 工具调用，转发为 WebSocket 命令
3. **cesium-mcp-bridge** 在浏览器中的 CesiumJS Viewer 上执行命令
4. 结果通过同一链路返回

## 包列表

| 包名 | 描述 | npm |
|------|------|-----|
| [`cesium-mcp-bridge`](https://www.npmjs.com/package/cesium-mcp-bridge) | 浏览器 SDK — 嵌入到 CesiumJS 应用中 | [![npm](https://img.shields.io/npm/v/cesium-mcp-bridge)](https://www.npmjs.com/package/cesium-mcp-bridge) |
| [`cesium-mcp-runtime`](https://www.npmjs.com/package/cesium-mcp-runtime) | MCP 服务器 — 19 个工具 + 2 个资源 | [![npm](https://img.shields.io/npm/v/cesium-mcp-runtime)](https://www.npmjs.com/package/cesium-mcp-runtime) |
| [`cesium-mcp-dev`](https://www.npmjs.com/package/cesium-mcp-dev) | IDE MCP 服务器 — 编码助手的 API 帮手 | [![npm](https://img.shields.io/npm/v/cesium-mcp-dev)](https://www.npmjs.com/package/cesium-mcp-dev) |
