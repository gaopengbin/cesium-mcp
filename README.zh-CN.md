# cesium-mcp

[English](README.md) | **中文**

MCP ([模型上下文协议](https://modelcontextprotocol.io/)) 与 [CesiumJS](https://cesium.com/) 的集成 — 让 AI 智能体通过自然语言操控三维地球。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 包

| 包名 | 描述 | npm |
|------|------|-----|
| [cesium-mcp-bridge](packages/cesium-mcp-bridge/) | 浏览器 SDK — 嵌入你的 CesiumJS 应用，通过 WebSocket 接收命令 | `cesium-mcp-bridge` |
| [cesium-mcp-runtime](packages/cesium-mcp-runtime/) | MCP 服务器 (stdio) — 为任何 MCP 客户端暴露 19 个工具 + 2 个资源 | `cesium-mcp-runtime` |
| [cesium-mcp-dev](packages/cesium-mcp-dev/) | IDE MCP 服务器 — 为代码助手提供 CesiumJS API 辅助 | `cesium-mcp-dev` |

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

## 19 个可用工具

| 类别 | 工具 |
|------|------|
| 相机 | `fly_to`, `get_camera` |
| 图层 | `add_geojson`, `add_tileset`, `add_terrain`, `add_imagery`, `remove_layer`, `get_layers` |
| 标记 | `add_marker` |
| 绘制 | `draw_shape` |
| 测量 | `measure` |
| 热力图 | `add_heatmap` |
| 交互 | `highlight`, `screenshot` |
| 场景 | `set_scene_style`, `get_scene_info` |
| 查询 | `coord_pick`, `feature_query`, `spatial_query` |
| 分析 | `viewshed_analysis` |

## 示例

查看 [examples/minimal/](examples/minimal/) 获取包含全部 19 个命令的完整工作示例。

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

MIT
