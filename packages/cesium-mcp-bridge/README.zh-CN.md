# cesium-mcp-bridge

[English](README.md) | **中文**

> AI 智能体操控 Cesium 三维地图的统一执行层。

[![npm version](https://img.shields.io/npm/v/cesium-mcp-bridge.svg)](https://www.npmjs.com/package/cesium-mcp-bridge)
[![license](https://img.shields.io/npm/l/cesium-mcp-bridge.svg)](LICENSE)

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

## 命令 (19)

### 视图控制

| 命令 | 描述 |
|------|------|
| `flyTo` | 飞行到地理位置，可设置朝向/俯仰/翻滚 |
| `setView` | 瞬间设置相机位置和方向 |
| `getView` | 获取当前相机状态（位置、朝向、俯仰、翻滚） |
| `zoomToExtent` | 缩放到指定矩形范围 |

### 图层管理

| 命令 | 描述 |
|------|------|
| `addGeoJsonLayer` | 添加 GeoJSON 图层，支持样式选项（等值线、分类等） |
| `addHeatmap` | 添加基于 Canvas 的热力图图层 |
| `removeLayer` | 按 ID 删除图层 |
| `setLayerVisibility` | 显示/隐藏图层 |
| `listLayers` | 列出所有已加载图层及元数据 |
| `updateLayerStyle` | 动态更新图层样式 |
| `setBasemap` | 切换底图（暗色/卫星/标准/自定义） |

### 三维场景

| 命令 | 描述 |
|------|------|
| `load3dTiles` | 从 URL 或 Cesium Ion 加载 3D Tiles 数据集 |
| `loadTerrain` | 切换地形（平坦/arcgis/cesiumion/url） |
| `loadImageryService` | 添加 WMS / WMTS / XYZ / ArcGIS 影像图层 |

### 实体与标注

| 命令 | 描述 |
|------|------|
| `addMarker` | 在指定位置添加标记（注册到图层系统） |
| `addLabel` | 在多个位置添加文字标注 |

### 轨迹

| 命令 | 描述 |
|------|------|
| `playTrajectory` | 沿路径动画播放实体运动 |

### 交互

| 命令 | 描述 |
|------|------|
| `screenshot` | 截取当前地图视图为 base64 PNG |
| `highlight` | 高亮图层中的要素 |

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
} from 'cesium-mcp-bridge'
```

## 兼容性

| cesium-mcp-bridge | Cesium |
|-------------------|--------|
| 1.139.x | ~1.139.0 |

## 许可证

MIT
