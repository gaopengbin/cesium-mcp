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

## MCP 工具 (43 + 2 元工具)

工具按 **10 个工具集** 组织。默认启用 4 个核心工具集（约 19 个工具）。可通过环境变量或由 AI 智能体在运行时动态激活额外的工具集。

### 工具集概览

| 工具集 | 工具数 | 默认启用 | 描述 |
|--------|--------|----------|------|
| `view` | 4 | 是 | 相机视角控制 |
| `entity` | 7 | 是 | 核心实体操作 |
| `layer` | 6 | 是 | 图层管理 |
| `interaction` | 2 | 是 | 截图与高亮 |
| `camera` | 4 | — | 高级相机控制（环绕、注视） |
| `entity-ext` | 7 | — | 扩展实体类型（盒体、柱体、墙等） |
| `animation` | 8 | — | 动画系统（路径点、时钟、追踪） |
| `tiles` | 3 | — | 3D Tiles、地形、影像服务 |
| `trajectory` | 1 | — | 轨迹回放 |
| `heatmap` | 1 | — | 热力图可视化 |

### 工具集配置

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["cesium-mcp-runtime"],
      "env": {
        "CESIUM_TOOLSETS": "all"
      }
    }
  }
}
```

| `CESIUM_TOOLSETS` 值 | 效果 |
|----------------------|------|
| *（未设置）* | 默认 4 个工具集（19 工具 + 2 元工具） |
| `view,entity,camera,animation` | 仅启用指定的工具集 + 2 元工具 |
| `all` | 全部 43 个工具，无元工具 |

### 动态发现（元工具）

非 `all` 模式下，始终注册两个元工具，AI 可在运行时按需发现并激活额外能力：

| 工具 | 描述 |
|------|------|
| `list_toolsets` | 列出所有工具集及其启用状态和包含的工具 |
| `enable_toolset` | 动态启用一个工具集 -- 新工具立即可用 |

### 视图

| 工具 | 描述 |
|------|------|
| `flyTo` | 飞行到坐标（经度、纬度、高度、朝向、俯仰、翻滚、时长） |
| `setView` | 瞬间设置相机位置 |
| `getView` | 获取当前相机状态 |
| `zoomToExtent` | 缩放到边界框（west, south, east, north） |

### 实体

| 工具 | 描述 |
|------|------|
| `addMarker` | 在坐标处添加标记 |
| `addLabel` | 在地图上添加文字标注 |
| `addModel` | 添加 3D 模型（glTF/GLB 或 Ion 资产） |
| `addPolygon` | 添加带样式的多边形 |
| `addPolyline` | 添加带样式的折线 |
| `updateEntity` | 更新实体属性 |
| `removeEntity` | 按 ID 删除实体 |

### 图层

| 工具 | 描述 |
|------|------|
| `addGeoJsonLayer` | 添加带样式的 GeoJSON（等值线、分类等） |
| `listLayers` | 列出所有图层 |
| `removeLayer` | 按 ID 删除图层 |
| `setLayerVisibility` | 切换图层可见性 |
| `updateLayerStyle` | 修改图层颜色/透明度/宽度 |
| `setBasemap` | 切换底图 |

### 相机 *（工具集: camera）*

| 工具 | 描述 |
|------|------|
| `lookAtTransform` | 环绕式相机注视某位置（朝向/俯仰/距离） |
| `startOrbit` | 开始相机环绕旋转 |
| `stopOrbit` | 停止环绕动画 |
| `setCameraOptions` | 配置相机控制器（启用/禁用旋转、缩放、倾斜） |

### 扩展实体类型 *（工具集: entity-ext）*

| 工具 | 描述 |
|------|------|
| `addBillboard` | 在指定位置添加图片图标 |
| `addBox` | 添加带尺寸和材质的 3D 盒体 |
| `addCorridor` | 添加走廊（带宽度的路径） |
| `addCylinder` | 添加圆柱体或圆锥体 |
| `addEllipse` | 添加椭圆 |
| `addRectangle` | 按地理范围添加矩形 |
| `addWall` | 沿路径添加墙体 |

### 动画 *（工具集: animation）*

| 工具 | 描述 |
|------|------|
| `createAnimation` | 创建基于时间的路径动画（实体沿路径运动） |
| `controlAnimation` | 播放或暂停当前动画 |
| `removeAnimation` | 删除动画实体 |
| `listAnimations` | 列出所有活跃的动画 |
| `updateAnimationPath` | 更新动画路径的可视属性 |
| `trackEntity` | 相机追踪实体 |
| `controlClock` | 配置 Cesium 时钟（时间范围、速度、动画状态） |
| `setGlobeLighting` | 启用/禁用地球光照和大气效果 |

### 三维数据 *（工具集: tiles）*

| 工具 | 描述 |
|------|------|
| `load3dTiles` | 从 URL 或 Ion 资产 ID 加载 3D Tiles |
| `loadTerrain` | 设置地形提供器 |
| `loadImageryService` | 添加影像服务（WMS/WMTS/XYZ） |

### 交互 *（工具集: interaction）*

| 工具 | 描述 |
|------|------|
| `screenshot` | 截取地图为 base64 PNG |
| `highlight` | 高亮图层要素 |

### 其他

| 工具 | 工具集 | 描述 |
|------|--------|------|
| `playTrajectory` | trajectory | 沿坐标路径动画播放实体运动 |
| `addHeatmap` | heatmap | 从点数据生成热力图 |

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
| `CESIUM_TOOLSETS` | *（未设置）* | 工具集激活：省略使用默认集，`all` 启用全部，或逗号分隔列表 |

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
