# 架构概览

## 总览

Cesium MCP 由三个独立的包组成，构成从 AI 智能体到三维地球的完整管线：

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

## 各包职责

### cesium-mcp-bridge（浏览器端）

Bridge 运行在**浏览器内部**，与 CesiumJS 应用共存。它：

- 通过 WebSocket 连接到 Runtime
- 接收 JSON-RPC 命令
- 执行 CesiumJS API 调用（相机、图层、实体等）
- 将结果通过 WebSocket 返回

**两种调用方式：**
- **类型安全方法**：`bridge.flyTo({ longitude: 2.29, latitude: 48.86, height: 1000 })`
- **JSON 命令分发**：`bridge.execute({ action: 'flyTo', params: { ... } })`

### cesium-mcp-runtime（Node.js）

Runtime 是一个 **Node.js MCP 服务器**，充当 AI 智能体和浏览器之间的翻译器。它：

- 通过 stdio 暴露 24 个 MCP 工具和 2 个资源
- 运行 WebSocket 服务器（默认端口 9100）
- 将 MCP 工具调用转译为 Bridge 命令
- 支持多会话路由以管理多个浏览器标签页

### cesium-mcp-dev（Node.js）

Dev 服务器是独立的 **IDE 助手**，不需要运行中的地球。它提供：

- CesiumJS API 文档查询（12 个核心类）
- 常见模式的代码片段生成
- Entity 模板构建器，用于生成配置

## 数据流

### AI 智能体 → 地球（工具调用）

```
1. 用户："添加一个地震数据的 GeoJSON 图层"
2. AI 智能体 → MCP 工具调用：addGeoJsonLayer({ url: "...", name: "earthquakes" })
3. Runtime 通过 stdio 接收工具调用
4. Runtime 发送 WebSocket 命令：{ action: "addGeoJsonLayer", params: { ... } }
5. Bridge 执行：viewer.dataSources.add(Cesium.GeoJsonDataSource.load(...))
6. Bridge 返回：{ success: true, layerId: "..." }
7. 结果回流：Bridge → Runtime → AI 智能体
8. AI 智能体："我已经把地震数据图层添加到地图上了。"
```

### 地球 → AI 智能体（资源读取）

```
1. AI 智能体读取资源：cesium://scene/camera
2. Runtime 通过 WebSocket 将请求转发给 Bridge
3. Bridge 读取：viewer.camera.positionCartographic
4. Bridge 返回：{ longitude: 2.29, latitude: 48.86, height: 1000 }
5. AI 智能体获取相机状态，用于上下文感知决策
```

## 会话路由

多个浏览器标签页可以连接到同一个 Runtime。每个 Bridge 连接使用一个 `sessionId`：

```
浏览器标签页 1 (sessionId: "project-a") ──┐
                                          ├── cesium-mcp-runtime ── AI 智能体
浏览器标签页 2 (sessionId: "project-b") ──┘
```

Runtime 将 MCP 工具调用路由到匹配 `DEFAULT_SESSION_ID` 的会话。

## 版本策略

三个包使用 [changesets](https://github.com/changesets/changesets) 共享同一版本号（**fixed** 模式）。

**主版本号.次版本号** 跟踪 CesiumJS：
- `cesium-mcp-*@1.139.x` 对应 `cesium@~1.139.0`

**修订版本号** 独立迭代，用于 MCP 功能更新。
