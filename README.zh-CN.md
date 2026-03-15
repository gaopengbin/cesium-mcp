<div align="center">
  <img src="docs/public/logo.svg" alt="Cesium MCP" width="120">

  <h1>Cesium MCP</h1>

  <p><strong>通过模型上下文协议，用 AI 操控三维地球</strong></p>

  <p>将任何 MCP 兼容的 AI 智能体接入 <a href="https://cesium.com/">CesiumJS</a> — 相机、图层、实体、空间分析，全部通过自然语言完成。</p>

  <p>
    <a href="https://gaopengbin.github.io/cesium-mcp/">官方网站</a> &middot;
    <a href="README.md">English</a> &middot;
    <a href="https://gaopengbin.github.io/cesium-mcp/zh-CN/guide/getting-started.html">快速入门</a> &middot;
    <a href="https://gaopengbin.github.io/cesium-mcp/zh-CN/api/bridge.html">API 文档</a>
  </p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
    <a href="https://github.com/gaopengbin/cesium-mcp/actions/workflows/ci.yml"><img src="https://github.com/gaopengbin/cesium-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-bridge"><img src="https://img.shields.io/npm/v/cesium-mcp-bridge?label=bridge" alt="npm bridge"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-runtime"><img src="https://img.shields.io/npm/v/cesium-mcp-runtime?label=runtime" alt="npm runtime"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-dev"><img src="https://img.shields.io/npm/v/cesium-mcp-dev?label=dev" alt="npm dev"></a>
    <a href="https://glama.ai/mcp/servers/gaopengbin/cesium-mcp"><img src="https://glama.ai/mcp/servers/gaopengbin/cesium-mcp/badges/card.svg" alt="cesium-mcp MCP server"></a>
  </p>
</div>

---

## 演示

https://github.com/user-attachments/assets/8a40565a-fcdd-47bf-ae67-bc870611c908

## 包

| 包名 | 描述 | npm |
|------|------|-----|
| [cesium-mcp-bridge](packages/cesium-mcp-bridge/) | 浏览器 SDK — 嵌入你的 CesiumJS 应用，通过 WebSocket 接收命令 | [![npm](https://img.shields.io/npm/v/cesium-mcp-bridge)](https://www.npmjs.com/package/cesium-mcp-bridge) |
| [cesium-mcp-runtime](packages/cesium-mcp-runtime/) | MCP 服务器 (stdio) — 43 个工具（10 个工具集）+ 2 个资源，支持动态发现 | [![npm](https://img.shields.io/npm/v/cesium-mcp-runtime)](https://www.npmjs.com/package/cesium-mcp-runtime) |
| [cesium-mcp-dev](packages/cesium-mcp-dev/) | IDE MCP 服务器 — 为代码助手提供 CesiumJS API 辅助 | [![npm](https://img.shields.io/npm/v/cesium-mcp-dev)](https://www.npmjs.com/package/cesium-mcp-dev) |

## 架构

```
┌──────────────┐   stdio    ┌──────────────────┐  WebSocket  ┌──────────────────┐
│  AI 智能体   │ ◄────────► │  cesium-mcp-     │ ◄─────────► │  cesium-mcp-     │
│  (Claude,    │   MCP      │  runtime         │   JSON-RPC  │  bridge          │
│   Cursor…)   │            │  (Node.js)       │             │  (浏览器)         │
└──────────────┘            └──────────────────┘             └──────────────────┘
                                                                     │
                                                              ┌──────▼──────┐
                                                              │  CesiumJS   │
                                                              │  Viewer     │
                                                              └─────────────┘
```

## 快速开始

### 1. 在你的 CesiumJS 应用中安装 bridge

```bash
npm install cesium-mcp-bridge
```

```js
import { CesiumMcpBridge } from 'cesium-mcp-bridge';

const bridge = new CesiumMcpBridge(viewer, { port: 9100 });
bridge.connect();
```

### 2. 启动 MCP 运行时

```bash
npx cesium-mcp-runtime
```

### 3. 连接你的 AI 智能体

在 MCP 客户端配置中添加（如 Claude Desktop）：

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

然后对 AI 说：*"飞到埃菲尔铁塔，添加一个红色标记"*

## 43 个可用工具

工具按 **10 个工具集** 组织。默认启用 4 个核心工具集（约 19 个工具）。设置 `CESIUM_TOOLSETS=all` 启用全部，或由 AI 在运行时动态按需发现和激活。

| 工具集 | 工具 |
|--------|------|
| **view** (默认) | `flyTo`, `setView`, `getView`, `zoomToExtent` |
| **entity** (默认) | `addMarker`, `addLabel`, `addModel`, `addPolygon`, `addPolyline`, `updateEntity`, `removeEntity` |
| **layer** (默认) | `addGeoJsonLayer`, `listLayers`, `removeLayer`, `setLayerVisibility`, `updateLayerStyle`, `setBasemap` |
| **interaction** (默认) | `screenshot`, `highlight` |
| camera | `lookAtTransform`, `startOrbit`, `stopOrbit`, `setCameraOptions` |
| entity-ext | `addBillboard`, `addBox`, `addCorridor`, `addCylinder`, `addEllipse`, `addRectangle`, `addWall` |
| animation | `createAnimation`, `controlAnimation`, `removeAnimation`, `listAnimations`, `updateAnimationPath`, `trackEntity`, `controlClock`, `setGlobeLighting` |
| tiles | `load3dTiles`, `loadTerrain`, `loadImageryService` |
| trajectory | `playTrajectory` |
| heatmap | `addHeatmap` |

> **与 CesiumGS 官方 MCP 服务器的关系**：`camera`、`entity-ext` 和 `animation` 工具集原生融合了 [CesiumGS/cesium-mcp-server](https://github.com/CesiumGS/cesium-mcp-server)（Camera Server、Entity Server、Animation Server）的能力到本项目的统一 Bridge 架构中。一个 MCP 服务器即可获得全部官方功能加更多工具，无需运行多个进程。

## 示例

查看 [examples/minimal/](examples/minimal/) 获取完整工作示例。

## 开发

```bash
git clone https://github.com/gaopengbin/cesium-mcp.git
cd cesium-mcp
npm install
npm run build
```

## 版本策略

主版本号.次版本号跟踪 CesiumJS（如 `1.139.x` 对应 Cesium `~1.139.0`）。补丁版本独立用于 MCP 功能迭代。

## 许可证

[MIT](LICENSE)
