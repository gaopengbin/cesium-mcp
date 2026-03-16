# 常见问题

## 连接问题

### WebSocket 连接失败

**表现**：浏览器控制台显示 `WebSocket connection to 'ws://localhost:9100' failed`。

**解决方案**：
1. 确认 `cesium-mcp-runtime` 正在运行：`npx cesium-mcp-runtime`
2. 检查端口 — 如果 9100 端口被占用，设置自定义端口：
   ```bash
   CESIUM_WS_PORT=9200 npx cesium-mcp-runtime
   ```
   同时更新 Bridge 配置：
   ```js
   new CesiumBridge(viewer, { wsUrl: 'ws://localhost:9200' })
   ```
3. 如果使用 HTTPS，浏览器会阻止混合内容（需要使用 wss://）。可使用反向代理或隧道（如 ngrok）。

### Bridge 已连接但工具不工作

**表现**：Runtime 日志显示 `browser connected`，但 AI 工具调用返回错误。

**解决方案**：
1. 确保 CesiumJS Viewer 完全初始化后再创建 Bridge
2. 检查浏览器控制台是否有 JavaScript 错误
3. 确认 `sessionId` 在 Bridge 和 Runtime 之间一致（默认值：`'default'`）

## 工具问题

### "No browser connected" 错误

Runtime 找不到已连接的浏览器会话。

1. 在浏览器中打开你的 CesiumJS 应用
2. 检查 Bridge 初始化代码是否在运行（浏览器控制台中查找 `[CesiumBridge] connected`）
3. 如果使用多个标签页，为每个标签页设置不同的 `sessionId`

### 只有部分工具可用

默认只启用核心工具集。要启用全部 43 个工具：

```bash
CESIUM_TOOLSETS=all npx cesium-mcp-runtime
```

或使用动态发现 — 让 AI 智能体执行：*"列出可用的工具集"*，然后 *"启用动画工具集"*。

### flyTo 没有动画效果

如果 `flyTo` 直接跳转而非平滑飞行，检查：
1. `duration` 参数（默认 2 秒）
2. CesiumJS 场景模式 — 2D 模式不支持平滑飞行
3. 部分 AI 客户端超时时间较短 — 可适当增加 MCP 超时设置

## 配置

### 如何使用 Cesium Ion 访问令牌？

在创建 Viewer 之前在 CesiumJS 应用中设置令牌：

```js
Cesium.Ion.defaultAccessToken = 'YOUR_TOKEN_HERE'
```

Bridge 不处理令牌 — 由你的 CesiumJS 应用自行管理。

### 如何更改 WebSocket 端口？

设置 `CESIUM_WS_PORT` 环境变量：

```bash
CESIUM_WS_PORT=9200 npx cesium-mcp-runtime
```

### 能否使用远程/云端模式？

可以。Runtime 支持 Streamable HTTP 模式进行远程访问：

```bash
npx cesium-mcp-runtime --mode http --port 3000
```

也可以使用托管端点 `https://mcp.gpb.cc`。

## 兼容性

### 支持哪些 CesiumJS 版本？

cesium-mcp v1.139.x 目标为 CesiumJS ~1.139.0。Bridge 使用稳定的 CesiumJS API，通常兼容 CesiumJS 1.100+，但较新功能（如 3D Tiles 样式）可能需要较新版本。

### 哪些 AI 客户端可以使用？

任何兼容 MCP 的客户端都可以：
- **Claude Desktop** — 完全支持
- **VS Code GitHub Copilot** — 完全支持
- **Cursor** — 完全支持
- **Windsurf** — 完全支持
- **自定义客户端** — 任何遵循 [MCP 规范](https://modelcontextprotocol.io/) 的实现

### 是否支持 TypeScript？

支持。所有包都包含 TypeScript 类型声明。Bridge 导出所有类型定义：

```ts
import type { BridgeCommand, EntityOptions, LayerInfo } from 'cesium-mcp-bridge'
```
