<div align="center">
  <img src="docs/public/logo.svg" alt="Cesium MCP" width="120">

  <h1>Cesium MCP</h1>

  <p><strong>给 CesiumJS 加 AI 命令的最小代价</strong></p>

  <p><a href="packages/cesium-mcp-bridge/">cesium-mcp-bridge</a> 是协议无关的命令分发核心，60+ 工具一次实现，可同时通过 <strong>纯浏览器 Agent</strong>、<strong>function calling</strong>、<strong>MCP</strong> 三种方式驱动。</p>

  <p>三种入口任选其一：<a href="examples/browser-agent/">浏览器 Agent</a>（最简单，零后端）· function calling（自托管 Web 应用嵌入）· <a href="packages/cesium-mcp-runtime/">MCP runtime</a>（接 Claude Desktop / Cursor / Dify）</p>

  <p><a href="https://cesium-browser-agent.pages.dev/"><strong>立即体验</strong></a> — 在线 Demo，零安装、零注册</p>

  <p>
    <a href="https://gaopengbin.github.io/cesium-mcp/">官方网站</a> &middot;
    <a href="README.md">English</a> &middot;
    <a href="https://gaopengbin.github.io/cesium-mcp/zh-CN/guide/getting-started.html">快速入门</a> &middot;
    <a href="https://gaopengbin.github.io/cesium-mcp/zh-CN/api/bridge.html">API 文档</a>
  </p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-155EEF?style=flat-square" alt="许可证: MIT"></a>
    <a href="https://github.com/gaopengbin/cesium-mcp/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/gaopengbin/cesium-mcp/ci.yml?branch=main&label=CI&style=flat-square" alt="CI"></a>
    <a href="https://github.com/gaopengbin/cesium-mcp/stargazers"><img src="https://img.shields.io/github/stars/gaopengbin/cesium-mcp?style=flat-square" alt="GitHub Stars"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-runtime"><img src="https://img.shields.io/npm/dm/cesium-mcp-runtime?label=runtime%20downloads&style=flat-square" alt="Runtime 下载量"></a>
  </p>

  <p>
    <a href="https://www.npmjs.com/package/cesium-mcp-bridge"><img src="https://img.shields.io/badge/bridge-npm-528bff?style=for-the-badge&logo=npm&logoColor=white" alt="bridge npm"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-runtime"><img src="https://img.shields.io/badge/runtime-npm-155EEF?style=for-the-badge&logo=npm&logoColor=white" alt="runtime npm"></a>
    <a href="https://www.npmjs.com/package/cesium-mcp-dev"><img src="https://img.shields.io/badge/dev-npm-364fc7?style=for-the-badge&logo=npm&logoColor=white" alt="dev npm"></a>
  </p>
</div>

---

## 演示

https://github.com/user-attachments/assets/8a40565a-fcdd-47bf-ae67-bc870611c908

## 包与入口

