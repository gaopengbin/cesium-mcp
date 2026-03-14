# cesium-mcp-runtime

[English](README.md) | **中文**

> MCP 服务器，让 AI 智能体通过模型上下文协议实时控制 Cesium 地球。

[![npm version](https://img.shields.io/npm/v/cesium-mcp-runtime.svg)](https://www.npmjs.com/package/cesium-mcp-runtime)
[![license](https://img.shields.io/npm/l/cesium-mcp-runtime.svg)](LICENSE)

## 架构

```
AI 智能体 <--MCP stdio--> cesium-mcp-runtime <--WebSocket--> 浏览器 (cesium-mcp-bridge)
```

运行时作为 MCP 兼容 AI 客户端（Claude Desktop、VS Code Copilot、Cursor 等）与运行 CesiumJS 的浏览器之间的桥梁。它将 MCP 工具调用转换为 WebSocket 命令，由 [cesium-mcp-bridge](https://www.npmjs.com/package/cesium-mcp-bridge) 在浏览器端执行。

## 安装与运行

```bash
# 使用 npx 直接运行
npx cesium-mcp-runtime

# 或全局安装
npm install -g cesium-mcp-runtime
cesium-mcp-runtime
```

## MCP 客户端配置

### Claude Desktop

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["cesium-mcp-runtime"],
      "env": {
        "CESIUM_WS_PORT": "9100",
        "DEFAULT_SESSION_ID": "default"
      }
    }
  }
}
```

### VS Code (Copilot)

在 `.vscode/mcp.json` 中：

```json
{
  "servers": {
    "cesium": {
      "command": "npx",
      "args": ["cesium-mcp-runtime"],
      "env": {
        "DEFAULT_SESSION_ID": "default"
      }
    }
  }
}
```

### Cursor

在 `.cursor/mcp.json` 中：

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["cesium-mcp-runtime"]
    }
  }
}
```

## MCP 工具 (19)

### 视图

| 工具 | 描述 |
|------|------|
| `flyTo` | 飞行到坐标（经度、纬度、高度、朝向、俯仰、翻滚、时长） |
| `setView` | 瞬间设置相机位置 |
| `getView` | 获取当前相机状态 |
| `zoomToExtent` | 缩放到边界框（west, south, east, north） |
| `screenshot` | 截取地图为 base64 PNG |

### 图层

| 工具 | 描述 |
|------|------|
| `addGeoJsonLayer` | 添加带样式的 GeoJSON（等值线、分类等） |
| `addHeatmap` | 从点数据生成热力图 |
| `addMarker` | 在坐标处添加标记 |
| `addLabel` | 在地图上添加文字标注 |
| `removeLayer` | 按 ID 删除图层 |
| `setLayerVisibility` | 切换图层可见性 |
| `listLayers` | 列出所有图层 |
| `updateLayerStyle` | 修改图层颜色/透明度/宽度 |
| `setBasemap` | 切换底图 |
| `highlight` | 高亮图层要素 |

### 三维数据

| 工具 | 描述 |
|------|------|
| `load3dTiles` | 从 URL 或 Ion 资产 ID 加载 3D Tiles |
| `loadTerrain` | 设置地形提供器 |
| `loadImageryService` | 添加影像服务（WMS/WMTS/XYZ） |

### 动画

| 工具 | 描述 |
|------|------|
| `playTrajectory` | 沿坐标路径动画播放实体运动 |

## MCP 资源

| URI | 描述 |
|-----|------|
| `cesium://scene/camera` | 当前相机位置、朝向、俯仰、翻滚 |
| `cesium://scene/layers` | 所有已加载图层列表（类型与可见性） |

## 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CESIUM_WS_PORT` | `9100` | WebSocket 服务器端口 |
| `DEFAULT_SESSION_ID` | `default` | MCP 工具路由的首选浏览器会话 |

## 浏览器端设置

浏览器页面需要通过 WebSocket 连接到运行时，并将命令转发给 `cesium-mcp-bridge`：

```typescript
import { CesiumBridge } from 'cesium-mcp-bridge'

const bridge = new CesiumBridge(viewer)
const ws = new WebSocket('ws://localhost:9100?session=default')

ws.onmessage = async (event) => {
  const { id, method, params } = JSON.parse(event.data)
  try {
    const result = await bridge.execute({ action: method, params })
    ws.send(JSON.stringify({ id, result }))
  } catch (error) {
    ws.send(JSON.stringify({ id, error: { message: String(error) } }))
  }
}
```

## 会话路由

多个浏览器标签页可以使用不同的会话 ID 连接到同一个运行时：

```
标签页 A: ws://localhost:9100?session=geoagent
标签页 B: ws://localhost:9100?session=demo
```

MCP 工具调用会路由到匹配 `DEFAULT_SESSION_ID` 的会话。如果该会话不可用，将回退到第一个已连接的会话。

## HTTP 推送 API

运行时还暴露了 HTTP 端点，用于非 MCP 集成（如 FastAPI 后端）：

```bash
curl -X POST http://localhost:9100/push \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "default", "command": {"action": "flyTo", "params": {"longitude": 116.39, "latitude": 39.91}}}'
```

## 兼容性

| cesium-mcp-runtime | cesium-mcp-bridge | Cesium |
|--------------------|-------------------|--------|
| 1.139.x | 1.139.x | ~1.139.0 |

## 许可证

MIT
