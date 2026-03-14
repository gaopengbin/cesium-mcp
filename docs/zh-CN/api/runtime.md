# cesium-mcp-runtime

> MCP 服务器（stdio） — 向任何 MCP 客户端暴露 19 个工具 + 2 个资源。

[![npm](https://img.shields.io/npm/v/cesium-mcp-runtime)](https://www.npmjs.com/package/cesium-mcp-runtime)

## 安装与运行

```bash
npx cesium-mcp-runtime
```

或全局安装：

```bash
npm install -g cesium-mcp-runtime
cesium-mcp-runtime
```

## MCP 客户端配置

### Claude Desktop

`claude_desktop_config.json`：

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

### VS Code (GitHub Copilot)

`.vscode/mcp.json`：

```json
{
  "servers": {
    "cesium-mcp": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-runtime"]
    }
  }
}
```

### Cursor

`.cursor/mcp.json`：

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

## MCP 工具（19 个）

### 视图

| 工具 | 描述 |
|------|------|
| `flyTo` | 相机飞行动画到经纬度/高度，可选朝向/俯仰/翻转 |
| `setView` | 立即设置相机位置和方向 |
| `getView` | 返回当前相机位置、朝向、俯仰、翻转 |
| `zoomToExtent` | 适配视图到地理包围盒 |
| `screenshot` | 截取当前地球视图为图片 |

### 图层

| 工具 | 描述 |
|------|------|
| `addGeoJsonLayer` | 从 URL 或内联数据加载 GeoJSON |
| `addHeatmap` | 从点数据创建热力图叠加层 |
| `addMarker` | 添加带标注的点标记 |
| `addLabel` | 在指定位置添加文字标注 |
| `removeLayer` | 按 ID 移除图层 |
| `setLayerVisibility` | 切换图层可见性 |
| `listLayers` | 列出当前所有已加载图层 |
| `updateLayerStyle` | 修改图层样式属性 |
| `setBasemap` | 切换底图影像 |
| `highlight` | 高亮特定要素 |

### 3D 数据

| 工具 | 描述 |
|------|------|
| `load3dTiles` | 加载 3D Tileset（建筑物、地形网格等） |
| `loadTerrain` | 设置地形提供者 |
| `loadImageryService` | 添加 WMS/WMTS/TMS 影像图层 |

### 动画

| 工具 | 描述 |
|------|------|
| `playTrajectory` | 沿路径随时间动画化实体 |

## MCP 资源（2 个）

| URI | 描述 |
|-----|------|
| `cesium://scene/camera` | 当前相机状态（位置、方向） |
| `cesium://scene/layers` | 所有已加载图层及其元数据列表 |

资源为只读，AI 智能体可轮询获取以进行上下文感知决策。

## 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CESIUM_WS_PORT` | `9100` | Bridge 连接的 WebSocket 服务器端口 |
| `DEFAULT_SESSION_ID` | `default` | MCP 调用路由到哪个浏览器会话 |

## 会话路由

多个浏览器标签页可同时连接。每个 Bridge 实例使用 `sessionId` 注册：

```
标签页 1：sessionId = "project-a"
标签页 2：sessionId = "project-b"
```

Runtime 将 MCP 工具调用路由到匹配 `DEFAULT_SESSION_ID` 的会话。

## HTTP Push API

对于非 MCP 集成（如 FastAPI 后端），Runtime 暴露 HTTP 端点：

```bash
curl -X POST http://localhost:9100/push \
  -H "Content-Type: application/json" \
  -d '{"action": "flyTo", "params": {"longitude": 2.29, "latitude": 48.86, "height": 1000}}'
```