| 模块 | 角色 | 状态 | 链接 |
|------|------|------|------|
| **cesium-mcp-bridge** | 协议无关的命令分发核心（60+ 工具） | 主线，持续迭代 | [![npm](https://img.shields.io/npm/v/cesium-mcp-bridge)](https://www.npmjs.com/package/cesium-mcp-bridge) · [源码](packages/cesium-mcp-bridge/) |
| **examples/browser-agent** | 纯浏览器 AI Agent（推荐起点，零后端） | 推荐入口 | [示例](examples/browser-agent/) · [在线 demo](https://cesium-browser-agent.pages.dev/) |
| **cesium-mcp-runtime** | MCP 服务器（stdio + HTTP） | 稳定，按需更新 | [![npm](https://img.shields.io/npm/v/cesium-mcp-runtime)](https://www.npmjs.com/package/cesium-mcp-runtime) · [源码](packages/cesium-mcp-runtime/) |
| **cesium-mcp-dev** | 给代码助手用的 CesiumJS API 知识库 | 维护中 | [![npm](https://img.shields.io/npm/v/cesium-mcp-dev)](https://www.npmjs.com/package/cesium-mcp-dev) · [源码](packages/cesium-mcp-dev/) |

> **怎么选？** 个人项目或想最快试用 → browser-agent；已有 Web 应用要嵌 AI 助手 → bridge + 自己接 function calling；要从 Claude Desktop / Cursor / Dify 调用 → MCP runtime。

## 架构

```mermaid
flowchart LR
  subgraph clients ["AI 驱动方（任选其一）"]
    BA["浏览器 Agent\n（同页调用）"]
    FC["你的 Web 应用\nfunction calling"]
    MCP["Claude / Cursor / Dify\n通过 MCP runtime"]
  end

  subgraph core ["cesium-mcp-bridge（浏览器内）"]
    B["60+ 工具\n协议无关的命令分发器"]
    C["CesiumJS Viewer"]
  end

  BA -- "页内调用" --> B
  FC -- "页内调用" --> B
  MCP -- "WebSocket / JSON-RPC" --> B
  B --> C

  style clients fill:#1e293b,stroke:#528bff,color:#e2e8f0
  style core fill:#1e293b,stroke:#12B76A,color:#e2e8f0
```

bridge 是唯一必需的部分。三种驱动方调用的是同一套 60+ 工具，按场景选一种即可。

## 快速开始

### 路径 0 — 30 秒体验（浏览器 Agent，推荐）

打开 [在线 demo](https://cesium-browser-agent.pages.dev/)，粘贴一个 OpenAI 兼容的 API key，问一句：
> *“飞到埃菲尔铁塔，放个红色标记”*

Fork [examples/browser-agent](examples/browser-agent/) 部署你自己的。

### 路径 1 — 嵌进你的 Web 应用（function calling）

```bash
npm install cesium-mcp-bridge
```

```js
import { CesiumBridge } from 'cesium-mcp-bridge';

const bridge = new CesiumBridge(viewer);
// 然后：把 bridge 的工具 schema 交给任何支持 function/tool calling 的 LLM，
// 把模型返回的 tool call 路由到 bridge.execute(name, params) 即可。
```

完整闭环示例：[examples/browser-agent/index.html](examples/browser-agent/index.html)。

### 路径 2 — 从 Claude Desktop / Cursor / Dify 调用（MCP）

按路径 1 安装 bridge，然后启动 MCP runtime：

```bash
# stdio 模式（Claude Desktop、VS Code、Cursor）
npx cesium-mcp-runtime

# HTTP 模式（Dify、远程/云端 MCP 客户端）
npx cesium-mcp-runtime --transport http --port 3000
```

MCP 客户端配置：

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

## 58 个可用工具

工具按 **12 个工具集** 组织。默认启用 4 个核心工具集（约 31 个工具）。设置 `CESIUM_TOOLSETS=all` 启用全部，或由 AI 在运行时动态按需发现和激活。

> **国际化**: 工具描述默认英文，设置 `CESIUM_LOCALE=zh-CN` 切换中文。

| 工具集 | 工具 |
|--------|------|
| **view** (默认) | `flyTo`, `setView`, `getView`, `zoomToExtent`, `saveViewpoint`, `loadViewpoint`, `listViewpoints`, `exportScene` |
| **entity** (默认) | `addMarker`, `addLabel`, `addModel`, `addPolygon`, `addPolyline`, `updateEntity`, `removeEntity`, `batchAddEntities`, `queryEntities`, `getEntityProperties` |
| **layer** (默认) | `addGeoJsonLayer`, `listLayers`, `removeLayer`, `clearAll`, `setLayerVisibility`, `updateLayerStyle`, `getLayerSchema`, `setBasemap` |
| **interaction** (默认) | `screenshot`, `highlight`, `measure` |
| camera | `lookAtTransform`, `startOrbit`, `stopOrbit`, `setCameraOptions` |
| entity-ext | `addBillboard`, `addBox`, `addCorridor`, `addCylinder`, `addEllipse`, `addRectangle`, `addWall` |
| animation | `createAnimation`, `controlAnimation`, `removeAnimation`, `listAnimations`, `updateAnimationPath`, `trackEntity`, `controlClock`, `setGlobeLighting` |
| tiles | `load3dTiles`, `loadTerrain`, `loadImageryService`, `loadCzml`, `loadKml` |
| trajectory | `playTrajectory` |
| heatmap | `addHeatmap` |
| scene | `setSceneOptions`, `setPostProcess` |
| geolocation | `geocode` |

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

版本格式：`{Cesium主版本}.{Cesium次版本}.{MCP补丁号}`

| 版本段 | 含义 | 示例 |
|--------|------|------|
| `1.139` | 跟踪 CesiumJS 版本 — 基于 Cesium `~1.139.0` 构建与测试 | `1.139.8` → Cesium 1.139 |
| `.8` | MCP 补丁号 — 独立迭代，用于新增工具、缺陷修复、文档更新 | `1.139.7` → `1.139.8` |

当 CesiumJS 发布新次版本（如 1.140）时，我们将同步升级：`1.140.0`。

## 相关项目

- [mapbox-mcp](https://github.com/gaopengbin/mapbox-mcp) — AI 控制 Mapbox GL JS
- [openlayers-mcp](https://github.com/gaopengbin/openlayers-mcp) — AI 控制 OpenLayers

## Star 趋势

<a href="https://star-history.com/#gaopengbin/cesium-mcp&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=gaopengbin/cesium-mcp&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=gaopengbin/cesium-mcp&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=gaopengbin/cesium-mcp&type=Date" />
 </picture>
</a>

## 许可证

[MIT](LICENSE)
