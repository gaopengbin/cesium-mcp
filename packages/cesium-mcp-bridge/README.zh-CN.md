# cesium-mcp-bridge

[English](README.md) | **中文**

> AI 智能体操控 Cesium 三维地图的统一执行层。

[![npm version](https://img.shields.io/npm/v/cesium-mcp-bridge.svg)](https://www.npmjs.com/package/cesium-mcp-bridge)
[![license](https://img.shields.io/npm/l/cesium-mcp-bridge.svg)](LICENSE)

> **cesium-mcp 的协议无关核心。** 既可以从纯浏览器 agent 驱动（[在线 demo](https://cesium-browser-agent.pages.dev/) · [示例](../../examples/browser-agent/)），也可以接入你自己的 function calling 循环，或通过 [cesium-mcp-runtime](../cesium-mcp-runtime/) MCP 包装。60+ 工具，一套核心。

## 简介

`cesium-mcp-bridge` 是一个轻量级 SDK，让 AI 智能体（LangChain, LangGraph, Claude 等）通过统一命令接口操控浏览器端的 [CesiumJS](https://cesium.com) 地球。支持类型安全的方法调用和 JSON 命令分发。

```
AI 智能体 --> SSE / MCP / WebSocket --> cesium-mcp-bridge --> Cesium Viewer
```

## 安装

```bash
npm install cesium-mcp-bridge cesium
```

> `cesium` 是 peer 依赖（兼容 `~1.139.0`）。

## 快速开始

```typescript
import * as Cesium from 'cesium'
import { CesiumBridge } from 'cesium-mcp-bridge'

const viewer = new Cesium.Viewer('cesiumContainer')
const bridge = new CesiumBridge(viewer)

// 类型安全的方法调用
await bridge.flyTo({ longitude: 116.39, latitude: 39.91, height: 5000 })

// JSON 命令分发（用于 AI 智能体消息）
await bridge.execute({
  action: 'addGeoJsonLayer',
  params: { id: 'cities', name: '城市', data: geojson },
})
```

## 命令 (43)

### 视图控制

| 命令 | 描述 |
|------|------|
| `flyTo` | 飞行到地理位置，可设置朝向/俯仰/翻滚 |
| `setView` | 瞬间设置相机位置和方向 |
| `getView` | 获取当前相机状态（位置、朝向、俯仰、翻滚） |
| `zoomToExtent` | 缩放到指定矩形范围 |

### 实体

| 命令 | 描述 |
|------|------|
| `addMarker` | 在指定位置添加标记 |
| `addLabel` | 在多个位置添加文字标注 |
| `addModel` | 添加 3D 模型（glTF/GLB 或 Ion 资产） |
| `addPolygon` | 添加带样式的多边形 |
| `addPolyline` | 添加带样式的折线 |
| `updateEntity` | 更新实体属性 |
| `removeEntity` | 按 ID 删除实体 |

### 图层管理

| 命令 | 描述 |
|------|------|
| `addGeoJsonLayer` | 添加 GeoJSON 图层，支持样式选项（等值线、分类等） |
| `listLayers` | 列出所有已加载图层及元数据 |
| `removeLayer` | 按 ID 删除图层 |
| `setLayerVisibility` | 显示/隐藏图层 |
| `updateLayerStyle` | 动态更新图层样式 |
| `setBasemap` | 切换底图（暗色/卫星/标准/自定义） |

### 高级相机

| 命令 | 描述 |
|------|------|
| `lookAtTransform` | 环绕式相机注视某位置（朝向/俯仰/距离） |
| `startOrbit` | 开始相机环绕旋转 |
| `stopOrbit` | 停止环绕动画 |
| `setCameraOptions` | 配置相机控制器（启用/禁用旋转、缩放、倾斜） |

### 扩展实体类型

| 命令 | 描述 |
|------|------|
| `addBillboard` | 在指定位置添加图片图标 |
| `addBox` | 添加带尺寸和材质的 3D 盒体 |
| `addCorridor` | 添加走廊（带宽度的路径） |
| `addCylinder` | 添加圆柱体或圆锥体 |
| `addEllipse` | 添加椭圆 |
| `addRectangle` | 按地理范围添加矩形 |
| `addWall` | 沿路径添加墙体 |

### 动画

| 命令 | 描述 |
|------|------|
| `createAnimation` | 创建基于时间的路径动画 |
| `controlAnimation` | 播放或暂停动画 |
| `removeAnimation` | 删除动画实体 |
| `listAnimations` | 列出所有活跃的动画 |
| `updateAnimationPath` | 更新动画路径的可视属性 |
| `trackEntity` | 相机追踪实体 |
| `controlClock` | 配置 Cesium 时钟（时间范围、速度） |
| `setGlobeLighting` | 启用/禁用地球光照和大气效果 |

### 三维场景

| 命令 | 描述 |
|------|------|
| `load3dTiles` | 从 URL 或 Cesium Ion 加载 3D Tiles 数据集 |
| `loadTerrain` | 切换地形（平坦/arcgis/cesiumion/url） |
| `loadImageryService` | 添加 WMS / WMTS / XYZ / ArcGIS / Ion 影像图层 |

### 交互

| 命令 | 描述 |
|------|------|
| `screenshot` | 截取当前地图视图为 base64 PNG |
| `highlight` | 高亮图层中的要素 |

### 其他

| 命令 | 描述 |
|------|------|
| `playTrajectory` | 沿路径动画播放实体运动 |
| `addHeatmap` | 添加基于 Canvas 的热力图图层 |

## 两种调用方式

```typescript
// 方式 1: 类型安全方法
const layers = bridge.listLayers()
await bridge.flyTo({ longitude: 121.47, latitude: 31.23, height: 3000 })

// 方式 2: JSON 命令分发（MCP / SSE 兼容）
const result = await bridge.execute({
  action: 'flyTo',
  params: { longitude: 121.47, latitude: 31.23 },
})
```

## 事件

```typescript
bridge.on('layerAdded', (e) => console.log('图层已添加:', e.data))
bridge.on('layerRemoved', (e) => console.log('图层已删除:', e.data))
bridge.on('error', (e) => console.error('错误:', e.data))
```

## 与 cesium-mcp-runtime 集成

本包是 [cesium-mcp-runtime](https://www.npmjs.com/package/cesium-mcp-runtime) 的浏览器端执行引擎。运行时通过 WebSocket 连接到 bridge：

```typescript
const ws = new WebSocket('ws://localhost:9100?session=default')
ws.onmessage = async (event) => {
  const { id, method, params } = JSON.parse(event.data)
  const result = await bridge.execute({ action: method, params })
  ws.send(JSON.stringify({ id, result }))
}
```

## 类型导出

```typescript
import type {
  BridgeCommand, BridgeResult, FlyToParams, SetViewParams,
  AddGeoJsonLayerParams, AddHeatmapParams, Load3dTilesParams,
  PlayTrajectoryParams, LayerInfo, HighlightParams,
  // 相机
  LookAtTransformParams, StartOrbitParams, SetCameraOptionsParams,
  // 扩展实体类型
  AddBillboardParams, AddBoxParams, AddCorridorParams,
  AddCylinderParams, AddEllipseParams, AddRectangleParams, AddWallParams,
  MaterialSpec, MaterialInput, OrientationInput, PositionDegrees,
  // 动画
  CreateAnimationParams, ControlAnimationParams, RemoveAnimationParams,
  UpdateAnimationPathParams, TrackEntityParams, ControlClockParams,
  SetGlobeLightingParams, AnimationWaypoint, AnimationInfo,
} from 'cesium-mcp-bridge'
```

## 兼容性

| cesium-mcp-bridge | Cesium |
|-------------------|--------|
| 1.139.x | ~1.139.0 |

## 许可证

MIT
