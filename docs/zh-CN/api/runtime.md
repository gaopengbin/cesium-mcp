# cesium-mcp-runtime

> MCP 服务器（stdio）— 43 个工具（10 个工具集）+ 2 个资源，支持动态发现。

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

## MCP 工具（43 + 2 元工具）

工具按 **10 个工具集** 组织。默认启用 4 个核心工具集（约 19 个工具）。设置 `CESIUM_TOOLSETS=all` 启用全部，或由 AI 在运行时动态发现和激活。

### 工具集

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

### 动态发现

非 `all` 模式下，始终注册两个元工具：

| 工具 | 描述 |
|------|------|
| `list_toolsets` | 列出所有工具集及其启用状态 |
| `enable_toolset` | 在运行时动态启用一个工具集 |

### 视图

| 工具 | 描述 |
|------|------|
| `flyTo` | 相机飞行动画到经纬度/高度，可选朝向/俯仰/翻转 |
| `setView` | 立即设置相机位置和方向 |
| `getView` | 返回当前相机位置、朝向、俯仰、翻转 |
| `zoomToExtent` | 适配视图到地理包围盒 |

### 实体

| 工具 | 描述 |
|------|------|
| `addMarker` | 添加带标注的点标记 |
| `addLabel` | 在指定位置添加文字标注 |
| `addModel` | 在指定位置放置 3D 模型 (glTF/GLB) |
| `addPolygon` | 添加多边形区域（填充+描边） |
| `addPolyline` | 添加折线（路径/线段） |
| `updateEntity` | 更新实体属性 |
| `removeEntity` | 按 ID 移除单个实体 |

### 图层

| 工具 | 描述 |
|------|------|
| `addGeoJsonLayer` | 从 URL 或内联数据加载 GeoJSON |
| `listLayers` | 列出当前所有已加载图层 |
| `removeLayer` | 按 ID 移除图层 |
| `setLayerVisibility` | 切换图层可见性 |
| `updateLayerStyle` | 修改图层样式属性 |
| `setBasemap` | 切换底图影像 |

### 相机

| 工具 | 描述 |
|------|------|
| `lookAtTransform` | 环绕式相机注视某位置（朝向/俯仰/距离） |
| `startOrbit` | 开始相机环绕旋转 |
| `stopOrbit` | 停止环绕动画 |
| `setCameraOptions` | 配置相机控制器（启用/禁用旋转、缩放、倾斜） |

### 扩展实体类型

| 工具 | 描述 |
|------|------|
| `addBillboard` | 在指定位置添加图片图标 |
| `addBox` | 添加带尺寸和材质的 3D 盒体 |
| `addCorridor` | 添加走廊（带宽度的路径） |
| `addCylinder` | 添加圆柱体或圆锥体 |
| `addEllipse` | 添加椭圆 |
| `addRectangle` | 按地理范围添加矩形 |
| `addWall` | 沿路径添加墙体 |

### 动画

| 工具 | 描述 |
|------|------|
| `createAnimation` | 创建基于时间的路径动画 |
| `controlAnimation` | 播放或暂停动画 |
| `removeAnimation` | 删除动画实体 |
| `listAnimations` | 列出所有活跃的动画 |
| `updateAnimationPath` | 更新动画路径的可视属性 |
| `trackEntity` | 相机追踪实体 |
| `controlClock` | 配置 Cesium 时钟（时间范围、速度） |
| `setGlobeLighting` | 启用/禁用地球光照和大气效果 |

### 3D 数据

| 工具 | 描述 |
|------|------|
| `load3dTiles` | 加载 3D Tileset（建筑物、地形网格等） |
| `loadTerrain` | 设置地形提供者 |
| `loadImageryService` | 添加 WMS/WMTS/TMS 影像图层 |

### 交互

| 工具 | 描述 |
|------|------|
| `screenshot` | 截取当前地球视图为图片 |
| `highlight` | 高亮特定要素 |

### 其他

| 工具 | 工具集 | 描述 |
|------|--------|------|
| `playTrajectory` | trajectory | 沿路径随时间动画化实体 |
| `addHeatmap` | heatmap | 从点数据创建热力图叠加层 |

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
| `CESIUM_TOOLSETS` | *（未设置）* | 工具集激活：省略使用默认集，`all` 启用全部，或逗号分隔列表 |

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
