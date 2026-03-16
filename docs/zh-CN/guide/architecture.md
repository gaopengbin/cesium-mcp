# 架构概览

## 总览

Cesium MCP 由三个独立的包组成，构成从 AI 智能体到三维地球的完整管线：

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

- 通过 stdio 暴露 **43 个 MCP 工具**（按 **10 个工具集** 组织）+ 2 个资源
- 运行 WebSocket + HTTP 服务器（默认端口 9100）
- 将 MCP 工具调用转译为 Bridge 命令
- 支持多会话路由以管理多个浏览器标签页
- 提供 HTTP Push API（`POST /api/command`）供后端系统集成

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

## 工具集与动态发现

43 个工具按 **10 个工具集** 组织，解决 LLM 工具选择困难：

| 工具集 | 工具数 | 默认启用 |
|--------|--------|----------|
| `view` | 4 | 是 |
| `entity` | 7 | 是 |
| `layer` | 6 | 是 |
| `interaction` | 2 | 是 |
| `camera` | 4 | — |
| `entity-ext` | 7 | — |
| `animation` | 8 | — |
| `tiles` | 3 | — |
| `trajectory` | 1 | — |
| `heatmap` | 1 | — |

默认启用 4 个核心工具集（约 19 个工具）。其余工具集可通过两种方式激活：

1. **环境变量**：`CESIUM_TOOLSETS=all` 启用全部
2. **动态发现**：两个元工具（`list_toolsets`、`enable_toolset`）允许 AI 智能体在运行时自主发现和激活工具集，无需用户手动配置

```
AI："我需要创建一个动画"
→ 调用 list_toolsets → 发现 animation 工具集未启用
→ 调用 enable_toolset("animation") → 8 个动画工具变为可用
→ 调用 createAnimation(...)
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
